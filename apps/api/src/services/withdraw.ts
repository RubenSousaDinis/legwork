/**
 * ## POST /me/withdraw
 *
 * A worker moves their earnings off the payout address their phone generated. That address
 * has never held a wei of ETH — every claim they ever made was relayed — so it cannot send a
 * transaction, and the only way money leaves it is an EIP-3009 authorization somebody else
 * submits. Legwork submits it, pays the gas, and keeps 2 % of the amount withdrawn.
 *
 * | | |
 * |---|---|
 * | Auth | worker session (`lw_worker`) |
 * | Body | `WithdrawRequest` (`@legwork/shared`) — `{to, payout, fee}` |
 * | 200 | `{payout_tx, fee_tx, payout_usdc, fee_usdc, fee_pending?, replay?}` |
 * | 403 | `{error:'forbidden', reason:'not_the_signer'}` — a signature that is not this session's worker |
 * | 422 | `WithdrawRefused` — the arithmetic, the recipients or the floor |
 * | 409 | `{error:'conflict', reason:'in_progress'}` — the same pair is mid-flight |
 * | 503 | `{error:'withdraw_failed'}` — the payout leg failed, so nothing moved |
 *
 * ### The mini-app builds what it signs
 *
 * This route never hands the phone a payload to sign. `signWithdrawal` in
 * `apps/miniapp/lib/workerKey.ts` builds both `TransferWithAuthorization` payloads from the
 * worker's own input and constants compiled into the module, and this route receives the
 * result. That asymmetry is the whole security model: a server that could choose the `to` of
 * a `TransferWithAuthorization` could name itself and take the worker's entire balance, and
 * nothing on the phone's screen would look wrong while it happened.
 *
 * So everything below is a *check on what arrived*, never a value this service supplied:
 *
 * ```
 * recover both signatures -> 403 if either is not the session worker
 *   -> recipients, arithmetic, floor, expiry   (422; still no chain call)
 *   -> reserve the payout nonce                (409 if mid-flight, replay if done)
 *   -> relay the payout leg                    (503 if it fails; nothing moved)
 *   -> relay the fee leg                       (200 either way)
 * ```
 *
 * **A foreign signature is a 403 and not a 400.** A pair that does not recover to the session
 * worker is not a malformed request — it is somebody asking this relayer to spend an address
 * they do not hold the key to. It is refused before the reservation, before the arithmetic
 * and before anything at all touches a node.
 *
 * ### Payout first, fee second, and why the order is not arbitrary
 *
 * The two legs are two transactions and there is a window between them. Whichever leg goes
 * first, the other one can fail; the question is only who is left short when it does.
 *
 * Payout first means the failure case is *Legwork is owed 2 % on a withdrawal the worker
 * already has*. Fee first means the failure case is *the worker paid a fee for a withdrawal
 * that never happened*, which is the same thing as taking their money. Legwork created the
 * window by shipping two transactions instead of one, so Legwork carries it.
 *
 * That is why a failed fee leg is a **200** with `fee_tx: null` and `fee_pending: true`, and
 * never a 500. A 500 here would tell a worker their withdrawal failed while the money was
 * already in their wallet, and they would try again. The row records `fee_pending` so the
 * miss is counted, not so it can be recovered: the fee authorization is not stored, and it
 * expires in an hour, so a failed fee is forfeit. That is Legwork's 2 %, which is the risk
 * this design carries.
 *
 * `apps/api/src/services/hire.ts` reports `float_absorbed` the same way on the same
 * primitive from the buyer's side, for the same reason.
 */
