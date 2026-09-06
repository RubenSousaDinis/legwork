/**
 * World ID onboarding end to end: an RP-signed request out, a proof forwarded to World byte
 * for byte, a nullifier recorded once, and an EIP-712 attestation relayed as `registerFor`.
 *
 * No key in this file is written down. Every one is derived from a seed string at run time,
 * which is also how `contracts/test/fixtures/attestation.json` is produced — the Forge side
 * derives the same key from the same string and must land on the same digest.
 *
 * World is `msw` with `onUnhandledRequest: 'error'`, so a request to any other host fails the
 * suite rather than leaving it. The chain is `FakeChain`; the database is pglite.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  getAddress,
  keccak256,
  recoverTypedDataAddress,
  stringToBytes,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ChainRevert, FakeChain } from '@legwork/chain';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as idkitRequestRoute } from '../../app/idkit/request/route';
import { POST as idkitVerifyRoute } from '../../app/idkit/verify/route';
import { POST as registerRoute } from '../../app/register/route';
import { GET as configWorldRoute } from '../../app/config/world/route';
import { setChainForTests } from '../../src/chain';
import { resetConfigForTests } from '../../src/config';
import { resetRateLimitForTests } from '../../src/http/rateLimit';
import { issueIdkitSession } from '../../src/session';
import {
  ATTESTATION_TYPES,
  ATTESTATION_PRIMARY_TYPE,
  attestationDigest,
  attestationDomain,
  signAttestation,
  taskTypesMask,
  verifierAddress,
  type AttestationDomain,
  type AttestationMessage,
} from '../../src/services/attestation';
import { nullifierToNumeric } from '../../src/services/worldId';
import { call, setCookies } from '../app';
import { createTestDb, type TestDb } from '../db';

// --- derived keys and constants -------------------------------------------

/** The one string both sides of the fixture derive from. Never the key itself. */
const VERIFIER_SEED = 'legwork-test-verifier';
const RP_SIGNING_SEED = 'legwork-test-rp-signing';
const NULLIFIER_SEED = 'legwork-test-nullifier';

const VERIFIER_KEY = keccak256(stringToBytes(VERIFIER_SEED));
const RP_SIGNING_KEY = keccak256(stringToBytes(RP_SIGNING_SEED));

const ACTION = 'legwork-worker';
const APP_ID = 'app_legwork_test';
const RP_ID = 'rp_legwork_test';
const CREDENTIAL_LEVEL = 'orb';
const WORLD_ENV = 'staging';
const REGISTRY = '0x1111111111111111111111111111111111111111' as Address;
const CHAIN_ID = 84532;

const WORKER_LOWER = '0x2222222222222222222222222222222222222222';
const WORKER = getAddress(WORKER_LOWER);
const AREA = 'ez5ku';
/** 4102444800 is 2100-01-01; a fixture deadline must never expire. */
const FIXTURE_DEADLINE = 4102444800n;

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../contracts/test/fixtures/attestation.json',
);

const TEST_WORLD_ENV: Record<string, string> = {
  WORLD_APP_ID: APP_ID,
  WORLD_RP_ID: RP_ID,
  WORLD_RP_SIGNING_KEY: RP_SIGNING_KEY,
  WORLD_ACTION: ACTION,
  WORLD_ENV,
  WORLD_CREDENTIAL_LEVEL: CREDENTIAL_LEVEL,
  ATTESTATION_VERIFIER_PRIVATE_KEY: VERIFIER_KEY,
  WORKER_REGISTRY_ADDRESS: REGISTRY,
  CHAIN_ID: String(CHAIN_ID),
};

// --- a chain that remembers what it was asked to do ------------------------

interface ChainCall {
  role: string;
  fn: string;
  args: unknown[];
}

/**
 * `FakeChain` carries no call log and no `failNextWith`, so this wrapper adds both without
 * touching `@legwork/chain` — see the `INTERFACE REQUEST:` on this PR. It records only, and
 * every call it does not intercept goes straight through to the real fake.
 *
 * `registerFor` is a relayer-role write in `RegistryClient`, which is where the `role` below
 * comes from; the API never picks a role of its own.
 */
const RELAYER_WRITES = new Set([
  'post',
  'claimFor',
  'releaseClaimFor',
  'submitFor',
  'approve',
  'dispute',
  'autoRelease',
  'expire',
  'registerFor',
]);

type RecordingChain = FakeChain & {
  calls: ChainCall[];
  /** A revert name, or an error object to throw as it stands — an unreachable node is not a revert. */
  failNextWith: (failure: string | Error) => void;
};

