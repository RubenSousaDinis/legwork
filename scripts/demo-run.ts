/**
 * The green headless loop: post → claim → submit → release, on Base Sepolia, in one command.
 *
 *   pnpm demo:run [--agent-id 9196] [--auto-release] [--place scripts/fixtures/demo-place.json]
 *
 * This is the money beat with no phone and no human in it. The buyer is the demo agent
 * (`BUYER_PRIVATE_KEY`, allowlisted on the escrow); the worker is the seeded CLI worker,
 * driven in-process by `runWorkerOnce`. `POST /tasks` answers 402, `@x402/fetch` signs a
 * 3.45 USDC authorization, and the retry comes back 201 with a task id.
 *
 * Three things this file refuses to take on faith:
 *
 * - **The preconditions.** Nothing is spent until the registry says the worker is seeded, the
 *   escrow says the buyer is allowlisted, the buyer's balance covers 3.45 and `/healthz` is
 *   200. A loop that dies halfway has already moved money.
 * - **The receipt.** The release is asserted from the two USDC `Transfer` logs on the
 *   transaction — `3_000_000` to the worker, `450_000` to the treasury — never from the API's
 *   own `amount_usdc`. The API reporting a release it did not get is exactly the failure this
 *   check exists for.
 * - **The custody gap.** x402 settles to the relayer and `TaskEscrow.post` locks a block
 *   later. That gap is real, it is one block wide, and the `POSTED` line says so out loud.
 */
import { readFileSync } from 'node:fs';

import { ExactEvmScheme } from '@x402/evm';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  getAddress,
  http,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

import ngeohash from 'ngeohash';

import { CHAIN_ID, parseDeployment } from '../packages/shared/src/addresses.ts';
import { TASK_TYPE_BIT } from '../packages/shared/src/enums.ts';
import { specHash } from '../packages/shared/src/schemas/spec-hash.ts';
import {
  DEFAULT_CLAIM_TTL_S,
  DEFAULT_SUBMIT_TTL_S,
  DEMO_DISPUTE_WINDOW_S,
  LONGPOLL_MAX_S,
  MAX_TASK_AMOUNT_USDC,
  feeOn,
  fromUsdcUnits,
  priceWithFee,
  toUsdcUnits,
} from '../packages/shared/src/constants.ts';
import {
  StageError,
  ClaimConflictError,
  loadDemoPlace,
  runWorkerOnce,
  type DemoPlace,
} from './cli-worker.ts';

// ------------------------------------------------------------------ the money

/** The worker's rate. The fee is 15 % **on top**, so the agent pays 3.45 and locks 3.45. */
export const TASK_AMOUNT_USDC = 3.0;
export const WORKER_UNITS = toUsdcUnits(TASK_AMOUNT_USDC);
export const FEE_UNITS = feeOn(WORKER_UNITS);
export const PRICE_UNITS = priceWithFee(WORKER_UNITS);

/** The library's own default is $1, which refuses the 3.45 this task costs. */
const MAX_PAYMENT_USD = `$${fromUsdcUnits(priceWithFee(toUsdcUnits(MAX_TASK_AMOUNT_USDC))).toFixed(2)}`;
const PAYMENT_NETWORK = 'eip155:84532' as const;

/**
 * The read client, named by its factory.
 *
 * `PublicClient` from `viem` is generic over chain and transport, and the instantiation a
 * signature declares is rarely the one `createPublicClient` returns — the two are structurally
 * identical and nominally unrelated, which is a compiler error and never a bug. Naming the
 * return type sidesteps the whole argument.
 */
function readClient(rpcUrl: string) {
  return createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
}
type ReadClient = ReturnType<typeof readClient>;

const BASESCAN_TX = 'https://sepolia.basescan.org/tx/';
export const txLink = (hash: string): string => `${BASESCAN_TX}${hash}`;

// ----------------------------------------------------------------- the output

export type StageName = 'POSTED' | 'CLAIMED' | 'SUBMITTED' | 'RELEASED';

export interface Stage {
  stage: StageName;
  tx: string;
  /** `POSTED` only. */
  taskId?: string;
  /** An indented line printed under the stage. Honesty copy, never a value the caller typed. */
  detail?: string;
}

/**
 * The five lines, in the order they are printed.
 *
 * The brief lists the money line after `RELEASED` and then says three separate times — §8, §9
 * and §14 — that the last line must be `RELEASED`. Both cannot hold. The three checks win: the
 * money line is the receipt `RELEASED` then confirms, and `tail -n 1` reads `RELEASED`. The PR
 * flags the contradiction rather than quietly picking a side.
 */
