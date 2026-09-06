import { keccak256 } from 'viem';
import type { FacilitatorClient } from '@x402/core/server';
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from '@x402/core/types';
import { readAuthorization } from './paths';

const DEFAULT_NETWORK: Network = 'eip155:84532';

/**
 * A facilitator that answers from arithmetic instead of a chain. No network, no RPC, no
 * key: every test in this repo runs against it, and nothing here ever reaches the public
 * reference facilitator.
 *
 * It checks what a real one checks about the authorization itself — recipient, amount,
 * expiry, and whether this nonce was already settled — and it does not check the signature,
 * because there is no chain to check it against.
 */
export class FakeFacilitator implements FacilitatorClient {
  verifyCalls = 0;
  settleCalls = 0;

  private readonly networks: Network[];
  private readonly settledNonces = new Set<string>();
  private nextVerifyFailure: string | null = null;
  private nextSettleFailure: string | null = null;
  /** Injectable so an expiry test does not have to wait. */
  private readonly now: () => number;

  constructor(options: { networks?: Network[]; now?: () => number } = {}) {
    this.networks = options.networks ?? [DEFAULT_NETWORK];
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
  }

  /** The next `verify` answers invalid with this reason, then the fake returns to normal. */
  failNextVerify(reason: string): void {
    this.nextVerifyFailure = reason;
  }

  /** The next `settle` answers unsuccessful with this reason, then the fake returns to normal. */
  failNextSettle(reason: string): void {
    this.nextSettleFailure = reason;
  }

  reset(): void {
    this.verifyCalls = 0;
    this.settleCalls = 0;
    this.settledNonces.clear();
    this.nextVerifyFailure = null;
    this.nextSettleFailure = null;
  }

  verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    this.verifyCalls++;

    const forced = this.nextVerifyFailure;
    if (forced !== null) {
      this.nextVerifyFailure = null;
      return Promise.resolve({ isValid: false, invalidReason: forced });
    }

    let authorization;
    try {
      authorization = readAuthorization(paymentPayload);
    } catch {
      return Promise.resolve({ isValid: false, invalidReason: 'invalid_exact_evm_payload' });
    }
    const payer = authorization.from;

    if (authorization.to.toLowerCase() !== paymentRequirements.payTo.toLowerCase()) {
      return Promise.resolve({
        isValid: false,
        invalidReason: 'invalid_exact_evm_payload_recipient_mismatch',
        payer,
      });
    }
    if (BigInt(authorization.value) < BigInt(paymentRequirements.amount)) {
      return Promise.resolve({
        isValid: false,
        invalidReason: 'insufficient_funds',
        payer,
      });
    }
    if (BigInt(authorization.validBefore) <= BigInt(this.now())) {
      return Promise.resolve({
        isValid: false,
        invalidReason: 'invalid_exact_evm_payload_authorization_valid_before',
        payer,
      });
    }
    if (this.settledNonces.has(authorization.nonce.toLowerCase())) {
      return Promise.resolve({
        isValid: false,
        invalidReason: 'invalid_exact_evm_payload_authorization_already_used',
        payer,
      });
    }
    return Promise.resolve({ isValid: true, payer });
  }

  settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    this.settleCalls++;
    const network = paymentRequirements.network;

    const forced = this.nextSettleFailure;
    if (forced !== null) {
      this.nextSettleFailure = null;
      return Promise.resolve({
        success: false,
        errorReason: forced,
        transaction: '',
        network,
      });
    }

    const authorization = readAuthorization(paymentPayload);
    const nonce = authorization.nonce.toLowerCase();
    this.settledNonces.add(nonce);
    return Promise.resolve({
      success: true,
      transaction: keccak256(nonce as `0x${string}`),
      network,
      payer: authorization.from,
    });
  }

  getSupported(): Promise<SupportedResponse> {
    return Promise.resolve({
      kinds: this.networks.map((network) => ({ x402Version: 2, scheme: 'exact', network })),
      extensions: [],
      signers: Object.fromEntries(this.networks.map((network) => [network, []])),
    });
  }
}
