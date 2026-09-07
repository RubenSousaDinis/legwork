/**
 * What the harness proves, once the money has moved.
 *
 *   pnpm tsx scripts/e2e/assert.ts
 *
 * Run by `scripts/e2e/run.sh` after `demo:run` returns. Every balance is asserted as a delta
 * against `.out/before.json` rather than as an absolute: the seed has already pushed 17.25
 * through the escrow by the time the demo posts, so an absolute figure here would be a number
 * that happens to be right rather than a fact about this run.
 *
 * Three sources, and they have to agree: the chain (through `viem`), the API (through its own
 * routes) and the receipt of the release transaction. The first failure prints and stops —
 * `E2E FAIL <what>` — because the second assertion after a broken one tells you nothing.
 */
import { readFileSync } from 'node:fs';

import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  parseAbi,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { anvil } from 'viem/chains';

// ------------------------------------------------------------------- the money

/** The agent pays 3.45, the escrow locks 3.45, the worker receives 3.00, the fee is 0.45. */
const WORKER_UNITS = 3_000_000n;
const FEE_UNITS = 450_000n;
const PRICE_UNITS = 3_450_000n;

/** `TaskState.Released`, frozen in T-01. */
const RELEASED = 4;

// -------------------------------------------------------------------- the files

const ROOT = new URL('../../', import.meta.url);
const OUT = new URL('scripts/e2e/.out/', ROOT);

const readJson = <T>(url: URL): T => JSON.parse(readFileSync(url, 'utf8')) as T;
const abiOf = (path: string): Abi => readJson<Abi>(new URL(path, ROOT));

const escrowAbi = abiOf('packages/shared/src/abi/ITaskEscrow.json');
const registryAbi = abiOf('packages/shared/src/abi/IWorkerRegistry.json');
const reputationAbi = abiOf('packages/shared/src/abi/IReputation.json');

const erc20Abi = parseAbi(['function balanceOf(address account) view returns (uint256)']);

/** `contracts/test/mocks/MockERC8004.sol` — the recorded-call accessor, and nothing else. */
const mockReputationAbi = parseAbi([
  'function callCount() view returns (uint256)',
  'function calls(uint256) view returns (uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash, address client)',
]);

interface Deployment {
  chainId: number;
  addresses: {
    workerRegistry: Address;
    taskEscrow: Address;
    reputation: Address;
    abuseMark: Address;
    erc8004Identity: Address;
    erc8004Reputation: Address;
  };
  usdc: Address;
  treasury: Address;
  relayer: Address;
}

interface Before {
  addresses: { cliWorker: Address; treasury: Address; relayer: Address; escrow: Address; usdc: Address };
  usdc: { cliWorker: string; treasury: string; relayer: string; escrow: string };
  taskCount: string;
  nullifier: string;
  completed: string;
}

// --------------------------------------------------------------- the assertion

class Failed extends Error {}

let passed = 0;

/**
 * One line per assertion, and the first failure is the last line printed.
 *
 * `detail` is only ever read on the way out: a passing line says what held, and what it held
 * against is noise until it does not.
 */
function check(ok: boolean, message: string, detail?: string): void {
  if (!ok) throw new Failed(detail ? `${message} — ${detail}` : message);
  passed += 1;
  console.log(`ok   ${message}`);
}

const eq = (got: unknown, want: unknown, message: string): void =>
  check(got === want, message, `expected ${String(want)}, got ${String(got)}`);

const sameAddress = (got: string, want: string, message: string): void =>
  check(getAddress(got as Address) === getAddress(want as Address), message, `expected ${want}, got ${got}`);

// ------------------------------------------------------------------ the sources

const taskIdFromDemoLog = (log: string): string => {
  const match = /task_id=(\d+)/.exec(log);
  if (!match?.[1]) throw new Failed('.out/demo.log carries no task_id= — demo:run never posted');
  return match[1];
};

const agentIdFromDemoLog = (log: string): string | undefined => /agent_id=(\d+)/.exec(log)?.[1];

async function readBody(url: string): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (error) {
    // A dead API is an assertion failure with a name on it, not a bare "fetch failed".
    throw new Failed(`GET ${url} — the API did not answer (${error instanceof Error ? error.message : String(error)})`);
  }
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) as unknown };
  } catch {
    return { status: res.status, body: text };
  }
}

/**
 * Every key name in a body, however deep.
 *
 * The public checks ask whether a key is *there*, never what it holds: a spec that leaked as
 * an empty string is still a spec that leaked.
 */
function keyNames(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) keyNames(item, into);
  } else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      into.add(key);
      keyNames(inner, into);
    }
  }
  return into;
}

