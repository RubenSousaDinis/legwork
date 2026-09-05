/**
 * The session path, end to end, on pglite and `FakeChain`: nonce out, SIWE in, cookie back.
 *
 * The three named cases are T-08 §8. They are one file because they share the fixture and
 * because "a session was issued" only means anything beside "a session was refused".
 */
import { jwtVerify } from 'jose';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { FakeChain } from '@legwork/chain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as nonceRoute } from '../app/session/nonce/route';
import { POST as sessionRoute } from '../app/session/route';
import { setChainForTests } from '../src/chain';
import { resetConfigForTests } from '../src/config';
import { resetRateLimitForTests } from '../src/http/rateLimit';
import { setSiweProviderForTests } from '../src/siwe';
import { call, setCookies } from './app';
import { createTestDb, type TestDb } from './db';
import { offlineSiweProvider, walletAuthPayload } from './siwe';

const DOMAIN = 'miniapp.legwork.test';
const ACTION = 'legwork-worker';
/** A full uint256, so a `NUMERIC(78,0)` round trip that silently narrowed would show. */
const NULLIFIER = '81234567890123456789012345678901234567890123456789012345678901234567890123456';

const worker: PrivateKeyAccount = privateKeyToAccount(`0x${'a1'.repeat(32)}`);
const stranger: PrivateKeyAccount = privateKeyToAccount(`0x${'b2'.repeat(32)}`);

let fixture: TestDb;
let chain: FakeChain;

async function getNonce(): Promise<string> {
  const res = await call(nonceRoute, { url: 'http://localhost/session/nonce' });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { nonce: string };
  expect(body.nonce).toMatch(/^[0-9a-f]{32}$/);
  return body.nonce;
}

async function postSession(nonce: string, payload: unknown): Promise<Response> {
  return call(sessionRoute, {
    method: 'POST',
    url: 'http://localhost/session',
    body: { mode: 'walletAuth', payload, nonce },
  });
}

beforeEach(async () => {
  resetConfigForTests();
  resetRateLimitForTests();
  setSiweProviderForTests(offlineSiweProvider());
  fixture = await createTestDb();
  chain = new FakeChain();
  setChainForTests(chain);
});

afterEach(async () => {
  setChainForTests(undefined);
  setSiweProviderForTests(undefined);
  await fixture.close();
});

/** Registered both places: the registry says worker, the table says which human. */
async function register(account: PrivateKeyAccount): Promise<void> {
  chain.setWorker(account.address, {
    nullifier: BigInt(NULLIFIER),
    seeded: false,
    area: 'test-area',
    taskTypes: 1,
  });
  await fixture.rawQuery('INSERT INTO nullifiers (nullifier, action, worker) VALUES ($1, $2, $3)', [
    NULLIFIER,
    ACTION,
    account.address,
  ]);
}

describe('sessionIssuedForRegisteredWorker', () => {
  it('issues a worker session for a registered worker', async () => {
    await register(worker);

    const nonce = await getNonce();
    const res = await postSession(nonce, await walletAuthPayload(worker, nonce, DOMAIN));

    expect(res.status).toBe(200);
    expect(setCookies(res).lw_worker).toBeTruthy();

    const body = (await res.json()) as {
      worker: string;
      nullifier: string;
      mode: string;
      token: string;
    };
    expect(body.worker).toBe(worker.address);
    expect(body.nullifier).toBe(NULLIFIER);
    expect(body.mode).toBe('walletAuth');

    const secret = new TextEncoder().encode(resetConfigForTests().SESSION_SECRET);
    const { payload } = await jwtVerify(body.token, secret, { algorithms: ['HS256'] });
    expect(payload.sub).toBe(worker.address);
    expect(payload.nullifier).toBe(NULLIFIER);
    expect(payload.mode).toBe('walletAuth');
    expect(payload.kind).toBe('worker');
  });
});

describe('sessionRefusedForUnregistered', () => {
  it('refuses an address the registry does not know', async () => {
    const nonce = await getNonce();
    const res = await postSession(nonce, await walletAuthPayload(worker, nonce, DOMAIN));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden', reason: 'not_registered' });
    expect(setCookies(res).lw_worker).toBeUndefined();
  });

  it('refuses a registered worker whose row is there but whose registry entry is not', async () => {
    await fixture.rawQuery('INSERT INTO nullifiers (nullifier, action, worker) VALUES ($1, $2, $3)', [
      NULLIFIER,
      ACTION,
      worker.address,
    ]);

    const nonce = await getNonce();
    const res = await postSession(nonce, await walletAuthPayload(worker, nonce, DOMAIN));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden', reason: 'not_registered' });
    expect(setCookies(res).lw_worker).toBeUndefined();
  });

  it('refuses a payload whose signature does not match the address', async () => {
    await register(worker);

    const nonce = await getNonce();
    const forged = await walletAuthPayload(worker, nonce, DOMAIN, { signWith: stranger });
    const res = await postSession(nonce, forged);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(setCookies(res).lw_worker).toBeUndefined();
  });
});

describe('nonceSingleUse', () => {
  it('spends a nonce once and refuses one that was never issued', async () => {
    await register(worker);

    const nonce = await getNonce();
    const first = await postSession(nonce, await walletAuthPayload(worker, nonce, DOMAIN));
    expect(first.status).toBe(200);

    const second = await postSession(nonce, await walletAuthPayload(worker, nonce, DOMAIN));
    expect(second.status).toBe(401);
    expect(await second.json()).toEqual({ error: 'unauthorized', reason: 'nonce_used' });

    const neverIssued = 'a'.repeat(32);
    const third = await postSession(
      neverIssued,
      await walletAuthPayload(worker, neverIssued, DOMAIN),
    );
    expect(third.status).toBe(401);
    expect(await third.json()).toEqual({ error: 'unauthorized', reason: 'nonce_used' });
  });
});
