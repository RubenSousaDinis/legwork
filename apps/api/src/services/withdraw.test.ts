/**
 * `POST /me/withdraw`, end to end and entirely offline.
 *
 * The signatures are real: the worker is a viem account signing genuine EIP-712
 * `TransferWithAuthorization` payloads against Circle's Base Sepolia domain, and the route
 * recovers them the same way it would in production. What is faked is the relayer — a
 * recorder that hands back a hash and can be told to throw on one leg — and the database,
 * which is pglite running the same migration folder Supabase gets. No RPC, no node, no key
 * but two throwaway ones generated here.
 *
 * The named tests are the brief's §8, and between them they say the four things this feature
 * has to be true about: the arithmetic never rounds towards Legwork, a signature that is not
 * the session worker's is refused before anything touches a chain, an amount under the floor
 * costs nothing, and a fee leg that fails after the payout landed is still a withdrawal the
 * worker got.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAddress, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import {
  MIN_WITHDRAW_USDC,
  WITHDRAW_FEE_BPS,
  toUsdcUnits,
  withdrawFeeOn,
} from '@legwork/shared';
import { call } from '../../test/app';
import { createTestDb, type TestDb } from '../../test/db';
import { resetConfigForTests } from '../config';
import { route } from '../http/route';
import { withdrawals } from '../db/schema';
import type { WorkerSession } from '../session';
import {
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  USDC_DOMAIN_NAME,
  USDC_DOMAIN_VERSION,
  splitSignature,
  withdraw,
  type SignedAuthorization,
  type WithdrawDeps,
} from './withdraw';

// ------------------------------------------------------------------ fixtures

/** Circle's own Base Sepolia deployment — `version()` is `"2"` and EIP-3009 is there. */
const USDC = getAddress('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
const TREASURY = getAddress('0xABFDB572E3d6093113Cdb9c1C1599E8699226D52');
const CHAIN_ID = 84532;

/** Where the worker is moving their earnings to: their other wallet, not Legwork's. */
const DESTINATION = getAddress('0x1234567890AbcdEF1234567890aBcdef12345678');

const NOW = new Date('2026-09-09T12:00:00Z');
const VALID_BEFORE = String(Math.floor(NOW.getTime() / 1000) + 3600);

const domain = {
  name: USDC_DOMAIN_NAME,
  version: USDC_DOMAIN_VERSION,
  chainId: CHAIN_ID,
  verifyingContract: USDC,
} as const;

let nonceCounter = 0;
function nextNonce(): Hex {
  nonceCounter += 1;
  return `0x${nonceCounter.toString(16).padStart(64, '0')}` as Hex;
}

/**
 * One signed leg, built exactly the way `apps/miniapp/lib/workerKey.ts` builds it — from
 * arguments, never from anything a server said.
 */
async function signLeg(
  account: PrivateKeyAccount,
  to: `0x${string}`,
  value: bigint,
  overrides: Partial<SignedAuthorization> = {},
): Promise<SignedAuthorization> {
  const nonce = (overrides.nonce as Hex | undefined) ?? nextNonce();
  const validAfter = BigInt(overrides.valid_after ?? '0');
  const validBefore = BigInt(overrides.valid_before ?? VALID_BEFORE);
  const signature = await account.signTypedData({
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: { from: account.address, to, value, validAfter, validBefore, nonce },
  });
  return {
    from: account.address,
    to,
    value: value.toString(),
    valid_after: validAfter.toString(),
    valid_before: validBefore.toString(),
    nonce,
    signature,
    ...overrides,
  };
}

/** The whole body: the destination the worker typed, and the two legs their phone signed. */
async function signWithdrawal(
  account: PrivateKeyAccount,
  amountUnits: bigint,
  options: { to?: `0x${string}`; feeUnits?: bigint; feeTo?: `0x${string}`; nonce?: Hex } = {},
) {
  const to = options.to ?? DESTINATION;
  const feeUnits = options.feeUnits ?? withdrawFeeOn(amountUnits);
  const payoutUnits = amountUnits - feeUnits;
  return {
    to,
    payout: await signLeg(account, to, payoutUnits, options.nonce ? { nonce: options.nonce } : {}),
    fee: await signLeg(account, options.feeTo ?? TREASURY, feeUnits),
  };
}

// ------------------------------------------------------------------ the bench

interface Bench {
  db: TestDb;
  worker: PrivateKeyAccount;
  session: WorkerSession;
  /** Every leg the relayer was asked to submit, in the order it was asked. */
  submitted: SignedAuthorization[];
  /** Set to make the nth call throw: `{ 1: 'boom' }` fails the fee leg and only the fee leg. */
  failAt: Record<number, string>;
  logs: { info: object[]; warn: object[]; error: object[] };
  deps: WithdrawDeps;
}

let bench: Bench;

async function buildBench(): Promise<Bench> {
  const db = await createTestDb();
  const worker = privateKeyToAccount(generatePrivateKey());
  const submitted: SignedAuthorization[] = [];
  const failAt: Record<number, string> = {};
  const logs = { info: [] as object[], warn: [] as object[], error: [] as object[] };

  const deps: WithdrawDeps = {
    db: db.db,
    relayer: {
      async transferWithAuthorization(auth) {
        const index = submitted.length;
        const failure = failAt[index];
        if (failure !== undefined) throw new Error(failure);
        submitted.push(auth);
        return { hash: `0x${(index + 1).toString(16).padStart(64, '0')}` };
      },
    },
    treasury: TREASURY,
    usdc: USDC,
    chainId: CHAIN_ID,
    now: () => NOW,
    log: {
      info: (o) => void logs.info.push(o),
      warn: (o) => void logs.warn.push(o),
      error: (o) => void logs.error.push(o),
    },
  };

  return {
    db,
    worker,
    session: { worker: worker.address, nullifier: '42', mode: 'idkit' },
    submitted,
    failAt,
    logs,
    deps,
  };
}

/**
 * The route as Next mounts it, over the bench's deps: `withdraw()` throws `ApiError` for the
 * codes the error envelope owns, and `route()` is what turns those into a response.
 */
const handler = route((req) => withdraw(req, bench.session, bench.deps));

function post(body: unknown): Promise<Response> {
  return call(handler, { method: 'POST', url: 'http://localhost/me/withdraw', body });
}

beforeEach(async () => {
  resetConfigForTests({ DATABASE_URL: 'pglite://memory' });
  bench = await buildBench();
});

afterEach(async () => {
  await bench.db.close();
  vi.restoreAllMocks();
});

// -------------------------------------------------------------- the fee, and the dust

describe('the withdrawal fee', () => {
  it('feeIsTwoPercentAndDustStaysWithTheWorker', () => {
    expect(WITHDRAW_FEE_BPS).toBe(200n);

    // The demo figure: 3.00 withdrawn is 0.06 to Legwork and 2.94 to the worker.
    expect(withdrawFeeOn(3_000_000n)).toBe(60_000n);
    expect(3_000_000n - withdrawFeeOn(3_000_000n)).toBe(2_940_000n);

    // The case the brief names by hand: 1_000_001 × 200 / 10_000 is 20_000.02, and the .02
    // is a unit that will not divide. It stays on the payout side.
    expect(withdrawFeeOn(1_000_001n)).toBe(20_000n);
    expect(1_000_001n - withdrawFeeOn(1_000_001n)).toBe(980_001n);

    // And it holds for every amount, not just the two that were chosen. A thousand random
    // amounts across the range a payout address can plausibly hold: the fee is never more
    // than 2 %, and the two halves always add back up to exactly what went in.
    for (let i = 0; i < 1000; i++) {
      const amount = BigInt(1 + Math.floor(Math.random() * 100_000_000));
      const fee = withdrawFeeOn(amount);
      const payout = amount - fee;
      expect(payout + fee).toBe(amount);
      expect(fee * 10_000n).toBeLessThanOrEqual(amount * WITHDRAW_FEE_BPS);
      expect(payout).toBeGreaterThanOrEqual(amount - (amount * WITHDRAW_FEE_BPS) / 10_000n);
    }
  });
});

// ------------------------------------------------------------------ the route

describe('POST /me/withdraw', () => {
  it('withdrawRejectsASignatureFromAnotherAddress', async () => {
    // A pair signed with a key that is not the session's: the same amounts, the same
    // destination, the same everything — and a different signer.
    const stranger = privateKeyToAccount(generatePrivateKey());
    const body = await signWithdrawal(stranger, 3_000_000n);

    const res = await post(body);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden', reason: 'not_the_signer' });

    // It is an attempt to spend somebody else's balance, so it never reaches a node and never
    // reserves a nonce.
    expect(bench.submitted).toEqual([]);
    expect(await bench.db.db.select().from(withdrawals)).toEqual([]);

    // And the refusal says nothing about whose signature it was.
    expect(JSON.stringify(bench.logs)).not.toContain(stranger.address);
    expect(JSON.stringify(bench.logs)).not.toContain(body.payout.signature);
  });

  it('withdrawRejectsAMismatchedFee', async () => {
    // 3.00 withdrawn owes 0.06. This pair signs 0.01, keeping 2.99 for the worker.
    const short = await signWithdrawal(bench.worker, 3_000_000n, { feeUnits: 10_000n });

    const res = await post(short);

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'withdraw_refused', reason: 'fee_mismatch' });
    expect(bench.submitted).toEqual([]);
    expect(await bench.db.db.select().from(withdrawals)).toEqual([]);

    // The fee leg is refused for naming anybody but the treasury, too — that is the other
    // half of the same rule, and a payload whose fee leg pays the worker's friend is not a
    // cheaper withdrawal, it is a different one.
    const elsewhere = await signWithdrawal(bench.worker, 3_000_000n, { feeTo: DESTINATION });
    const redirected = await post(elsewhere);
    expect(redirected.status).toBe(422);
    expect(await redirected.json()).toEqual({
      error: 'withdraw_refused',
      reason: 'wrong_fee_recipient',
    });
    expect(bench.submitted).toEqual([]);
  });

  it('withdrawRefusesBelowTheMinimum', async () => {
    const body = await signWithdrawal(bench.worker, toUsdcUnits(0.99));

    const res = await post(body);

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'withdraw_refused',
      reason: 'below_minimum',
      min_withdraw_usdc: MIN_WITHDRAW_USDC,
    });
    // Nothing submitted, nothing reserved: a worker under the floor keeps what they have.
    expect(bench.submitted).toEqual([]);
    expect(await bench.db.db.select().from(withdrawals)).toEqual([]);

    // Exactly the floor is a withdrawal, not a refusal.
    const atTheFloor = await post(await signWithdrawal(bench.worker, toUsdcUnits(MIN_WITHDRAW_USDC)));
    expect(atTheFloor.status).toBe(200);
  });

  it('withdrawIsIdempotentOnTheNonce', async () => {
    const body = await signWithdrawal(bench.worker, 3_000_000n);

    const first = await post(body);
    const firstBody = await first.json();
    expect(first.status).toBe(200);
    expect(bench.submitted).toHaveLength(2);

    const second = await post(body);
    const secondBody = (await second.json()) as Record<string, unknown>;

    expect(second.status).toBe(200);
    // The first answer, plus the flag that says it is the first answer.
    expect(secondBody).toEqual({ ...(firstBody as object), replay: true });
    // Broadcast once. The second request re-read the row and told the node nothing.
    expect(bench.submitted).toHaveLength(2);
    expect(await bench.db.db.select().from(withdrawals)).toHaveLength(1);
  });

  it('withdrawReportsAFailedFeeLegWithoutLosingThePayout', async () => {
    // The payout leg lands; the fee leg reverts on the second call.
    bench.failAt[1] = 'execution reverted';
    const body = await signWithdrawal(bench.worker, 3_000_000n);

    const res = await post(body);
    const answer = (await res.json()) as Record<string, unknown>;

    // 200, not 500. The worker has 2.94 and the response says so.
    expect(res.status).toBe(200);
    expect(answer.payout_tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(answer.payout_usdc).toBe(2.94);
    // The fee is the part that did not happen, and the body states it rather than implying it.
    expect(answer.fee_tx).toBeNull();
    expect(answer.fee_pending).toBe(true);
    expect(answer.fee_usdc).toBe(0.06);

    // The payout leg is the only one that reached the relayer, and it was the payout leg —
    // the order is what makes Legwork the one that is short.
    expect(bench.submitted).toHaveLength(1);
    expect(bench.submitted[0]?.to).toBe(DESTINATION);

    // The row carries the same fact, so the operator can find it without reading logs.
    const rows = await bench.db.db.select().from(withdrawals);
    expect(rows[0]?.feePending).toBe(true);
    expect(rows[0]?.feeTx).toBeNull();
    expect(rows[0]?.payoutTx).toBe(answer.payout_tx);
  });

  it('submitsThePayoutLegBeforeTheFeeLeg', async () => {
    const res = await post(await signWithdrawal(bench.worker, 3_000_000n));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      payout_tx: `0x${'0'.repeat(63)}1`,
      fee_tx: `0x${'0'.repeat(63)}2`,
      payout_usdc: 2.94,
      fee_usdc: 0.06,
    });

    // Payout first, fee second, and the recipients are the two the worker signed for.
    expect(bench.submitted.map((a) => a.to)).toEqual([DESTINATION, TREASURY]);
    expect(bench.submitted.map((a) => a.value)).toEqual(['2940000', '60000']);
  });

  it('aFailedPayoutLegMovesNothingAndCanBeSentAgain', async () => {
    bench.failAt[0] = 'insufficient balance';
    const body = await signWithdrawal(bench.worker, 3_000_000n);

    const failed = await post(body);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: 'withdraw_failed' });
    expect(bench.submitted).toEqual([]);
    // The reservation went with it, so the same authorization is not burnt.
    expect(await bench.db.db.select().from(withdrawals)).toEqual([]);

    delete bench.failAt[0];
    const retried = await post(body);
    expect(retried.status).toBe(200);
    expect(bench.submitted).toHaveLength(2);
  });

  it('refusesAPayoutLegThatDoesNotPayTheDestinationTheWorkerNamed', async () => {
    // The body says one address and the signed leg says another: whichever one is the lie,
    // this is not a withdrawal the worker asked for.
    const body = await signWithdrawal(bench.worker, 3_000_000n);
    const res = await post({ ...body, to: TREASURY });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'withdraw_refused', reason: 'wrong_destination' });
    expect(bench.submitted).toEqual([]);
  });

  it('refusesAnAuthorizationThatHasAlreadyExpired', async () => {
    const stale = String(Math.floor(NOW.getTime() / 1000) - 1);
    const body = await signWithdrawal(bench.worker, 3_000_000n);
    const expired = {
      ...body,
      payout: await signLeg(bench.worker, DESTINATION, 2_940_000n, { valid_before: stale }),
    };

    const res = await post(expired);

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'withdraw_refused',
      reason: 'authorization_expired',
    });
    expect(bench.submitted).toEqual([]);
  });

  it('signsAgainstThisChainAndThisToken', async () => {
    // The same fields, signed against a different verifying contract. The route rebuilds the
    // domain from its own config, so the recovered address is somebody else and the answer is
    // the foreign-signature 403 — not a 400 that would suggest the body was merely malformed.
    const elsewhere = await bench.worker.signTypedData({
      domain: { ...domain, verifyingContract: TREASURY },
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: bench.worker.address,
        to: DESTINATION,
        value: 2_940_000n,
        validAfter: 0n,
        validBefore: BigInt(VALID_BEFORE),
        nonce: nextNonce(),
      },
    });
    const body = await signWithdrawal(bench.worker, 3_000_000n);

    const res = await post({ ...body, payout: { ...body.payout, signature: elsewhere } });

    expect(res.status).toBe(403);
    expect(bench.submitted).toEqual([]);
  });

  it('splitsASignatureTheWayTheTokenWantsIt', async () => {
    const leg = await signLeg(bench.worker, DESTINATION, 2_940_000n);
    const { v, r, s } = splitSignature(leg.signature as Hex);

    expect([27, 28]).toContain(v);
    expect(r).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s).toMatch(/^0x[0-9a-f]{64}$/);
    // Recomposed, it is the signature that arrived.
    expect(`${r}${s.slice(2)}${v.toString(16)}`).toBe(leg.signature);
  });
});
