import type { Hex } from 'viem';
import type { PaymentPayload } from '@x402/core/types';

/**
 * The only file that knows where the payer and the nonce live inside a decoded
 * PAYMENT-SIGNATURE payload. Both paths are copied from the S3 spike
 * (`docs/spikes/RESULTS.md#s3`), which logged them against three live round-trips —
 * they are not guessed from the library's source.
 *
 *   Payer path: `decoded.payload.authorization.from`
 *   Nonce path: `decoded.payload.authorization.nonce`
 *
 * Full EIP-3009 authorization shape: `{ from, to, value, validAfter, validBefore, nonce }`.
 */

/** Header the client sends its signed authorization in. */
export const REQUEST_HEADER = 'PAYMENT-SIGNATURE';
/** Header the 402 carries its requirements in. A v2 client reads this, not the JSON body. */
export const PAYMENT_REQUIRED_HEADER = 'PAYMENT-REQUIRED';
/** Header the 2xx carries the settlement receipt in. */
export const PAYMENT_RESPONSE_HEADER = 'PAYMENT-RESPONSE';

/** The EIP-3009 authorization as it travels inside `PaymentPayload.payload`. */
export type ExactEvmAuthorization = {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
};

export function readAuthorization(decodedPayload: PaymentPayload): ExactEvmAuthorization {
  const authorization = (decodedPayload.payload as { authorization?: Partial<ExactEvmAuthorization> })
    .authorization;
  if (!authorization?.from || !authorization.nonce) {
    throw new Error('no authorization in the decoded payload');
  }
  return authorization as ExactEvmAuthorization;
}

export function readPayer(decodedPayload: PaymentPayload): Hex {
  return readAuthorization(decodedPayload).from as Hex;
}

/** Lowercased: the spike found the same nonce arriving in mixed case, and it is a map key. */
export function readNonce(decodedPayload: PaymentPayload): Hex {
  return readAuthorization(decodedPayload).nonce.toLowerCase() as Hex;
}
