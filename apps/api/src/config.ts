/**
 * The environment, parsed once.
 *
 * Every name in `.env.example` appears here and nowhere else in the API: a route reads
 * `getConfig()`, never `process.env`. That is what keeps a key out of a client bundle and
 * makes "which variable is missing?" a question with one answer.
 *
 * A parse failure names the variables and never their values — three of these are private
 * keys, and a validation message is the easiest place in a system to leak one into a log.
 */
import { privateKeyToAccount } from 'viem/accounts';
import type { Address } from 'viem';
import { z } from 'zod';

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 20-byte hex address');
const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'expected a 32-byte hex private key');
const secret = z.string().min(32, 'expected at least 32 characters');

/** `''` is what an unset variable looks like in a `.env` file; treat it as absent. */
const optional = <T extends z.ZodType>(inner: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? undefined : v), inner.optional());

export const ConfigEnv = z.object({
  // -- chain --
  BASE_SEPOLIA_RPC_URL: z.string().min(1, 'expected an RPC URL'),
  CHAIN_ID: z.coerce.number().int().pipe(z.literal(84532)).default(84532),

  // -- keys (never logged, never sent to a client) --
  RELAYER_PRIVATE_KEY: privateKey,
  ATTESTATION_VERIFIER_PRIVATE_KEY: privateKey,
  ABUSEMARK_SIGNER_PRIVATE_KEY: privateKey,
  DEPLOYER_PRIVATE_KEY: optional(privateKey),
  BUYER_PRIVATE_KEY: optional(privateKey),
  CLI_WORKER_PRIVATE_KEY: optional(privateKey),
  TREASURY_ADDRESS: optional(address),
  BUYER_AGENT_ID: optional(z.string()),
  BASESCAN_API_KEY: optional(z.string()),
  FORCE_REDEPLOY: optional(z.string()),

  // -- deployed addresses (T-14 fills these) --
  WORKER_REGISTRY_ADDRESS: optional(address),
  TASK_ESCROW_ADDRESS: optional(address),
  REPUTATION_ADDRESS: optional(address),
  ABUSEMARK_ADDRESS: optional(address),
  USDC_ADDRESS: optional(address),
  ERC8004_IDENTITY_ADDRESS: optional(address),
  ERC8004_REPUTATION_ADDRESS: optional(address),

  // -- World ID --
  WORLD_APP_ID: optional(z.string()),
  WORLD_RP_ID: optional(z.string()),
  WORLD_RP_SIGNING_KEY: optional(z.string()),
  WORLD_ACTION: z.string().min(1).default('legwork-worker'),
  WORLD_ENV: z.string().min(1).default('staging'),
  WORLD_CREDENTIAL_LEVEL: z.enum(['selfie', 'orb']).default('selfie'),
  NEXT_PUBLIC_WORLD_APP_ID: optional(z.string()),
  NEXT_PUBLIC_WORLD_CREDENTIAL_LEVEL: z.enum(['selfie', 'orb']).default('selfie'),

  // -- payments --
  PAYMENT_MODE: z.enum(['x402', 'direct']).default('x402'),
  X402_FACILITATOR_URL: optional(z.string()),
  X402_NETWORK: optional(z.string()),

  // -- Supabase --
  DATABASE_URL: z.string().min(1, 'expected a Postgres connection string'),
  SUPABASE_URL: optional(z.string()),
  SUPABASE_SERVICE_ROLE_KEY: optional(z.string()),
  PROOF_BUCKET: z.string().min(1).default('proofs'),

  // -- The Graph --
  SUBGRAPH_QUERY_URL: optional(z.string()),
  GRAPH_API_KEY: optional(z.string()),
  GRAPH_DEPLOY_KEY: optional(z.string()),
  SUBGRAPH_SLUG: optional(z.string()),
  NEXT_PUBLIC_SUBGRAPH_QUERY_URL: optional(z.string()),

  // -- classifier (the key itself is read only by packages/screening) --
  CLASSIFIER_MODEL: optional(z.string()),
  LIVE_LLM: optional(z.string()),

  // -- API --
  API_BASE_URL: optional(z.string()),
  DASHBOARD_URL: optional(z.string()),
  MINIAPP_URL: optional(z.string()),
  NEXT_PUBLIC_API_BASE_URL: optional(z.string()),
  NEXT_PUBLIC_ADMIN_UI: optional(z.string()),
  ADMIN_API_KEY: optional(z.string()),
  SWEEP_SECRET: optional(z.string()),
  SESSION_SECRET: secret,
  PROOF_URL_SECRET: secret,
  DEMO_DISPUTE_WINDOW_S: z.coerce.number().int().positive().default(120),
  /** Vercel kills a function well before a longer poll returns, so 50 is a ceiling. */
  LONGPOLL_MAX_S: z.coerce.number().int().positive().default(50),
  DATA_MODE: z.enum(['live', 'demo']).default('live'),

  // -- runtime, not from .env.example --
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  VERCEL_GIT_COMMIT_SHA: optional(z.string()),
});

