/**
 * The API as the default reviewer, and the sweep that replaces a keeper.
 *
 * The four named cases are T-17 §8's PR2 rows. What they are really asserting is one sentence
 * from the architecture: an auto-dispute is **submit then dispute**, both onchain, never a 4xx
 * and never a silent drop — so every one of them checks `FakeChain.calls`, in order, and not
 * just the status code.
 *
 * The fixture below is deliberately a copy of `lifecycle.test.ts`'s rather than an import: one
 * test file importing another registers its suites twice. §4 owns two test files here, so a
 * third module to share them is not mine to add.
 */
import { FakeChain } from '@legwork/chain';
import {
  DEMO_DISPUTE_WINDOW_S,
  GEOFENCE_M,
  TASK_TYPE_BIT,
  specHash,
  type TaskType,
} from '@legwork/shared';
import { eq } from 'drizzle-orm';
import { keccak256, toBytes, type Address, type Hex } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as submitRoute } from '../../app/tasks/[id]/submit/route';
import { POST as sweepRoute } from '../../app/admin/sweep/route';
import { GET as listRoute } from '../../app/tasks/list/route';
import { call } from '../../test/app';
import { createTestDb, type TestDb } from '../../test/db';
import { setChainForTests } from '../chain';
import { resetConfigForTests } from '../config';
import { adminAudit, observations, proofs, screeningLog, tasks } from '../db/schema';
import { resetRateLimitForTests } from '../http/rateLimit';
import { issueWorkerSession } from '../session';
import { dbState, secondsToDate, settleIfEligible } from './lifecycle';
import { checkGeofence, checkReuse } from './proofChecks';
import { reconcileOpen, reconcileTask } from './reconcile';
import { resetSweepClockForTests, sweep } from './sweeper';

const AREA = 'ez1dp';
const CLAIM_TTL = 1800;
const SUBMIT_TTL = 3600;
const AMOUNT_UNITS = 3_000_000n;

/** The demo shop's coordinate, and the one every geofence case measures from. */
const PLACE_LAT = 39.74362;
const PLACE_LON = -8.80713;
/**
 * One metre of latitude in degrees, derived from the same mean Earth radius `distanceM` uses,
 * so "200 m north" is 200 m to the check and not 200.2.
 */
const METRE_IN_DEGREES = 180 / (Math.PI * 6_371_008.8);
const LAT_200_M = PLACE_LAT + 200 * METRE_IN_DEGREES;
const LAT_80_M = PLACE_LAT + 80 * METRE_IN_DEGREES;

interface Place {
  place_id: string;
  name: string;
  street_address: string;
  locality: string;
  country: 'PT';
}

const PLACE_P: Place = {
  place_id: 'node/650194167',
  name: 'Farmacia Lis',
  street_address: 'Rua Direita 12',
  locality: 'Leiria',
  country: 'PT',
};

const PLACE_Q: Place = { ...PLACE_P, place_id: 'node/650194168', name: 'Padaria Central' };

const photoSpec = (place: Place) => ({
  place,
  subject: 'storefront',
  subject_detail: 'the main door',
  claimed_state: 'shutters down',
  source: 'osm',
});

const WORKER = '0x00000000000000000000000000000000000000a1' as Address;
const OTHER_WORKER = '0x00000000000000000000000000000000000000a2' as Address;
const BUYER = '0x00000000000000000000000000000000000000b1' as Address;

const NULLIFIER = '1001';
const OTHER_NULLIFIER = '1002';
const ADMIN_KEY = 'admin-key-of-at-least-a-few-characters';
const SWEEP_SECRET = 'sweep-secret-of-at-least-a-few-characters';

const CAPTURED_AT = '2026-09-06T10:00:00.000Z';

let fixture: TestDb;
let fake: FakeChain;

/** The writes a route or a pass made since the last `arrange()`, in order. */
const writes = (): string[] => fake.calls.map((c) => c.fn);
const arrange = (): void => {
  fake.calls.length = 0;
};

