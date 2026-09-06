import type { Hex } from 'viem';
import type { TaskType } from '@legwork/shared';
import {
  quoteFor,
  type PaymentContext,
  type PaymentGateway,
  type PriceQuote,
  type RemainingBudget,
  type RequirePaymentResult,
  type SettleResult,
} from '../gateway';

const NOT_IMPLEMENTED = 'direct funding not implemented — T-16b';

/**
 * The Day-6 pivot, selected by `PAYMENT_MODE=direct`. Under it the buyer calls
 * `postAsBuyer` themselves and the API verifies the `TaskPosted` event, so there is no
 * 402 and nothing to settle. Pricing is the same arithmetic either way, so `price` works
 * today; the rest lands in T-16b if it is dispatched.
 */
export class DirectFundingGateway implements PaymentGateway {
  price(envelope: { task_type: TaskType; amount_usdc: number }): PriceQuote {
    return quoteFor(envelope);
  }

  requirePayment(
    _req: Request,
    _quote: PriceQuote,
    _extras: { remaining_budget: RemainingBudget; resource: string },
  ): Promise<RequirePaymentResult> {
    throw new Error(NOT_IMPLEMENTED);
  }

  settle(_ctx: PaymentContext): Promise<SettleResult> {
    throw new Error(NOT_IMPLEMENTED);
  }

  payerOf(ctx: PaymentContext): Hex {
    return ctx.payer;
  }

  authNonceOf(ctx: PaymentContext): Hex {
    return ctx.authNonce;
  }
}
