/**
 * The worker's path through a task, on pglite and `FakeChain`.
 *
 * The two named cases are T-17 §8's PR1 rows — `workerBriefNeverLeaksClaims` and
 * `claimCooldownSurfaced`. The rest of the file is the path either side of them, because a
 * claim that surfaces the right 409 is only worth something if the happy path it guards
 * actually completes.
 *
 * `spyChain` is a thin recorder around `FakeChain`: it keeps the ordered list of relayer calls
 * a route made, and can arm one of them to revert with a contract error name. Both live here
 * rather than in `@legwork/chain` because `packages/**` belongs to T-07.
 */
import { ChainRevert, FakeChain, type ChainAdapter } from '@legwork/chain';
import {
  DEMO_DISPUTE_WINDOW_S,
  TASK_TYPE_BIT,
  canonicalJson,
  specHash,
  type TaskType,
} from '@legwork/shared';
import { eq } from 'drizzle-orm';
import { keccak256, toBytes, type Address, type Hex } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as listRoute } from '../../app/tasks/list/route';
import { POST as claimRoute } from '../../app/tasks/[id]/claim/route';
import { POST as releaseClaimRoute } from '../../app/tasks/[id]/release-claim/route';
import { POST as submitRoute } from '../../app/tasks/[id]/submit/route';
import { POST as reportRoute } from '../../app/tasks/[id]/report/route';
import { GET as earningsRoute } from '../../app/me/earnings/route';
import { call } from '../../test/app';
import { createTestDb, type TestDb } from '../../test/db';
import { setChainForTests } from '../chain';
import { resetConfigForTests } from '../config';
import { observations, proofs, screeningLog, tasks } from '../db/schema';
import { issueWorkerSession } from '../session';
import { dbState, secondsToDate, titleOf, workerBrief } from './lifecycle';

const AREA = 'ez5ku';
const CLAIM_TTL = 1800;
const SUBMIT_TTL = 3600;
/** The worker's amount. The buyer's 3.45 sits in `fee_units` beside it and is never shown here. */
const AMOUNT_UNITS = 3_000_000n;

const PLACE = {
  place_id: 'node/123456',
  name: 'Padaria Central',
  street_address: 'Rua Direita 12',
  locality: 'Leiria',
  country: 'PT',
} as const;

/** All four, each carrying every field a brief must not pass on. */
const SPECS: Record<TaskType, Record<string, unknown>> = {
  'verify-open': {
    place: PLACE,
    question: 'open_now',
    claimed_open: true,
    claimed_hours: 'Mon-Fri 09:00-18:00',
    source: 'google',
  },
  'photo-of': {
    place: PLACE,
    subject: 'storefront',
    subject_detail: 'the main door',
    claimed_state: 'shutters down',
    source: 'osm',
  },
  'call-confirm': {
    place: PLACE,
    phone: '+351244000000',
    template_id: 'have_item',
    slots: { item: 'pasteis de nata' },
  },
  'compare-two': {
    a: { kind: 'text', text: 'Rua Direita 12', sha256: 'a'.repeat(64) },
    b: { kind: 'text', text: 'Rua Direita 21', sha256: 'b'.repeat(64) },
    criterion_id: 'more_legible',
  },
};

const WORKER = '0x00000000000000000000000000000000000000a1' as Address;
const OTHER_WORKER = '0x00000000000000000000000000000000000000a2' as Address;
const SEEDED_WORKER = '0x00000000000000000000000000000000000000a3' as Address;
const BUYER = '0x00000000000000000000000000000000000000b1' as Address;
const OTHER_BUYER = '0x00000000000000000000000000000000000000b2' as Address;

const NULLIFIER = '1001';

interface Recorded {
  name: string;
  args: unknown[];
}

/** Every relayer write a route can make. Reads are not recorded; they are not evidence. */
const WRITES = new Set(['claimFor', 'releaseClaimFor', 'submitFor', 'dispute', 'expire', 'autoRelease']);

interface Spy {
  chain: ChainAdapter;
  calls: Recorded[];
  /** Arms the next call to `method` to revert with the contract's own error name. */
  failNext: (method: string, revert: string) => void;
}

function spyChain(inner: FakeChain): Spy {
  const calls: Recorded[] = [];
  const armed = new Map<string, string>();

  const chain = new Proxy(inner, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function' || typeof property !== 'string') return value;
      return (...args: unknown[]) => {
        if (WRITES.has(property)) calls.push({ name: property, args });
        const revert = armed.get(property);
        if (revert !== undefined) {
          armed.delete(property);
          return Promise.reject(new ChainRevert(revert));
        }
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  }) as unknown as ChainAdapter;

  return { chain, calls, failNext: (method, revert) => armed.set(method, revert) };
}

