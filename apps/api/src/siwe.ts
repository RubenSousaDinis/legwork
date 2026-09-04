/**
 * The one call into MiniKit's SIWE verifier, wrapped so a route reads a boolean.
 *
 * MiniKit tries plain signature recovery first and falls back to EIP-1271 — the World App
 * wallet is a smart contract, so that fallback is the path a real user takes, and it needs a
 * World Chain client. In production that is MiniKit's own default. `setSiweProviderForTests`
 * substitutes a client that answers nothing, which is how a suite with no RPC can still
 * assert that a mismatched signature is refused.
 */
import { verifySiweMessage } from '@worldcoin/minikit-js/siwe';
import type { Client } from 'viem';

/** MiniKit's walletAuth success payload, as it arrives in the request body. */
export interface WalletAuthPayload {
  status: 'success';
  message: string;
  signature: string;
  address: string;
  version: number;
}

let providerForTests: Client | undefined;

/** Vitest only. */
export function setSiweProviderForTests(client: Client | undefined): void {
  providerForTests = client;
}

/**
 * `true` only when MiniKit says the signature covers this exact nonce. Every failure — a
 * malformed message, an expired one, a nonce that does not match, a signature from another
 * key — is the same `false`, because the caller is told the same 401 either way.
 */
export async function verifyWalletAuth(payload: WalletAuthPayload, nonce: string): Promise<boolean> {
  try {
    const result = await verifySiweMessage(payload, nonce, undefined, undefined, providerForTests);
    return result.isValid === true;
  } catch {
    return false;
  }
}
