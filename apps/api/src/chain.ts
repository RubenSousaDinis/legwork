/**
 * The only place in `apps/api` that imports `@legwork/chain`.
 *
 * One import site is what makes `setChainForTests` total: a route that reached for
 * `LiveChain` directly would still dial an RPC in a test suite that has no key and no node,
 * and a cloud agent would find that out at the worst possible moment.
 */
import { LiveChain, PgNonceLock, parseChainEnv, type ChainAdapter, type TxQueue } from '@legwork/chain';
import { getConfig } from './config';
import { getDb, transaction } from './db/client';
import { logger } from './log';

let live: LiveChain | undefined;
let fake: ChainAdapter | undefined;

/** Only the names `ChainEnv` knows, and only when set — its own defaults cover the rest. */
function chainEnv(): Record<string, string | undefined> {
  const c = getConfig();
  const env: Record<string, string | undefined> = {
    BASE_SEPOLIA_RPC_URL: c.BASE_SEPOLIA_RPC_URL,
    CHAIN_ID: String(c.CHAIN_ID),
    RELAYER_PRIVATE_KEY: c.RELAYER_PRIVATE_KEY,
    ABUSEMARK_SIGNER_PRIVATE_KEY: c.ABUSEMARK_SIGNER_PRIVATE_KEY,
    WORKER_REGISTRY_ADDRESS: c.WORKER_REGISTRY_ADDRESS,
    TASK_ESCROW_ADDRESS: c.TASK_ESCROW_ADDRESS,
    REPUTATION_ADDRESS: c.REPUTATION_ADDRESS,
    ABUSEMARK_ADDRESS: c.ABUSEMARK_ADDRESS,
    USDC_ADDRESS: c.USDC_ADDRESS,
    ERC8004_IDENTITY_ADDRESS: c.ERC8004_IDENTITY_ADDRESS,
    ERC8004_REPUTATION_ADDRESS: c.ERC8004_REPUTATION_ADDRESS,
  };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  return env;
}

/**
 * The API never holds the owner key, so `LiveChain` is built without a
 * `DEPLOYER_PRIVATE_KEY`: the disclosed operator calls belong to a script, not to a route.
 */
function getLive(): LiveChain {
  if (!live) {
    // The lock lives in Postgres so two instances relaying at once cannot pick the same
    // nonce. `getDb()` is already open by the time any route reaches the chain.
    getDb();
    live = new LiveChain({
      env: parseChainEnv(chainEnv()),
      lock: new PgNonceLock({ transaction }),
      logger,
    });
  }
  return live;
}

export function getChain(): ChainAdapter {
  return fake ?? getLive();
}

/**
 * The relayer queue: every chain write this service ever makes goes through it, one nonce at
 * a time. This task performs no write at all — it exists so T-16 … T-20 have one to reach
 * for and never build a second.
 */
export function getTxQueue(): TxQueue {
  if (fake) {
    // `FakeChain` applies a write the moment it is called, so there is no queue behind it.
    // Loud on purpose: a test that needs one is testing `LiveChain`, not a route.
    throw new Error('getTxQueue() is unavailable under setChainForTests — FakeChain has no queue');
  }
  return getLive().queues.relayer;
}

/** Vitest only: `setChainForTests(new FakeChain())`, `setChainForTests(undefined)` to clear. */
export function setChainForTests(next: ChainAdapter | undefined): void {
  fake = next;
  live = undefined;
}
