import { describe, expect, it } from 'vitest';
import { keccak256, stringToHex, type Address, type Hex } from 'viem';
import {
  ALL_TASK_TYPES_BITMASK,
  DEFAULT_CLAIM_TTL_S,
  DEFAULT_DISPUTE_WINDOW_S,
  DEFAULT_SUBMIT_TTL_S,
  TASK_STATE,
  TASK_TYPE_BIT,
} from '@legwork/shared';
import type { ChainAdapter, PostParams } from '../../src/adapter.js';
import type { DecodedEvent } from '../../src/events.js';

/**
 * What the lifecycle scenarios need on top of `ChainAdapter`: a clock they can move.
 *
 * `events()` is optional so that a harness backed by a real node — T-36's anvil one — can be
 * a plain `ChainAdapter & { warp }` and still run this suite unchanged; where it exists, the
 * cumulative log is checked as well as the per-transaction one.
 */
export type LifecycleHarness = ChainAdapter & {
  warp(seconds: number): Promise<void>;
  events?(): DecodedEvent[];
};

/** A readable, deterministic address per role. No keys — the suite never signs. */
function actor(label: string): Address {
  return `0x${keccak256(stringToHex(`legwork:${label}`)).slice(-40)}` as Address;
}

/**
 * The cast every scenario uses. A harness must hand back a chain where:
 *
 *  - `relayer` holds plenty of USDC and `treasury` holds none;
 *  - `worker1` and `worker2` are registered and not seeded, `seededWorker` is seeded;
 *  - no buyer is allowlisted, nothing is paused, and no task exists yet.
 *
 * A harness on a real chain also has to resolve a `DirectSender` from its address alone —
 * the suite has no wallets of its own to pass.
 */
export const LIFECYCLE = {
  relayer: actor('relayer'),
  treasury: actor('treasury'),
  buyer: actor('buyer'),
  worker1: actor('worker1'),
  worker2: actor('worker2'),
  seededWorker: actor('seeded-worker'),

  nullifier1: 1n,
  nullifier2: 2n,
  nullifierSeeded: 3n,
  agentId: 1207n,

  /** Leiria. A geohash-5, never a coordinate. */
  area: 'ez5ku',
  taskTypes: ALL_TASK_TYPES_BITMASK,

  /** The agent pays 3.45, the escrow locks 3.45, the worker receives 3.00, the fee is 0.45. */
  amount: 3_000_000n,
  fee: 450_000n,
  total: 3_450_000n,

  claimTTL: DEFAULT_CLAIM_TTL_S,
  submitTTL: DEFAULT_SUBMIT_TTL_S,
  disputeWindow: DEFAULT_DISPUTE_WINDOW_S,

  /** Every worker starts funded with nothing, so a balance is always a delta from zero. */
  relayerFloat: 1_000_000_000n,
} as const;

let specCounter = 0;

export function postParams(overrides: Partial<PostParams> = {}): PostParams {
  specCounter += 1;
  return {
    taskType: TASK_TYPE_BIT['verify-open'],
    specHash: keccak256(stringToHex(`legwork-spec-${specCounter}`)),
    amount: LIFECYCLE.amount,
    buyer: LIFECYCLE.buyer,
    buyerAgentId: 0n,
    area: LIFECYCLE.area,
    claimTTL: LIFECYCLE.claimTTL,
    submitTTL: LIFECYCLE.submitTTL,
    disputeWindow: LIFECYCLE.disputeWindow,
    ...overrides,
  };
}

export function proofHash(label: string): Hex {
  return keccak256(stringToHex(`legwork-proof-${label}`));
}

function named(events: DecodedEvent[], name: string): DecodedEvent | undefined {
  return events.find((e) => e.name === name);
}

/**
 * The escrow lifecycle, written once against `ChainAdapter` so the same scenarios can be run
 * against `FakeChain` today and against anvil in T-36. Nothing in here reaches for a
 * FakeChain-only method: if a rule cannot be exercised through the adapter, it is not a rule
 * a route can depend on either.
 */