/**
 * The path of the first coordinate key a stranger must not see, or `undefined`.
 *
 * `lat` and `lon` are allowed in exactly one place: directly inside `coordinate_rounded`, which
 * is the three-decimal form the privacy rule prescribes and `round100m` in
 * `apps/api/app/public/_shared.ts` produces. Anywhere else the pair is an exact coordinate that
 * escaped the private task record, and `exact_*` is never allowed anywhere. Checking the shape
 * rather than a flat set of names is what keeps "rounded, in its own container" a pass and
 * "rounded, but spilled next to the proof hash" a failure.
 */
function firstPrivateCoordinateKey(value: unknown, path = '', insideRounded = false): string | undefined {
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      const found = firstPrivateCoordinateKey(item, `${path}[${i}]`, false);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;

  for (const [key, inner] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key;
    if (key.startsWith('exact_')) return here;
    if ((key === 'lat' || key === 'lon') && !insideRounded) return here;
    const found = firstPrivateCoordinateKey(inner, here, key === 'coordinate_rounded');
    if (found) return found;
  }
  return undefined;
}

// ------------------------------------------------------------------------ main

async function main(): Promise<void> {
  const deployment = readJson<Deployment>(new URL('contracts/deployments/anvil.json', ROOT));
  const before = readJson<Before>(new URL('before.json', OUT));
  const demoLog = readFileSync(new URL('demo.log', OUT), 'utf8');
  const taskId = taskIdFromDemoLog(demoLog);

  const apiBaseUrl = (process.env['API_BASE_URL'] ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
  const rpcUrl = process.env['BASE_SEPOLIA_RPC_URL'] ?? 'http://127.0.0.1:8545';
  const client = createPublicClient({ chain: anvil, transport: http(rpcUrl) });

  const { addresses, usdc } = deployment;
  const cliWorker = before.addresses.cliWorker;
  const read = <T>(address: Address, abi: Abi, functionName: string, args: unknown[] = []): Promise<T> =>
    client.readContract({ address, abi, functionName, args }) as Promise<T>;

  eq(deployment.chainId, 31337, 'the deployment record is the anvil one');

  // ------------------------------------------------------------------- the task

  interface Task {
    amount: bigint;
    fee: bigint;
    worker: Address;
    state: number;
    buyerAgentId: bigint;
  }
  const task = await read<Task>(addresses.taskEscrow, escrowAbi, 'getTask', [BigInt(taskId)]);

  eq(task.state, RELEASED, `getTask(${taskId}).state is Released (4)`);
  eq(task.amount, WORKER_UNITS, `getTask(${taskId}).amount is the 3.00 the worker receives`);
  eq(task.fee, FEE_UNITS, `getTask(${taskId}).fee is the 0.45 charged on top`);
  sameAddress(task.worker, cliWorker, `getTask(${taskId}).worker is the seeded CLI worker`);

  const taskCount = await read<bigint>(addresses.taskEscrow, escrowAbi, 'taskCount');
  eq(taskCount, BigInt(before.taskCount) + 1n, 'taskCount() is one above the snapshot');

  // ---------------------------------------------------------------- the balances

  const balance = (holder: Address): Promise<bigint> =>
    read<bigint>(usdc, erc20Abi as unknown as Abi, 'balanceOf', [holder]);
  const delta = async (holder: Address, was: string): Promise<bigint> => (await balance(holder)) - BigInt(was);

  eq(
    await delta(cliWorker, before.usdc.cliWorker),
    WORKER_UNITS,
    'the CLI worker is 3.00 up on the snapshot',
  );
  eq(
    await delta(deployment.treasury, before.usdc.treasury),
    FEE_UNITS,
    'the treasury is 0.45 up on the snapshot',
  );
  eq(
    await delta(addresses.taskEscrow, before.usdc.escrow),
    0n,
    'the escrow holds no more than it did: it locked 3.45 and paid all of it out',
  );
  eq(
    await delta(deployment.relayer, before.usdc.relayer),
    -PRICE_UNITS,
    'the relayer is 3.45 down: it funds the escrow post out of its float, and the fake facilitator settles no tokens back to it',
  );

  // -------------------------------------------------------------- the reputation

  const nullifier = await read<bigint>(addresses.workerRegistry, registryAbi, 'nullifierOf', [cliWorker]);
  eq(nullifier, BigInt(before.nullifier), 'nullifierOf(the CLI worker) is the one in the snapshot');

  const completed = await read<bigint>(addresses.reputation, reputationAbi, 'completed', [nullifier]);
  eq(completed, BigInt(before.completed) + 1n, 'Reputation.completed(the worker) is one above the snapshot');

  const distinctRaters = await read<bigint>(addresses.reputation, reputationAbi, 'distinctRaters', [nullifier]);
  check(distinctRaters >= 1n, `Reputation.distinctRaters(the worker) is at least 1 — got ${distinctRaters}`);

  // ---------------------------------------------------------------- the API view

  const { status, body } = await readBody(`${apiBaseUrl}/tasks/${taskId}`);
  eq(status, 200, `GET /tasks/${taskId} answers 200`);
  const view = body as { status?: string; amount_usdc?: number; fee_usdc?: number; tx?: Record<string, string> };
  eq(view.status, 'released', `GET /tasks/${taskId} reports the task released`);
  eq(view.amount_usdc, 3, `GET /tasks/${taskId} reports amount_usdc 3.00`);
  eq(view.fee_usdc, 0.45, `GET /tasks/${taskId} reports fee_usdc 0.45`);

  const releaseTx = view.tx?.['release'];
  check(Boolean(releaseTx), `GET /tasks/${taskId} carries tx.release beside the released status`);

  const receipt = await client.getTransactionReceipt({ hash: releaseTx as Hex });
  eq(receipt.status, 'success', `the release transaction ${releaseTx} succeeded`);

  let released: { taskId: bigint; worker: Address; amount: bigint; fee: bigint } | undefined;
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(addresses.taskEscrow)) continue;
    try {
      const decoded = decodeEventLog({ abi: escrowAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === 'TaskReleased') {
        released = decoded.args as unknown as typeof released;
      }
    } catch {
      continue;
    }
  }
  check(Boolean(released), `the release receipt carries a TaskReleased log`);
  const event = released as NonNullable<typeof released>;
  eq(event.taskId, BigInt(taskId), 'TaskReleased is for this task');
  sameAddress(event.worker, cliWorker, 'TaskReleased names the seeded CLI worker');
  eq(event.amount, WORKER_UNITS, 'TaskReleased carries the 3.00 amount');
  eq(event.fee, FEE_UNITS, 'TaskReleased carries the 0.45 fee');

  // ------------------------------------------------------------- the public view

  const feed = await readBody(`${apiBaseUrl}/public/feed`);
  eq(feed.status, 200, 'GET /public/feed answers 200');
  const rows = (feed.body as { tasks?: { task_id?: string; seeded?: boolean }[] }).tasks ?? [];
  const row = rows.find((t) => t.task_id === taskId);
  check(Boolean(row), `GET /public/feed lists task ${taskId}`);
  eq(row?.seeded, true, `the feed row for ${taskId} renders as seeded — the CLI worker is seeded demo staff`);

  const leaked = firstPrivateCoordinateKey(feed.body);
  check(
    leaked === undefined,
    'GET /public/feed carries no coordinate outside a rounded one',
    `found ${leaked ?? 'none'}`,
  );

  const publicTask = await readBody(`${apiBaseUrl}/public/task/${taskId}`);
  eq(publicTask.status, 200, `GET /public/task/${taskId} answers 200`);
  const publicKeys = keyNames(publicTask.body);
  const publicLeak = firstPrivateCoordinateKey(publicTask.body);
  check(
    publicLeak === undefined,
    `GET /public/task/${taskId} carries no coordinate outside a rounded one`,
    `found ${publicLeak ?? 'none'}`,
  );
  check(!publicKeys.has('buyer_token'), `GET /public/task/${taskId} carries no buyer_token`);
  for (const secret of ['spec', 'spec_text', 'question', 'note', 'payer'] as const) {
    check(!publicKeys.has(secret), `GET /public/task/${taskId} carries no ${secret} — raw spec text is never public`);
  }

  // ------------------------------------------- the ERC-8004 write, when there was one

  const agentId = agentIdFromDemoLog(demoLog);
  if (agentId === undefined) {
    console.log('skip demo:run printed no agent_id= — no ERC-8004 feedback was expected on this run');
  } else {
    const registry = addresses.erc8004Reputation;
    const count = await read<bigint>(registry, mockReputationAbi as unknown as Abi, 'callCount');
    check(count >= 1n, `MockReputationRegistry recorded a feedback call — got ${count}`);
    const recorded = (await client.readContract({
      address: registry,
      abi: mockReputationAbi,
      functionName: 'calls',
      args: [count - 1n],
    })) as unknown as readonly [bigint, bigint, number, string, string, string, string, Hex, Address];
    eq(recorded[0], BigInt(agentId), `the recorded feedback is for agent ${agentId}`);
    eq(recorded[3], 'paid-on-proof', 'the recorded feedback is tagged paid-on-proof');
  }

  console.log(`E2E PASS — ${passed} assertions`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`E2E FAIL ${message}`);
  process.exit(1);
});
