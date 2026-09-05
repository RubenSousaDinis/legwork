import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, foundry } from 'viem/chains';
import type { ChainEnv } from './env';

/** The three keys this package can send from. One job per key; see `docs/keys.md`. */
export type Role = 'relayer' | 'signer' | 'owner';

export interface Clients {
  publicClient: PublicClient;
  wallets: {
    /** Holds the float. `post`, `registerFor`, `claimFor`, `submitFor`, `approve`, … */
    relayer: WalletClient;
    /** `AbuseMark.mark`, and nothing else. */
    signer: WalletClient;
    /** The deployer. Present only when `DEPLOYER_PRIVATE_KEY` is set — scripts, not the API. */
    owner?: WalletClient;
  };
}

export function chainFor(chainId: ChainEnv['CHAIN_ID']): Chain {
  return chainId === 84532 ? baseSepolia : foundry;
}

/**
 * One transport, three wallets. Every wallet shares the public client's transport so a route
 * opens one connection rather than four.
 */
export function createClients(env: ChainEnv): Clients {
  const chain = chainFor(env.CHAIN_ID);
  const transport = http(env.BASE_SEPOLIA_RPC_URL);

  const publicClient = createPublicClient({ chain, transport });
  const wallet = (key: `0x${string}`): WalletClient =>
    createWalletClient({ account: privateKeyToAccount(key), chain, transport });

  return {
    publicClient,
    wallets: {
      relayer: wallet(env.RELAYER_PRIVATE_KEY),
      signer: wallet(env.ABUSEMARK_SIGNER_PRIVATE_KEY),
      ...(env.DEPLOYER_PRIVATE_KEY ? { owner: wallet(env.DEPLOYER_PRIVATE_KEY) } : {}),
    },
  };
}