function recordingChain(inner: FakeChain): RecordingChain {
  const calls: ChainCall[] = [];
  let failNext: string | Error | undefined;

  return new Proxy(inner, {
    get(target, property) {
      if (property === 'calls') return calls;
      if (property === 'failNextWith') {
        return (failure: string | Error) => {
          failNext = failure;
        };
      }
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function' || !RELAYER_WRITES.has(String(property))) return value;
      return (...args: unknown[]) => {
        calls.push({ role: 'relayer', fn: String(property), args });
        if (failNext !== undefined) {
          const failure = failNext;
          failNext = undefined;
          return Promise.reject(
            typeof failure === 'string' ? new ChainRevert(failure) : failure,
          );
        }
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  }) as RecordingChain;
}

// --- fixture --------------------------------------------------------------

interface AttestationFixture {
  chainId: number;
  verifyingContract: Address;
  nullifierHash: string;
  worker: Address;
  area: string;
  taskTypes: number;
  deadline: number;
  digest: Hex;
  signature: Hex;
  signer: Address;
  keyDerivation: string;
  domain: { name: string; version: string };
}

function fixtureDomain(): AttestationDomain {
  return attestationDomain(CHAIN_ID, REGISTRY);
}

function fixtureMessage(): AttestationMessage {
  return {
    nullifierHash: BigInt(keccak256(stringToBytes(NULLIFIER_SEED))),
    worker: WORKER,
    area: AREA,
    taskTypes: 3,
    deadline: FIXTURE_DEADLINE,
  };
}

async function buildFixture(): Promise<AttestationFixture> {
  const domain = fixtureDomain();
  const message = fixtureMessage();
  return {
    chainId: CHAIN_ID,
    verifyingContract: REGISTRY,
    nullifierHash: message.nullifierHash.toString(10),
    worker: message.worker,
    area: message.area,
    taskTypes: message.taskTypes,
    deadline: Number(message.deadline),
    digest: attestationDigest(domain, message),
    signature: await signAttestation(VERIFIER_KEY, domain, message),
    signer: privateKeyToAccount(VERIFIER_KEY).address,
    keyDerivation: `keccak256(utf8('${VERIFIER_SEED}'))`,
    domain: { name: domain.name, version: domain.version },
  };
}

// --- World, in memory -----------------------------------------------------

interface CapturedRequest {
  body: string;
  rpId: string;
  contentType: string | null;
}

let captured: CapturedRequest | undefined;
let worldReply: () => Response;
let server: ReturnType<typeof setupServer>;

function worldSuccess(nullifier: string, extra: Record<string, unknown> = {}): () => Response {
  return () =>
    HttpResponse.json({
      success: true,
      nullifier,
      protocol_version: '4.0',
      action: ACTION,
      ...extra,
    }) as unknown as Response;
}

beforeAll(() => {
  server = setupServer(
    http.post(`https://developer.world.org/api/v4/verify/:rp_id`, async ({ request, params }) => {
      captured = {
        body: await request.text(),
        rpId: String(params.rp_id),
        contentType: request.headers.get('content-type'),
      };
      return worldReply();
    }),
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterAll(() => server.close());

let fixture: TestDb;
let chain: RecordingChain;

beforeEach(async () => {
  resetConfigForTests(TEST_WORLD_ENV);
  resetRateLimitForTests();
  captured = undefined;
  worldReply = worldSuccess('0x01');
  fixture = await createTestDb();
  chain = recordingChain(new FakeChain());
  setChainForTests(chain);
});

afterEach(async () => {
  server.resetHandlers();
  setChainForTests(undefined);
  await fixture.close();
});

// --- helpers --------------------------------------------------------------

async function seedUnbound(nullifier: string): Promise<void> {
  await fixture.rawQuery(
    'INSERT INTO nullifiers (nullifier, action, worker) VALUES ($1, $2, NULL)',
    [nullifier, ACTION],
  );
}

async function seedBound(nullifier: string, worker: string): Promise<void> {
  await fixture.rawQuery('INSERT INTO nullifiers (nullifier, action, worker) VALUES ($1, $2, $3)', [
    nullifier,
    ACTION,
    worker,
  ]);
}

async function workerOf(nullifier: string): Promise<unknown> {
  const rows = await fixture.rawQuery('SELECT worker FROM nullifiers WHERE nullifier = $1', [
    nullifier,
  ]);
  return rows[0]?.worker;
}

async function idkitCookie(nullifier: string): Promise<Record<string, string>> {
  const session = await issueIdkitSession({ nullifier, level: CREDENTIAL_LEVEL, action: ACTION });
  return { lw_idkit: session.token };
}

async function postRegister(nullifier: string, body: unknown): Promise<Response> {
  return call(registerRoute, {
    method: 'POST',
    url: 'http://localhost/register',
    cookies: await idkitCookie(nullifier),
    body,
  });
}

async function postVerify(body: string): Promise<Response> {
  return call(idkitVerifyRoute, {
    method: 'POST',
    url: 'http://localhost/idkit/verify',
    body,
  });
}

// --- tests ----------------------------------------------------------------

describe('registerBindsNullifierToWorker', () => {
  it('signs an attestation, relays registerFor and binds the row afterwards', async () => {
    const nullifier = BigInt(keccak256(stringToBytes(NULLIFIER_SEED))).toString(10);
    await seedUnbound(nullifier);

    const before = Math.floor(Date.now() / 1000);
    const res = await postRegister(nullifier, {
      worker_address: WORKER_LOWER,
      area: AREA,
      task_types: ['verify-open', 'photo-of'],
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tx: string; worker: string };
    expect(body.worker).toBe(WORKER);
    expect(body.tx).toMatch(/^0x[0-9a-f]+$/i);

    const registerCalls = chain.calls.filter((c) => c.fn === 'registerFor');
    expect(registerCalls).toHaveLength(1);
    const only = registerCalls[0]!;
    expect(only.role).toBe('relayer');

    const [nullifierArg, workerArg, areaArg, maskArg, deadlineArg, attestation] = only.args as [
      bigint,
      Address,
      string,
      number,
      bigint,
      Hex,
    ];
    expect(nullifierArg).toBe(BigInt(nullifier));
    expect(workerArg).toBe(WORKER);
    expect(areaArg).toBe(AREA);
    expect(maskArg).toBe(3);
    expect(Number(deadlineArg) - (before + 600)).toBeLessThanOrEqual(5);
    expect(Number(deadlineArg) - (before + 600)).toBeGreaterThanOrEqual(-5);

    const recovered = await recoverTypedDataAddress({
      domain: attestationDomain(CHAIN_ID, REGISTRY),
      types: ATTESTATION_TYPES,
      primaryType: ATTESTATION_PRIMARY_TYPE,
      message: {
        nullifierHash: nullifierArg,
        worker: workerArg,
        area: areaArg,
        taskTypes: maskArg,
        deadline: deadlineArg,
      },
      signature: attestation,
    });
    expect(recovered).toBe(verifierAddress());

    expect(await workerOf(nullifier)).toBe(WORKER);

    // A client that sends the same type twice means the same worker.
    expect(taskTypesMask(['verify-open', 'photo-of', 'photo-of'])).toBe(3);
    expect(taskTypesMask(['verify-open', 'photo-of'])).toBe(taskTypesMask(['photo-of', 'verify-open']));
  });
});

describe('duplicateNullifierIs409', () => {
  it('refuses a session for a nullifier that is already bound', async () => {
    const nullifier = nullifierToNumeric('0x1f');
    await seedBound(nullifier, WORKER);
    worldReply = worldSuccess('0x1f', { verification_level: CREDENTIAL_LEVEL });

    const res = await postVerify(JSON.stringify({ action: ACTION, proof: '0xabc' }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'nullifier_already_registered' });
    expect(setCookies(res).lw_idkit).toBeUndefined();
  });

  it('refuses /register for a bound nullifier without touching the chain', async () => {
    const nullifier = nullifierToNumeric('0x1f');
    await seedBound(nullifier, WORKER);

    const res = await postRegister(nullifier, {
      worker_address: WORKER_LOWER,
      area: AREA,
      task_types: ['verify-open'],
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'nullifier_already_registered' });
    expect(chain.calls.filter((c) => c.fn === 'registerFor')).toHaveLength(0);
  });

  it('leaves the row unbound when the registry reverts DuplicateNullifier', async () => {
    const nullifier = nullifierToNumeric('0x2f');
    await seedUnbound(nullifier);
    chain.failNextWith('DuplicateNullifier');

    const res = await postRegister(nullifier, {
      worker_address: WORKER_LOWER,
      area: AREA,
      task_types: ['verify-open'],
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'nullifier_already_registered' });
    expect(await workerOf(nullifier)).toBeNull();
  });

  it('answers 503 when the node is unreachable, and still leaves the row unbound', async () => {
    const nullifier = nullifierToNumeric('0x3f');
    await seedUnbound(nullifier);
    // What an unreachable RPC actually throws. It carries a `name` like any other error, and
    // a `name` alone must never be read as a decoded revert.
    chain.failNextWith(new TypeError('fetch failed'));

    const res = await postRegister(nullifier, {
      worker_address: WORKER_LOWER,
      area: AREA,
      task_types: ['verify-open'],
    });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'chain_unavailable' });
    expect(await workerOf(nullifier)).toBeNull();
  });
});

describe('attestationDigestMatchesForge', () => {
  it('computes the digest the Forge fixture records', async () => {
    const built = await buildFixture();
    if (process.env.REGEN_FIXTURE === '1') {
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(built, null, 2)}\n`);
    }

    // Read, not imported: the committed JSON is a data file the Forge side also reads, and a
    // module cache would hide a regeneration inside the same run.
    const vector = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as AttestationFixture;

    const domain = fixtureDomain();
    const message = fixtureMessage();

    expect(attestationDigest(domain, message)).toBe(vector.digest);
    expect(
      await recoverTypedDataAddress({
        domain,
        types: ATTESTATION_TYPES,
        primaryType: ATTESTATION_PRIMARY_TYPE,
        message,
        signature: vector.signature,
      }),
    ).toBe(vector.signer);
    // RFC 6979: the same key over the same digest signs the same bytes every time.
    expect(await signAttestation(VERIFIER_KEY, domain, message)).toBe(vector.signature);
    expect(privateKeyToAccount(VERIFIER_KEY).address).toBe(vector.signer);
    expect(vector.deadline).toBe(4102444800);
    expect(vector.taskTypes).toBe(3);
    expect(vector.nullifierHash).toBe(message.nullifierHash.toString(10));
    expect(vector.domain).toEqual({ name: 'Legwork WorkerRegistry', version: '1' });
    expect(vector.keyDerivation).toBe(`keccak256(utf8('${VERIFIER_SEED}'))`);
  });
});

describe('verifyForwardsPayloadAsIs', () => {
  it('sends World the exact bytes it was given and records the nullifier once', async () => {
    const nullifierHex = `0x1f${'a'.repeat(62)}`;
    const raw = '{"z":1, "action":"legwork-worker",  "proof":"0xabc","verification_level":"orb"}';
    worldReply = worldSuccess(nullifierHex);

    const res = await postVerify(raw);

    expect(captured?.body).toBe(raw);
    expect(captured?.rpId).toBe(RP_ID);
    expect(captured?.contentType).toBe('application/json');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      verified: true,
      nullifier: nullifierHex,
      level: 'orb',
    });
    expect(setCookies(res).lw_idkit).toBeTruthy();
    expect(await workerOf(BigInt(nullifierHex).toString(10))).toBeNull();
  });

  it('turns a refusal from World into a 400 carrying World s code and stores nothing', async () => {
    const nullifierHex = `0x1f${'a'.repeat(62)}`;
    worldReply = () =>
      HttpResponse.json({ code: 'invalid_proof' }, { status: 400 }) as unknown as Response;

    const res = await postVerify(
      JSON.stringify({ action: ACTION, proof: '0xabc', verification_level: 'orb' }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'invalid_request',
      field: 'proof',
      reason: 'invalid_proof',
    });
    expect(setCookies(res).lw_idkit).toBeUndefined();
    const rows = await fixture.rawQuery('SELECT nullifier FROM nullifiers WHERE nullifier = $1', [
      BigInt(nullifierHex).toString(10),
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe('configNeverLeaksSigningKey', () => {
  it('publishes five keys and neither private key', async () => {
    const res = await call(configWorldRoute, { url: 'http://localhost/config/world' });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');

    const body = await res.json();
    expect(body).toEqual({
      app_id: APP_ID,
      action: ACTION,
      rp_id: RP_ID,
      credential_level: CREDENTIAL_LEVEL,
      env: WORLD_ENV,
    });
    expectNoKeys(JSON.stringify(body));
  });

  it('signs an RP request and keeps the key out of it', async () => {
    const res = await call(idkitRequestRoute, {
      method: 'POST',
      url: 'http://localhost/idkit/request',
      body: { action: ACTION },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rp_context: {
        rp_id: string;
        nonce: string;
        created_at: number;
        expires_at: number;
        signature: string;
      };
    };
    const context = body.rp_context;
    expect(Object.keys(context).sort()).toEqual([
      'created_at',
      'expires_at',
      'nonce',
      'rp_id',
      'signature',
    ]);
    expect(context.rp_id).toBe(RP_ID);
    expect(context.expires_at).toBeGreaterThan(context.created_at);
    expect(context.nonce.length).toBeGreaterThan(0);
    expect(context.signature.length).toBeGreaterThan(0);
    expectNoKeys(JSON.stringify(body));
  });

  it('refuses an action this app does not sign for', async () => {
    const res = await call(idkitRequestRoute, {
      method: 'POST',
      url: 'http://localhost/idkit/request',
      body: { action: 'other' },
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'invalid_request',
      field: 'action',
      reason: 'unknown_action',
    });
  });
});

/** Hex and base64, because a key that leaked re-encoded would still be a key that leaked. */
function expectNoKeys(text: string): void {
  for (const key of [RP_SIGNING_KEY, VERIFIER_KEY]) {
    const bare = key.slice(2);
    for (const form of [key, bare, Buffer.from(bare, 'hex').toString('base64')]) {
      expect(text).not.toContain(form);
    }
  }
}