export type ConfigEnv = z.infer<typeof ConfigEnv>;

/** The parsed environment plus the three addresses derived from the keys. */
export type Config = ConfigEnv & {
  relayerAddress: Address;
  attestationVerifierAddress: Address;
  abuseMarkSignerAddress: Address;
  isProduction: boolean;
  /** The git sha the running build came from, or `'dev'`. */
  version: string;
};

const LONGPOLL_CEILING_S = 50;

export class ConfigError extends Error {
  readonly names: string[];
  constructor(names: string[]) {
    super(`invalid environment — check ${names.join(', ')}`);
    this.name = 'ConfigError';
    this.names = names;
  }
}

function build(env: Record<string, string | undefined>): Config {
  const parsed = ConfigEnv.safeParse(env);
  if (!parsed.success) {
    // Names only. `i.message` is our own text ("expected at least 32 characters"), never the
    // value zod rejected.
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? '(root)')))].sort();
    throw new ConfigError(names);
  }
  const data = parsed.data;
  return {
    ...data,
    LONGPOLL_MAX_S: Math.min(data.LONGPOLL_MAX_S, LONGPOLL_CEILING_S),
    relayerAddress: privateKeyToAccount(data.RELAYER_PRIVATE_KEY as `0x${string}`).address,
    attestationVerifierAddress: privateKeyToAccount(
      data.ATTESTATION_VERIFIER_PRIVATE_KEY as `0x${string}`,
    ).address,
    abuseMarkSignerAddress: privateKeyToAccount(
      data.ABUSEMARK_SIGNER_PRIVATE_KEY as `0x${string}`,
    ).address,
    isProduction: data.NODE_ENV === 'production',
    version: data.VERCEL_GIT_COMMIT_SHA ?? 'dev',
  };
}

let cached: Config | undefined;

/** Parsed on the first call, then held for the life of the instance. */
export function getConfig(): Config {
  if (!cached) cached = build(process.env);
  return cached;
}

/**
 * Vitest only. Replaces the cached config with one built from `overrides` on top of a
 * minimal valid environment, so a test never reads a real `.env` and never needs one.
 */
export function resetConfigForTests(overrides: Record<string, string | undefined> = {}): Config {
  cached = build({ ...TEST_ENV, ...overrides });
  return cached;
}

/**
 * Not a secret: three throwaway keys and two hosts nothing dials. Tests run on pglite
 * through `setDbForTests` and on `FakeChain` through `setChainForTests`, so neither the
 * `DATABASE_URL` nor the RPC URL below is ever opened — they exist only so `getConfig()`
 * has a complete environment to parse.
 */
export const TEST_ENV: Record<string, string> = {
  BASE_SEPOLIA_RPC_URL: 'http://rpc.invalid',
  CHAIN_ID: '84532',
  RELAYER_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
  ATTESTATION_VERIFIER_PRIVATE_KEY: `0x${'22'.repeat(32)}`,
  ABUSEMARK_SIGNER_PRIVATE_KEY: `0x${'33'.repeat(32)}`,
  DATABASE_URL: 'postgres://never-dialed@db.invalid/legwork',
  SESSION_SECRET: 'test-session-secret-of-at-least-32-chars',
  PROOF_URL_SECRET: 'test-proof-url-secret-of-at-least-32-chars',
  NODE_ENV: 'test',
};
