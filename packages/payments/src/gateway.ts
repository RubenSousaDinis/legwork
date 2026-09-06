import type { Hex } from 'viem';
import { fromUsdcUnits, priceWithFee, toUsdcUnits, type TaskType } from '@legwork/shared';

/**
 * The seam `POST /tasks` calls. The route never touches the x402 library directly: it asks
 * for a price, asks whether the request is paid for, does its own work (screen, then
 * `TaskEscrow.post`), and only then settles.
 *
 * `verify` moves no money and comes first; `settle` is a separate call the route makes
 * **after** `post`. There is deliberately no verify-and-settle helper: a task that is refused
 * moves no money, and one that is accepted must have its escrow posted before the agent is
 * charged.
 */

/** Six-decimal integer money. The agent pays `price_units`; the worker keeps `amount_units`. */
export type PriceQuote = {
  amount_units: bigint;
  fee_units: bigint;
  price_units: bigint;
  price_usdc: number;
};

/** Echoed in the 402 body so an honest agent can read its own remaining budget. */
export type RemainingBudget = { open_tasks: number; daily_usdc: number };

/**
 * Everything the route needs to carry from `requirePayment` to `settle`. `authNonce` — the
 * EIP-3009 authorization nonce — is the idempotency key: never the task id, never the payer.
 */
export type PaymentContext = {
  payer: Hex;
  authNonce: Hex;
  priceUnits: bigint;
  paymentHeader: string;
  requirements: unknown;
  network: 'eip155:84532';
};

export type PaymentRequiredBody = {
  error: 'payment_required';
  price_usdc: number;
  accepts: unknown[];
  remaining_budget: RemainingBudget;
  reason?: string;
};

export type RequirePaymentResult =
  | {
      kind: 'payment_required';
      status: 402;
      body: PaymentRequiredBody;
      headers: Record<string, string>;
    }
  | { kind: 'verified'; ctx: PaymentContext };

/** A settle that fails after `post` succeeded: the operator float absorbed the task. */
export type SettleResult = { ok: true; tx: Hex } | { ok: false; reason: string; float_absorbed: true };

export interface PaymentGateway {
  price(envelope: { task_type: TaskType; amount_usdc: number }): PriceQuote;
  requirePayment(
    req: Request,
    quote: PriceQuote,
    extras: { remaining_budget: RemainingBudget; resource: string },
  ): Promise<RequirePaymentResult>;
  settle(ctx: PaymentContext): Promise<SettleResult>;
  payerOf(ctx: PaymentContext): Hex;
  authNonceOf(ctx: PaymentContext): Hex;
}

/**
 * The one place a price is computed, shared by every gateway. The fee is 15 % **on top** of
 * what the worker keeps: 3.00 for the worker, 0.45 fee, 3.45 charged. All of it is integer
 * arithmetic on 6-decimal units — a float multiply would drift on the third task.
 */
export function quoteFor(envelope: { task_type: TaskType; amount_usdc: number }): PriceQuote {
  const amount_units = toUsdcUnits(envelope.amount_usdc);
  const price_units = priceWithFee(amount_units);
  return {
    amount_units,
    fee_units: price_units - amount_units,
    price_units,
    price_usdc: fromUsdcUnits(price_units),
  };
}