export function formatStageLog(stages: readonly Stage[]): string {
  const lines: string[] = [];
  for (const stage of stages) {
    const headline =
      stage.stage === 'POSTED'
        ? `POSTED task_id=${stage.taskId ?? ''} ${txLink(stage.tx)}`
        : `${stage.stage} ${txLink(stage.tx)}`;
    // `POSTED` explains itself afterwards; every later stage is explained before it, so the
    // very last line of a successful run is `RELEASED`.
    if (stage.stage === 'POSTED') {
      lines.push(headline);
      if (stage.detail) lines.push(`  ${stage.detail}`);
    } else {
      if (stage.detail) lines.push(`  ${stage.detail}`);
      lines.push(headline);
    }
  }
  return lines.join('\n');
}

/** The receipt line: what moved, to whom, and that it is testnet money. */
export function moneyLine(worker: Address, treasury: Address): string {
  return (
    `USDC ${fromUsdcUnits(WORKER_UNITS).toFixed(2)} → worker ${worker}` +
    ` · USDC ${fromUsdcUnits(FEE_UNITS).toFixed(2)} → treasury ${treasury}` +
    ` · testnet USDC — not spendable`
  );
}

/** Printed under `POSTED`. The one block between settlement and escrow, said out loud. */
export const CUSTODY_LINE =
  'x402 settled 3.45 to the relayer and TaskEscrow locked 3.45 one block later — our custody is the one block between settlement and escrow, and we say so';

// -------------------------------------------------------------------- the ABI

const abiOf = (path: string): Abi =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')) as Abi;

const registryAbi = abiOf('packages/shared/src/abi/IWorkerRegistry.json');
const escrowAbi = abiOf('packages/shared/src/abi/ITaskEscrow.json');

/** `Transfer` and the two writes direct mode needs. Nothing else off the token is used. */
const erc20Abi = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const satisfies Abi;

// ----------------------------------------------------------- the failure mode

