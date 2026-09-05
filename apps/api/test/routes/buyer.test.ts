/**
 * The buyer's three verbs and the status a poller waits on.
 *
 * Everything here runs on pglite and a recording chain double; no key, no RPC, no model.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keccak256, toBytes } from 'viem';
import { eq } from 'drizzle-orm';
import { FakeChain, type ChainAdapter } from '@legwork/chain';
import { readFileSync } from 'node:fs';
import { GET as getTask } from '../../app/tasks/[id]/route';
import { POST as approve } from '../../app/tasks/[id]/approve/route';
import { POST as dispute } from '../../app/tasks/[id]/dispute/route';
import { POST as refund } from '../../app/tasks/[id]/refund/route';
import { resetConfigForTests } from '../../src/config';
import { setChainForTests } from '../../src/chain';
import { resetRateLimitForTests } from '../../src/http/rateLimit';
import { proofs, tasks } from '../../src/db/schema';
import { hashBuyerToken } from '../../src/services/buyerToken';
import {
  deps,
  eligibleAction,
  parseWait,
  proofDeps,
  type TaskRow,
} from '../../src/services/statusBus';
import { call } from '../app';
import { createTestDb, type TestDb } from '../db';

// --------------------------------------------------------------- chain double

/**
 * `FakeChain` carries neither a call log nor `failNextWith`, both of which the brief's §5
 * names. This recorder supplies them without touching `packages/chain`: reads fall through
 * to a real `FakeChain`, and the writes this task makes are recorded and answered with a
 * synthetic hash — the escrow rows under test live in the pglite fixture and were never
 * `post`ed into the fake, so delegating the write would revert on a task the fake never saw.
 *
 * `role` mirrors `packages/chain/src/contracts/{escrow,registry}.ts`, which is where the
 * key each write goes out on is actually decided.
 */
const WRITE_ROLE: Record<string, 'relayer' | 'signer' | 'owner'> = {
  post: 'relayer', claimFor: 'relayer', releaseClaimFor: 'relayer', submitFor: 'relayer',
  approve: 'relayer', dispute: 'relayer', autoRelease: 'relayer', expire: 'relayer',
  registerFor: 'relayer', mark: 'signer',
  pause: 'owner', unpause: 'owner', resolve: 'owner', resetWorker: 'owner',
  setAllowlistedBuyer: 'owner', seedWorker: 'owner', setMarkCooldown: 'owner',
};

interface RecordedCall {
  fn: string;
  args: unknown[];
  role: 'relayer' | 'signer' | 'owner';
}

class RecordingChain {
  readonly calls: RecordedCall[] = [];
  readonly adapter: ChainAdapter;
  private failure: { name: string; transport: boolean } | null = null;
  private sent = 0;

  constructor() {
    const fake = new FakeChain();
    this.adapter = new Proxy(fake, {
      get: (target, prop, receiver) => {
        const fn = String(prop);
        const role = WRITE_ROLE[fn];
        if (!role) return Reflect.get(target, prop, receiver);
        return async (...args: unknown[]) => {
          this.calls.push({ fn, args, role });
          const failure = this.failure;
          this.failure = null;
          if (failure?.transport) throw new Error('fetch failed');
          if (failure) {
            // A `ChainRevert` carries the contract's error name in both `name` and `message`.
            const err = new Error(failure.name);
            err.name = failure.name;
            throw err;
          }
          this.sent += 1;
          return { hash: hashOf(this.sent), blockNumber: 1n, events: [] };
        };
      },
    }) as unknown as ChainAdapter;
  }

  /** The next write reverts with this contract error name. */
  failNextWith(name: string): void {
    this.failure = { name, transport: false };
  }

  /** The next write fails on the wire rather than in the contract. */
  failNextWithTransport(): void {
    this.failure = { name: 'transport', transport: true };
  }

  callsTo(fn: string): RecordedCall[] {
    return this.calls.filter((c) => c.fn === fn);
  }
}