import { and, eq, isNull } from 'drizzle-orm';
import {
  encodeFunctionData,
  getAddress,
  isAddress,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from 'viem';
import {
  MIN_WITHDRAW_USDC,
  WithdrawRequest,
  fromUsdcUnits,
  toUsdcUnits,
  withdrawFeeOn,
} from '@legwork/shared';
import type { Db } from '../db/client';
import { withdrawals } from '../db/schema';
import { ApiError, apiErrorFromZod } from '../errors';
import { getConfig } from '../config';
import { getTxQueue } from '../chain';
import { logger } from '../log';
import type { WorkerSession } from '../session';

// ------------------------------------------------------------------ constants

/**
 * The EIP-712 domain of Circle's Base Sepolia USDC, confirmed against the deployment:
 * `version()` is `"2"` and `authorizationState(address,bytes32)` answers rather than
 * reverting, so EIP-3009 is there.
 */
export const USDC_DOMAIN_NAME = 'USDC';
export const USDC_DOMAIN_VERSION = '2';

/** EIP-3009, field for field, exactly as the phone signed it. */
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

/** The one function this route calls, in the `(v, r, s)` form Circle's FiatTokenV2_2 exposes. */
export const TRANSFER_WITH_AUTHORIZATION_ABI = [
  {
    type: 'function',
    name: 'transferWithAuthorization',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

/** A second request carrying a pair that is still mid-flight. */
const IN_PROGRESS_RETRY_S = 5;

// ---------------------------------------------------------------------- seams

/** One signed leg, parsed. `WithdrawRequest` has already checked the shapes. */
export type SignedAuthorization = ReturnType<typeof WithdrawRequest.parse>['payout'];

/**
 * The relayer, as this route calls it: hand it a signed authorization, get a hash back, and
 * it throws if the transaction did not land. `buildWithdrawDeps()` binds it to the queue
 * behind `getChain()`, which is the only writer of a Legwork key.
 */
export interface WithdrawRelayer {
  transferWithAuthorization(auth: SignedAuthorization): Promise<{ hash: string }>;
}

/**
 * Everything `withdraw()` touches that is not its own logic, declared structurally so a test
 * hands it fakes. Note what is *not* in here: nothing that could supply a recipient. The
 * treasury and the token come from config, and the destination comes from the request the
 * worker's phone signed.
 */
export interface WithdrawDeps {
  db: Db;
  relayer: WithdrawRelayer;
  treasury: Address;
  usdc: Address;
  chainId: number;
  now: () => Date;
  log: { info(o: object): void; warn(o: object): void; error(o: object): void };
}

// --------------------------------------------------------------------- pieces

/** The refusals that happen before any chain call, each naming the rule it broke. */
export type RefusalReason =
  | 'below_minimum'
  | 'fee_mismatch'
  | 'wrong_fee_recipient'
  | 'wrong_destination'
  | 'authorization_expired';

function refuse(reason: RefusalReason, extra?: Record<string, unknown>): Response {
  return Response.json({ error: 'withdraw_refused', reason, ...(extra ?? {}) }, { status: 422 });
}

const sameAddress = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** `0x…{130}` split the way `transferWithAuthorization(v, r, s)` wants it. */
export function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  const body = signature.slice(2);
  if (body.length !== 130) throw new Error('a secp256k1 signature is 65 bytes');
  const r = `0x${body.slice(0, 64)}` as Hex;
  const s = `0x${body.slice(64, 128)}` as Hex;
  const raw = Number.parseInt(body.slice(128, 130), 16);
  // viem signs with `v` already at 27/28; a wallet that answered 0/1 means the same thing.
  return { v: raw < 27 ? raw + 27 : raw, r, s };
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw ApiError.of('invalid_request', { field: 'body', reason: 'expected a JSON object' });
  }
}

/**
 * Who signed this leg.
 *
 * The domain is rebuilt here from config — the token, the chain — and the message from the
 * fields that arrived. A caller cannot hand us a domain, so a signature made against some
 * other token or some other chain recovers to a different address and is refused as a
 * foreign signature, which is what it is.
 */
async function signerOf(
  auth: SignedAuthorization,
  deps: Pick<WithdrawDeps, 'usdc' | 'chainId'>,
): Promise<Address | null> {
  try {
    return await recoverTypedDataAddress({
      domain: {
        name: USDC_DOMAIN_NAME,
        version: USDC_DOMAIN_VERSION,
        chainId: deps.chainId,
        verifyingContract: deps.usdc,
      },
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: getAddress(auth.from),
        to: getAddress(auth.to),
        value: BigInt(auth.value),
        validAfter: BigInt(auth.valid_after),
        validBefore: BigInt(auth.valid_before),
        nonce: auth.nonce as Hex,
      },
      signature: auth.signature as Hex,
    });
  } catch {
    // A signature that will not parse recovers to nobody, which is the same refusal.
    return null;
  }
}

