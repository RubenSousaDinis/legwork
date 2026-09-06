import type { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { encodePaymentSignatureHeader } from '@x402/core/http';
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types';

/**
 * Signs a real PAYMENT-SIGNATURE header for tests. EIP-3009 is typed-data signing, so this
 * is entirely offline: no RPC, no facilitator, no chain. T-16 and T-28 import it to drive a
 * paid request through their own handlers.
 */

/**
 * Anvil account #0. A published test vector printed by `anvil` on every start — it is not a
 * secret, holds nothing, and is never used outside tests. Real keys are read from
 * `process.env`; this package reads no env at all.
 */
export const ANVIL_ACCOUNT_0_PRIVATE_KEY: Hex =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/** x402 protocol version the v2 wire format carries. */
const X402_VERSION = 2;

export type SignPaymentHeaderArgs = {
  privateKey?: Hex;
  requirements: PaymentRequirements;
  /** Force the authorization nonce, so a replay test can re-send a known key. */
  nonce?: Hex;
};

export type SignedPaymentHeader = {
  header: string;
  payload: PaymentPayload;
  payer: Hex;
  nonce: Hex;
};

export async function signPaymentHeader({
  privateKey = ANVIL_ACCOUNT_0_PRIVATE_KEY,
  requirements,
  nonce,
}: SignPaymentHeaderArgs): Promise<SignedPaymentHeader> {
  const account = privateKeyToAccount(privateKey);

  // The scheme picks its own random nonce. When the caller wants a specific one, substitute
  // it inside the signer, so the signature actually covers the authorization we hand back
  // rather than a different one.
  const signer = {
    address: account.address,
    signTypedData: (typedData: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }) =>
      account.signTypedData({
        ...typedData,
        message: nonce ? { ...typedData.message, nonce } : typedData.message,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
  };

  const result = await new ExactEvmScheme(signer).createPaymentPayload(X402_VERSION, requirements);
  const authorization = (result.payload as { authorization: { from: string; nonce: string } })
    .authorization;
  if (nonce) authorization.nonce = nonce;

  const payload: PaymentPayload = {
    x402Version: result.x402Version,
    accepted: requirements,
    payload: result.payload,
  };

  return {
    header: encodePaymentSignatureHeader(payload),
    payload,
    payer: authorization.from as Hex,
    nonce: authorization.nonce.toLowerCase() as Hex,
  };
}
