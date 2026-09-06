/**
 * The public surfaces, checked the only way that means anything: against the raw JSON text.
 *
 * A field-by-field assertion passes on a body that also carries `spec_json` in a corner. The
 * sentinels below are planted in the private columns and then hunted for in the string, so a
 * `...row` spread anywhere in `publicTaskView` fails this test on the first run.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { keccak256, toBytes } from 'viem';
import { GET as feed } from '../../app/public/feed/route';
import { GET as publicTask } from '../../app/public/task/[id]/route';
import { GET as refusals } from '../../app/public/refusals/route';
import { GET as posters } from '../../app/public/posters/route';
import { GET as preflight } from '../../app/public/preflight/route';
import { GET as getTask } from '../../app/tasks/[id]/route';
import { resetConfigForTests } from '../../src/config';
import { resetRateLimitForTests } from '../../src/http/rateLimit';
import { proofs, screeningLog, tasks } from '../../src/db/schema';
import { hashBuyerToken } from '../../src/services/buyerToken';
import {
  MemoryProofStore, imageKey, rawKey, setProofStoreForTests,
} from '../../src/services/proofStore';
import { call } from '../app';
import { createTestDb, type TestDb } from '../db';

const SENTINEL_SPEC = 'SENTINEL-SPEC-7f3a';
const SENTINEL_NOTE = 'SENTINEL-NOTE';
const SENTINEL_TOKEN = 'SENTINEL-TOKEN';
const PAYER = '0xPAYER0000000000000000000000000000000000';
const AGENT_ID = '8004-1207';
const EXACT_LAT = '39.74362';
const EXACT_LON = '-8.80713';

const PROOF_BYTES = Buffer.from(toBytes('the photo bytes as they were uploaded'));
const PROOF_HASH = keccak256(PROOF_BYTES);
/** The re-encoded copy a URL resolves to; no public surface ever names it. */
const SERVED_BYTES = Buffer.from(toBytes('the stripped copy a signed URL serves'));
const WORKER = `0x${'c1'.repeat(20)}`;

const hashOf = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;

let fixture: TestDb;
let proofStore: MemoryProofStore;

beforeEach(async () => {
  resetConfigForTests({ DASHBOARD_URL: 'https://dashboard.legwork.test' });
  resetRateLimitForTests();
  proofStore = new MemoryProofStore();
  setProofStoreForTests(proofStore);
  fixture = await createTestDb();
});

afterEach(async () => {
  setProofStoreForTests(undefined);
  await fixture.close();
});

async function seed(): Promise<void> {
  const postedAt = new Date(Date.now() - 600_000);
  const submittedAt = new Date(Date.now() - 60_000);

  await fixture.db.insert(tasks).values({
    taskId: 1n,
    taskType: 1,
    specHash: hashOf(7),
    amountUnits: 3_000_000n,
    feeUnits: 450_000n,
    priceUnits: 3_450_000n,
    buyer: `0x${'b1'.repeat(20)}`,
    buyerAgentId: AGENT_ID,
    area: 'ez1dp',
    worker: WORKER,
    state: 'submitted',
    postedAt,
    claimedAt: new Date(postedAt.getTime() + 60_000),
    submittedAt,
    proofHash: PROOF_HASH,
    claimTtlS: 1800,
    submitTtlS: 3600,
    disputeWindowS: 120,
    answer: 'open',
    note: SENTINEL_NOTE,
    txPost: hashOf(1),
    txClaim: hashOf(2),
    txSubmit: hashOf(3),
    specJson: { instructions: SENTINEL_SPEC },
    buyerTokenHash: hashBuyerToken(SENTINEL_TOKEN),
    exactLat: EXACT_LAT,
    exactLon: EXACT_LON,
    agentId: AGENT_ID,
    payer: PAYER,
    authNonce: hashOf(9),
  });

  await fixture.db.insert(proofs).values({
    hash: PROOF_HASH,
    storageKey: 'proofs/one.jpg',
    capturedAt: submittedAt,
    exactLat: EXACT_LAT,
    exactLon: EXACT_LON,
    gpsUnavailable: false,
    worker: WORKER,
    taskId: 1n,
  });
  await proofStore.put(rawKey(PROOF_HASH), PROOF_BYTES, 'application/octet-stream');
  await proofStore.put(imageKey(PROOF_HASH), SERVED_BYTES, 'image/jpeg');

  await fixture.db.insert(screeningLog).values([
    {
      id: 's1', taskType: 'call-confirm', class: 'authentication circumvention',
      reason: `denylist matched ${SENTINEL_SPEC}`, ruleId: 'deny.auth', specHash: hashOf(11),
      marked: true, markTx: hashOf(12), agentId: AGENT_ID, payer: PAYER,
    },
    {
      id: 's2', taskType: 'verify-open', class: 'referral fraud',
      reason: `denylist matched ${SENTINEL_SPEC}`, ruleId: 'deny.referral', specHash: hashOf(13),
      marked: false, agentId: AGENT_ID, payer: PAYER,
    },
  ]);
}