/** The 200, from the row or from the two hashes that just landed. */
function answer(row: {
  payoutTx: string | null;
  feeTx: string | null;
  payoutUnits: bigint;
  feeUnits: bigint;
  feePending: boolean;
  replay?: boolean;
}): Response {
  return Response.json({
    payout_tx: row.payoutTx,
    fee_tx: row.feeTx,
    payout_usdc: fromUsdcUnits(row.payoutUnits),
    fee_usdc: fromUsdcUnits(row.feeUnits),
    ...(row.feePending ? { fee_pending: true as const } : {}),
    ...(row.replay ? { replay: true as const } : {}),
  });
}

// ---------------------------------------------------------------- the handler

/**
 * `POST /me/withdraw`, in the order the doc comment above fixes. Every exit before the
 * reservation has made no chain call and written no row.
 */
export async function withdraw(
  req: Request,
  session: WorkerSession,
  deps: WithdrawDeps,
): Promise<Response> {
  if (!isAddress(session.worker)) throw ApiError.of('forbidden', { reason: 'not_worker' });
  const worker = getAddress(session.worker);

  const parsed = WithdrawRequest.safeParse(await readJson(req));
  if (!parsed.success) throw apiErrorFromZod(parsed.error);
  const { to, payout, fee } = parsed.data;

  // 1. Whose money is this. Nothing below this point runs for somebody else's balance, and
  //    nothing above it has touched a node.
  const [payoutSigner, feeSigner] = await Promise.all([signerOf(payout, deps), signerOf(fee, deps)]);
  const signedByWorker = (signer: Address | null, auth: SignedAuthorization): boolean =>
    signer !== null && sameAddress(signer, worker) && sameAddress(auth.from, worker);

  if (!signedByWorker(payoutSigner, payout) || !signedByWorker(feeSigner, fee)) {
    // Never the recovered address and never the signature: what a refused caller learns here
    // is that it was refused.
    deps.log.warn({ route: '/me/withdraw', decision: 'not_the_signer', worker });
    throw ApiError.of('forbidden', { reason: 'not_the_signer' });
  }

  // 2. The recipients. The payout leg pays the address the worker typed; the fee leg pays the
  //    treasury and nothing else. Both are compared against values this service already had.
  if (!sameAddress(payout.to, to)) return refuse('wrong_destination');
  if (!sameAddress(fee.to, deps.treasury)) return refuse('wrong_fee_recipient');

  // 3. The arithmetic. `amount` is what the two legs add up to, and the fee has to be exactly
  //    `withdrawFeeOn` of it — a leg under it is Legwork being short-changed, a leg over it is
  //    a worker being over-charged, and both are the same refusal.
  const payoutUnits = BigInt(payout.value);
  const feeUnits = BigInt(fee.value);
  const amountUnits = payoutUnits + feeUnits;
  if (feeUnits !== withdrawFeeOn(amountUnits)) return refuse('fee_mismatch');

  // 4. The floor, named in the body so the phone never has to hold a second copy of it.
  if (amountUnits < toUsdcUnits(MIN_WITHDRAW_USDC)) {
    return refuse('below_minimum', { min_withdraw_usdc: MIN_WITHDRAW_USDC });
  }

  // 5. The window. An authorization the token would reject is refused here rather than
  //    burning the relayer's gas on a revert.
  const nowS = BigInt(Math.floor(deps.now().getTime() / 1000));
  for (const auth of [payout, fee]) {
    if (BigInt(auth.valid_before) <= nowS || BigInt(auth.valid_after) > nowS) {
      return refuse('authorization_expired');
    }
  }

  // 6. One payout nonce, one withdrawal. The insert is the reservation: a row that exists
  //    with no `payout_tx` is mid-flight, and a row with one is answered, never re-broadcast.
  const reserved = await deps.db
    .insert(withdrawals)
    .values({
      payoutNonce: payout.nonce,
      feeNonce: fee.nonce,
      worker,
      destination: to,
      amountUnits,
      payoutUnits,
      feeUnits,
      payoutTx: null,
      feeTx: null,
      feePending: false,
      createdAt: deps.now(),
    })
    .onConflictDoNothing({ target: withdrawals.payoutNonce })
    .returning({ payoutNonce: withdrawals.payoutNonce });

  if (reserved.length === 0) {
    const rows = await deps.db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.payoutNonce, payout.nonce))
      .limit(1);
    const row = rows[0];
    if (!row || row.payoutTx === null) {
      throw ApiError.of('conflict', { reason: 'in_progress', retry_after_s: IN_PROGRESS_RETRY_S });
    }
    deps.log.info({ route: '/me/withdraw', decision: 'replay', worker });
    return answer({ ...row, replay: true });
  }

  // 7. The payout leg. A failure here has moved nothing — the authorization is untouched and
  //    the phone can send the same pair again — so the reservation is dropped with it.
  let payoutTx: string;
  try {
    payoutTx = (await deps.relayer.transferWithAuthorization(payout)).hash;
  } catch (err) {
    await deps.db.delete(withdrawals).where(
      and(eq(withdrawals.payoutNonce, payout.nonce), isNull(withdrawals.payoutTx)),
    );
    deps.log.error({
      route: '/me/withdraw',
      decision: 'withdraw_failed',
      worker,
      err: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: 'withdraw_failed' }, { status: 503 });
  }

  // 8. The fee leg. It is second on purpose and it never turns a landed payout into an error:
  //    from here on the worker has their money, and the only open question is ours.
  let feeTx: string | null = null;
  let feePending = false;
  try {
    feeTx = (await deps.relayer.transferWithAuthorization(fee)).hash;
  } catch (err) {
    feePending = true;
    deps.log.error({
      route: '/me/withdraw',
      decision: 'fee_pending',
      worker,
      payout_tx: payoutTx,
      fee_units: feeUnits.toString(),
      err: err instanceof Error ? err.message : String(err),
    });
  }

  await deps.db
    .update(withdrawals)
    .set({ payoutTx, feeTx, feePending })
    .where(eq(withdrawals.payoutNonce, payout.nonce));

  deps.log.info({
    route: '/me/withdraw',
    decision: feePending ? 'paid_fee_pending' : 'paid',
    worker,
    payout_tx: payoutTx,
    fee_tx: feeTx,
  });

  return answer({ payoutTx, feeTx, payoutUnits, feeUnits, feePending });
}

