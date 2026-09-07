/**
 * Registers the Task API's own ERC-8004 identity on Base Sepolia, then proves the agent-side
 * feedback pipe end to end with one released task whose `buyerAgentId` is a real ERC-8004 id.
 *
 *   pnpm tsx scripts/register-identity.ts [--dry-run] [--only-register]
 *
 * Lead-run, against the operator's `.env`. This is not a test — it writes to a live chain, so it
 * refuses to start on any chain but Base Sepolia (84532). Keys come from `process.env` and are
 * never printed: only the addresses derived from them are.
 *
 *   A  register    AbuseMark.registerIdentity(agentURI)         -> selfAgentId, held by AbuseMark
 *   B  buyer id    IdentityRegistry.register(agentURI)          -> BUYER_AGENT_ID, held by the buyer
 *   C  lifecycle   post -> claimFor -> submitFor -> approve     -> TaskReleased + Outcome
 *   D  read back   ReputationRegistry.getSummary                -> count >= 1, summaryValue >= 1
 *   E  the printed block goes into docs/spikes/RESULTS.md#Identity
 *
 * Every step reads before it writes, so a re-run after a partial failure resumes where it stopped.
 * `--dry-run` sends nothing and simulates every write it can. `--only-register` skips step C.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  http,
  keccak256,
  parseEventLogs,
  stringToHex,
  toFunctionSelector,
  type Abi,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

// `@legwork/shared` is not a dependency of the repository root and root `package.json` is frozen
// (AGENTS.md), so the constants are read from the package source the same way
// `scripts/osm-extract.ts` reads `packages/screening` — it is the same module either way.
import {
  CHAIN_ID,
  ERC8004_IDENTITY,
  ERC8004_REPUTATION,
  parseDeployment,
} from '../packages/shared/src/addresses.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const abiOf = (path: string): Abi =>
  JSON.parse(readFileSync(`${HERE}../${path}`, 'utf8')) as Abi;

const abuseMarkAbi = abiOf('packages/shared/src/abi/AbuseMark.json');
const escrowAbi = abiOf('packages/shared/src/abi/TaskEscrow.json');
const identityAbi = abiOf('packages/shared/src/abi/erc8004/IdentityRegistry.json');
const reputationAbi = abiOf('packages/shared/src/abi/erc8004/ReputationRegistry.json');
const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'o', type: 'address' },
      { name: 's', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const satisfies Abi;

/** 3.00 posted, 0.45 fee (15 % on top), 3.45 locked. 6-decimal USDC integers. */
const AMOUNT = 3_000_000n;
const FEE = 450_000n;
const LOCKED = 3_450_000n;

const OUTCOME_PAID = 1;
const STATE_OPEN = 1;
const STATE_CLAIMED = 2;
const STATE_SUBMITTED = 3;
const STATE_RELEASED = 4;
const TAG_PAID = 'paid-on-proof';

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_REGISTER = process.argv.includes('--only-register');

const failures: string[] = [];
const plan: string[] = [];

const log = (s = '') => console.log(s);
const step = (id: string, s: string) => console.log(`[${id}] ${s}`);
const planned = (s: string) => {
  plan.push(s);
  console.log(`[plan] ${s}`);
};
const fail = (s: string) => {
  failures.push(s);
  console.error(`[FAIL] ${s}`);
};

