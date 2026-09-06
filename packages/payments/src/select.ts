import type { PaymentGateway } from './gateway.js';
import { DirectFundingGateway } from './direct/gateway.js';
import { X402Gateway, type X402GatewayOptions } from './x402/gateway.js';

export type PaymentMode = 'x402' | 'direct';

/** T-16 reads `PAYMENT_MODE` and passes it here; this package reads no env itself. */
export type SelectGatewayDeps = { x402?: X402GatewayOptions };

export function selectGateway(mode: PaymentMode, deps: SelectGatewayDeps = {}): PaymentGateway {
  if (mode === 'direct') return new DirectFundingGateway();
  if (!deps.x402) throw new Error('PAYMENT_MODE=x402 needs an x402 gateway configuration');
  return new X402Gateway(deps.x402);
}