// --------------------------------------------------------------- the wiring

/**
 * The relayer half, on the queue behind `getChain()`.
 *
 * `sendAndWait`, not `send`: a `transferWithAuthorization` that reverts still has a hash, and
 * a route that returned that hash would tell a worker their money moved when it did not. The
 * receipt is the only thing that knows, and this is the one place that reads it.
 */
export function buildRelayer(usdc: Address): WithdrawRelayer {
  return {
    async transferWithAuthorization(auth) {
      const { v, r, s } = splitSignature(auth.signature as Hex);
      const receipt = await getTxQueue().sendAndWait({
        to: usdc,
        data: encodeFunctionData({
          abi: TRANSFER_WITH_AUTHORIZATION_ABI,
          functionName: 'transferWithAuthorization',
          args: [
            getAddress(auth.from),
            getAddress(auth.to),
            BigInt(auth.value),
            BigInt(auth.valid_after),
            BigInt(auth.valid_before),
            auth.nonce as Hex,
            v,
            r,
            s,
          ],
        }),
      });
      if (receipt.status !== 'success') throw new Error(`transferWithAuthorization reverted`);
      return { hash: receipt.transactionHash };
    },
  };
}

/**
 * Production wiring, and the only place that reads config. A missing `TREASURY_ADDRESS` or
 * `USDC_ADDRESS` is a boot-time misconfiguration that says which one it is — not a
 * withdrawal quietly paid to `0x0`.
 */
export function buildWithdrawDeps(db: Db): WithdrawDeps {
  const config = getConfig();
  if (!config.TREASURY_ADDRESS) throw new Error('POST /me/withdraw needs TREASURY_ADDRESS');
  if (!config.USDC_ADDRESS) throw new Error('POST /me/withdraw needs USDC_ADDRESS');
  const usdc = getAddress(config.USDC_ADDRESS);

  return {
    db,
    relayer: buildRelayer(usdc),
    treasury: getAddress(config.TREASURY_ADDRESS),
    usdc,
    chainId: config.CHAIN_ID,
    now: () => new Date(),
    log: logger,
  };
}