const hashOf = (n: number): `0x${string}` => `0x${n.toString(16).padStart(64, '0')}`;

// -------------------------------------------------------------------- fixture

const DASHBOARD = 'https://dashboard.legwork.test';
const BUYER_TOKEN = 'a-buyer-token-nobody-else-holds';
const PROOF_BYTES = toBytes('proof bytes for task one');
const PROOF_HASH = keccak256(PROOF_BYTES);

const VERIFY_OPEN_BIT = 1;
const AMOUNT_UNITS = 3_000_000n;
const FEE_UNITS = 450_000n;
const DISPUTE_WINDOW_S = 120;
const CLAIM_TTL_S = 1800;
const SUBMIT_TTL_S = 3600;

let fixture: TestDb;
let chain: RecordingChain;

type TaskSeed = Partial<typeof tasks.$inferInsert>;

async function seedTask(overrides: TaskSeed = {}): Promise<void> {
  const postedAt = new Date(Date.now() - 60_000);
  await fixture.db.insert(tasks).values({
    taskId: 1n,
    taskType: VERIFY_OPEN_BIT,
    specHash: hashOf(7),
    amountUnits: AMOUNT_UNITS,
    feeUnits: FEE_UNITS,
    priceUnits: AMOUNT_UNITS + FEE_UNITS,
    buyer: `0x${'b1'.repeat(20)}`,
    area: 'ez1dp',
    state: 'open',
    postedAt,
    claimTtlS: CLAIM_TTL_S,
    submitTtlS: SUBMIT_TTL_S,
    disputeWindowS: DISPUTE_WINDOW_S,
    txPost: hashOf(1),
    specJson: { place: 'private' },
    buyerTokenHash: hashBuyerToken(BUYER_TOKEN),
    payer: `0x${'a1'.repeat(20)}`,
    ...overrides,
  });
}

async function clearTasks(): Promise<void> {
  await fixture.db.delete(proofs);
  await fixture.db.delete(tasks);
}

const status = (url: string, headers: Record<string, string> = {}) =>
  call(getTask, { url: `http://localhost${url}`, headers, params: { id: '1' } });

beforeEach(async () => {
  resetConfigForTests({ DASHBOARD_URL: DASHBOARD, API_BASE_URL: 'https://api.legwork.test' });
  resetRateLimitForTests();
  proofDeps.store.clear();
  chain = new RecordingChain();
  setChainForTests(chain.adapter);
  fixture = await createTestDb();
});

afterEach(async () => {
  setChainForTests(undefined);
  await fixture.close();
});