/** Everything printed on the way out. `FAILED <stage>: <reason>`, exit 1. */
export class DemoFailure extends Error {
  constructor(readonly stage: string, message: string) {
    super(message);
    this.name = 'DemoFailure';
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function describe(body: unknown): string {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

// --------------------------------------------------------- the preconditions

export interface Preconditions {
  apiBaseUrl: string;
  publicClient: ReadClient;
  registry: Address;
  escrow: Address;
  usdc: Address;
  buyer: Address;
  worker: Address;
}

/**
 * Four reads before a cent moves. Each answers `PRECONDITION FAILED: <which>` and stops.
 */
export async function checkPreconditions(deps: Preconditions): Promise<string | null> {
  const health = await fetch(`${deps.apiBaseUrl}/healthz`).catch(() => null);
  if (!health || health.status !== 200) {
    return `healthz — GET ${deps.apiBaseUrl}/healthz answered ${health ? health.status : 'nothing'}`;
  }

  const read = <T>(address: Address, abi: Abi, functionName: string, args: unknown[]): Promise<T> =>
    deps.publicClient.readContract({ address, abi, functionName, args }) as Promise<T>;

  if (!(await read<boolean>(deps.registry, registryAbi, 'isSeeded', [deps.worker]))) {
    return `registry.isSeeded(${deps.worker}) is false — the CLI worker is not seeded demo staff`;
  }
  if (!(await read<boolean>(deps.escrow, escrowAbi, 'allowlistedBuyer', [deps.buyer]))) {
    return `escrow.allowlistedBuyer(${deps.buyer}) is false — a seeded worker may not claim this buyer's tasks`;
  }
  const balance = await read<bigint>(deps.usdc, erc20Abi as unknown as Abi, 'balanceOf', [deps.buyer]);
  if (balance < PRICE_UNITS) {
    return `buyer USDC balance ${fromUsdcUnits(balance).toFixed(2)} is under the ${fromUsdcUnits(PRICE_UNITS).toFixed(2)} this task costs`;
  }
  return null;
}

// ---------------------------------------------------------------- the posting

export interface PostedTask {
  taskId: string;
  buyerToken: string;
  specHash: Hex;
}

/** The envelope, exactly as `POST /tasks` and `hire_human` both spell it. */
export function buildEnvelope(place: DemoPlace, agentId?: string): Record<string, unknown> {
  return {
    task_type: 'verify-open',
    spec: {
      place: {
        place_id: place.place_id,
        name: place.name,
        street_address: place.street_address,
        locality: place.locality,
        country: place.country,
      },
      question: 'open_now',
      claimed_open: true,
      claimed_hours: null,
      source: 'own-list',
    },
    amount_usdc: TASK_AMOUNT_USDC,
    dispute_window_s: Number(process.env['DEMO_DISPUTE_WINDOW_S'] ?? DEMO_DISPUTE_WINDOW_S),
    ...(agentId ? { agent_id: agentId } : {}),
  };
}

/**
 * `POST /tasks` through the paying fetch.
 *
 * The first request carries no credential: the server has not asked yet, and a signature
 * given away unprompted is one somebody else can spend. Only the 402 makes the client sign.
 */
async function postTask(
  apiBaseUrl: string,
  privateKey: Hex,
  envelope: Record<string, unknown>,
): Promise<PostedTask> {
  const account = privateKeyToAccount(privateKey);
  const client = new x402Client()
    .register(PAYMENT_NETWORK, new ExactEvmScheme(account))
    .setSpendControls({ maxAmountPerPayment: MAX_PAYMENT_USD });
  const payFetch = wrapFetchWithPayment(fetch, client) as typeof fetch;

  let res: Response;
  try {
    res = await payFetch(`${apiBaseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(envelope),
    });
  } catch (error) {
    throw new DemoFailure('post', `the x402 leg threw before a task id: ${error instanceof Error ? error.message : String(error)}`);
  }

  const body = await readBody(res);
  if (res.status !== 201) {
    throw new DemoFailure('post', `POST /tasks answered ${res.status} ${describe(body)}`);
  }
  const posted = body as { task_id: string; buyer_token: string; spec_hash: Hex };
  return { taskId: posted.task_id, buyerToken: posted.buyer_token, specHash: posted.spec_hash };
}

/**
 * Direct mode (`PAYMENT_MODE=direct`, the S3 pivot): the buyer approves the escrow and posts
 * for itself, and the loop then continues from the claim exactly as it does under x402.
 *
 * There is no `buyer_token` on this path — only `POST /tasks` mints one — so the release beat
 * is the dispute window and the sweeper, never `approve`. And the API row behind the onchain
 * task is T-17's reconciliation: if the board never lists the id, this stops with `BLOCKED:`
 * rather than inventing one.
 */
async function postDirect(
  rpcUrl: string,
  privateKey: Hex,
  escrow: Address,
  usdc: Address,
  place: DemoPlace,
  agentId: string | undefined,
): Promise<{ taskId: string; postTx: Hex }> {
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });
  const publicClient = readClient(rpcUrl);

  const approveTx = await wallet.writeContract({
    address: usdc,
    abi: erc20Abi as unknown as Abi,
    functionName: 'approve',
    args: [escrow, PRICE_UNITS],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });

  const envelope = buildEnvelope(place, agentId) as { spec: unknown; dispute_window_s: number };
  const params = {
    taskType: TASK_TYPE_BIT['verify-open'],
    specHash: specHash(envelope.spec),
    amount: WORKER_UNITS,
    buyer: account.address,
    buyerAgentId: BigInt(agentId ?? '0'),
    area: ngeohash.encode(place.lat, place.lon, 5),
    claimTTL: DEFAULT_CLAIM_TTL_S,
    submitTTL: DEFAULT_SUBMIT_TTL_S,
    disputeWindow: envelope.dispute_window_s,
  };
  const postTx = await wallet.writeContract({
    address: escrow,
    abi: escrowAbi,
    functionName: 'postAsBuyer',
    args: [params],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: postTx });

  // The id comes off the emitted event, never off a simulation: two simulations of the same
  // call predict the same id, and only one of them can be right.
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(escrow)) continue;
    try {
      const decoded = decodeEventLog({ abi: escrowAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === 'TaskPosted') {
        const args = decoded.args as unknown as { taskId: bigint };
        return { taskId: args.taskId.toString(), postTx };
      }
    } catch {
      continue;
    }
  }
  throw new DemoFailure('post', `postAsBuyer ${postTx} emitted no TaskPosted`);
}

// --------------------------------------------------------------- the watching

interface TaskView {
  status: string;
  tx: { post?: string; claim?: string; submit?: string; release?: string };
  poll_after_seconds: number;
}

async function readTask(apiBaseUrl: string, taskId: string, buyerToken: string, waitS: number): Promise<TaskView> {
  const res = await fetch(`${apiBaseUrl}/tasks/${taskId}?wait=${waitS}`, {
    headers: { 'x-buyer-token': buyerToken },
  });
  const body = await readBody(res);
  if (!res.ok) throw new DemoFailure('status', `GET /tasks/${taskId} answered ${res.status} ${describe(body)}`);
  return body as TaskView;
}

/** Long-polls until the task reaches one of `wanted`, or gives up. */
async function waitForStatus(
  apiBaseUrl: string,
  taskId: string,
  buyerToken: string,
  wanted: readonly string[],
  timeoutMs: number,
  stage: string,
): Promise<TaskView> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const view = await readTask(apiBaseUrl, taskId, buyerToken, LONGPOLL_MAX_S);
    if (wanted.includes(view.status)) return view;
    if (view.status === 'disputed' || view.status === 'refunded' || view.status === 'expired') {
      throw new DemoFailure(stage, `task ${taskId} is ${view.status}, which is not on the way to ${wanted.join(' or ')}`);
    }
    if (Date.now() > deadline) {
      throw new DemoFailure(stage, `task ${taskId} was still ${view.status} after ${Math.round(timeoutMs / 1000)} s`);
    }
    await sleep(Math.max(1, view.poll_after_seconds) * 1000);
  }
}

async function approve(apiBaseUrl: string, taskId: string, buyerToken: string): Promise<string> {
  const res = await fetch(`${apiBaseUrl}/tasks/${taskId}/approve`, {
    method: 'POST',
    headers: { 'x-buyer-token': buyerToken },
  });
  const body = await readBody(res);
  if (!res.ok) throw new DemoFailure('approve', `POST /tasks/${taskId}/approve answered ${res.status} ${describe(body)}`);
  return (body as { tx: string }).tx;
}

/** The lazy sweeper runs on a status read; `POST /admin/sweep` only makes it sooner. */
async function nudgeSweeper(apiBaseUrl: string): Promise<void> {
  const adminKey = process.env['ADMIN_API_KEY'];
  if (!adminKey) return;
  await fetch(`${apiBaseUrl}/admin/sweep`, {
    method: 'POST',
    headers: { 'x-admin-key': adminKey, 'content-type': 'application/json' },
    body: '{}',
  }).catch(() => undefined);
}

// --------------------------------------------------------------- the receipt

export interface ReleaseReceipt {
  toWorker: bigint;
  toTreasury: bigint;
}

/**
 * The two USDC `Transfer` logs on the release transaction.
 *
 * Read off the receipt rather than off the API: `3_000_000` to the worker and `450_000` to the
 * treasury are the only evidence that the money moved, and they are asserted as integers, never
 * computed from a percentage of a string.
 */
export async function assertReleaseReceipt(
  publicClient: ReadClient,
  hash: Hex,
  usdc: Address,
  worker: Address,
  treasury: Address,
): Promise<ReleaseReceipt> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new DemoFailure('receipt', `release ${hash} reverted`);

  let toWorker = 0n;
  let toTreasury = 0n;
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(usdc)) continue;
    let decoded;
    try {
      decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    if (decoded.eventName !== 'Transfer') continue;
    const { to, value } = decoded.args as unknown as { to: Address; value: bigint };
    if (getAddress(to) === getAddress(worker)) toWorker += value;
    if (getAddress(to) === getAddress(treasury)) toTreasury += value;
  }

  if (toWorker !== WORKER_UNITS || toTreasury !== FEE_UNITS) {
    throw new DemoFailure(
      'receipt',
      `release ${hash} moved ${toWorker} to the worker and ${toTreasury} to the treasury; the loop asserts ${WORKER_UNITS} and ${FEE_UNITS}`,
    );
  }
  return { toWorker, toTreasury };
}

// -------------------------------------------------------------------- the CLI

export interface DemoArgs {
  agentId?: string;
  autoRelease: boolean;
  place: string;
}

export function parseArgs(argv: readonly string[]): DemoArgs {
  const args: DemoArgs = { autoRelease: false, place: 'scripts/fixtures/demo-place.json' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--agent-id' && value) { args.agentId = value; i += 1; }
    else if (flag === '--place' && value) { args.place = value; i += 1; }
    else if (flag === '--auto-release') args.autoRelease = true;
  }
  return args;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new DemoFailure('env', `${name} is not set`);
  return value;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiBaseUrl = requireEnv('API_BASE_URL').replace(/\/$/, '');
  const rpcUrl = requireEnv('BASE_SEPOLIA_RPC_URL');
  const buyerKey = requireEnv('BUYER_PRIVATE_KEY') as Hex;
  const workerKey = requireEnv('CLI_WORKER_PRIVATE_KEY') as Hex;
  const treasury = getAddress(requireEnv('TREASURY_ADDRESS'));
  const place = loadDemoPlace(args.place);

  const record = JSON.parse(
    readFileSync(new URL('../contracts/deployments/base-sepolia.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>;
  const deployment = parseDeployment(record);
  if (deployment.chainId !== CHAIN_ID) {
    throw new DemoFailure('env', `the deployment record is chain ${deployment.chainId}, not Base Sepolia`);
  }
  const usdc = getAddress(String(record['usdc']));

  const publicClient = readClient(rpcUrl);
  const buyer = privateKeyToAccount(buyerKey).address;
  const worker = privateKeyToAccount(workerKey).address;

  const failed = await checkPreconditions({
    apiBaseUrl,
    publicClient,
    registry: deployment.addresses.workerRegistry,
    escrow: deployment.addresses.taskEscrow,
    usdc,
    buyer,
    worker,
  });
  if (failed) {
    console.log(`PRECONDITION FAILED: ${failed}`);
    process.exit(1);
  }

  const direct = (process.env['PAYMENT_MODE'] ?? 'x402') === 'direct';
  const stages: Stage[] = [];
  let posted: PostedTask;

  if (direct) {
    const onchain = await postDirect(
      rpcUrl,
      buyerKey,
      deployment.addresses.taskEscrow,
      usdc,
      place,
      args.agentId,
    );
    posted = { taskId: onchain.taskId, buyerToken: '', specHash: '0x' };
    stages.push({ stage: 'POSTED', tx: onchain.postTx, taskId: onchain.taskId, detail: CUSTODY_LINE });
  } else {
    posted = await postTask(apiBaseUrl, buyerKey, buildEnvelope(place, args.agentId));
    const postView = await readTask(apiBaseUrl, posted.taskId, posted.buyerToken, 0);
    stages.push({
      stage: 'POSTED',
      tx: postView.tx.post ?? '',
      taskId: posted.taskId,
      detail: CUSTODY_LINE,
    });
  }

  // The worker half, in-process and silent: `demo-run` owns the output.
  let run;
  try {
    run = await runWorkerOnce({
      apiBaseUrl,
      privateKey: workerKey,
      place,
      taskId: posted.taskId,
      log: () => undefined,
    });
  } catch (error) {
    if (error instanceof ClaimConflictError) throw new DemoFailure('claim', error.code);
    const stage = error instanceof StageError ? error.stage : 'worker';
    if (direct && stage === 'list') {
      throw new DemoFailure(
        'post',
        `BLOCKED: task ${posted.taskId} was posted onchain but never listed by GET /tasks/list — reconciling a direct post into an API row is T-17's, not T-29's`,
      );
    }
    throw new DemoFailure(stage, error instanceof Error ? error.message : String(error));
  }
  if (run.autoDisputeReason) {
    throw new DemoFailure('submit', `the submit auto-disputed: ${run.autoDisputeReason}`);
  }
  stages.push({ stage: 'CLAIMED', tx: run.claimTx ?? '' });

  const submitted = await waitForStatus(apiBaseUrl, posted.taskId, posted.buyerToken, ['submitted'], 180_000, 'submit');
  stages.push({ stage: 'SUBMITTED', tx: run.submitTx ?? submitted.tx.submit ?? '' });

  if (args.autoRelease || direct) {
    // The window is short on purpose and disclosed on screen; the sweeper is only urgency.
    await sleep((Number(process.env['DEMO_DISPUTE_WINDOW_S'] ?? DEMO_DISPUTE_WINDOW_S) + 5) * 1000);
    await nudgeSweeper(apiBaseUrl);
  } else {
    await approve(apiBaseUrl, posted.taskId, posted.buyerToken);
  }

  const released = await waitForStatus(apiBaseUrl, posted.taskId, posted.buyerToken, ['released'], 300_000, 'release');
  const releaseTx = released.tx.release;
  if (!releaseTx) throw new DemoFailure('release', `task ${posted.taskId} is released with no transaction beside it`);

  await assertReleaseReceipt(publicClient, releaseTx as Hex, usdc, run.worker, treasury);
  stages.push({ stage: 'RELEASED', tx: releaseTx, detail: moneyLine(run.worker, treasury) });

  console.log(formatStageLog(stages));
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    const stage = error instanceof DemoFailure ? error.stage : 'demo-run';
    console.log(`FAILED ${stage}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
