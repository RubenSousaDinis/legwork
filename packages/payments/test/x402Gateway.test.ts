import { beforeEach, describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { decodePaymentSignatureHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import type { PaymentRequirements } from '@x402/core/types';
import type { PaymentContext, RemainingBudget } from '../src/gateway.js';
import { FakeFacilitator } from '../src/x402/fakeFacilitator.js';
import { X402Gateway } from '../src/x402/gateway.js';
import { REQUEST_HEADER } from '../src/x402/paths.js';
import { ANVIL_ACCOUNT_0_PRIVATE_KEY, signPaymentHeader } from '../src/x402/testSigner.js';

/**
 * Everything here runs offline: the fake facilitator answers from arithmetic, and EIP-3009
 * signing is typed data. No chain, no RPC, and never the public reference facilitator.
 */

const PAY_TO = '0x1111111111111111111111111111111111111111' as const;
/** Base Sepolia USDC, the library's own default asset for `eip155:84532`. */
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
const RESOURCE = 'http://127.0.0.1:4021/tasks';
const REMAINING_BUDGET: RemainingBudget = { open_tasks: 4, daily_usdc: 18.10 };

const facilitator = new FakeFacilitator();
const gateway = new X402Gateway({
  facilitator,
  payTo: PAY_TO,
  asset: USDC,
  network: 'eip155:84532',
});
const quote = gateway.price({ task_type: 'verify-open', amount_usdc: 3.0 });

beforeEach(() => {
  facilitator.reset();
});

function request(headers: Record<string, string> = {}): Request {
  return new Request(RESOURCE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ task_type: 'verify-open', amount_usdc: 3.0 }),
  });
}

async function requirementsFrom402(): Promise<PaymentRequirements> {
  const result = await gateway.requirePayment(request(), quote, {
    remaining_budget: REMAINING_BUDGET,
    resource: RESOURCE,
  });
  if (result.kind !== 'payment_required') throw new Error('expected a 402');
  return result.body.accepts[0] as PaymentRequirements;
}

async function verifiedContext(): Promise<PaymentContext> {
  const requirements = await requirementsFrom402();
  const signed = await signPaymentHeader({ requirements });
  facilitator.reset();
  const result = await gateway.requirePayment(
    request({ [REQUEST_HEADER]: signed.header }),
    quote,
    { remaining_budget: REMAINING_BUDGET, resource: RESOURCE },
  );
  if (result.kind !== 'verified') throw new Error('expected a verified payment');
  return result.ctx;
}

describe('X402Gateway', () => {
  it('requirePaymentIsVerifyOnly', async () => {
    const noHeader = await gateway.requirePayment(request(), quote, {
      remaining_budget: REMAINING_BUDGET,
      resource: RESOURCE,
    });
    if (noHeader.kind !== 'payment_required') throw new Error('expected a 402');
    expect(noHeader.status).toBe(402);
    expect(Object.keys(noHeader.body).sort()).toEqual([
      'accepts',
      'error',
      'price_usdc',
      'remaining_budget',
    ]);
    expect(noHeader.body.error).toBe('payment_required');
    expect(noHeader.body.price_usdc).toBe(3.45);
    expect(noHeader.body.remaining_budget).toEqual(REMAINING_BUDGET);
    expect(noHeader.body.accepts).toHaveLength(1);
    const requirements = noHeader.body.accepts[0] as PaymentRequirements;
    expect(requirements.amount).toBe('3450000');
    expect(requirements.payTo).toBe(PAY_TO);
    // A v2 client reads its requirements from the header, not the JSON body.
    expect(noHeader.headers['PAYMENT-REQUIRED']).toBeTypeOf('string');
    // A 402 is not a payment: nothing was asked of the facilitator at all.
    expect(facilitator.verifyCalls).toBe(0);
    expect(facilitator.settleCalls).toBe(0);

    const signed = await signPaymentHeader({ requirements });
    const paid = await gateway.requirePayment(
      request({ [REQUEST_HEADER]: signed.header }),
      quote,
      { remaining_budget: REMAINING_BUDGET, resource: RESOURCE },
    );
    if (paid.kind !== 'verified') throw new Error('expected a verified payment');
    expect(gateway.payerOf(paid.ctx)).toBe(privateKeyToAccount(ANVIL_ACCOUNT_0_PRIVATE_KEY).address);
    expect(gateway.authNonceOf(paid.ctx)).toBe(signed.nonce);
    expect(paid.ctx.priceUnits).toBe(3_450_000n);
    expect(paid.ctx.network).toBe('eip155:84532');
    // verify moves no money, and nothing settles inside requirePayment.
    expect(facilitator.verifyCalls).toBe(1);
    expect(facilitator.settleCalls).toBe(0);

    // A header that decodes but does not verify: the same 402 shape, plus the reason.
    const tampered = decodePaymentSignatureHeader(signed.header);
    (tampered.payload as { authorization: { value: string } }).authorization.value = '1';
    const rejected = await gateway.requirePayment(
      request({ [REQUEST_HEADER]: encodePaymentSignatureHeader(tampered) }),
      quote,
      { remaining_budget: REMAINING_BUDGET, resource: RESOURCE },
    );
    if (rejected.kind !== 'payment_required') throw new Error('expected a 402');
    expect(rejected.status).toBe(402);
    expect(rejected.body.error).toBe('payment_required');
    expect(rejected.body.reason).toBe('insufficient_funds');
    expect(facilitator.settleCalls).toBe(0);
  });

  it('settleFailureSurfacesFloatAbsorbed', async () => {
    const ctx = await verifiedContext();

    facilitator.failNextSettle('facilitator_unavailable');
    // The route has already posted the escrow by this point. A settle that throws would
    // lose the task the agent paid for, so it never throws.
    const failed = await gateway.settle(ctx);
    expect(failed).toEqual({
      ok: false,
      reason: 'facilitator_unavailable',
      float_absorbed: true,
    });
    expect(facilitator.settleCalls).toBe(1);

    // The spike saw the identical authorization settle seconds later: a failed settle is
    // retryable, not a refusal.
    const retried = await gateway.settle(ctx);
    expect(retried.ok).toBe(true);
    expect(facilitator.settleCalls).toBe(2);
  });

  it('settles the verified authorization after the route has posted', async () => {
    const ctx = await verifiedContext();
    const settlement = await gateway.settle(ctx);
    if (!settlement.ok) throw new Error(`expected a settlement, got ${settlement.reason}`);
    expect(settlement.tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(facilitator.settleCalls).toBe(1);
  });
});