let fixture: TestDb;
let fake: FakeChain;
let spy: Spy;

/** `Authorization: Bearer` rather than a cookie — the CLI worker has no cookie jar either. */
async function sessionFor(worker: Address, nullifier = NULLIFIER): Promise<string> {
  const { token } = await issueWorkerSession({ worker, nullifier, mode: 'walletAuth' });
  return token;
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** Posts on the fake and mirrors the row, the way T-16's `POST /tasks` will. */
async function postTask(
  type: TaskType,
  options: { buyer?: Address; payer?: Address; lat?: number; lon?: number } = {},
): Promise<bigint> {
  const buyer = options.buyer ?? BUYER;
  const spec = SPECS[type];
  const { taskId } = await fake.post({
    taskType: TASK_TYPE_BIT[type],
    specHash: specHash(spec),
    amount: AMOUNT_UNITS,
    buyer,
    buyerAgentId: 0n,
    area: AREA,
    claimTTL: CLAIM_TTL,
    submitTTL: SUBMIT_TTL,
    disputeWindow: DEMO_DISPUTE_WINDOW_S,
  });
  const chainTask = await fake.getTask(taskId);

  await fixture.db.insert(tasks).values({
    taskId,
    taskType: TASK_TYPE_BIT[type],
    specHash: chainTask.specHash,
    amountUnits: chainTask.amount,
    feeUnits: chainTask.fee,
    buyer,
    area: AREA,
    state: dbState(chainTask.state),
    postedAt: secondsToDate(chainTask.postedAt),
    claimTtlS: CLAIM_TTL,
    submitTtlS: SUBMIT_TTL,
    disputeWindowS: DEMO_DISPUTE_WINDOW_S,
    specJson: spec,
    buyerTokenHash: `hash-${taskId}`,
    exactLat: options.lat === undefined ? null : String(options.lat),
    exactLon: options.lon === undefined ? null : String(options.lon),
    payer: options.payer ?? buyer,
    priceUnits: chainTask.amount + chainTask.fee,
  });
  return taskId;
}

/** Re-mirrors the row after a write made directly on the fake, as the routes themselves do. */
async function syncRow(taskId: bigint): Promise<void> {
  const chainTask = await fake.getTask(taskId);
  await fixture.db
    .update(tasks)
    .set({
      state: dbState(chainTask.state),
      worker: /^0x0{40}$/.test(chainTask.worker) ? null : chainTask.worker,
      claimedAt: chainTask.claimedAt === 0n ? null : secondsToDate(chainTask.claimedAt),
      submittedAt: chainTask.submittedAt === 0n ? null : secondsToDate(chainTask.submittedAt),
    })
    .where(eq(tasks.taskId, taskId));
}

async function rowOf(taskId: bigint) {
  const rows = await fixture.db.select().from(tasks).where(eq(tasks.taskId, taskId));
  return rows[0];
}

beforeEach(async () => {
  resetConfigForTests();
  fixture = await createTestDb();
  fake = new FakeChain();
  fake.mintUsdc(fake.relayerAddress, 1_000_000_000n);
  fake.setWorker(WORKER, { nullifier: BigInt(NULLIFIER), seeded: false, area: AREA, taskTypes: 15 });
  fake.setWorker(OTHER_WORKER, { nullifier: 1002n, seeded: false, area: AREA, taskTypes: 15 });
  spy = spyChain(fake);
  setChainForTests(spy.chain);
});

afterEach(async () => {
  setChainForTests(undefined);
  await fixture.close();
});

// ---------------------------------------------------------------- §8 workerBriefNeverLeaksClaims

describe('workerBrief', () => {
  it('workerBriefNeverLeaksClaims', () => {
    const banned = ['claimed_open', 'claimed_hours', 'claimed_state', 'source'];

    for (const [type, spec] of Object.entries(SPECS) as [TaskType, Record<string, unknown>][]) {
      const brief = workerBrief({ taskType: TASK_TYPE_BIT[type], specJson: spec });
      for (const key of deepKeys(brief)) expect(banned).not.toContain(key);
      // The spec it came from really does carry them, so this is a filter and not a fixture
      // that happened to be clean.
      if (type !== 'call-confirm' && type !== 'compare-two') {
        expect(deepKeys(spec).some((k) => banned.includes(k))).toBe(true);
      }
    }
  });

  it('renders the question a worker is asked, never the buyer text', () => {
    const brief = workerBrief({
      taskType: TASK_TYPE_BIT['call-confirm'],
      specJson: SPECS['call-confirm'],
    });
    expect(brief.template_question).toBe('Do you have pasteis de nata in stock?');
    expect(brief.place).toEqual({
      name: PLACE.name,
      street_address: PLACE.street_address,
      locality: PLACE.locality,
    });
  });

  it('titles a place task by place and a comparison by criterion', () => {
    expect(titleOf({ taskType: TASK_TYPE_BIT['photo-of'], specJson: SPECS['photo-of'] })).toBe(
      'photo-of · Padaria Central · Rua Direita 12',
    );
    expect(
      titleOf({ taskType: TASK_TYPE_BIT['compare-two'], specJson: SPECS['compare-two'] }),
    ).toBe('compare-two · more_legible');
  });
});

function deepKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(deepKeys);
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [k, ...deepKeys(v)]);
}

