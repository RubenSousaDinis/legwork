import type { TASK_STATE, TaskStateName } from '@legwork/shared';
import type { Address, Hash, Hex, WalletClient } from 'viem';
import type { DecodedEvent } from './events.js';

/** The eight states of `ITaskEscrow.TaskState`, as their on-chain ordinals. */
export type TaskState = (typeof TASK_STATE)[TaskStateName];

/** `ITaskEscrow.PostParams`, field for field. Amounts are 6-decimal USDC integers. */
export interface PostParams {
  taskType: number;
  specHash: Hex;
  amount: bigint;
  buyer: Address;
  buyerAgentId: bigint;
  area: string;
  claimTTL: number;
  submitTTL: number;
  disputeWindow: number;
}

/** `ITaskEscrow.Task`, field for field. Timestamps are seconds. */
export interface Task {
  taskType: number;
  specHash: Hex;
  amount: bigint;
  fee: bigint;
  buyer: Address;
  buyerAgentId: bigint;
  area: string;
  worker: Address;
  state: TaskState;
  postedAt: bigint;
  claimedAt: bigint;
  submittedAt: bigint;
  claimTTL: number;
  submitTTL: number;
  disputeWindow: number;
  proofHash: Hex;
}

export interface TxResult {
  hash: Hash;
  blockNumber: bigint;
  events: DecodedEvent[];
}

/**
 * A revert, carrying the contract's error name.
 *
 * The name is the whole point: routes map `InCooldown`, `AlreadyClaimed` and
 * `SeededCannotClaimExternal` straight onto 409 bodies, so `FakeChain` and a real node have
 * to disagree about nothing but where the string came from.
 */
export class ChainRevert extends Error {
  /** Shadows `Error.name` deliberately: the contract's error name *is* this error's name. */
  override readonly name: string;

  constructor(name: string) {
    super(name);
    this.name = name;
  }
}

/**
 * Who a direct-path call comes from.
 *
 * `postAsBuyer`, `claim` and `submit` exist for scripts and for the self-custodial roadmap:
 * they are sent by somebody else's wallet, never by the relayer key, and so they bypass the
 * queue entirely. `LiveChain` needs the `walletClient` to sign; `FakeChain` needs only the
 * address it is pretending to be.
 */
export interface DirectSender {
  address: Address;
  walletClient?: WalletClient;
}

/**
 * The surface every route, script and test talks to. `LiveChain` puts it on Base Sepolia or
 * anvil; `FakeChain` puts it in memory with the same rules and the same error names.
 */
export interface ChainAdapter {
  // --- escrow reads ---
  getTask(taskId: bigint): Promise<Task>;
  taskCount(): Promise<bigint>;
  openTasksOf(buyer: Address): Promise<bigint>;
  activeClaimOf(worker: Address): Promise<bigint>;
  cooldownUntil(worker: Address): Promise<bigint>;
  allowlistedBuyer(buyer: Address): Promise<boolean>;
  paused(): Promise<boolean>;

  // --- registry reads ---
  isWorker(a: Address): Promise<boolean>;
  isSeeded(a: Address): Promise<boolean>;
  nullifierOf(a: Address): Promise<bigint>;
  workerOf(nullifierHash: bigint): Promise<Address>;
  areaOf(a: Address): Promise<string>;
  taskTypesOf(a: Address): Promise<number>;

  // --- reputation reads ---
  score(nullifierHash: bigint): Promise<bigint>;
  completed(nullifierHash: bigint): Promise<bigint>;
  distinctRaters(nullifierHash: bigint): Promise<bigint>;
  slotOf(nullifierHash: bigint, raterKey: Hex): Promise<number>;

  // --- abuse-mark reads ---
  marked(agentId: bigint, specHash: Hex): Promise<boolean>;
  lastMarkAt(agentId: bigint): Promise<bigint>;
  markCooldown(): Promise<bigint>;
  selfAgentId(): Promise<bigint>;

  // --- ERC-8004 identity reads (the API decides what they mean; this package only reports) ---
  ownerOf(agentId: bigint): Promise<Address>;
  getAgentWallet(agentId: bigint): Promise<Address>;

  // --- money and time ---
  usdcBalanceOf(a: Address): Promise<bigint>;
  now(): Promise<bigint>;

  // --- relayer-role writes ---
  post(p: PostParams): Promise<TxResult & { taskId: bigint }>;
  claimFor(taskId: bigint, worker: Address): Promise<TxResult>;
  releaseClaimFor(taskId: bigint, worker: Address): Promise<TxResult>;
  submitFor(taskId: bigint, worker: Address, proofHash: Hex): Promise<TxResult>;
  approve(taskId: bigint): Promise<TxResult>;
  dispute(taskId: bigint): Promise<TxResult>;
  autoRelease(taskId: bigint): Promise<TxResult>;
  expire(taskId: bigint): Promise<TxResult>;
  registerFor(
    nullifierHash: bigint,
    worker: Address,
    area: string,
    taskTypes: number,
    deadline: bigint,
    attestation: Hex,
  ): Promise<TxResult>;

  /**
   * Signer role. `written` is `false` when `(agentId, specHash)` was already marked — the
   * contract is idempotent there, so it writes nothing and emits nothing, and the only
   * evidence either way is whether a `Marked` event came back.
   */
  mark(agentId: bigint, classId: number, specHash: Hex): Promise<TxResult & { written: boolean }>;

  // --- owner-role writes (disclosed operator powers; see the README) ---
  pause(): Promise<TxResult>;
  unpause(): Promise<TxResult>;
  resolve(taskId: bigint, toBuyer: boolean): Promise<TxResult>;
  resetWorker(nullifierHash: bigint): Promise<TxResult>;
  setAllowlistedBuyer(buyer: Address, allowed: boolean): Promise<TxResult>;
  seedWorker(
    worker: Address,
    syntheticNullifier: bigint,
    area: string,
    taskTypes: number,
  ): Promise<TxResult>;
  setMarkCooldown(seconds: bigint): Promise<TxResult>;

  // --- direct path: somebody else's wallet, never the relayer key, never the queue ---
  postAsBuyer(p: PostParams, sender: DirectSender): Promise<TxResult & { taskId: bigint }>;
  claim(taskId: bigint, sender: DirectSender): Promise<TxResult>;
  submit(taskId: bigint, proofHash: Hex, sender: DirectSender): Promise<TxResult>;
}