describe('/public/*', () => {
  it('publicNeverLeaksSpecOrExactCoordinate', async () => {
    await seed();

    const bodies: Record<string, string> = {
      '/public/feed': await (await call(feed, { url: 'http://localhost/public/feed' })).text(),
      '/public/task/1': await (
        await call(publicTask, { url: 'http://localhost/public/task/1', params: { id: '1' } })
      ).text(),
      '/public/refusals': await (
        await call(refusals, { url: 'http://localhost/public/refusals' })
      ).text(),
      '/public/posters': await (
        await call(posters, { url: 'http://localhost/public/posters' })
      ).text(),
      '/public/preflight': await (
        await call(preflight, {
          url: 'http://localhost/public/preflight?task_type=verify-open&area=ez5ku',
        })
      ).text(),
      'GET /tasks/1': await (
        await call(getTask, { url: 'http://localhost/tasks/1', params: { id: '1' } })
      ).text(),
    };

    const forbidden = [
      SENTINEL_SPEC, '0xPAYER', AGENT_ID, SENTINEL_TOKEN, hashBuyerToken(SENTINEL_TOKEN),
      EXACT_LAT, EXACT_LON, 'exact_lat', 'spec_json', 'buyer_token', '"url"',
    ];
    for (const [surface, text] of Object.entries(bodies)) {
      for (const secret of forbidden) {
        expect(text, `${surface} leaked ${secret}`).not.toContain(secret);
      }
    }

    const task = JSON.parse(bodies['/public/task/1'] as string) as {
      price_usdc: number; fee_usdc: number; answer: string;
      proof: { hash_ok: boolean; coordinate_rounded: { lat: number; lon: number } };
    };
    expect(task.proof.coordinate_rounded).toEqual({ lat: 39.744, lon: -8.807 });
    expect(task.proof.hash_ok).toBe(true);
    expect(task.price_usdc).toBe(3);
    expect(task.fee_usdc).toBe(0.45);
    expect(task.answer).toBe('open');
    expect(bodies['/public/task/1']).not.toContain(SENTINEL_NOTE);

    const refusalBody = JSON.parse(bodies['/public/refusals'] as string) as {
      classes: { class: string; count: number }[];
      recent: Record<string, unknown>[];
      examples: Record<string, unknown>[];
    };
    expect(refusalBody.classes).toHaveLength(6);
    expect(refusalBody.classes).toContainEqual({ class: 'authentication circumvention', count: 1 });
    expect(refusalBody.classes).toContainEqual({ class: 'credential fraud', count: 0 });
    // `recent` is a count of refusals, not a copy of them: no reason, no spec hash, no payer.
    expect(Object.keys(refusalBody.recent[0] ?? {}).sort()).toEqual([
      'at', 'class', 'marked', 'rule_id', 'task_type',
    ]);
    expect(refusalBody.examples.every((row) => row.example === true)).toBe(true);
  });

  it('serves the feed newest first and refuses a preflight that is not a geohash', async () => {
    await seed();

    const listed = (await (await call(feed, { url: 'http://localhost/public/feed' })).json()) as {
      tasks: { task_id: string; seeded: boolean; links: Record<string, string> }[];
    };
    expect(listed.tasks).toHaveLength(1);
    expect(listed.tasks[0]?.task_id).toBe('1');
    expect(listed.tasks[0]?.seeded).toBe(false);
    expect(listed.tasks[0]?.links.post).toBe(`https://sepolia.basescan.org/tx/${hashOf(1)}`);

    const bad = await call(preflight, {
      url: 'http://localhost/public/preflight?task_type=verify-open&area=nope',
    });
    expect(bad.status).toBe(400);
    expect((await bad.json()) as { error: string }).toMatchObject({ error: 'invalid_request' });

    const missing = await call(publicTask, {
      url: 'http://localhost/public/task/42',
      params: { id: '42' },
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not_found' });
  });
});