async function sessionFor(worker: Address, nullifier: string): Promise<string> {
  const { token } = await issueWorkerSession({ worker, nullifier, mode: 'walletAuth' });
  return token;
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

interface PostOptions {
  place?: Place;
  type?: TaskType;
  lat?: number | null;
  lon?: number | null;
  claimTtl?: number;
  disputeWindow?: number;
}

/** Posts on the fake and mirrors the row, the way T-16's `POST /tasks` will. */
async function postTask(options: PostOptions = {}): Promise<bigint> {
  const type = options.type ?? 'photo-of';
  const spec = photoSpec(options.place ?? PLACE_P);
  const claimTtl = options.claimTtl ?? CLAIM_TTL;
  const disputeWindow = options.disputeWindow ?? DEMO_DISPUTE_WINDOW_S;

  const { taskId } = await fake.post({
    taskType: TASK_TYPE_BIT[type],
    specHash: specHash(spec),
    amount: AMOUNT_UNITS,
    buyer: BUYER,
    buyerAgentId: 0n,
    area: AREA,
    claimTTL: claimTtl,
    submitTTL: SUBMIT_TTL,
    disputeWindow,
  });
  const chainTask = await fake.getTask(taskId);

  await fixture.db.insert(tasks).values({
    taskId,
    taskType: TASK_TYPE_BIT[type],
    specHash: chainTask.specHash,
    amountUnits: chainTask.amount,
    feeUnits: chainTask.fee,
    buyer: BUYER,
    area: AREA,
    state: dbState(chainTask.state),
    postedAt: secondsToDate(chainTask.postedAt),
    claimTtlS: claimTtl,
    submitTtlS: SUBMIT_TTL,
    disputeWindowS: disputeWindow,
    specJson: spec,
    buyerTokenHash: `hash-${taskId}`,
    exactLat: options.lat === null ? null : String(options.lat ?? PLACE_LAT),
    exactLon: options.lon === null ? null : String(options.lon ?? PLACE_LON),
    payer: BUYER,
    priceUnits: chainTask.amount + chainTask.fee,
  });
  return taskId;
}

async function syncRow(taskId: bigint): Promise<void> {
  const chainTask = await fake.getTask(taskId);
  await fixture.db
    .update(tasks)
    .set({
      state: dbState(chainTask.state),
      worker: /^0x0{40}$/.test(chainTask.worker) ? null : chainTask.worker,
      claimedAt: chainTask.claimedAt === 0n ? null : secondsToDate(chainTask.claimedAt),
      submittedAt: chainTask.submittedAt === 0n ? null : secondsToDate(chainTask.submittedAt),
      proofHash: /^0x0{64}$/.test(chainTask.proofHash) ? null : chainTask.proofHash,
    })
    .where(eq(tasks.taskId, taskId));
}

async function rowOf(taskId: bigint) {
  const rows = await fixture.db.select().from(tasks).where(eq(tasks.taskId, taskId));
  return rows[0];
}

interface ProofRowOptions {
  lat?: number | null;
  lon?: number | null;
  gpsUnavailable?: boolean;
}

/** T-18 owns `POST /proofs`; these rows are what it writes. */
async function insertProofRow(
  hash: Hex,
  worker: Address,
  options: ProofRowOptions = {},
): Promise<void> {
  const gpsUnavailable = options.gpsUnavailable ?? false;
  await fixture.db.insert(proofs).values({
    hash,
    storageKey: `proofs/${hash}.jpg`,
    capturedAt: new Date(CAPTURED_AT),
    exactLat: options.lat === null ? null : String(options.lat ?? PLACE_LAT),
    exactLon: options.lon === null ? null : String(options.lon ?? PLACE_LON),
    exactAccuracyM: '8',
    gpsUnavailable,
    worker,
  });
}

function photoBody(hash: Hex, overrides: Record<string, unknown> = {}) {
  return {
    proofHash: hash,
    photo_hash: hash,
    gps: { lat: PLACE_LAT, lon: PLACE_LON, accuracy_m: 8 },
    gps_unavailable: false,
    worker_confirmed_at_place: true,
    captured_at: CAPTURED_AT,
    answer: 'captured',
    ...overrides,
  };
}

const submit = (taskId: bigint, token: string, body: unknown) =>
  call(submitRoute, {
    method: 'POST',
    params: { id: taskId.toString() },
    headers: auth(token),
    body,
  });

/** Claims a task for a worker and mirrors the row, ready to submit against. */
async function claimed(worker: Address, options: PostOptions = {}): Promise<bigint> {
  const taskId = await postTask(options);
  await fake.claimFor(taskId, worker);
  await syncRow(taskId);
  return taskId;
}

beforeEach(async () => {
  resetConfigForTests();
  resetRateLimitForTests();
  resetSweepClockForTests();
  fixture = await createTestDb();
  fake = new FakeChain();
  fake.mintUsdc(fake.relayerAddress, 1_000_000_000n);
  fake.setWorker(WORKER, { nullifier: BigInt(NULLIFIER), seeded: false, area: AREA, taskTypes: 15 });
  fake.setWorker(OTHER_WORKER, {
    nullifier: BigInt(OTHER_NULLIFIER),
    seeded: false,
    area: AREA,
    taskTypes: 15,
  });
  setChainForTests(fake);
});

afterEach(async () => {
  setChainForTests(undefined);
  await fixture.close();
});

// ---------------------------------------------------------------- §8 reuseAutoDisputes

describe('proof reuse', () => {
  it('reuseAutoDisputes', async () => {
    const token = await sessionFor(WORKER, NULLIFIER);
    const hash = keccak256(toBytes('one photo of one storefront')) as Hex;

    // Task A: the same worker, the same place, the same kind of errand — already paid.
    const a = await claimed(WORKER);
    await insertProofRow(hash, WORKER);
    await fake.submitFor(a, WORKER, hash);
    await fake.approve(a);
    await syncRow(a);
    await fixture.db
      .update(proofs)
      .set({ taskId: a, placeId: PLACE_P.place_id })
      .where(eq(proofs.hash, hash));

    // Task B: same place, same type, and the worker hands in the same file.
    const b = await claimed(WORKER);
    arrange();
    const res = await submit(b, token, photoBody(hash));

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body).toMatchObject({ status: 'disputed', auto_dispute_reason: 'proof_reuse' });
    expect(body.dispute_tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.tx).not.toBe(body.dispute_tx);

    // Submit first, dispute second, both onchain. Never a refusal to submit.
    expect(writes()).toEqual(['submitFor', 'dispute']);
    const [submitCall, disputeCall] = fake.calls;
    expect(submitCall?.args[0]).toBe(b);
    expect(String(submitCall?.args[1]).toLowerCase()).toBe(WORKER.toLowerCase());
    expect(submitCall?.args[2]).toBe(hash);
    expect(disputeCall?.args).toEqual([b]);

    expect((await rowOf(b))?.state).toBe('disputed');
    expect((await rowOf(b))?.autoDisputeReason).toBe('proof_reuse');

    const [logged] = await fixture.db.select().from(screeningLog);
    expect(logged?.ruleId).toBe('submit-reuse');
    expect(logged?.marked).toBe(false);
    // An outcome, not a refusal: nothing here names an abuse class and nothing marks.
    expect(logged?.class).toBeNull();
    expect(logged?.specHash).toBe(specHash(photoSpec(PLACE_P)));

    // Kept and labelled rather than dropped — trusted by nothing.
    const [observation] = await fixture.db.select().from(observations);
    expect(Number(observation?.confidence)).toBe(0.1);
  });

  it('lets a different hash for a different place through', async () => {
    const spent = keccak256(toBytes('the spent photo')) as Hex;

    const a = await claimed(WORKER);
    await insertProofRow(spent, WORKER);
    await fake.submitFor(a, WORKER, spent);
    await fake.approve(a);
    await syncRow(a);
    await fixture.db
      .update(proofs)
      .set({ taskId: a, placeId: PLACE_P.place_id })
      .where(eq(proofs.hash, spent));

    const other = await sessionFor(OTHER_WORKER, OTHER_NULLIFIER);
    const fresh = keccak256(toBytes('a different photo')) as Hex;
    const c = await claimed(OTHER_WORKER, { place: PLACE_Q });
    await insertProofRow(fresh, OTHER_WORKER);

    arrange();
    const res = await submit(c, other, photoBody(fresh));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tx: expect.stringMatching(/^0x[0-9a-f]{64}$/),
      status: 'submitted',
    });
    expect(writes()).toEqual(['submitFor']);
    expect(await fixture.db.select().from(screeningLog)).toEqual([]);
  });

  it('does not match a task against itself', async () => {
    const hash = keccak256(toBytes('the only photo')) as Hex;
    const taskId = await claimed(WORKER);
    await insertProofRow(hash, WORKER);
    await fixture.db
      .update(proofs)
      .set({ taskId, placeId: PLACE_P.place_id })
      .where(eq(proofs.hash, hash));
    await fixture.db.update(tasks).set({ proofHash: hash }).where(eq(tasks.taskId, taskId));

    const row = await rowOf(taskId);
    expect(row).toBeDefined();
    expect(await checkReuse({ proofHash: hash, task: row! })).toEqual({ hit: false });
  });
});