describe('GET /tasks/:id', () => {
  it('longPollReturnsOnStateChange', async () => {
    const claimedAt = new Date(Date.now() - 30_000);
    await seedTask({ state: 'claimed', claimedAt, worker: `0x${'c1'.repeat(20)}`, txClaim: hashOf(2) });

    const startedAt = Date.now();
    const pending = status('/tasks/1?wait=5');

    setTimeout(() => {
      void fixture.db
        .update(tasks)
        .set({
          state: 'submitted',
          submittedAt: new Date(),
          answer: 'open',
          note: 'door open at 09:12',
          txSubmit: hashOf(3),
        })
        .where(eq(tasks.taskId, 1n))
        .execute();
    }, 300);

    const res = await pending;
    const elapsed = Date.now() - startedAt;
    const body = (await res.json()) as Record<string, unknown>;

    expect(elapsed).toBeLessThan(3_000);
    expect(body.changed).toBe(true);
    expect(body.status).toBe('submitted');
    expect(body.answer).toEqual({
      answer: 'open',
      note: 'door open at 09:12',
      _source: 'worker',
      _untrusted: true,
    });
    expect(body.poll_after_seconds).toBe(3);

    const etag = res.headers.get('etag');
    expect(etag).toMatch(/^"[0-9a-f]{16}"$/);

    const again = await status('/tasks/1?wait=0', { 'if-none-match': etag as string });
    expect(((await again.json()) as { changed: boolean }).changed).toBe(false);
  });

  it('longPollCapsAtFifty', async () => {
    expect(parseWait('120')).toBe(50);
    expect(parseWait('-3')).toBe(0);
    expect(parseWait('abc')).toBe(0);
    expect(parseWait('7.9')).toBe(7);

    await seedTask({ state: 'claimed', claimedAt: new Date(), worker: `0x${'c1'.repeat(20)}` });

    const sleep = vi.fn(async () => {});
    const realSleep = deps.sleep;
    deps.sleep = sleep;
    try {
      const res = await status('/tasks/1?wait=120');
      const body = (await res.json()) as { changed: boolean; poll_after_seconds: number };
      expect(body).toMatchObject({ changed: false, poll_after_seconds: 1 });
    } finally {
      deps.sleep = realSleep;
    }

    expect(sleep).toHaveBeenCalledTimes(50);
    for (const args of sleep.mock.calls) expect(args).toEqual([1000]);

    const source = readFileSync(new URL('../../app/tasks/[id]/route.ts', import.meta.url), 'utf8');
    expect(source.split('\n').filter((l) => l.includes('maxDuration = 60'))).toHaveLength(1);
  });

  it('eligibleAction matches the escrow: >= for the dispute window, > for both expiries', () => {
    const base = {
      state: 'submitted',
      postedAt: new Date(1_000_000_000_000),
      claimedAt: new Date(1_000_000_060_000),
      submittedAt: new Date(1_000_000_120_000),
      claimTtlS: CLAIM_TTL_S,
      submitTtlS: SUBMIT_TTL_S,
      disputeWindowS: DISPUTE_WINDOW_S,
    } as unknown as TaskRow;
    const submittedAtS = 1_000_000_120;

    expect(eligibleAction(base, submittedAtS + DISPUTE_WINDOW_S - 1)).toBeNull();
    expect(eligibleAction(base, submittedAtS + DISPUTE_WINDOW_S)).toBe('autoRelease');

    const open = { ...base, state: 'open' } as TaskRow;
    expect(eligibleAction(open, 1_000_000_000 + CLAIM_TTL_S)).toBeNull();
    expect(eligibleAction(open, 1_000_000_000 + CLAIM_TTL_S + 1)).toBe('expire');

    const claimed = { ...base, state: 'claimed' } as TaskRow;
    expect(eligibleAction(claimed, 1_000_000_060 + SUBMIT_TTL_S)).toBeNull();
    expect(eligibleAction(claimed, 1_000_000_060 + SUBMIT_TTL_S + 1)).toBe('expire');
  });
});