// ---------------------------------------------------------------- §8 claimCooldownSurfaced

describe('POST /tasks/:id/claim', () => {
  it('claimCooldownSurfaced', async () => {
    const token = await sessionFor(WORKER);

    // A cooldown the way a worker earns one: claim, vanish, and let the next claimant clear
    // the stale claim on the way past.
    const stranded = await postTask('verify-open');
    await fake.claimFor(stranded, WORKER);
    await fake.warp(CLAIM_TTL + 1);
    await fake.claimFor(stranded, OTHER_WORKER);
    await syncRow(stranded);

    const now = await fake.now();
    expect(await fake.cooldownUntil(WORKER)).toBe(now + 900n);

    const target = await postTask('photo-of');
    spy.calls.length = 0;

    const cooling = await call(claimRoute, {
      method: 'POST',
      params: { id: target.toString() },
      headers: auth(token),
    });
    expect(cooling.status).toBe(409);
    expect(await cooling.json()).toEqual({
      error: 'InCooldown',
      cooldown_until: secondsToDate(now + 900n).toISOString(),
    });
    // Refused before the relayer was ever asked: no gas spent to learn what a read told us.
    expect(spy.calls).toEqual([]);

    // Past the cooldown, but the contract itself reverts `InCooldown` — the same 409.
    await fake.warp(901);
    spy.failNext('claimFor', 'InCooldown');
    const raced = await call(claimRoute, {
      method: 'POST',
      params: { id: target.toString() },
      headers: auth(token),
    });
    expect(raced.status).toBe(409);
    expect((await raced.json()).error).toBe('InCooldown');
    expect(spy.calls.map((c) => c.name)).toEqual(['claimFor']);

    // A seeded worker may only take an allowlisted payer's work.
    fake.setWorker(SEEDED_WORKER, { nullifier: 1003n, seeded: true, area: AREA, taskTypes: 15 });
    const seededToken = await sessionFor(SEEDED_WORKER, '1003');
    const external = await postTask('verify-open', { buyer: OTHER_BUYER });
    const refused = await call(claimRoute, {
      method: 'POST',
      params: { id: external.toString() },
      headers: auth(seededToken),
    });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'SeededCannotClaimExternal' });

    // The happy path, and the row that follows it.
    spy.calls.length = 0;
    const ok = await call(claimRoute, {
      method: 'POST',
      params: { id: target.toString() },
      headers: auth(token),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as {
      tx: string;
      claim_expires_at: string;
      submit_deadline: string;
    };
    const claimedAt = await fake.now();
    expect(body.tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.claim_expires_at).toBe(secondsToDate(claimedAt + BigInt(CLAIM_TTL)).toISOString());
    expect(body.submit_deadline).toBe(secondsToDate(claimedAt + BigInt(SUBMIT_TTL)).toISOString());
    expect(spy.calls.map((c) => c.name)).toEqual(['claimFor']);

    const row = await rowOf(target);
    expect(row?.state).toBe('claimed');
    expect(row?.worker?.toLowerCase()).toBe(WORKER.toLowerCase());
    expect(row?.txClaim).toBe(body.tx);
  });

  it('409s a worker who already holds a claim, naming the task', async () => {
    const token = await sessionFor(WORKER);
    const held = await postTask('verify-open');
    await fake.claimFor(held, WORKER);
    await syncRow(held);

    const other = await postTask('photo-of');
    const res = await call(claimRoute, {
      method: 'POST',
      params: { id: other.toString() },
      headers: auth(token),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'AlreadyClaimed',
      active_task_id: held.toString(),
    });
  });

  it('403s an address the registry does not know', async () => {
    const stranger = '0x00000000000000000000000000000000000000c9' as Address;
    const token = await sessionFor(stranger, '1099');
    const taskId = await postTask('verify-open');
    const res = await call(claimRoute, {
      method: 'POST',
      params: { id: taskId.toString() },
      headers: auth(token),
    });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------- GET /tasks/list

describe('GET /tasks/list', () => {
  it('shows open work, the caller own claim, and a stale claim as open', async () => {
    const token = await sessionFor(WORKER);
    const open = await postTask('verify-open', { lat: 39.74362, lon: -8.80713 });
    const mine = await postTask('photo-of');
    const stale = await postTask('call-confirm');

    await fake.claimFor(mine, WORKER);
    await syncRow(mine);
    await fake.claimFor(stale, OTHER_WORKER);
    await syncRow(stale);
    await fake.warp(CLAIM_TTL + 1);

    const res = await call(listRoute, {
      url: 'http://localhost/tasks/list?area=ez5ku&lat=39.74362&lon=-8.80713',
      headers: auth(token),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: Record<string, unknown>[] };
    const byId = new Map(body.tasks.map((t) => [t.task_id, t]));
    expect(byId.size).toBe(3);

    expect(byId.get(open.toString())).toMatchObject({
      state: 'open',
      task_type: 'verify-open',
      price_usdc: 3,
      distance_m: 0,
      title: 'verify-open · Padaria Central · Rua Direita 12',
      seeded: false,
    });
    // The worker's number is 3.00 — never the 3.45 the escrow locks.
    expect(byId.get(open.toString())?.price_usdc).not.toBe(3.45);

    expect(byId.get(mine.toString())).toMatchObject({ state: 'claimed', claim_expires_in_s: 0 });
    expect(byId.get(stale.toString())).toMatchObject({ state: 'open', claim_expires_in_s: 0 });

    const brief = byId.get(open.toString())?.brief as Record<string, unknown>;
    expect(deepKeys(brief)).not.toContain('claimed_open');
    expect(brief.question).toBe('open_now');
  });

  it('counts down the caller own live claim', async () => {
    const token = await sessionFor(WORKER);
    const mine = await postTask('verify-open');
    await fake.claimFor(mine, WORKER);
    await syncRow(mine);
    await fake.warp(300);

    const res = await call(listRoute, { url: 'http://localhost/tasks/list', headers: auth(token) });
    const body = (await res.json()) as { tasks: { claim_expires_in_s: number }[] };
    expect(body.tasks[0]?.claim_expires_in_s).toBe(CLAIM_TTL - 300);
  });

  it('shows a seeded worker only allowlisted work', async () => {
    fake.setWorker(SEEDED_WORKER, { nullifier: 1003n, seeded: true, area: AREA, taskTypes: 15 });
    await fake.setAllowlistedBuyer(BUYER, true);
    const token = await sessionFor(SEEDED_WORKER, '1003');

    const demo = await postTask('verify-open', { buyer: BUYER, payer: BUYER });
    await postTask('photo-of', { buyer: OTHER_BUYER, payer: OTHER_BUYER });

    const res = await call(listRoute, { url: 'http://localhost/tasks/list', headers: auth(token) });
    const body = (await res.json()) as { tasks: { task_id: string; seeded: boolean }[] };
    expect(body.tasks.map((t) => t.task_id)).toEqual([demo.toString()]);
    // The chip is on the row, not in the fine print.
    expect(body.tasks[0]?.seeded).toBe(true);
  });

  it('401s without a worker session', async () => {
    const res = await call(listRoute, { url: 'http://localhost/tasks/list' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------- release-claim

describe('POST /tasks/:id/release-claim', () => {
  it('hands the task back and reopens the row', async () => {
    const token = await sessionFor(WORKER);
    const taskId = await postTask('verify-open');
    await fake.claimFor(taskId, WORKER);
    await syncRow(taskId);

    const res = await call(releaseClaimRoute, {
      method: 'POST',
      params: { id: taskId.toString() },
      headers: auth(token),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(spy.calls.map((c) => c.name)).toEqual(['releaseClaimFor']);

    const row = await rowOf(taskId);
    expect(row?.state).toBe('open');
    expect(row?.worker).toBeNull();
    // Giving up inside the TTL is free.
    expect(await fake.cooldownUntil(WORKER)).toBe(0n);
  });

  it('409s a task the caller does not hold', async () => {
    const token = await sessionFor(WORKER);
    const taskId = await postTask('verify-open');
    await fake.claimFor(taskId, OTHER_WORKER);
    await syncRow(taskId);

    const res = await call(releaseClaimRoute, {
      method: 'POST',
      params: { id: taskId.toString() },
      headers: auth(token),
    });
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------- submit

const CAPTURED_AT = '2026-09-05T10:00:00.000Z';

function photoProof(hash: Hex, overrides: Record<string, unknown> = {}) {
  return {
    proofHash: hash,
    photo_hash: hash,
    gps: { lat: 39.74362, lon: -8.80713, accuracy_m: 8 },
    gps_unavailable: false,
    worker_confirmed_at_place: true,
    captured_at: CAPTURED_AT,
    answer: 'captured',
    ...overrides,
  };
}

async function insertProofRow(hash: Hex, worker: Address): Promise<void> {
  // T-18 owns `POST /proofs`; until it merges the row is inserted directly. The table is frozen.
  await fixture.db.insert(proofs).values({
    hash,
    storageKey: `proofs/${hash}.jpg`,
    capturedAt: new Date(CAPTURED_AT),
    exactLat: '39.74362',
    exactLon: '-8.80713',
    exactAccuracyM: '8',
    gpsUnavailable: false,
    worker,
  });
}

describe('POST /tasks/:id/submit', () => {
  it('submits a photo proof, mirrors the row and records the observation', async () => {
    const token = await sessionFor(WORKER);
    const taskId = await postTask('photo-of', { lat: 39.74362, lon: -8.80713 });
    await fake.claimFor(taskId, WORKER);
    await syncRow(taskId);

    const hash = keccak256(toBytes('a photo of a storefront')) as Hex;
    await insertProofRow(hash, WORKER);

    const res = await call(submitRoute, {
      method: 'POST',
      params: { id: taskId.toString() },
      headers: auth(token),
      body: photoProof(hash, { note: 'shutters up' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'submitted' });
    expect(spy.calls.map((c) => c.name)).toEqual(['submitFor']);

    const row = await rowOf(taskId);
    expect(row?.state).toBe('submitted');
    expect(row?.proofHash).toBe(hash);
    expect(row?.submittedAt).not.toBeNull();
    expect(row?.answer).toBe('captured');
    expect(row?.note).toBe('shutters up');

    const [observation] = await fixture.db.select().from(observations);
    expect(observation).toMatchObject({
      placeKey: PLACE.place_id,
      claimType: 'photo',
      claimValue: 'captured',
      evidenceHash: hash,
      workerNullifier: NULLIFIER,
      geohash5: AREA,
      seeded: false,
    });
    expect(Number(observation?.confidence)).toBe(0.9);

    const [proofRow] = await fixture.db.select().from(proofs);
    expect(proofRow?.taskId).toBe(taskId);
    expect(proofRow?.placeId).toBe(PLACE.place_id);
  });

  it('400s a proof hash that is not this worker own upload', async () => {
    const token = await sessionFor(WORKER);
    const taskId = await postTask('photo-of');
    await fake.claimFor(taskId, WORKER);
    await syncRow(taskId);

    const hash = keccak256(toBytes('someone else photo')) as Hex;
    await insertProofRow(hash, OTHER_WORKER);

    const res = await call(submitRoute, {
      method: 'POST',
      params: { id: taskId.toString() },
      headers: auth(token),
      body: photoProof(hash),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_request', field: 'proofHash' });
    expect(spy.calls).toEqual([]);
  });

  it('400s when proofHash and photo_hash disagree', async () => {
    const token = await sessionFor(WORKER);
    const taskId = await postTask('photo-of');
    await fake.claimFor(taskId, WORKER);
    await syncRow(taskId);

    const hash = keccak256(toBytes('the photo')) as Hex;
    await insertProofRow(hash, WORKER);

    const res = await call(submitRoute, {
      method: 'POST',
      params: { id: taskId.toString() },
      headers: auth(token),
      body: photoProof(hash, { photo_hash: keccak256(toBytes('another photo')) }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('proofHash');
  });

  it('hashes the body itself for a call-confirm and stores no artefact hash', async () => {
    const token = await sessionFor(WORKER);
    const taskId = await postTask('call-confirm');
    await fake.claimFor(taskId, WORKER);
    await syncRow(taskId);

    const proof = {
      template_id: 'have_item',
      answer: 'yes',
      called_at: CAPTURED_AT,
      note: 'they had two trays left',
    };
    const res = await call(submitRoute, {
      method: 'POST',
      params: { id: taskId.toString() },
      headers: auth(token),
      body: proof,
    });
    expect(res.status).toBe(200);

    const expected = keccak256(toBytes(canonicalJson(proof)));
    expect((await rowOf(taskId))?.proofHash).toBe(expected);
    expect(spy.calls[0]?.args[2]).toBe(expected);

    const [observation] = await fixture.db.select().from(observations);
    expect(observation).toMatchObject({ claimType: 'item_in_stock', claimValue: 'yes' });
    // Self-reported: nothing here reads a call log.
    expect(Number(observation?.confidence)).toBe(0.5);
    expect(observation?.evidenceHash).toBeNull();
  });

  it('409s a task the caller does not hold', async () => {
    const token = await sessionFor(WORKER);
    const taskId = await postTask('photo-of');
    await fake.claimFor(taskId, OTHER_WORKER);
    await syncRow(taskId);

    const hash = keccak256(toBytes('not mine')) as Hex;
    await insertProofRow(hash, WORKER);

    const res = await call(submitRoute, {
      method: 'POST',
      params: { id: taskId.toString() },
      headers: auth(token),
      body: photoProof(hash),
    });
    expect(res.status).toBe(409);
    expect(spy.calls).toEqual([]);
  });

  it('409s once the submit window has closed', async () => {
    const token = await sessionFor(WORKER);
    const taskId = await postTask('photo-of');
    await fake.claimFor(taskId, WORKER);
    await syncRow(taskId);
    await fake.warp(SUBMIT_TTL + 1);

    const hash = keccak256(toBytes('too late')) as Hex;
    await insertProofRow(hash, WORKER);

    const res = await call(submitRoute, {
      method: 'POST',
      params: { id: taskId.toString() },
      headers: auth(token),
      body: photoProof(hash),
    });
    expect(res.status).toBe(409);
    expect(spy.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------- report and earnings

describe('POST /tasks/:id/report', () => {
  it('records the class and never marks', async () => {
    const token = await sessionFor(WORKER);
    const taskId = await postTask('call-confirm');

    const res = await call(reportRoute, {
      method: 'POST',
      params: { id: taskId.toString() },
      headers: auth(token),
      body: { class: 'authentication circumvention' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recorded: true });

    const [logged] = await fixture.db.select().from(screeningLog);
    expect(logged).toMatchObject({
      taskType: 'call-confirm',
      class: 'authentication circumvention',
      reason: 'worker report',
      ruleId: 'worker-report',
      marked: false,
    });
    // The hash names the task; the spec text never reaches a log line.
    expect(logged?.specHash).toBe(specHash(SPECS['call-confirm']));
  });

  it('400s a class that is not one of the six', async () => {
    const token = await sessionFor(WORKER);
    const taskId = await postTask('call-confirm');
    const res = await call(reportRoute, {
      method: 'POST',
      params: { id: taskId.toString() },
      headers: auth(token),
      body: { class: 'being rude' },
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /me/earnings', () => {
  it('sums released work only, never escrowed or posted', async () => {
    const token = await sessionFor(WORKER);

    const paid = await postTask('verify-open');
    await fake.claimFor(paid, WORKER);
    await fake.submitFor(paid, WORKER, keccak256(toBytes('proof')));
    await fake.approve(paid);
    await syncRow(paid);

    // Claimed and submitted, but not settled: money still in escrow is not earnings.
    const pending = await postTask('photo-of', { buyer: OTHER_BUYER });
    await fake.claimFor(pending, WORKER);
    await fake.submitFor(pending, WORKER, keccak256(toBytes('another proof')));
    await syncRow(pending);

    const res = await call(earningsRoute, {
      url: 'http://localhost/me/earnings',
      headers: auth(token),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      released_usdc: 3,
      completed: 1,
      score: 1,
      distinct_raters: 1,
    });
  });

  it('is zero for a worker who has finished nothing', async () => {
    const token = await sessionFor(OTHER_WORKER, '1002');
    const res = await call(earningsRoute, {
      url: 'http://localhost/me/earnings',
      headers: auth(token),
    });
    expect(await res.json()).toEqual({
      released_usdc: 0,
      completed: 0,
      score: 0,
      distinct_raters: 0,
    });
  });
});