// ---------------------------------------------------------------- §8 geofenceAutoDisputes

describe('geofence', () => {
  it('geofenceAutoDisputes', async () => {
    const token = await sessionFor(WORKER, NULLIFIER);
    const far = keccak256(toBytes('a photo taken two hundred metres away')) as Hex;

    const outside = await claimed(WORKER);
    await insertProofRow(far, WORKER, { lat: LAT_200_M });

    arrange();
    const disputed = await submit(outside, token, photoBody(far, { gps: { lat: LAT_200_M, lon: PLACE_LON, accuracy_m: 8 } }));
    expect(disputed.status).toBe(200);
    const body = (await disputed.json()) as Record<string, string>;
    expect(body).toMatchObject({ status: 'disputed', auto_dispute_reason: 'geofence' });
    expect(body.dispute_tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(writes()).toEqual(['submitFor', 'dispute']);

    const [logged] = await fixture.db.select().from(screeningLog);
    expect(logged?.ruleId).toBe('submit-geofence');
    expect(logged?.reason).toContain('200 m');

    // 80 m is inside the fence and is simply a submission.
    const other = await sessionFor(OTHER_WORKER, OTHER_NULLIFIER);
    const near = keccak256(toBytes('a photo taken eighty metres away')) as Hex;
    const inside = await claimed(OTHER_WORKER, { place: PLACE_Q });
    await insertProofRow(near, OTHER_WORKER, { lat: LAT_80_M });

    arrange();
    const accepted = await submit(inside, other, photoBody(near, { gps: { lat: LAT_80_M, lon: PLACE_LON, accuracy_m: 8 } }));
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).status).toBe('submitted');
    expect(writes()).toEqual(['submitFor']);
  });

  it('disputes outside the fence and not inside it', async () => {
    const taskId = await postTask();
    const task = await rowOf(taskId);
    expect(task).toBeDefined();

    const northOf = (metres: number) => ({
      exactLat: String(PLACE_LAT + metres * METRE_IN_DEGREES),
      exactLon: String(PLACE_LON),
      gpsUnavailable: false,
    });

    expect(checkGeofence({ proof: northOf(GEOFENCE_M + 1), task: task! })).toEqual({
      hit: true,
      distance_m: GEOFENCE_M + 1,
    });
    expect(checkGeofence({ proof: northOf(GEOFENCE_M - 1), task: task! })).toEqual({ hit: false });

    // No coordinate on either side is not an accusation.
    expect(
      checkGeofence({ proof: { exactLat: null, exactLon: null, gpsUnavailable: false }, task: task! }),
    ).toEqual({ hit: false });
    expect(checkGeofence({ proof: null, task: task! })).toEqual({ hit: false });
  });
});

