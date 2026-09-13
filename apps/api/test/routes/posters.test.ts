/**
 * `GET /public/posters` reads the T-30 ledger rather than a stub: an allowlisted payer is the
 * operator's own wallet and counts for nothing; everybody else is external, and so is every
 * task they funded. The body never carries a payer.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as posters } from '../../app/public/posters/route';
import { resetConfigForTests } from '../../src/config';
import { resetRateLimitForTests } from '../../src/http/rateLimit';
import { posters as postersTable, tasks } from '../../src/db/schema';
import { call } from '../app';
import { createTestDb, type TestDb } from '../db';

const DEMO_WALLET = `0x${'c3'.repeat(20)}`;
const EXTERNAL = `0x${'a1'.repeat(20)}`;
const OTHER_EXTERNAL = `0x${'b2'.repeat(20)}`;

const hashOf = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;

let fixture: TestDb;

beforeEach(async () => {
  resetConfigForTests({ DASHBOARD_URL: 'https://dashboard.legwork.test' });
  resetRateLimitForTests();
  fixture = await createTestDb();
});

afterEach(async () => {
  await fixture.close();
});

async function task(taskId: bigint, payer: string): Promise<void> {
  await fixture.db.insert(tasks).values({
    taskId,
    taskType: 1,
    specHash: hashOf(Number(taskId) + 100),
    amountUnits: 3_000_000n,
    feeUnits: 450_000n,
    priceUnits: 3_450_000n,
    buyer: payer,
    area: 'ez1dp',
    state: 'open',
    postedAt: new Date(),
    claimTtlS: 1800,
    submitTtlS: 3600,
    disputeWindowS: 120,
    seeded: false,
    txPost: hashOf(Number(taskId)),
    specJson: { place: { locality: 'Leiria', country: 'PT' } },
    buyerTokenHash: hashOf(Number(taskId) + 200),
    payer,
  });
}

describe('GET /public/posters', () => {
  it('counts nothing on an empty ledger and says which ledger', async () => {
    const res = await call(posters, { url: 'http://localhost/public/posters' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      distinct_external_buyers: 0,
      external_tasks: 0,
      source: 'posters',
    });
  });

  it('counts external payers and their tasks, never the allowlisted wallet', async () => {
    const now = new Date();
    await fixture.db.insert(postersTable).values([
      { payer: DEMO_WALLET, agentId: '9196', firstSeen: now, allowlisted: true },
      { payer: EXTERNAL, agentId: null, firstSeen: now, allowlisted: false },
      { payer: OTHER_EXTERNAL, agentId: '77', firstSeen: now, allowlisted: false },
    ]);
    await task(1n, DEMO_WALLET);
    await task(2n, DEMO_WALLET);
    await task(3n, EXTERNAL);
    await task(4n, EXTERNAL.toUpperCase().replace('0X', '0x'));
    await task(5n, OTHER_EXTERNAL);

    const res = await call(posters, { url: 'http://localhost/public/posters' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ distinct_external_buyers: 2, external_tasks: 3, source: 'posters' });

    // Counts only. An address on a public page is a standing invitation to grief its holder.
    const text = JSON.stringify(body).toLowerCase();
    expect(text).not.toContain(EXTERNAL.toLowerCase());
    expect(text).not.toContain(DEMO_WALLET.toLowerCase());
    expect(text).not.toContain('9196');
  });
});
