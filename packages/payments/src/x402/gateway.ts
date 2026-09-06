import type { Hex } from 'viem';
import { x402ResourceServer, type FacilitatorClient } from '@x402/core/server';
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader } from '@x402/core/http';
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { getDefaultAsset } from '@x402/evm';
import {
  quoteFor,
  type PaymentContext,
  type PaymentGateway,
  type PaymentRequiredBody,
  type PriceQuote,
  type RemainingBudget,
  type RequirePaymentResult,
  type SettleResult,
} from '../gateway.js';
import { PAYMENT_REQUIRED_HEADER, REQUEST_HEADER, readNonce, readPayer } from './paths.js';
import type { TaskType } from '@legwork/shared';

export type { FacilitatorClient };

export type X402GatewayOptions = {
  facilitator: FacilitatorClient;
  /** The relayer address the escrow is funded from. The agent pays this, not the worker. */
  payTo: Hex;
  asset: Hex;
  network: 'eip155:84532';
  maxTimeoutSeconds?: number;
};

const DEFAULT_MAX_TIMEOUT_SECONDS = 300;

/**
 * The x402 seller half of `POST /tasks`, built from the @x402/core resource-server
 * primitives rather than a framework middleware: the price is per-request, and settlement
 * has to happen *after* `TaskEscrow.post`, not before the handler.
 *
 * Order, frozen in T-01: `requirePayment` (402, or verify — which moves no money) → the
 * route screens and posts → `settle`. Nothing here settles on its own.
 */
export class X402Gateway implements PaymentGateway {
  private readonly resourceServer: x402ResourceServer;
  private readonly options: Required<X402GatewayOptions>;
  private initialized: Promise<void> | null = null;

  constructor(options: X402GatewayOptions) {
    this.options = {
      maxTimeoutSeconds: DEFAULT_MAX_TIMEOUT_SECONDS,
      ...options,
    };
    this.resourceServer = new x402ResourceServer(options.facilitator).register(
      options.network,
      new ExactEvmScheme(),
    );
  }

  price(envelope: { task_type: TaskType; amount_usdc: number }): PriceQuote {
    return quoteFor(envelope);
  }

  async requirePayment(
    req: Request,
    quote: PriceQuote,
    extras: { remaining_budget: RemainingBudget; resource: string },
  ): Promise<RequirePaymentResult> {
    await this.ready();
    const requirements = await this.buildRequirements(quote);

    const header = req.headers.get(REQUEST_HEADER);
    if (!header) {
      return this.paymentRequired(requirements, quote, extras);
    }

    let payload: PaymentPayload;
    try {
      payload = decodePaymentSignatureHeader(header);
    } catch (error) {
      return this.paymentRequired(requirements, quote, extras, reasonOf(error));
    }

    // verify moves no money. It is the only thing that happens before the route screens.
    const verification = await this.resourceServer.verifyPayment(payload, requirements);
    if (!verification.isValid) {
      return this.paymentRequired(
        requirements,
        quote,
        extras,
        verification.invalidReason ?? 'invalid_payment',
      );
    }

    return {
      kind: 'verified',
      ctx: {
        // The facilitator recovers the payer from the signature; the spike logged both it
        // and the authorization's own `from` and they matched.
        payer: (verification.payer as Hex | undefined) ?? readPayer(payload),
        authNonce: readNonce(payload),
        priceUnits: quote.price_units,
        paymentHeader: header,
        requirements,
        network: this.options.network,
      },
    };
  }

  /**
   * Called by the route only after `TaskEscrow.post` succeeded. Never throws: a facilitator
   * that is down leaves the task posted and the float short, which the route logs as
   * `float_absorbed=true` — the agent keeps the task it paid for.
   */
  async settle(ctx: PaymentContext): Promise<SettleResult> {
    try {
      await this.ready();
      const payload = decodePaymentSignatureHeader(ctx.paymentHeader);
      const settlement = await this.resourceServer.settlePayment(
        payload,
        ctx.requirements as PaymentRequirements,
      );
      if (!settlement.success) {
        return {
          ok: false,
          reason: settlement.errorReason ?? 'settle_failed',
          float_absorbed: true,
        };
      }
      return { ok: true, tx: settlement.transaction as Hex };
    } catch (error) {
      return { ok: false, reason: reasonOf(error), float_absorbed: true };
    }
  }

  payerOf(ctx: PaymentContext): Hex {
    return ctx.payer;
  }

  authNonceOf(ctx: PaymentContext): Hex {
    return ctx.authNonce;
  }

  /** Fetches the facilitator's supported kinds once. The fake answers offline. */
  private ready(): Promise<void> {
    this.initialized ??= this.resourceServer.initialize();
    return this.initialized;
  }

  /**
   * Requirements are built per request, inside the handler, because the amount is dynamic.
   * The resource URL travels on the 402's `resource` info, which is where a v2 client reads
   * it from.
   *
   * `extra` carries the asset's EIP-712 domain: with an explicit `{ asset, amount }` price
   * the library leaves it empty and the client then refuses to sign. The values come from
   * the library's own default-asset table rather than a hand-written constant, and its
   * address doubles as a check on the configured asset.
   */
  private async buildRequirements(quote: PriceQuote): Promise<PaymentRequirements> {
    const defaultAsset = getDefaultAsset(this.options.network);
    if (defaultAsset.asset.toLowerCase() !== this.options.asset.toLowerCase()) {
      throw new Error(
        `asset ${this.options.asset} is not the default asset for ${this.options.network} (${defaultAsset.asset})`,
      );
    }
    const [requirements] = await this.resourceServer.buildPaymentRequirements({
      scheme: 'exact',
      network: this.options.network,
      payTo: this.options.payTo,
      price: {
        asset: this.options.asset,
        amount: quote.price_units.toString(),
        extra: { name: defaultAsset.name, version: defaultAsset.version },
      },
      maxTimeoutSeconds: this.options.maxTimeoutSeconds,
    });
    if (!requirements) throw new Error('the resource server built no payment requirements');
    return requirements;
  }

  private async paymentRequired(
    requirements: PaymentRequirements,
    quote: PriceQuote,
    extras: { remaining_budget: RemainingBudget; resource: string },
    reason?: string,
  ): Promise<RequirePaymentResult> {
    const paymentRequired = await this.resourceServer.createPaymentRequiredResponse(
      [requirements],
      { url: extras.resource, description: 'Legwork task', mimeType: 'application/json' },
      'payment_required',
    );
    const body: PaymentRequiredBody = {
      error: 'payment_required',
      price_usdc: quote.price_usdc,
      accepts: paymentRequired.accepts,
      remaining_budget: extras.remaining_budget,
    };
    // A header that is present but does not verify gets the same 402 shape with the
    // facilitator's own reason — never a new error code.
    if (reason !== undefined) body.reason = reason;
    return {
      kind: 'payment_required',
      status: 402,
      body,
      // A v2 client reads its requirements from this header; the JSON body is for humans,
      // curl and the dashboard.
      headers: { [PAYMENT_REQUIRED_HEADER]: encodePaymentRequiredHeader(paymentRequired) },
    };
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