// ---------------------------------------------------------------- §8 gpsDowngradeAccepted

describe('GPS downgrade', () => {
  it('gpsDowngradeAccepted', async () => {
    const token = await sessionFor(WORKER, NULLIFIER);
    const hash = keccak256(toBytes('a photo from a phone with no fix')) as Hex;

    const taskId = await claimed(WORKER);
    await insertProofRow(hash, WORKER, { lat: null, lon: null, gpsUnavailable: true });

    arrange();
    const res = await submit(
      taskId,
      token,
      photoBody(hash, { gps: null, gps_unavailable: true, worker_confirmed_at_place: true }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('submitted');
    // Accepted, not disputed: a phone with no fix is not evidence of a worker being elsewhere.
    expect(writes()).toEqual(['submitFor']);

    const [observation] = await fixture.db.select().from(observations);
    // Labelled at 0.6 rather than 0.9 — the downgrade is on the record, not hidden.
    expect(Number(observation?.confidence)).toBe(0.6);

    // A downgrade without the worker's tap is not a downgrade, it is a missing field.
    const second = await claimed(OTHER_WORKER, { place: PLACE_Q });
    const otherToken = await sessionFor(OTHER_WORKER, OTHER_NULLIFIER);
    const otherHash = keccak256(toBytes('another photo with no fix')) as Hex;
    await insertProofRow(otherHash, OTHER_WORKER, { lat: null, lon: null, gpsUnavailable: true });

    arrange();
    const unconfirmed = await submit(
      second,
      otherToken,
      photoBody(otherHash, { gps: null, gps_unavailable: true, worker_confirmed_at_place: false }),
    );
    expect(unconfirmed.status).toBe(400);
    expect((await unconfirmed.json()).error).toBe('invalid_request');

    // `gps === null ⇔ gps_unavailable === true`: a coordinate beside the flag is incoherent.
    const contradictory = await submit(
      second,
      otherToken,
      photoBody(otherHash, { gps_unavailable: true }),
    );
    expect(contradictory.status).toBe(400);
    expect((await contradictory.json()).error).toBe('invalid_request');

    // Neither 400 reached the chain.
    expect(writes()).toEqual([]);
  });

  it('skips the fence rather than passing it', async () => {
    const taskId = await postTask();
    const task = await rowOf(taskId);
    // Far outside the fence *and* flagged unavailable: the skip has to win, or a worker whose
    // phone last fixed across town would be disputed for standing still.
    expect(
      checkGeofence({
        proof: { exactLat: String(LAT_200_M), exactLon: String(PLACE_LON), gpsUnavailable: true },
        task: task!,
      }),
    ).toEqual({ skipped: 'gps_unavailable' });
  });
});

// ---------------------------------------------------------------- §8 sweeperAutoReleasesAfterWindow

describe('sweep', () => {
  it('sweeperAutoReleasesAfterWindow', async () => {
    const hash = keccak256(toBytes('a proof waiting out its window')) as Hex;
    const taskId = await claimed(WORKER, { disputeWindow: 120 });
    await insertProofRow(hash, WORKER);
    await fake.submitFor(taskId, WORKER, hash);
    await syncRow(taskId);

    // One second short of the window: the contract would revert, so the pass does not ask.
    await fake.warp(119);
    arrange();
    expect(await sweep()).toEqual({ expired: [], auto_released: [] });
    expect(writes()).toEqual([]);

    await fake.warp(1);
    arrange();
    expect(await sweep()).toEqual({ expired: [], auto_released: [Number(taskId)] });
    expect(writes()).toEqual(['autoRelease']);
    expect(fake.calls[0]?.args).toEqual([taskId]);
    expect((await rowOf(taskId))?.state).toBe('released');

    // Settled is settled: a second pass finds nothing to do.
    arrange();
    expect(await sweep()).toEqual({ expired: [], auto_released: [] });
    expect(writes()).toEqual([]);

    // An open task one second past its claim TTL is refunded to the buyer.
    const stranded = await postTask({ claimTtl: 60 });
    await fake.warp(61);
    arrange();
    expect(await sweep()).toEqual({ expired: [Number(stranded)], auto_released: [] });
    expect(writes()).toEqual(['expire']);
    expect(fake.calls[0]?.args).toEqual([stranded]);
    expect((await rowOf(stranded))?.state).toBe('refunded');

    arrange();
    expect(await sweep()).toEqual({ expired: [], auto_released: [] });
    expect(writes()).toEqual([]);
  });

  it('expires a claim that outran its submit window, not its claim TTL', async () => {
    const taskId = await claimed(WORKER);

    // Past the claim TTL: still the worker's task to submit.
    await fake.warp(CLAIM_TTL + 1);
    arrange();
    expect(await sweep()).toEqual({ expired: [], auto_released: [] });

    await fake.warp(SUBMIT_TTL);
    arrange();
    expect(await sweep()).toEqual({ expired: [Number(taskId)], auto_released: [] });
    expect((await rowOf(taskId))?.state).toBe('refunded');
  });

  it('sweeps at most once per interval, and never fails the list it runs under', async () => {
    const token = await sessionFor(WORKER, NULLIFIER);
    const stranded = await postTask({ claimTtl: 60 });
    await fake.warp(61);

    arrange();
    const first = await call(listRoute, { url: 'http://localhost/tasks/list', headers: auth(token) });
    expect(first.status).toBe(200);
    expect(writes()).toEqual(['expire']);

    // A second reader inside the interval rides on the pass that already ran.
    const second = await call(listRoute, { url: 'http://localhost/tasks/list', headers: auth(token) });
    expect(second.status).toBe(200);
    expect(writes()).toEqual(['expire']);
    expect((await rowOf(stranded))?.state).toBe('refunded');
  });
});

// ---------------------------------------------------------------- reconcile and settle

describe('reconcile', () => {
  it('mirrors a row the chain has moved past', async () => {
    const taskId = await postTask();
    await fake.claimFor(taskId, WORKER);
    // The row still says `open`: the write landed after somebody's request gave up.

    const reconciled = await reconcileTask(taskId);
    expect(reconciled?.state).toBe('claimed');
    expect(reconciled?.worker?.toLowerCase()).toBe(WORKER.toLowerCase());
    expect((await rowOf(taskId))?.claimedAt).not.toBeNull();
  });

  it('leaves a settled row alone and reads every live one', async () => {
    const live = await claimed(WORKER);
    const settled = await postTask();
    await fixture.db.update(tasks).set({ state: 'released' }).where(eq(tasks.taskId, settled));

    const rows = await reconcileOpen();
    expect(rows.map((r) => r.taskId)).toEqual([live]);
  });
});

describe('settleIfEligible', () => {
  it('releases one task on a status read, and is quiet when nothing is due', async () => {
    const hash = keccak256(toBytes('a proof read into release')) as Hex;
    const taskId = await claimed(WORKER, { disputeWindow: 120 });
    await insertProofRow(hash, WORKER);
    await fake.submitFor(taskId, WORKER, hash);
    await syncRow(taskId);

    arrange();
    expect(await settleIfEligible(taskId)).toBeNull();
    expect(writes()).toEqual([]);

    await fake.warp(120);
    arrange();
    const settlement = await settleIfEligible(taskId);
    expect(settlement?.action).toBe('autoRelease');
    expect(settlement?.tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect((await rowOf(taskId))?.state).toBe('released');

    // Idempotent: the second reader gets `null`, not a revert.
    arrange();
    expect(await settleIfEligible(taskId)).toBeNull();
  });

  it('is null for a task that does not exist', async () => {
    expect(await settleIfEligible(999n)).toBeNull();
  });
});

// ---------------------------------------------------------------- POST /admin/sweep

describe('POST /admin/sweep', () => {
  const sweepCall = (headers: Record<string, string>) =>
    call(sweepRoute, { method: 'POST', url: 'http://localhost/admin/sweep', headers });

  it('is 404 while the admin surface is off and no cron secret is set', async () => {
    const res = await sweepCall({});
    expect(res.status).toBe(404);
  });

  it('runs the pass for an operator and audits it', async () => {
    resetConfigForTests({ ADMIN_API_KEY: ADMIN_KEY });
    const stranded = await postTask({ claimTtl: 60 });
    await fake.warp(61);

    arrange();
    const res = await sweepCall({ 'x-admin-key': ADMIN_KEY });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, expired: [Number(stranded)], auto_released: [] });
    expect(writes()).toEqual(['expire']);

    const [audited] = await fixture.db.select().from(adminAudit);
    expect(audited?.action).toBe('/admin/sweep');
    expect(audited?.payload).toMatchObject({ route: '/admin/sweep', outcome: 'ok' });
    // The key is never stored, echoed or logged.
    expect(JSON.stringify(audited?.payload)).not.toContain(ADMIN_KEY);
  });

  it('lets a cron in on X-Sweep-Secret alone, and refuses a wrong one', async () => {
    resetConfigForTests({ SWEEP_SECRET });

    const res = await sweepCall({ 'x-sweep-secret': SWEEP_SECRET });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, expired: [], auto_released: [] });

    // Wrong secret, and no admin key configured: the surface is not there.
    const wrong = await sweepCall({ 'x-sweep-secret': 'not-the-secret-at-all-but-long-enough' });
    expect(wrong.status).toBe(404);

    resetConfigForTests({ SWEEP_SECRET, ADMIN_API_KEY: ADMIN_KEY });
    const unauthorized = await sweepCall({ 'x-sweep-secret': 'not-the-secret-at-all-but-long' });
    expect(unauthorized.status).toBe(401);

    expect(await fixture.db.select().from(adminAudit)).toHaveLength(1);
  });
});
