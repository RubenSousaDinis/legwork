/**
 * `POST /tasks/:id/claim` — the 2 km claim radius. A worker with no fix is not refused;
 * one who sends a coordinate past `CLAIM_RADIUS_M` is, with the distance named.
 *
 * And the seeded demo row: a database row with no escrow twin, refused as a 409 before the
 * route asks the chain anything.
 */
import { FakeChain } from '@legwork/chain';
import {
  CLAIM_RADIUS_M,
  DEMO_DISPUTE_WINDOW_S,
  TASK_TYPE_BIT,
  ZERO_ADDRESS,
  specHash,
} from '@legwork/shared';
import { eq } from 'drizzle-orm';
import { type Address } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as claimRoute } from '../../app/tasks/[id]/claim/route';
import { setChainForTests } from '../../src/chain';
import { resetConfigForTests } from '../../src/config';
import { tasks } from '../../src/db/schema';
import { dbState, secondsToDate } from '../../src/services/lifecycle';
import { issueWorkerSession } from '../../src/session';
import { resetSweepClockForTests } from '../../src/services/sweeper';
import { call } from '../app';
import { createTestDb, type TestDb } from '../db';

const AREA = 'ez1dp';
const CLAIM_TTL = 1800;
const SUBMIT_TTL = 3600;
const AMOUNT_UNITS = 3_000_000n;
const PLACE_LAT = 39.74362;
const PLACE_LON = -8.80713;
const METRE_IN_DEGREES = 180 / (Math.PI * 6_371_008.8);

const WORKER = '0x00000000000000000000000000000000000000a1' as Address;
const BUYER = '0x00000000000000000000000000000000000000b1' as Address;
const NULLIFIER = '1001';

const SPEC = {
  place: {
    place_id: 'node/123456',
    name: 'Padaria Central',
    street_address: 'Rua Direita 12',
    locality: 'Leiria',
    country: 'PT',
  },
  question: 'open_now',
};

let fixture: TestDb;
let fake: FakeChain;

async function sessionFor(worker: Address): Promise<string> {
  const { token } = await issueWorkerSession({ worker, nullifier: NULLIFIER, mode: 'walletAuth' });
  return token;
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function postOpenTask(): Promise<bigint> {
  const { taskId } = await fake.post({
    taskType: TASK_TYPE_BIT['verify-open'],
    specHash: specHash(SPEC),
    amount: AMOUNT_UNITS,
    buyer: BUYER,
    buyerAgentId: 0n,
    area: AREA,
    claimTTL: CLAIM_TTL,
    submitTTL: SUBMIT_TTL,
    disputeWindow: DEMO_DISPUTE_WINDOW_S,
  });
  const chainTask = await fake.getTask(taskId);
  await fixture.db.insert(tasks).values({
    taskId,
    taskType: TASK_TYPE_BIT['verify-open'],
    specHash: chainTask.specHash,
    amountUnits: chainTask.amount,
    feeUnits: chainTask.fee,
    buyer: BUYER,
    area: AREA,
    state: dbState(chainTask.state),
    postedAt: secondsToDate(chainTask.postedAt),
    claimTtlS: CLAIM_TTL,
    submitTtlS: SUBMIT_TTL,
    disputeWindowS: DEMO_DISPUTE_WINDOW_S,
    specJson: SPEC,
    buyerTokenHash: `hash-${taskId}`,
    exactLat: String(PLACE_LAT),
    exactLon: String(PLACE_LON),
    payer: BUYER,
    priceUnits: chainTask.amount + chainTask.fee,
  });
  return taskId;
}

beforeEach(async () => {
  resetConfigForTests();
  fixture = await createTestDb();
  fake = new FakeChain();
  fake.mintUsdc(fake.relayerAddress, 1_000_000_000n);
  fake.setWorker(WORKER, { nullifier: BigInt(NULLIFIER), seeded: false, area: AREA, taskTypes: 15 });
  setChainForTests(fake);
  resetSweepClockForTests();
});

afterEach(async () => {
  setChainForTests(undefined);
  await fixture.close();
});

describe('POST /tasks/:id/claim radius', () => {
  it('claimRouteRefusesBeyondTheRadius', async () => {
    const taskId = await postOpenTask();
    const token = await sessionFor(WORKER);
    const farLat = PLACE_LAT + (CLAIM_RADIUS_M + 50) * METRE_IN_DEGREES;

    const refused = await call(claimRoute, {
      method: 'POST',
      params: { id: taskId.toString() },
      headers: auth(token),
      body: { lat: farLat, lon: PLACE_LON },
    });
    expect(refused.status).toBe(422);
    const body = (await refused.json()) as {
      error: string;
      distance_m: number;
      radius_m: number;
    };
    expect(body.error).toBe('too_far_to_claim');
    expect(body.radius_m).toBe(CLAIM_RADIUS_M);
    expect(body.distance_m).toBeGreaterThan(CLAIM_RADIUS_M);
    expect(fake.calls.map((c) => c.fn)).not.toContain('claimFor');

    const allowed = await call(claimRoute, {
      method: 'POST',
      params: { id: taskId.toString() },
      headers: auth(token),
    });
    expect(allowed.status).toBe(200);
    expect((await allowed.json()) as { tx: string }).toHaveProperty('tx');
    expect(fake.calls.map((c) => c.fn)).toContain('claimFor');
  });

});

describe('POST /tasks/:id/claim on a seeded demo row', () => {
  // A seeded demo row was never posted to the escrow. `FakeChain.calls` records writes only,
  // so `getTask` gets its own spy: the point is that the route never asked the chain anything.
  it('claimingASeededDemoRowIs409BeforeAnyChainCall', async () => {
    const getTask = vi.spyOn(fake, 'getTask');
    const claimFor = vi.spyOn(fake, 'claimFor');

    const seededId = 9_000_101n;
    await fixture.db.insert(tasks).values({
      taskId: seededId,
      taskType: TASK_TYPE_BIT['verify-open'],
      specHash: `0x${'ee'.repeat(32)}`,
      amountUnits: AMOUNT_UNITS,
      feeUnits: 450_000n,
      priceUnits: 3_450_000n,
      buyer: ZERO_ADDRESS,
      payer: ZERO_ADDRESS,
      area: AREA,
      state: 'open',
      postedAt: new Date(),
      claimTtlS: CLAIM_TTL,
      submitTtlS: SUBMIT_TTL,
      disputeWindowS: DEMO_DISPUTE_WINDOW_S,
      seeded: true,
      specJson: SPEC,
      buyerTokenHash: 'seeded-demo',
      exactLat: String(PLACE_LAT),
      exactLon: String(PLACE_LON),
    });

    const token = await sessionFor(WORKER);
    const res = await call(claimRoute, {
      method: 'POST',
      params: { id: seededId.toString() },
      headers: auth(token),
      body: { lat: PLACE_LAT, lon: PLACE_LON },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'SeededDemoRow' });

    expect(getTask).not.toHaveBeenCalled();
    expect(claimFor).not.toHaveBeenCalled();
    expect(fake.calls).toEqual([]);

    // The row moved nowhere: still open, still nobody's, still no money behind it.
    const [row] = await fixture.db.select().from(tasks).where(eq(tasks.taskId, seededId));
    expect(row).toMatchObject({ state: 'open', worker: null, seeded: true, buyer: ZERO_ADDRESS });
  });
});
