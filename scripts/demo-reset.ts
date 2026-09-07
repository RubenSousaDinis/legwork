/**
 * Back to an empty stage between takes.
 *
 *   pnpm demo:reset [--worker 0x… | --nullifier <uint256>]
 *
 * Three steps, in the order a rehearsal needs them:
 *
 *   1. `POST /admin/reset-demo` clears what the API remembers — tasks, proofs, logs, sessions.
 *      It does not clear `nullifiers`, `posters`, `nonces` or `admin_audit`, and it touches no
 *      contract: what the escrow holds is not demo state.
 *   2. `WorkerRegistry.resetWorker(nullifier)` frees a World ID binding so the same human can
 *      register again on camera. Owner-only, so `DEPLOYER_PRIVATE_KEY` signs it — the one
 *      disclosed operator power in this script, and the only place the owner key is used.
 *   3. The refusal wall is read back. Marks are onchain and nothing here deletes them.
 *
 * **The reset is opt-in.** Without `--worker` or `--nullifier` no binding is touched, because
 * `resetWorker` deletes the record in both directions: run against the seeded CLI worker it
 * would stop that address being a worker at all, and break the next `demo:run` rather than
 * prepare it.
 */
import { readFileSync } from 'node:fs';

import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

import { CHAIN_ID, ZERO_ADDRESS, parseDeployment } from '../packages/shared/src/addresses.ts';

const abiOf = (path: string): Abi =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')) as Abi;

const registryAbi = abiOf('packages/shared/src/abi/IWorkerRegistry.json');

/** What `demo:reset` says when the chain had nothing to free. */
export const NO_BINDING = 'no binding';

/** Printed when the wall still shows marks. An onchain mark outlives every reset there is. */
export const MARKS_SURVIVE =
  'onchain marks cannot be deleted — register a fresh demo agent id before filming (scripts/register-identity.ts, T-32)';

export class ResetFailure extends Error {
  constructor(readonly stage: string, message: string) {
    super(message);
    this.name = 'ResetFailure';
  }
}

// ------------------------------------------------------------------- step one

/** `POST /admin/reset-demo`. The body is the confirmation; there is no undo behind it. */
export async function resetDemoState(apiBaseUrl: string, adminKey: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/admin/reset-demo`, {
    method: 'POST',
    headers: { 'x-admin-key': adminKey, 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: 'reset-demo' }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ResetFailure('reset-demo', `POST /admin/reset-demo answered ${res.status} ${text}`);
  }
  const body = JSON.parse(text) as { ok?: boolean };
  if (body.ok !== true) {
    throw new ResetFailure('reset-demo', `POST /admin/reset-demo did not answer ok: ${text}`);
  }
}

// ------------------------------------------------------------------- step two

export interface ResetWorkerResult {
  nullifier: bigint;
  /** `undefined` when the chain had no binding to free. */
  tx?: Hex;
  worker?: Address;
}

/**
 * `resetWorker(nullifierHash)`, owner-only.
 *
 * `workerOf` is read first: the contract reverts `UnknownNullifier` on an unbound hash, and a
 * revert is a worse answer than "there was nothing there" for a script whose whole job is to
 * make the state boring.
 */
export async function resetWorkerBinding(
  rpcUrl: string,
  ownerKey: Hex,
  registry: Address,
  nullifier: bigint,
): Promise<ResetWorkerResult> {
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const bound = (await publicClient.readContract({
    address: registry,
    abi: registryAbi,
    functionName: 'workerOf',
    args: [nullifier],
  })) as Address;

  if (getAddress(bound) === getAddress(ZERO_ADDRESS)) return { nullifier };

  const account = privateKeyToAccount(ownerKey);
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });
  const tx = await wallet.writeContract({
    address: registry,
    abi: registryAbi,
    functionName: 'resetWorker',
    args: [nullifier],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
  return { nullifier, tx, worker: bound };
}

/** `nullifierOf(worker)` — the synthetic hash a seeded worker was registered under. */
export async function nullifierOfWorker(
  rpcUrl: string,
  registry: Address,
  worker: Address,
): Promise<bigint> {
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  return (await publicClient.readContract({
    address: registry,
    abi: registryAbi,
    functionName: 'nullifierOf',
    args: [worker],
  })) as bigint;
}

// ----------------------------------------------------------------- step three

interface RefusalWall {
  recent?: { marked?: boolean; example?: boolean }[];
}

/**
 * How many refusals on the public wall carry an onchain mark.
 *
 * `/public/refusals` never names an agent — that is deliberate, and a privacy ruling rather
 * than an omission — so this is the demo agent's count only because the demo agent is the one
 * posting. `examples` are `demo-data.json` rows and are excluded: a demo row never marked
 * anybody.
 */
export function markCount(wall: RefusalWall): number {
  return (wall.recent ?? []).filter((row) => row.marked === true && row.example !== true).length;
}

export async function readMarkCount(apiBaseUrl: string): Promise<number> {
  const res = await fetch(`${apiBaseUrl}/public/refusals`);
  if (!res.ok) {
    throw new ResetFailure('refusals', `GET /public/refusals answered ${res.status}`);
  }
  return markCount((await res.json()) as RefusalWall);
}

// -------------------------------------------------------------------- the CLI

export interface ResetArgs {
  worker?: string;
  nullifier?: string;
}

export function parseArgs(argv: readonly string[]): ResetArgs {
  const args: ResetArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--worker' && value) { args.worker = value; i += 1; }
    else if (flag === '--nullifier' && value) { args.nullifier = value; i += 1; }
  }
  return args;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ResetFailure('env', `${name} is not set`);
  return value;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiBaseUrl = requireEnv('API_BASE_URL').replace(/\/$/, '');

  await resetDemoState(apiBaseUrl, requireEnv('ADMIN_API_KEY'));
  console.log('DEMO STATE CLEARED tasks, proofs, logs and sessions');

  if (args.worker || args.nullifier) {
    const rpcUrl = requireEnv('BASE_SEPOLIA_RPC_URL');
    const record = JSON.parse(
      readFileSync(new URL('../contracts/deployments/base-sepolia.json', import.meta.url), 'utf8'),
    ) as unknown;
    const deployment = parseDeployment(record);
    if (deployment.chainId !== CHAIN_ID) {
      throw new ResetFailure('env', `the deployment record is chain ${deployment.chainId}, not Base Sepolia`);
    }
    const registry = deployment.addresses.workerRegistry;

    let nullifier: bigint;
    if (args.nullifier) {
      nullifier = BigInt(args.nullifier);
    } else {
      const worker = args.worker as string;
      if (!isAddress(worker)) throw new ResetFailure('args', `--worker ${worker} is not an address`);
      nullifier = await nullifierOfWorker(rpcUrl, registry, getAddress(worker));
    }

    const result = await resetWorkerBinding(
      rpcUrl,
      requireEnv('DEPLOYER_PRIVATE_KEY') as Hex,
      registry,
      nullifier,
    );
    if (result.tx) {
      console.log(`WORKER RESET nullifier ${result.nullifier} was ${result.worker} — ${result.tx}`);
    } else {
      console.log(`WORKER RESET nullifier ${result.nullifier} — ${NO_BINDING}`);
    }
  }

  const marks = await readMarkCount(apiBaseUrl);
  console.log(`MARKS ${marks}`);
  if (marks !== 0) console.log(MARKS_SURVIVE);

  console.log('RESET OK');
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    const stage = error instanceof ResetFailure ? error.stage : 'demo-reset';
    console.log(`FAILED ${stage}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
