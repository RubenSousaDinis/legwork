/**
 * T-30 §7-3: `upsertPoster` and `listPosters` over pglite and `FakeChain`.
 *
 * `distinct_external_buyers` is a claim the submission makes out loud, so it is counted from
 * `allowlisted === false` — read from `ITaskEscrow.allowlistedBuyer`, which is the only
 * thing that knows which wallets are the operator's own.
 */
import { FakeChain } from '@legwork/chain';
import type { Address } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../test/db';
import type { ServiceDeps } from './identity';
import { listPosters, resetPosterCacheForTests, upsertPoster } from './posters';

const EXTERNAL = `0x${'a1'.repeat(20)}` as Address;
const OTHER_EXTERNAL = `0x${'b2'.repeat(20)}` as Address;
const DEMO_WALLET = `0x${'c3'.repeat(20)}` as Address;

let test: TestDb;
let fake: FakeChain;
let clock: Date;

function deps(): ServiceDeps {
  return { chain: fake, txQueue: fake, db: test.db, now: () => clock };
}

beforeEach(async () => {
  test = await createTestDb();
  fake = new FakeChain();
  clock = new Date('2026-09-07T09:00:00.000Z');
  resetPosterCacheForTests();
});
afterEach(async () => {
  await test.close();
  resetPosterCacheForTests();
});

describe('upsertPoster', () => {
  it('inserts the payer with first_seen and no id', async () => {
    await upsertPoster({ payer: EXTERNAL, agentId: null }, deps());

    const { posters } = await listPosters(deps());
    expect(posters).toHaveLength(1);
    expect(posters[0]).toMatchObject({ payer: EXTERNAL, agent_id: null, allowlisted: false });
    expect(posters[0]?.first_seen).toEqual(clock);
  });

  it('fills the agent id in on a later task and never moves first_seen', async () => {
    await upsertPoster({ payer: EXTERNAL, agentId: null }, deps());
    const firstSeen = (await listPosters(deps())).posters[0]?.first_seen;

    clock = new Date('2026-09-08T09:00:00.000Z');
    await upsertPoster({ payer: EXTERNAL, agentId: 1207n }, deps());

    const { posters } = await listPosters(deps());
    expect(posters).toHaveLength(1);
    expect(posters[0]?.agent_id).toBe('1207');
    expect(posters[0]?.first_seen).toEqual(firstSeen);
  });

  it('does not erase an id when a later task verifies none', async () => {
    await upsertPoster({ payer: EXTERNAL, agentId: 1207n }, deps());
    await upsertPoster({ payer: EXTERNAL, agentId: null }, deps());
    expect((await listPosters(deps())).posters[0]?.agent_id).toBe('1207');
  });

  it('reads allowlisted from the escrow, not from configuration', async () => {
    await fake.setAllowlistedBuyer(DEMO_WALLET, true);
    await upsertPoster({ payer: DEMO_WALLET, agentId: null }, deps());
    await upsertPoster({ payer: EXTERNAL, agentId: null }, deps());

    const { posters } = await listPosters(deps());
    const byPayer = new Map(posters.map((p) => [p.payer, p.allowlisted]));
    expect(byPayer.get(DEMO_WALLET)).toBe(true);
    expect(byPayer.get(EXTERNAL)).toBe(false);
  });

  it('caches the allowlist read for 60 s per payer, then reads again', async () => {
    const reads: Address[] = [];
    // Bound method by method: `FakeChain`'s reads are on the prototype, so a spread of the
    // instance would hand over an object with none of them on it.
    const counting: ServiceDeps = {
      ...deps(),
      chain: {
        ownerOf: (id) => fake.ownerOf(id),
        getAgentWallet: (id) => fake.getAgentWallet(id),
        marked: (id, hash) => fake.marked(id, hash),
        lastMarkAt: (id) => fake.lastMarkAt(id),
        markCooldown: () => fake.markCooldown(),
        now: () => fake.now(),
        allowlistedBuyer: async (buyer: Address) => {
          reads.push(buyer);
          return fake.allowlistedBuyer(buyer);
        },
      },
    };

    await upsertPoster({ payer: EXTERNAL, agentId: null }, counting);
    await upsertPoster({ payer: EXTERNAL, agentId: null }, counting);
    expect(reads).toHaveLength(1);

    // A second payer is a second key, never the first one's answer.
    await upsertPoster({ payer: OTHER_EXTERNAL, agentId: null }, counting);
    expect(reads).toHaveLength(2);

    clock = new Date(clock.getTime() + 61_000);
    await upsertPoster({ payer: EXTERNAL, agentId: null }, { ...counting, now: () => clock });
    expect(reads).toHaveLength(3);
  });
});

describe('listPosters', () => {
  it('counts only allowlisted === false as an external buyer', async () => {
    await fake.setAllowlistedBuyer(DEMO_WALLET, true);
    await upsertPoster({ payer: DEMO_WALLET, agentId: null }, deps());
    await upsertPoster({ payer: EXTERNAL, agentId: 1207n }, deps());
    await upsertPoster({ payer: OTHER_EXTERNAL, agentId: null }, deps());
    // The same external payer twice is still one distinct buyer.
    await upsertPoster({ payer: EXTERNAL, agentId: 1207n }, deps());

    const list = await listPosters(deps());
    expect(list.posters).toHaveLength(3);
    expect(list.distinct_external_buyers).toBe(2);
  });

  it('is empty and zero before anybody has hired', async () => {
    await expect(listPosters(deps())).resolves.toEqual({ posters: [], distinct_external_buyers: 0 });
  });
});