export function lifecycleSuite(make: () => LifecycleHarness): void {
  describe('escrow lifecycle', () => {
    it('post → claimFor → submitFor → approve pays 3.00 to the worker and 0.45 to the treasury', async () => {
      const chain = make();
      const relayerBefore = await chain.usdcBalanceOf(LIFECYCLE.relayer);

      const posted = await chain.post(postParams());
      expect(await chain.usdcBalanceOf(LIFECYCLE.relayer)).toBe(relayerBefore - 3_450_000n);

      await chain.claimFor(posted.taskId, LIFECYCLE.worker1);
      await chain.submitFor(posted.taskId, LIFECYCLE.worker1, proofHash('a'));
      const approved = await chain.approve(posted.taskId);

      expect(await chain.usdcBalanceOf(LIFECYCLE.worker1)).toBe(3_000_000n);
      expect(await chain.usdcBalanceOf(LIFECYCLE.treasury)).toBe(450_000n);

      const released = named(approved.events, 'TaskReleased');
      expect(released?.args).toMatchObject({
        taskId: posted.taskId,
        worker: LIFECYCLE.worker1,
        amount: 3_000_000n,
        fee: 450_000n,
      });
      const all = chain.events?.();
      if (all) expect(named(all, 'TaskReleased')?.args['amount']).toBe(3_000_000n);

      expect(await chain.completed(LIFECYCLE.nullifier1)).toBe(1n);
      expect(await chain.activeClaimOf(LIFECYCLE.worker1)).toBe(0n);
      expect((await chain.getTask(posted.taskId)).state).toBe(TASK_STATE.Released);
    });

    it('expire refunds amount + fee to the buyer', async () => {
      const chain = make();
      const posted = await chain.post(postParams());
      expect((await chain.getTask(posted.taskId)).state).toBe(TASK_STATE.Open);

      // At exactly `postedAt + claimTTL` the task is still live: the rule is a strict `>`.
      await chain.warp(LIFECYCLE.claimTTL);
      await expect(chain.expire(posted.taskId)).rejects.toThrow('NotExpired');

      await chain.warp(1);
      const buyerBefore = await chain.usdcBalanceOf(LIFECYCLE.buyer);
      const expired = await chain.expire(posted.taskId);

      expect(await chain.usdcBalanceOf(LIFECYCLE.buyer)).toBe(buyerBefore + 3_450_000n);
      expect((await chain.getTask(posted.taskId)).state).toBe(TASK_STATE.Refunded);
      expect(named(expired.events, 'TaskRefunded')?.args).toMatchObject({
        taskId: posted.taskId,
        buyer: LIFECYCLE.buyer,
        total: 3_450_000n,
      });
    });

    it('lazy expiry re-claims a stale task and cools the stale worker down', async () => {
      const chain = make();
      const posted = await chain.post(postParams());
      await chain.claimFor(posted.taskId, LIFECYCLE.worker1);

      await chain.warp(LIFECYCLE.claimTTL);
      await expect(chain.claimFor(posted.taskId, LIFECYCLE.worker2)).rejects.toThrow(
        'AlreadyClaimed',
      );

      await chain.warp(1);
      const reclaimed = await chain.claimFor(posted.taskId, LIFECYCLE.worker2);

      // The stale claim is cleared before the new one is taken, and in that order.
      expect(reclaimed.events.map((e) => e.name)).toEqual(['ClaimExpired', 'TaskClaimed']);
      expect(reclaimed.events[0]?.args).toMatchObject({
        taskId: posted.taskId,
        staleWorker: LIFECYCLE.worker1,
      });
      expect(reclaimed.events[1]?.args).toMatchObject({
        taskId: posted.taskId,
        worker: LIFECYCLE.worker2,
      });

      const now = await chain.now();
      expect(await chain.cooldownUntil(LIFECYCLE.worker1)).toBe(now + 900n);
      expect(await chain.activeClaimOf(LIFECYCLE.worker1)).toBe(0n);

      const second = await chain.post(postParams());
      await expect(chain.claimFor(second.taskId, LIFECYCLE.worker1)).rejects.toThrow('InCooldown');

      await chain.warp(900);
      const afterCooldown = await chain.claimFor(second.taskId, LIFECYCLE.worker1);
      expect(named(afterCooldown.events, 'TaskClaimed')?.args['worker']).toBe(LIFECYCLE.worker1);
    });

    it('seeded worker cannot claim a task from a non-allowlisted buyer', async () => {
      const chain = make();
      const posted = await chain.post(postParams());
      const seeded = { address: LIFECYCLE.seededWorker };

      await expect(chain.claimFor(posted.taskId, LIFECYCLE.seededWorker)).rejects.toThrow(
        'SeededCannotClaimExternal',
      );
      await expect(chain.claim(posted.taskId, seeded)).rejects.toThrow(
        'SeededCannotClaimExternal',
      );

      await chain.setAllowlistedBuyer(LIFECYCLE.buyer, true);
      expect(await chain.allowlistedBuyer(LIFECYCLE.buyer)).toBe(true);

      const relayed = await chain.claimFor(posted.taskId, LIFECYCLE.seededWorker);
      expect(named(relayed.events, 'TaskClaimed')).toBeDefined();

      await chain.releaseClaimFor(posted.taskId, LIFECYCLE.seededWorker);
      const direct = await chain.claim(posted.taskId, seeded);
      expect(named(direct.events, 'TaskClaimed')?.args['worker']).toBe(LIFECYCLE.seededWorker);
    });

    it('pause blocks post and claim, never submit, autoRelease or expire', async () => {
      const chain = make();
      const working = await chain.post(postParams());
      await chain.claimFor(working.taskId, LIFECYCLE.worker1);
      const abandoned = await chain.post(postParams());

      await chain.pause();
      expect(await chain.paused()).toBe(true);

      await expect(chain.post(postParams())).rejects.toThrow('EnforcedPause');
      await expect(chain.claimFor(abandoned.taskId, LIFECYCLE.worker2)).rejects.toThrow(
        'EnforcedPause',
      );
      await expect(
        chain.claim(abandoned.taskId, { address: LIFECYCLE.worker2 }),
      ).rejects.toThrow('EnforcedPause');

      // A stop can never trap a worker's earned funds, so the settling half stays open.
      await chain.submitFor(working.taskId, LIFECYCLE.worker1, proofHash('paused'));
      await chain.warp(LIFECYCLE.disputeWindow);
      await chain.autoRelease(working.taskId);
      expect(await chain.usdcBalanceOf(LIFECYCLE.worker1)).toBe(3_000_000n);

      await chain.expire(abandoned.taskId);
      expect((await chain.getTask(abandoned.taskId)).state).toBe(TASK_STATE.Refunded);

      await chain.unpause();
      expect(await chain.paused()).toBe(false);
      const resumed = await chain.post(postParams());
      expect((await chain.getTask(resumed.taskId)).state).toBe(TASK_STATE.Open);
    });

    it('dispute inside the window, autoRelease after it, resolve pays zero fee', async () => {
      const chain = make();
      const disputed = await chain.post(postParams());
      await chain.claimFor(disputed.taskId, LIFECYCLE.worker1);
      await chain.submitFor(disputed.taskId, LIFECYCLE.worker1, proofHash('disputed'));

      await expect(chain.autoRelease(disputed.taskId)).rejects.toThrow('DisputeWindowOpen');

      await chain.warp(LIFECYCLE.disputeWindow - 1);
      await chain.dispute(disputed.taskId);
      expect((await chain.getTask(disputed.taskId)).state).toBe(TASK_STATE.Disputed);

      const workerBefore = await chain.usdcBalanceOf(LIFECYCLE.worker1);
      const buyerBefore = await chain.usdcBalanceOf(LIFECYCLE.buyer);
      const treasuryBefore = await chain.usdcBalanceOf(LIFECYCLE.treasury);
      await chain.resolve(disputed.taskId, false);

      expect((await chain.usdcBalanceOf(LIFECYCLE.worker1)) - workerBefore).toBe(3_000_000n);
      expect((await chain.usdcBalanceOf(LIFECYCLE.buyer)) - buyerBefore).toBe(450_000n);
      expect((await chain.usdcBalanceOf(LIFECYCLE.treasury)) - treasuryBefore).toBe(0n);

      const late = await chain.post(postParams());
      await chain.claimFor(late.taskId, LIFECYCLE.worker2);
      await chain.submitFor(late.taskId, LIFECYCLE.worker2, proofHash('late'));
      await chain.warp(LIFECYCLE.disputeWindow);
      await expect(chain.dispute(late.taskId)).rejects.toThrow('DisputeWindowClosed');
      await chain.autoRelease(late.taskId);
      expect((await chain.getTask(late.taskId)).state).toBe(TASK_STATE.Released);
    });

    it('reputation dedups per rater and abuseMark.mark is idempotent and cooled down', async () => {
      const chain = make();

      for (const label of ['first', 'second']) {
        const posted = await chain.post(postParams());
        await chain.claimFor(posted.taskId, LIFECYCLE.worker1);
        await chain.submitFor(posted.taskId, LIFECYCLE.worker1, proofHash(label));
        await chain.approve(posted.taskId);
      }

      // Two paid tasks, one buyer: the tally moves, the number of voices does not.
      expect(await chain.completed(LIFECYCLE.nullifier1)).toBe(2n);
      expect(await chain.distinctRaters(LIFECYCLE.nullifier1)).toBe(1n);
      expect(await chain.score(LIFECYCLE.nullifier1)).toBe(1n);

      const specA = keccak256(stringToHex('refused-spec-a'));
      const specB = keccak256(stringToHex('refused-spec-b'));

      const first = await chain.mark(LIFECYCLE.agentId, 5, specA);
      expect(first.written).toBe(true);
      expect(named(first.events, 'Marked')?.args['classId']).toBe(5);
      expect(await chain.marked(LIFECYCLE.agentId, specA)).toBe(true);

      const repeat = await chain.mark(LIFECYCLE.agentId, 5, specA);
      expect(repeat.written).toBe(false);
      expect(repeat.events).toEqual([]);

      await expect(chain.mark(LIFECYCLE.agentId, 5, specB)).rejects.toThrow('MarkCooldown');
    });
  });
}