describe('the buyer verbs', () => {
  it('buyerTokenRequired', async () => {
    const submittedAt = new Date(Date.now() - 5_000);
    await seedTask({
      state: 'submitted',
      claimedAt: new Date(Date.now() - 40_000),
      submittedAt,
      worker: `0x${'c1'.repeat(20)}`,
      answer: 'open',
      note: 'door open at 09:12',
      proofHash: PROOF_HASH,
      txClaim: hashOf(2),
      txSubmit: hashOf(3),
    });
    await fixture.db.insert(proofs).values({
      hash: PROOF_HASH,
      storageKey: 'proofs/one.jpg',
      capturedAt: submittedAt,
      exactLat: '39.74362',
      exactLon: '-8.80713',
      gpsUnavailable: false,
      worker: `0x${'c1'.repeat(20)}`,
      taskId: 1n,
    });
    proofDeps.store.set(PROOF_HASH, PROOF_BYTES);

    const post = (headers: Record<string, string> = {}) =>
      call(approve, { method: 'POST', headers, params: { id: '1' } });

    const missing = await post();
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: 'unauthorized' });

    const wrong = await post({ 'x-buyer-token': 'not-the-token' });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'unauthorized' });
    expect(chain.callsTo('approve')).toHaveLength(0);

    // --- the proof URL: token-less reads never get one ---
    const anonymous = await status('/tasks/1');
    const anonymousBody = (await anonymous.json()) as { proof: { url?: string } };
    expect(anonymousBody.proof.url).toBeUndefined();

    const revealed = await status('/tasks/1', { 'x-buyer-token': BUYER_TOKEN });
    const revealedBody = (await revealed.json()) as {
      proof: { url: string; hash_ok: boolean };
    };
    const checked = proofDeps.verifyProofUrl(revealedBody.proof.url);
    expect(checked.ok).toBe(true);
    expect(checked.hash).toBe(PROOF_HASH);
    expect(checked.expiresAtS).toBe(
      Math.floor(submittedAt.getTime() / 1000) + DISPUTE_WINDOW_S + 3600,
    );
    expect(revealedBody.proof.hash_ok).toBe(true);

    // --- the right token settles it ---
    const ok = await post({ 'x-buyer-token': BUYER_TOKEN });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ task_id: '1', status: 'released', tx: hashOf(1) });
    expect(chain.callsTo('approve')).toEqual([
      { fn: 'approve', args: [1n], role: 'relayer' },
    ]);

    // --- refund is a 409 until the escrow would allow the expiry ---
    await clearTasks();
    await seedTask({ state: 'open', postedAt: new Date() });
    const early = await call(refund, {
      method: 'POST',
      headers: { 'x-buyer-token': BUYER_TOKEN },
      params: { id: '1' },
    });
    expect(early.status).toBe(409);
    expect((await early.json()) as { error: string }).toMatchObject({ error: 'not_eligible' });
    expect(chain.callsTo('expire')).toHaveLength(0);

    await clearTasks();
    await seedTask({ state: 'open', postedAt: new Date(Date.now() - (CLAIM_TTL_S + 60) * 1000) });
    const late = await call(refund, {
      method: 'POST',
      headers: { 'x-buyer-token': BUYER_TOKEN },
      params: { id: '1' },
    });
    expect(late.status).toBe(200);
    expect((await late.json()) as { status: string }).toMatchObject({ status: 'refunded' });
    expect(chain.callsTo('expire')).toEqual([{ fn: 'expire', args: [1n], role: 'relayer' }]);
  });

  it('answers a closed window, a bad state and a revert without moving the row', async () => {
    await seedTask({ state: 'submitted', submittedAt: new Date(Date.now() - 10 * 60_000) });
    const closed = await call(dispute, {
      method: 'POST',
      headers: { 'x-buyer-token': BUYER_TOKEN },
      body: { reason: 'the photo is of the wrong door' },
      params: { id: '1' },
    });
    expect(closed.status).toBe(409);
    expect(await closed.json()).toEqual({ error: 'dispute_window_closed' });

    await clearTasks();
    await seedTask({ state: 'open' });
    const badState = await call(approve, {
      method: 'POST',
      headers: { 'x-buyer-token': BUYER_TOKEN },
      params: { id: '1' },
    });
    expect(badState.status).toBe(409);
    expect(await badState.json()).toEqual({ error: 'bad_state', status: 'open' });

    await clearTasks();
    await seedTask({ state: 'submitted', submittedAt: new Date() });
    chain.failNextWith('BadState');
    const reverted = await call(approve, {
      method: 'POST',
      headers: { 'x-buyer-token': BUYER_TOKEN },
      params: { id: '1' },
    });
    expect(reverted.status).toBe(409);
    expect(await reverted.json()).toEqual({ error: 'chain_revert', name: 'BadState' });

    chain.failNextWithTransport();
    const unreachable = await call(approve, {
      method: 'POST',
      headers: { 'x-buyer-token': BUYER_TOKEN },
      params: { id: '1' },
    });
    expect(unreachable.status).toBe(503);
    expect(await unreachable.json()).toEqual({ error: 'chain_unavailable' });

    // Neither failure wrote the row: the transition happens only after a hash comes back.
    const [row] = await fixture.rawQuery('SELECT state FROM tasks WHERE task_id = 1');
    expect(row?.state).toBe('submitted');
  });
});
