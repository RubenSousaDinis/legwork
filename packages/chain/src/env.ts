import { z } from 'zod';
import {
  CHAIN_ID,
  ERC8004_IDENTITY,
  ERC8004_REPUTATION,
  PLACEHOLDER_DEPLOYMENT,
  USDC,
} from '@legwork/shared';

/**
 * The chain half of `.env.example`, and nothing else. This library never reads
 * `process.env` itself — the caller builds the object and passes it in, which is what keeps
 * a key out of a client bundle and makes a route testable without a real environment.
 */

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 20-byte hex address')
  .transform((s) => s as `0x${string}`);

/** Never widened to `z.string()`: a malformed key must fail here, not inside viem. */
const privateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'expected a 32-byte hex private key')
  .transform((s) => s as `0x${string}`);

/**
 * `84532` is Base Sepolia, `31337` is a local anvil (T-36). Nothing else is a chain this
 * package knows how to talk to, so the union is the whole set.
 */
const chainId = z.coerce
  .number()
  .int()
  .pipe(z.union([z.literal(84532), z.literal(31337)], 'expected 84532 or 31337'));

export const ChainEnv = z.object({
  /**
   * Historical name: it is *the* RPC URL for whichever chain `CHAIN_ID` selects, so with
   * `CHAIN_ID=31337` it points at anvil. The lead adds a distinct variable if that ever stops
   * being true.
   */
  BASE_SEPOLIA_RPC_URL: z.url('expected an RPC URL'),
  CHAIN_ID: chainId.default(CHAIN_ID),

  RELAYER_PRIVATE_KEY: privateKey,
  ABUSEMARK_SIGNER_PRIVATE_KEY: privateKey,
  /** Owner-only calls (`pause`, `resolve`, `seedWorker`, …). Absent in the API; present in scripts. */
  DEPLOYER_PRIVATE_KEY: privateKey.optional(),

  WORKER_REGISTRY_ADDRESS: address.default(PLACEHOLDER_DEPLOYMENT.addresses.workerRegistry),
  TASK_ESCROW_ADDRESS: address.default(PLACEHOLDER_DEPLOYMENT.addresses.taskEscrow),
  REPUTATION_ADDRESS: address.default(PLACEHOLDER_DEPLOYMENT.addresses.reputation),
  ABUSEMARK_ADDRESS: address.default(PLACEHOLDER_DEPLOYMENT.addresses.abuseMark),
  USDC_ADDRESS: address.default(USDC),
  ERC8004_IDENTITY_ADDRESS: address.default(ERC8004_IDENTITY),
  ERC8004_REPUTATION_ADDRESS: address.default(ERC8004_REPUTATION),
});

export type ChainEnv = z.infer<typeof ChainEnv>;

/**
 * Parses the chain environment, or throws with the *names* of the bad variables.
 *
 * The error deliberately carries no values: two of these fields are private keys and a
 * validation message is the easiest place in a system to leak one into a log line.
 */
export function parseChainEnv(env: Record<string, string | undefined>): ChainEnv {
  const parsed = ChainEnv.safeParse(env);
  if (parsed.success) return parsed.data;
  const fields = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  throw new Error(`invalid chain environment — ${fields.join('; ')}`);
}
