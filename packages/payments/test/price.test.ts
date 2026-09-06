import { describe, expect, it } from 'vitest';
import { priceWithFee, toUsdcUnits } from '@legwork/shared';
import { DirectFundingGateway } from '../src/direct/gateway.js';
import { FakeFacilitator } from '../src/x402/fakeFacilitator.js';
import { X402Gateway } from '../src/x402/gateway.js';

const PAY_TO = '0x1111111111111111111111111111111111111111' as const;
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;

const gateway = new X402Gateway({
  facilitator: new FakeFacilitator(),
  payTo: PAY_TO,
  asset: USDC,
  network: 'eip155:84532',
});

describe('price', () => {
  it('priceMathSixDecimals', () => {
    // The worker keeps the posted rate; the 15 % fee is charged on top of it.
    expect(gateway.price({ task_type: 'verify-open', amount_usdc: 3.0 })).toEqual({
      amount_units: 3_000_000n,
      fee_units: 450_000n,
      price_units: 3_450_000n,
      price_usdc: 3.45,
    });

    expect(gateway.price({ task_type: 'photo-of', amount_usdc: 1.0 }).price_units).toBe(1_150_000n);
    expect(gateway.price({ task_type: 'photo-of', amount_usdc: 10.0 }).price_units).toBe(
      11_500_000n,
    );

    // 50 random 2-decimal amounts in [1, 10]: the quote is the shared integer helper, so a
    // float multiply anywhere in the chain would show up here.
    for (let i = 0; i < 50; i++) {
      const amount = Math.round((1 + Math.random() * 9) * 100) / 100;
      const quote = gateway.price({ task_type: 'compare-two', amount_usdc: amount });
      expect(quote.price_units).toBe(priceWithFee(toUsdcUnits(amount)));
      expect(quote.amount_units + quote.fee_units).toBe(quote.price_units);
    }
  });

  it('the direct-funding gateway prices identically', () => {
    expect(new DirectFundingGateway().price({ task_type: 'verify-open', amount_usdc: 3.0 })).toEqual(
      gateway.price({ task_type: 'verify-open', amount_usdc: 3.0 }),
    );
  });
});
