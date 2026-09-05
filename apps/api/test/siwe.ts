/**
 * Builds the walletAuth payload World App would send, from a viem account.
 *
 * MiniKit's `parseSiweMessage` is strict about line order and blank lines, so the message is
 * assembled the way MiniKit assembles it rather than the way an ERC-4361 example reads. The
 * CLI worker (T-25) copies this file: it signs the same message with its own key, which is
 * the whole reason the helper lives here and not inside a test file.
 */
import { createPublicClient, custom, type Client } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

export interface WalletAuthPayload {
  status: 'success';
  message: string;
  signature: string;
  address: string;
  version: number;
}

export const SIWE_STATEMENT = 'Sign in to Legwork';

export interface SiweMessageOptions {
  statement?: string;
  chainId?: number;
  issuedAt?: Date;
  expirationTime?: Date;
}

export function siweMessage(
  address: string,
  nonce: string,
  domain: string,
  options: SiweMessageOptions = {},
): string {
  const issuedAt = options.issuedAt ?? new Date();
  const expirationTime = options.expirationTime ?? new Date(issuedAt.getTime() + 10 * 60 * 1000);
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    options.statement ?? SIWE_STATEMENT,
    '',
    `URI: https://${domain}`,
    'Version: 1',
    `Chain ID: ${options.chainId ?? baseSepolia.id}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expiration Time: ${expirationTime.toISOString()}`,
    '',
  ].join('\n');
}

/** Signed by `account`; pass a different account to build a payload that must be refused. */
export async function walletAuthPayload(
  account: PrivateKeyAccount,
  nonce: string,
  domain: string,
  options: SiweMessageOptions & { signWith?: PrivateKeyAccount } = {},
): Promise<WalletAuthPayload> {
  const message = siweMessage(account.address, nonce, domain, options);
  const signature = await (options.signWith ?? account).signMessage({ message });
  return { status: 'success', message, signature, address: account.address, version: 1 };
}

/**
 * A World Chain client that answers nothing.
 *
 * MiniKit falls back to an EIP-1271 `isValidSignature` call when plain recovery does not
 * match the address — which is the right thing in production, where a World App wallet is a
 * smart contract, and exactly the wrong thing in a suite that must never touch a chain.
 * Handing `verifySiweMessage` this client keeps the refusal path offline.
 */
export function offlineSiweProvider(): Client {
  return createPublicClient({
    chain: baseSepolia,
    transport: custom({
      request: async () => {
        throw new Error('no chain in tests');
      },
    }),
  });
}