function assertEq(label: string, actual: unknown, expected: unknown): boolean {
  const a = String(actual).toLowerCase();
  const e = String(expected).toLowerCase();
  if (a === e) {
    step('ok', `${label} == ${String(expected)}`);
    return true;
  }
  fail(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  return false;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name} — see .env.example`);
  return v;
}

/** Accounts are built from `process.env` and only ever surface as addresses. */
function accountFrom(name: string): Account {
  const raw = env(name);
  return privateKeyToAccount((raw.startsWith('0x') ? raw : `0x${raw}`) as Hex);
}

const tx = (hash: string) => `https://sepolia.basescan.org/tx/${hash}`;

/** Reads lag their own receipt on Base Sepolia (RESULTS S3 and S5); never assert without a poll. */
async function poll<T>(label: string, read: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  let last = await read();
  for (let i = 0; i < 15 && !ok(last); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    last = await read();
  }
  if (!ok(last)) step('warn', `${label} did not settle after 30 s of polling`);
  return last;
}

/** Pulls the custom-error name out of a revert so a stop says why in one line. */
function revertReason(err: unknown, abis: Abi[]): string {
  const raw = err instanceof Error ? err.message : String(err);
  // viem prints the raw revert data alongside the address it came from, so every hex run is
  // tried rather than only the first — an address decodes against nothing and is skipped.
  for (const candidate of raw.match(/0x[0-9a-fA-F]{8,}/g) ?? []) {
    for (const abi of abis) {
      try {
        const d = decodeErrorResult({ abi, data: candidate as Hex });
        return `${d.errorName}(${(d.args ?? []).map(String).join(', ')})`;
      } catch {
        /* not this ABI, or not revert data at all */
      }
    }
    // viem prints only the four-byte selector when the error is not in the ABI it was given,
    // which is exactly the case worth naming: the revert came from a contract further down.
    const named = errorNameOf(candidate.slice(0, 10) as Hex, abis);
    if (named) return `${named} (selector ${candidate.slice(0, 10)})`;
  }
  const reason = /reverted with the following reason:\s*\n(.+)/.exec(raw)?.[1];
  return reason ? `Error("${reason.trim()}")` : raw.split('\n')[0]!;
}

/** Names a four-byte error selector against the ABIs this script already loads. */
function errorNameOf(selector: Hex, abis: Abi[]): string | null {
  for (const abi of abis) {
    for (const item of abi) {
      if (item.type !== 'error') continue;
      const signature = `${item.name}(${item.inputs.map((i) => i.type).join(',')})`;
      if (toFunctionSelector(signature) === selector) return signature;
    }
  }
  return null;
}

async function main(): Promise<void> {
  const rpc = env('BASE_SEPOLIA_RPC_URL');
  const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) }) as PublicClient;

  const chainId = await pub.getChainId();
  step('env', `chain id ${chainId}`);
  if (chainId !== CHAIN_ID) {
    fail(`refusing to run: chain id ${chainId}, expected ${CHAIN_ID} (Base Sepolia)`);
    process.exit(1);
  }

  const deployment = parseDeployment(
    JSON.parse(readFileSync(`${HERE}../contracts/deployments/base-sepolia.json`, 'utf8')),
  );
  const abuseMark = deployment.addresses.abuseMark;
  const escrow = deployment.addresses.taskEscrow;
  const identity = (deployment.addresses.erc8004Identity ?? ERC8004_IDENTITY) as Address;
  const reputation = (deployment.addresses.erc8004Reputation ?? ERC8004_REPUTATION) as Address;
  const usdc = env('USDC_ADDRESS') as Address;

  const deployer = accountFrom('DEPLOYER_PRIVATE_KEY');
  const relayer = accountFrom('RELAYER_PRIVATE_KEY');
  const buyerAccount = accountFrom('BUYER_PRIVATE_KEY');
  const cliWorker = accountFrom('CLI_WORKER_PRIVATE_KEY').address;
  const buyer = buyerAccount.address;

  const wallet = createWalletClient({ chain: baseSepolia, transport: http(rpc) });

  step('env', `mode ${DRY_RUN ? 'dry-run (sends nothing)' : 'live'}${ONLY_REGISTER ? ' --only-register' : ''}`);
  step('env', `AbuseMark ${abuseMark}  TaskEscrow ${escrow}`);
  step('env', `IdentityRegistry ${identity}  ReputationRegistry ${reputation}`);
  step('env', `deployer/owner ${deployer.address}  relayer ${relayer.address}`);
  step('env', `buyer ${buyer}  cliWorker ${cliWorker}`);

  const read = async <T>(address: Address, abi: Abi, functionName: string, args: unknown[] = []) =>
    (await pub.readContract({ address, abi, functionName, args })) as T;

  interface TaskView {
    amount: bigint;
    fee: bigint;
    buyerAgentId: bigint;
    worker: Address;
    state: number;
  }
  const getTask = (id: bigint) => read<TaskView>(escrow, escrowAbi, 'getTask', [id]);

  /**
   * A write is only safe once the read node has caught up with the write before it: a receipt
   * is confirmed several seconds before `getTask` stops answering with an empty slot, and a
   * `claimFor` simulated against that empty slot reverts. Every hop waits for its precondition.
   */
  const waitForState = async (id: bigint, want: number): Promise<void> => {
    const t = await poll(`getTask(${id}).state == ${want}`, () => getTask(id), (v) => v.state === want);
    if (t.state !== want) throw new Error(`task ${id} is in state ${t.state}, expected ${want}`);
  };

  /** eth_call first so a revert is reported before a key ever signs; returns the receipt. */
  async function send(
    account: Account,
    address: Address,
    abi: Abi,
    functionName: string,
    args: unknown[],
    label: string,
  ): Promise<TransactionReceipt> {
    // Simulated first, always: a call that would revert stops the run before a key ever signs,
    // so a broken precondition costs nothing and the stop names the error.
    try {
      await pub.simulateContract({ account, address, abi, functionName, args });
    } catch (e) {
      throw new Error(
        `${label} would revert, nothing sent: ${revertReason(e, [abi, abuseMarkAbi, identityAbi, escrowAbi, reputationAbi])}`,
      );
    }
    const hash = await wallet.writeContract({
      account,
      address,
      abi,
      functionName,
      args,
      chain: baseSepolia,
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    step('tx', `${label} ${tx(hash)} (${receipt.status})`);
    if (receipt.status !== 'success') throw new Error(`${label} reverted`);
    return receipt;
  }

  /** A write that is simulated in `--dry-run` and sent otherwise. */
  async function maybeSend(
    account: Account,
    address: Address,
    abi: Abi,
    functionName: string,
    args: unknown[],
    label: string,
  ): Promise<TransactionReceipt | null> {
    planned(label);
    if (DRY_RUN) {
      try {
        await pub.simulateContract({ account, address, abi, functionName, args });
        step('sim', `${label} — eth_call succeeds, nothing sent`);
      } catch (e) {
        fail(`${label} — eth_call reverts: ${revertReason(e, [abi, abuseMarkAbi, identityAbi, escrowAbi, reputationAbi])}`);
      }
      return null;
    }
    return send(account, address, abi, functionName, args, label);
  }

  // ── Step A — the Task API's own identity ────────────────────────────────────────────────────
  log();
  let selfAgentId = await read<bigint>(abuseMark, abuseMarkAbi, 'selfAgentId');
  if (selfAgentId !== 0n) {
    step('A', `selfAgentId ${selfAgentId} — already registered, skipping`);
    const owner = await read<Address>(identity, identityAbi, 'ownerOf', [selfAgentId]);
    assertEq('A ownerOf(selfAgentId)', owner, abuseMark);
  } else {
    const uri = await chooseAgentURI();
    step('A', `agentURI source: ${uri.source}`);
    step('A', `agentURI: ${uri.value}`);
    const receipt = await maybeSend(
      deployer,
      abuseMark,
      abuseMarkAbi,
      'registerIdentity',
      [uri.value],
      'AbuseMark.registerIdentity(agentURI) from the owner',
    );
    if (receipt) {
      // The id is read back from state, never from the simulation's return value.
      selfAgentId = await poll(
        'selfAgentId',
        () => read<bigint>(abuseMark, abuseMarkAbi, 'selfAgentId'),
        (v) => v !== 0n,
      );
      step('A', `selfAgentId ${selfAgentId}`);
      const owner = await read<Address>(identity, identityAbi, 'ownerOf', [selfAgentId]);
      assertEq('A ownerOf(selfAgentId)', owner, abuseMark);
    }
  }

  // ── Step B — a buyer-owned agent id ─────────────────────────────────────────────────────────
  // Never `selfAgentId`: the reference registry rejects feedback from an agent's own owner, and
  // the subject of a `paid-on-proof` mark is the agent that paid, not the Task API.
  log();
  let agentId = 0n;
  let agentIdSource = '';
  const fromEnv = process.env['BUYER_AGENT_ID'];
  if (fromEnv && /^[0-9]+$/.test(fromEnv.trim()) && fromEnv.trim() !== '0') {
    const candidate = BigInt(fromEnv.trim());
    if (await ownedByBuyer(candidate)) {
      agentId = candidate;
      agentIdSource = 'env BUYER_AGENT_ID, verified by ownerOf/getAgentWallet';
    } else {
      step('B', `BUYER_AGENT_ID=${candidate} is not owned by ${buyer} — minting a fresh id`);
    }
  }
  if (agentId === 0n) {
    const uri = dataUri('Legwork demo agent', 'The demo agent that hires a verified human through Legwork.');
    step('B', `agentURI: ${uri}`);
    const receipt = await maybeSend(
      buyerAccount,
      identity,
      identityAbi,
      'register',
      [uri],
      'IdentityRegistry.register(agentURI) from the buyer',
    );
    if (receipt) {
      const minted = parseEventLogs({ abi: identityAbi, eventName: 'Registered', logs: receipt.logs });
      const args = minted[0]?.args as { agentId?: bigint; owner?: Address } | undefined;
      if (args?.agentId === undefined) {
        fail('B: no Registered event in the register receipt');
      } else {
        agentId = args.agentId;
        agentIdSource = 'minted by this run on the IdentityRegistry';
        step('B', `BUYER_AGENT_ID=${agentId}`);
        log(`ENV REQUEST: BUYER_AGENT_ID=${agentId}`);
        if (!(await ownedByBuyer(agentId, true))) fail('B: the minted id is not owned by the buyer');
      }
    }
  }
  if (agentId !== 0n) {
    step('B', `agentId ${agentId} — source: ${agentIdSource}`);
    if (agentId === selfAgentId) fail('B: the feedback subject must not be selfAgentId');
  }

  // ── Step C — one released task carrying that id ─────────────────────────────────────────────
  log();
  let taskId = 0n;
  if (ONLY_REGISTER) {
    step('C', 'skipped — --only-register');
  } else {
    const allowlisted = await read<boolean>(escrow, escrowAbi, 'allowlistedBuyer', [buyer]);
    const active = await read<bigint>(escrow, escrowAbi, 'activeClaimOf', [cliWorker]);
    const float = await read<bigint>(usdc, erc20Abi as unknown as Abi, 'balanceOf', [relayer.address]);
    const allowance = await read<bigint>(usdc, erc20Abi as unknown as Abi, 'allowance', [
      relayer.address,
      escrow,
    ]);
    step('C', `allowlistedBuyer(${buyer}) = ${allowlisted}`);
    step('C', `activeClaimOf(cliWorker) = ${active}`);
    step('C', `relayer USDC balance ${float}  allowance ${allowance}  (need ${LOCKED})`);
    if (!allowlisted) fail(`C: buyer ${buyer} is not allowlisted on the escrow`);
    if (active !== 0n) fail(`C: cliWorker already holds task ${active} — finish it, then re-run`);
    if (float < LOCKED) fail(`C: relayer float ${float} is under ${LOCKED}`);
    if (allowance < LOCKED) fail(`C: relayer allowance ${allowance} is under ${LOCKED}`);

    // A live run stops on an earlier failure; a dry run keeps going so the operator sees the
    // whole plan, with a placeholder where step B's id would be.
    if (failures.length === 0 || DRY_RUN) {
      const unix = Math.floor(Date.now() / 1000);
      const specHash = keccak256(stringToHex(`identity-check-${unix}`));
      const proofHash = keccak256(stringToHex(`identity-proof-${unix}`));
      const params = {
        taskType: 1,
        specHash,
        amount: AMOUNT,
        buyer,
        buyerAgentId: agentId, // step B's id; 0 only in a dry run that minted nothing
        area: 'ez1dp',
        claimTTL: 1800,
        submitTTL: 3600,
        disputeWindow: 120,
      };
      // Resume before posting: a run that stopped between `post` and `approve` left a task of
      // ours part-finished, and posting a second one would strand it with 3.45 locked in it.
      const resumable = await findResumable(agentId);
      const postReceipt = resumable
        ? null
        : await maybeSend(
            relayer,
            escrow,
            escrowAbi,
            'post',
            [params],
            `TaskEscrow.post(amount ${AMOUNT}, buyerAgentId ${agentId === 0n ? '<step B id>' : agentId}, area ez1dp) from the relayer`,
          );
      planned(`TaskEscrow.claimFor(taskId, ${cliWorker}) from the relayer`);
      planned(`TaskEscrow.submitFor(taskId, ${cliWorker}, proofHash) from the relayer`);
      planned('TaskEscrow.approve(taskId) from the relayer');

      if (DRY_RUN) {
        if (resumable) step('C', `would resume task ${resumable.id} from state ${resumable.state} — nothing sent`);
      } else if (postReceipt || resumable) {
        if (postReceipt) {
          // The id comes off the receipt's event, not off the simulation's return value: two
          // simulations against the same block both predict the same next id.
          const posted = parseEventLogs({ abi: escrowAbi, eventName: 'TaskPosted', logs: postReceipt.logs });
          const args = posted[0]?.args as { taskId?: bigint } | undefined;
          if (args?.taskId === undefined) throw new Error('no TaskPosted event in the post receipt');
          taskId = args.taskId;
          step('C', `taskId ${taskId}`);
        } else {
          taskId = resumable!.id;
          step('C', `taskId ${taskId} — resuming, already in state ${resumable!.state}`);
        }

        let state = postReceipt ? STATE_OPEN : resumable!.state;
        if (state === STATE_OPEN) {
          await waitForState(taskId, STATE_OPEN);
          await send(relayer, escrow, escrowAbi, 'claimFor', [taskId, cliWorker], `claimFor(${taskId})`);
          state = STATE_CLAIMED;
        }
        if (state === STATE_CLAIMED) {
          await waitForState(taskId, STATE_CLAIMED);
          await send(
            relayer,
            escrow,
            escrowAbi,
            'submitFor',
            [taskId, cliWorker, proofHash],
            `submitFor(${taskId})`,
          );
          state = STATE_SUBMITTED;
        }
        await waitForState(taskId, STATE_SUBMITTED);
        const approveReceipt = await send(
          relayer,
          escrow,
          escrowAbi,
          'approve',
          [taskId],
          `approve(${taskId})`,
        );

        const released = parseEventLogs({
          abi: escrowAbi,
          eventName: 'TaskReleased',
          logs: approveReceipt.logs,
        })[0]?.args as { taskId?: bigint; worker?: Address; amount?: bigint; fee?: bigint } | undefined;
        assertEq('C TaskReleased.taskId', released?.taskId, taskId);
        assertEq('C TaskReleased.worker', released?.worker, cliWorker);
        assertEq('C TaskReleased.amount', released?.amount, AMOUNT);
        assertEq('C TaskReleased.fee', released?.fee, FEE);

        const outcome = parseEventLogs({
          abi: abuseMarkAbi,
          eventName: 'Outcome',
          logs: approveReceipt.logs.filter((l) => l.address.toLowerCase() === abuseMark.toLowerCase()),
        })[0]?.args as { agentId?: bigint; taskId?: bigint; outcome?: number } | undefined;
        assertEq('C Outcome.agentId', outcome?.agentId, agentId);
        assertEq('C Outcome.taskId', outcome?.taskId, taskId);
        assertEq('C Outcome.outcome', outcome?.outcome, OUTCOME_PAID);

        const task = await poll(
          `getTask(${taskId}).state == ${STATE_RELEASED}`,
          () => getTask(taskId),
          (v) => v.state === STATE_RELEASED,
        );
        assertEq('C getTask.state', task.state, STATE_RELEASED);
        assertEq('C getTask.buyerAgentId', task.buyerAgentId, agentId);
        assertEq('C getTask.amount', task.amount, AMOUNT);
        assertEq('C getTask.fee', task.fee, FEE);
        assertEq('C getTask.worker', task.worker, cliWorker);
        step('C', `taskCount() is now ${await read<bigint>(escrow, escrowAbi, 'taskCount')}`);
      }
    }
  }

  // ── Step D — read the feedback back off the ReputationRegistry ───────────────────────────────
  log();
  if (agentId === 0n) {
    step('D', 'skipped — no buyer agent id');
  } else {
    const summary = await poll(
      'getSummary',
      () =>
        read<readonly [bigint, bigint, number]>(reputation, reputationAbi, 'getSummary', [
          agentId,
          [abuseMark],
          TAG_PAID,
          '',
        ]),
      (v) => v[0] >= 1n,
    );
    step('D', `getSummary(${agentId}, [${abuseMark}], "${TAG_PAID}", "") -> count=${summary[0]} summaryValue=${summary[1]} summaryValueDecimals=${summary[2]}`);
    if (taskId !== 0n) {
      if (summary[0] < 1n) fail(`D: count is ${summary[0]}, expected at least 1`);
      if (summary[1] < 1n) fail(`D: summaryValue is ${summary[1]}, expected at least 1`);
    }
    // §2 asks for the unfiltered summary too. The deployed registry refuses an empty
    // `clientAddresses` array (RESULTS S5), so the call is made and its revert is printed
    // rather than hidden — it is a property of the registry, not a failure of this run.
    try {
      const all = await read<readonly [bigint, bigint, number]>(
        reputation,
        reputationAbi,
        'getSummary',
        [agentId, [], '', ''],
      );
      step('D', `getSummary(${agentId}, [], "", "") -> count=${all[0]} summaryValue=${all[1]} summaryValueDecimals=${all[2]}`);
    } catch (e) {
      step('D', `getSummary(${agentId}, [], "", "") -> reverts: ${revertReason(e, [reputationAbi])}`);
    }
    const clients = await read<readonly Address[]>(reputation, reputationAbi, 'getClients', [agentId]);
    step('D', `getClients(${agentId}) -> ${clients.join(', ') || '(none)'}`);
  }

  // ── Step E — the block that goes into RESULTS ────────────────────────────────────────────────
  log();
  step('E', 'for docs/spikes/RESULTS.md#Identity:');
  log(`  selfAgentId           ${selfAgentId}`);
  log(`  ownerOf(selfAgentId)  ${selfAgentId === 0n ? '(not registered)' : await read<Address>(identity, identityAbi, 'ownerOf', [selfAgentId])}`);
  log(`  BUYER_AGENT_ID        ${agentId} (${agentIdSource || 'not set'})`);
  log(`  taskId                ${taskId === 0n ? '(no lifecycle this run)' : taskId}`);
  log(`  planned calls         ${plan.length}`);
  for (const p of plan) log(`    - ${p}`);

  log();
  if (failures.length > 0) {
    console.error(`FAILED — ${failures.length} check(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  log(DRY_RUN ? 'dry run complete — nothing was sent.' : 'done.');

  /**
   * The most recent task carrying this agent id that has not reached a terminal state. Only the
   * last handful are looked at: this script posts one task per run and nothing else posts with
   * an agent id yet.
   */
  async function findResumable(id: bigint): Promise<{ id: bigint; state: number } | null> {
    const count = await read<bigint>(escrow, escrowAbi, 'taskCount');
    for (let k = count; k > 0n && k > count - 20n; k--) {
      const t = await getTask(k);
      if (t.buyerAgentId !== id) continue;
      if (t.state === STATE_OPEN || t.state === STATE_CLAIMED || t.state === STATE_SUBMITTED) {
        if (t.state !== STATE_OPEN && t.worker.toLowerCase() !== cliWorker.toLowerCase()) continue;
        step('C', `task ${k} is ours and unfinished (state ${t.state}) — resuming it`);
        return { id: k, state: t.state };
      }
    }
    return null;
  }

  /** `${DASHBOARD_URL}/agent.json` when it answers with a named registration, else a data URI. */
  async function chooseAgentURI(): Promise<{ source: 'dashboard' | 'data-uri'; value: string }> {
    const base = process.env['DASHBOARD_URL'];
    if (base) {
      const url = `${base.replace(/\/$/, '')}/agent.json`;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const body = (await res.json()) as { name?: unknown };
          if (typeof body.name === 'string' && body.name.length > 0) {
            return { source: 'dashboard', value: url };
          }
        }
        step('A', `${url} answered ${res.status} without a name — falling back to a data URI`);
      } catch (e) {
        step('A', `${url} is unreachable (${e instanceof Error ? e.message.split('\n')[0] : String(e)}) — falling back to a data URI`);
      }
    }
    return {
      source: 'data-uri',
      value: dataUri(
        'Legwork Task API',
        'Hire a verified human for a small real-world check; pays USDC on proof.',
      ),
    };
  }

  function dataUri(name: string, description: string): string {
    const doc = {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name,
      description,
      services: [{ name: 'web', endpoint: process.env['DASHBOARD_URL'] ?? '' }],
    };
    return `data:application/json;base64,${Buffer.from(JSON.stringify(doc)).toString('base64')}`;
  }

  /**
   * `ownerOf` reverts on a token that was never minted, so the miss is caught, not thrown.
   * A token minted seconds ago reverts too, on a read node that has not caught up with the
   * receipt it just returned — so a fresh id is polled and only an old one fails on the spot.
   */
  async function ownedByBuyer(id: bigint, fresh = false): Promise<boolean> {
    for (const fn of ['ownerOf', 'getAgentWallet'] as const) {
      const who = await poll(
        `${fn}(${id})`,
        async (): Promise<Address | null> => {
          try {
            return await read<Address>(identity, identityAbi, fn, [id]);
          } catch {
            return null;
          }
        },
        (v) => v !== null || !fresh,
      );
      if (who === null) {
        step('B', `${fn}(${id}) reverts — no such agent id`);
        return false;
      }
      step('B', `${fn}(${id}) = ${who}`);
      if (who.toLowerCase() === buyer.toLowerCase()) return true;
    }
    return false;
  }
}

main().catch((e: unknown) => {
  console.error(`FAILED — ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
