import { keccak256, pad, numberToHex, stringToHex, type Address, type Hex } from 'viem';
import {
  CLAIM_COOLDOWN_S,
  MAX_OPEN_TASKS_PER_BUYER,
  MAX_TASK_AMOUNT_USDC,
  OUTCOME,
  TASK_STATE,
  TASK_TYPE_BIT,
  ZERO_ADDRESS,
  feeOn,
  toUsdcUnits,
} from '@legwork/shared';
import {
  ChainRevert,
  type ChainAdapter,
  type DirectSender,
  type PostParams,
  type Task,
  type TxResult,
} from './adapter';
import type { DecodedEvent } from './events';

/** T-01 §2: `post` requires `p.amount ≥ 1_000_000` — one USDC, the smallest errand there is. */
const MIN_TASK_AMOUNT = 1_000_000n;
const MAX_TASK_AMOUNT = toUsdcUnits(MAX_TASK_AMOUNT_USDC);
const TASK_TYPE_BITS = new Set<number>(Object.values(TASK_TYPE_BIT));
const CLAIM_COOLDOWN = BigInt(CLAIM_COOLDOWN_S);

/** Where locked money sits between `post` and settlement. The escrow's own balance. */
const ESCROW = '0x000000000000000000000000000000000000e5c0' as const;

export interface FakeChainOptions {
  relayer?: Address;
  treasury?: Address;
  /** Seconds since the epoch. `warp` moves it; nothing else does. */
  now?: bigint;
  /** T-01 §2 default; the filmed run sets 120 through `setMarkCooldown`. */
  markCooldown?: bigint;
  selfAgentId?: bigint;
  maxOpenTasksPerBuyer?: number;
}

/** Which key a write goes out on. `sender` is direct mode: the caller's own wallet. */
export type FakeChainRole = 'relayer' | 'owner' | 'signer' | 'sender';

/** One recorded write: the adapter method, the role it goes out on, and its decoded args (bigint for uint256). */
export interface FakeChainCall {
  fn: string;
  role: FakeChainRole;
  args: readonly unknown[];
}

export interface WorkerRecord {
  nullifier: bigint;
  seeded: boolean;
  area: string;
  taskTypes: number;
}

interface ReputationRecord {
  score: bigint;
  completed: bigint;
  distinctRaters: bigint;
  slots: Map<string, number>;
}

const lower = (a: Address): string => a.toLowerCase();

/**
 * The escrow state machine, in memory, with the same rules and the same revert names as the
 * contracts.
 *
 * Cloud agents have no key and no RPC, so every route test, every lifecycle test and the
 * whole of the demo harness runs against this. The order of the checks in each method is the
 * order of T-01 §2's prose, not a convenient one — a fake that reports `BadState` where the
 * contract reports `InCooldown` teaches a route the wrong 409.
 */
export class FakeChain implements ChainAdapter {
  readonly relayerAddress: Address;
  readonly treasuryAddress: Address;
  readonly escrowAddress: Address = ESCROW;

  private clock: bigint;
  private blockNumber = 0n;
  private txCounter = 0;

  private readonly tasks = new Map<string, Task>();
  private taskCounter = 0n;
  private readonly balances = new Map<string, bigint>();
  private readonly workers = new Map<string, WorkerRecord>();
  private readonly workerByNullifier = new Map<string, Address>();
  private readonly usedAttestations = new Set<string>();
  private readonly openTasks = new Map<string, bigint>();
  private readonly activeClaims = new Map<string, bigint>();
  private readonly cooldowns = new Map<string, bigint>();
  private readonly allowlist = new Set<string>();
  private readonly reputation = new Map<string, ReputationRecord>();
  private readonly marks = new Set<string>();
  private readonly lastMarks = new Map<string, bigint>();
  private readonly markCounts = new Map<string, bigint>();
  private readonly identities = new Map<string, { owner: Address; wallet: Address }>();
  private readonly maxOpenTasksPerBuyer: number;

  private isPaused = false;
  private cooldownSeconds: bigint;
  private agentId: bigint;

  private readonly log: DecodedEvent[] = [];
  private pending: DecodedEvent[] = [];
  private txHash: Hex = '0x';

  /**
   * Every write, in order, with its role and decoded args — what a route test asserts on
   * instead of an explorer. Reads are not recorded; a fake that logged `getTask` would bury
   * the one `claimFor` a test is looking for.
   */
  readonly calls: FakeChainCall[] = [];
  private armedRevert: string | undefined;

  constructor(options: FakeChainOptions = {}) {
    this.relayerAddress = options.relayer ?? '0x0000000000000000000000000000000000004e1a';
    this.treasuryAddress = options.treasury ?? '0x0000000000000000000000000000000000007e00';
    this.clock = options.now ?? 1_760_000_000n;
    this.cooldownSeconds = options.markCooldown ?? 86_400n;
    this.agentId = options.selfAgentId ?? 0n;
    this.maxOpenTasksPerBuyer = options.maxOpenTasksPerBuyer ?? MAX_OPEN_TASKS_PER_BUYER;
  }

  // ---------------------------------------------------------------- test controls

  /**
   * The next write — whichever it is — rejects with `ChainRevert(name)` before it touches
   * state, then the fake behaves again. What a route does with `InCooldown` or
   * `DuplicateNullifier` when the contract, not the pre-check, is the one that says no.
   */
  failNextWith(name: string): void {
    this.armedRevert = name;
  }

  /** Moves the clock. There is no other way time passes here. */
  async warp(seconds: number): Promise<void> {
    this.clock += BigInt(Math.trunc(seconds));
  }

  mintUsdc(to: Address, units: bigint): void {
    this.credit(to, units);
  }

  /** Stands in for an ERC-8004 registration, which this package never performs. */
  setAgentIdentity(agentId: bigint, owner: Address, wallet: Address): void {
    this.identities.set(agentId.toString(), { owner, wallet });
  }

  /** Binds a worker without an attestation — the registry's state, not its front door. */
  setWorker(address: Address, record: WorkerRecord): void {
    this.workers.set(lower(address), { ...record });
    this.workerByNullifier.set(record.nullifier.toString(), address);
  }

  /** Every event this chain has emitted, in order. */
  events(): DecodedEvent[] {
    return [...this.log];
  }

  // ---------------------------------------------------------------- reads

  async getTask(taskId: bigint): Promise<Task> {
    return { ...(this.tasks.get(taskId.toString()) ?? this.emptyTask()) };
  }
  async taskCount(): Promise<bigint> {
    return this.taskCounter;
  }
  async openTasksOf(buyer: Address): Promise<bigint> {
    return this.openTasks.get(lower(buyer)) ?? 0n;
  }
  async activeClaimOf(worker: Address): Promise<bigint> {
    return this.activeClaims.get(lower(worker)) ?? 0n;
  }
  async cooldownUntil(worker: Address): Promise<bigint> {
    return this.cooldowns.get(lower(worker)) ?? 0n;
  }
  async allowlistedBuyer(buyer: Address): Promise<boolean> {
    return this.allowlist.has(lower(buyer));
  }
  async paused(): Promise<boolean> {
    return this.isPaused;
  }

  async isWorker(a: Address): Promise<boolean> {
    return this.workers.has(lower(a));
  }
  async isSeeded(a: Address): Promise<boolean> {
    return this.workers.get(lower(a))?.seeded ?? false;
  }
  async nullifierOf(a: Address): Promise<bigint> {
    return this.workers.get(lower(a))?.nullifier ?? 0n;
  }
  async workerOf(nullifierHash: bigint): Promise<Address> {
    return this.workerByNullifier.get(nullifierHash.toString()) ?? ZERO_ADDRESS;
  }
  async areaOf(a: Address): Promise<string> {
    return this.workers.get(lower(a))?.area ?? '';
  }
  async taskTypesOf(a: Address): Promise<number> {
    return this.workers.get(lower(a))?.taskTypes ?? 0;
  }

  async score(nullifierHash: bigint): Promise<bigint> {
    return this.record(nullifierHash).score;
  }
  async completed(nullifierHash: bigint): Promise<bigint> {
    return this.record(nullifierHash).completed;
  }
  async distinctRaters(nullifierHash: bigint): Promise<bigint> {
    return this.record(nullifierHash).distinctRaters;
  }
  async slotOf(nullifierHash: bigint, raterKey: Hex): Promise<number> {
    return this.record(nullifierHash).slots.get(raterKey.toLowerCase()) ?? 0;
  }

  async marked(agentId: bigint, specHash: Hex): Promise<boolean> {
    return this.marks.has(this.markKey(agentId, specHash));
  }
  async lastMarkAt(agentId: bigint): Promise<bigint> {
    return this.lastMarks.get(agentId.toString()) ?? 0n;
  }
  async markCooldown(): Promise<bigint> {
    return this.cooldownSeconds;
  }
  async selfAgentId(): Promise<bigint> {
    return this.agentId;
  }
  async ownerOf(agentId: bigint): Promise<Address> {
    return this.identities.get(agentId.toString())?.owner ?? ZERO_ADDRESS;
  }
  async getAgentWallet(agentId: bigint): Promise<Address> {
    return this.identities.get(agentId.toString())?.wallet ?? ZERO_ADDRESS;
  }
  async usdcBalanceOf(a: Address): Promise<bigint> {
    return this.balances.get(lower(a)) ?? 0n;
  }
  async now(): Promise<bigint> {
    return this.clock;
  }

  // ---------------------------------------------------------------- escrow writes

  post(p: PostParams): Promise<TxResult & { taskId: bigint }> {
    return this.write('post', 'relayer', [p], () => this.postFrom(p, this.relayerAddress));
  }

  /** `p.buyer == msg.sender`, and the money comes from that wallet rather than the float. */
  postAsBuyer(p: PostParams, sender: DirectSender): Promise<TxResult & { taskId: bigint }> {
    return this.write('postAsBuyer', 'sender', [p, sender], () => {
      if (lower(p.buyer) !== lower(sender.address)) throw new ChainRevert('NotBuyer');
      return this.postFrom(p, sender.address);
    });
  }

  claimFor(taskId: bigint, worker: Address): Promise<TxResult> {
    return this.write('claimFor', 'relayer', [taskId, worker], () => this.claimBy(taskId, worker));
  }

  claim(taskId: bigint, sender: DirectSender): Promise<TxResult> {
    return this.write('claim', 'sender', [taskId, sender], () => this.claimBy(taskId, sender.address));
  }

  releaseClaimFor(taskId: bigint, worker: Address): Promise<TxResult> {
    return this.write('releaseClaimFor', 'relayer', [taskId, worker], () => this.releaseClaimBy(taskId, worker));
  }

  submitFor(taskId: bigint, worker: Address, proofHash: Hex): Promise<TxResult> {
    return this.write('submitFor', 'relayer', [taskId, worker, proofHash], () => this.submitBy(taskId, worker, proofHash));
  }

  submit(taskId: bigint, proofHash: Hex, sender: DirectSender): Promise<TxResult> {
    return this.write('submit', 'sender', [taskId, proofHash, sender], () => this.submitBy(taskId, sender.address, proofHash));
  }

  approve(taskId: bigint): Promise<TxResult> {
    return this.write('approve', 'relayer', [taskId], () => {
      const task = this.mustExist(taskId);
      if (task.state !== TASK_STATE.Submitted) throw new ChainRevert('BadState');
      this.release(taskId, task);
    });
  }

  dispute(taskId: bigint): Promise<TxResult> {
    return this.write('dispute', 'relayer', [taskId], () => {
      const task = this.mustExist(taskId);
      if (task.state !== TASK_STATE.Submitted) throw new ChainRevert('BadState');
      if (this.clock >= task.submittedAt + BigInt(task.disputeWindow)) {
        throw new ChainRevert('DisputeWindowClosed');
      }
      task.state = TASK_STATE.Disputed;
      this.emit('TaskDisputed', { taskId });
    });
  }

  /** Never gated by pause: a stop can never trap a worker's earned funds. */
  autoRelease(taskId: bigint): Promise<TxResult> {
    return this.write('autoRelease', 'relayer', [taskId], () => {
      const task = this.mustExist(taskId);
      if (task.state !== TASK_STATE.Submitted) throw new ChainRevert('BadState');
      if (this.clock < task.submittedAt + BigInt(task.disputeWindow)) {
        throw new ChainRevert('DisputeWindowOpen');
      }
      this.release(taskId, task);
    });
  }

  /** Never gated by pause either. The buyer's deadline passed, so no cooldown for the worker. */
  expire(taskId: bigint): Promise<TxResult> {
    return this.write('expire', 'relayer', [taskId], () => {
      const task = this.mustExist(taskId);
      const expiredOpen =
        task.state === TASK_STATE.Open && this.clock > task.postedAt + BigInt(task.claimTTL);
      const expiredClaimed =
        task.state === TASK_STATE.Claimed && this.clock > task.claimedAt + BigInt(task.submitTTL);
      if (!expiredOpen && !expiredClaimed) {
        const live = task.state === TASK_STATE.Open || task.state === TASK_STATE.Claimed;
        throw new ChainRevert(live ? 'NotExpired' : 'BadState');
      }

      const total = task.amount + task.fee;
      task.state = TASK_STATE.Refunded;
      this.clearClaim(task.worker);
      this.closeTask(task.buyer);
      this.debit(ESCROW, total);
      this.credit(task.buyer, total);
      this.emit('TaskRefunded', { taskId, buyer: task.buyer, total });
    });
  }

  resolve(taskId: bigint, toBuyer: boolean): Promise<TxResult> {
    return this.write('resolve', 'owner', [taskId, toBuyer], () => {
      const task = this.mustExist(taskId);
      if (task.state !== TASK_STATE.Disputed) throw new ChainRevert('BadState');

      // Zero fee on any resolve: the treasury takes nothing from a task that went wrong.
      if (toBuyer) {
        this.debit(ESCROW, task.amount + task.fee);
        this.credit(task.buyer, task.amount + task.fee);
      } else {
        this.debit(ESCROW, task.amount + task.fee);
        this.credit(task.worker, task.amount);
        this.credit(task.buyer, task.fee);
      }

      const worker = task.worker;
      task.state = TASK_STATE.Resolved;
      this.clearClaim(worker);
      this.closeTask(task.buyer);

      const outcome = toBuyer ? OUTCOME.ResolvedToBuyer : OUTCOME.ResolvedToWorker;
      this.feedback(this.nullifierFor(worker), this.raterKey(task), outcome, taskId);
      if (task.buyerAgentId !== 0n) this.outcome(task.buyerAgentId, taskId, outcome);
      this.emit('TaskResolved', { taskId, toBuyer });
    });
  }

  pause(): Promise<TxResult> {
    return this.write('pause', 'owner', [], () => {
      this.isPaused = true;
      this.emit('Paused', { account: this.relayerAddress });
    });
  }

  unpause(): Promise<TxResult> {
    return this.write('unpause', 'owner', [], () => {
      this.isPaused = false;
      this.emit('Unpaused', { account: this.relayerAddress });
    });
  }

  setAllowlistedBuyer(buyer: Address, allowed: boolean): Promise<TxResult> {
    return this.write('setAllowlistedBuyer', 'owner', [buyer, allowed], () => {
      if (allowed) this.allowlist.add(lower(buyer));
      else this.allowlist.delete(lower(buyer));
      this.emit('BuyerAllowlisted', { buyer, allowed });
    });
  }

  // ---------------------------------------------------------------- registry writes

  registerFor(
    nullifierHash: bigint,
    worker: Address,
    area: string,
    taskTypes: number,
    deadline: bigint,
    attestation: Hex,
  ): Promise<TxResult> {
    return this.write('registerFor', 'relayer', [nullifierHash, worker, area, taskTypes, deadline, attestation], () => {
      if (this.workerByNullifier.has(nullifierHash.toString())) {
        throw new ChainRevert('DuplicateNullifier');
      }
      if (this.workers.has(lower(worker))) throw new ChainRevert('WorkerAlreadyBound');
      if (this.clock > deadline) throw new ChainRevert('AttestationExpired');
      // No verifier key here, so any non-empty attestation stands in for a valid signature —
      // what this fake can honestly reproduce is the replay guard, not the signature check.
      if (attestation === '0x' || attestation.length < 4) throw new ChainRevert('BadAttestation');
      const digest = keccak256(
        stringToHex(`${nullifierHash}:${worker}:${area}:${taskTypes}:${deadline}:${attestation}`),
      );
      if (this.usedAttestations.has(digest)) throw new ChainRevert('AttestationUsed');
      this.usedAttestations.add(digest);

      this.setWorker(worker, { nullifier: nullifierHash, seeded: false, area, taskTypes });
      this.emit('WorkerRegistered', { nullifierHash, worker, area, taskTypes });
    });
  }

  seedWorker(
    worker: Address,
    syntheticNullifier: bigint,
    area: string,
    taskTypes: number,
  ): Promise<TxResult> {
    return this.write('seedWorker', 'owner', [worker, syntheticNullifier, area, taskTypes], () => {
      this.setWorker(worker, { nullifier: syntheticNullifier, seeded: true, area, taskTypes });
      // `WorkerSeeded`, never `WorkerRegistered`: a seeded worker is demo data and every
      // surface that renders one has to be able to tell.
      this.emit('WorkerSeeded', { syntheticNullifier, worker, area, taskTypes });
    });
  }

  resetWorker(nullifierHash: bigint): Promise<TxResult> {
    return this.write('resetWorker', 'owner', [nullifierHash], () => {
      const worker = this.workerByNullifier.get(nullifierHash.toString());
      if (!worker) throw new ChainRevert('UnknownNullifier');
      this.workerByNullifier.delete(nullifierHash.toString());
      this.workers.delete(lower(worker));
      this.emit('WorkerReset', { nullifierHash, worker });
    });
  }

  // ---------------------------------------------------------------- abuse mark

  mark(agentId: bigint, classId: number, specHash: Hex): Promise<TxResult & { written: boolean }> {
    return this.write('mark', 'signer', [agentId, classId, specHash], () => {
      if (classId < 1 || classId > 6) throw new ChainRevert('BadClass');

      // Idempotency is checked before the cooldown on purpose: a repeat of a mark that was
      // already written is a no-op, not a rate-limit failure.
      if (this.marks.has(this.markKey(agentId, specHash))) return { written: false };

      const last = this.lastMarks.get(agentId.toString()) ?? 0n;
      if (last !== 0n && this.clock < last + this.cooldownSeconds) {
        throw new ChainRevert('MarkCooldown');
      }

      this.marks.add(this.markKey(agentId, specHash));
      this.lastMarks.set(agentId.toString(), this.clock);
      this.markCounts.set(agentId.toString(), (this.markCounts.get(agentId.toString()) ?? 0n) + 1n);
      this.emit('Marked', { agentId, classId, specHash });
      return { written: true };
    });
  }

  setMarkCooldown(seconds: bigint): Promise<TxResult> {
    return this.write('setMarkCooldown', 'owner', [seconds], () => {
      this.cooldownSeconds = seconds;
    });
  }

  // ---------------------------------------------------------------- internals

  /** `post` and `postAsBuyer` differ only in who pays; both are gated by pause. */
  private postFrom(p: PostParams, payer: Address): { taskId: bigint } {
    if (this.isPaused) throw new ChainRevert('EnforcedPause');
    if (p.amount > MAX_TASK_AMOUNT || p.amount < MIN_TASK_AMOUNT) {
      throw new ChainRevert('AmountOutOfRange');
    }
    if ((this.openTasks.get(lower(p.buyer)) ?? 0n) >= BigInt(this.maxOpenTasksPerBuyer)) {
      throw new ChainRevert('OverOpenCap');
    }
    if (!TASK_TYPE_BITS.has(p.taskType)) throw new ChainRevert('BadTaskType');

    // The fee is charged on top: a 3.00 task pulls 3.45 and locks 3.45.
    const fee = feeOn(p.amount);
    const total = p.amount + fee;
    if ((this.balances.get(lower(payer)) ?? 0n) < total) {
      throw new ChainRevert('ERC20InsufficientBalance');
    }
    this.debit(payer, total);
    this.credit(ESCROW, total);

    this.taskCounter += 1n;
    const taskId = this.taskCounter;
    const task: Task = {
      taskType: p.taskType,
      specHash: p.specHash,
      amount: p.amount,
      fee,
      buyer: p.buyer,
      buyerAgentId: p.buyerAgentId,
      area: p.area,
      worker: ZERO_ADDRESS,
      state: TASK_STATE.Open,
      postedAt: this.clock,
      claimedAt: 0n,
      submittedAt: 0n,
      claimTTL: p.claimTTL,
      submitTTL: p.submitTTL,
      disputeWindow: p.disputeWindow,
      proofHash: pad('0x', { size: 32 }),
    };
    this.tasks.set(taskId.toString(), task);
    this.openTasks.set(lower(p.buyer), (this.openTasks.get(lower(p.buyer)) ?? 0n) + 1n);

    this.emit('TaskPosted', {
      taskId,
      buyer: p.buyer,
      buyerAgentId: p.buyerAgentId,
      taskType: p.taskType,
      specHash: p.specHash,
      amount: p.amount,
      fee,
      area: p.area,
      claimTTL: p.claimTTL,
      submitTTL: p.submitTTL,
      disputeWindow: p.disputeWindow,
    });
    return { taskId };
  }

  /**
   * The check order here is the one the reviewer reads first, and it is T-01 §2's:
   * worker, active claim, cooldown, seeded ⇒ allowlisted, then state and lazy expiry.
   */
  private claimBy(taskId: bigint, worker: Address): void {
    if (this.isPaused) throw new ChainRevert('EnforcedPause');
    if (!this.workers.has(lower(worker))) throw new ChainRevert('NotWorker');
    if ((this.activeClaims.get(lower(worker)) ?? 0n) !== 0n) throw new ChainRevert('HasActiveClaim');
    if (this.clock < (this.cooldowns.get(lower(worker)) ?? 0n)) throw new ChainRevert('InCooldown');

    const task = this.mustExist(taskId);
    if (this.workers.get(lower(worker))?.seeded && !this.allowlist.has(lower(task.buyer))) {
      throw new ChainRevert('SeededCannotClaimExternal');
    }

    if (task.state === TASK_STATE.Claimed) {
      if (this.clock <= task.claimedAt + BigInt(task.claimTTL)) {
        throw new ChainRevert('AlreadyClaimed');
      }
      // Lazy expiry, no keeper: the next claimant clears the stale one on the way past. The
      // stale worker's cooldown starts now; the new claimant's does not exist.
      const stale = task.worker;
      this.emit('ClaimExpired', { taskId, staleWorker: stale });
      this.cooldowns.set(lower(stale), this.clock + CLAIM_COOLDOWN);
      this.clearClaim(stale);
    } else if (task.state !== TASK_STATE.Open) {
      throw new ChainRevert('BadState');
    }

    task.state = TASK_STATE.Claimed;
    task.worker = worker;
    task.claimedAt = this.clock;
    this.activeClaims.set(lower(worker), taskId);
    this.emit('TaskClaimed', { taskId, worker });
  }

  private releaseClaimBy(taskId: bigint, worker: Address): void {
    const task = this.mustExist(taskId);
    if (task.state !== TASK_STATE.Claimed) throw new ChainRevert('BadState');
    if (lower(task.worker) !== lower(worker)) throw new ChainRevert('NotClaimant');

    task.state = TASK_STATE.Open;
    task.worker = ZERO_ADDRESS;
    task.claimedAt = 0n;
    this.clearClaim(worker);
    // Giving up inside the TTL is free — no cooldown.
    this.emit('ClaimReleased', { taskId, worker });
  }

  /** Never gated by pause. */
  private submitBy(taskId: bigint, worker: Address, proofHash: Hex): void {
    const task = this.mustExist(taskId);
    if (task.state !== TASK_STATE.Claimed) throw new ChainRevert('BadState');
    if (lower(task.worker) !== lower(worker)) throw new ChainRevert('NotClaimant');
    if (this.clock > task.claimedAt + BigInt(task.submitTTL)) {
      throw new ChainRevert('SubmitWindowClosed');
    }

    task.state = TASK_STATE.Submitted;
    task.submittedAt = this.clock;
    task.proofHash = proofHash;
    this.emit('TaskSubmitted', { taskId, worker, proofHash });
  }

  /** Effects before interactions, same as the contract. */
  private release(taskId: bigint, task: Task): void {
    const worker = task.worker;
    task.state = TASK_STATE.Released;
    this.clearClaim(worker);
    this.closeTask(task.buyer);

    this.debit(ESCROW, task.amount + task.fee);
    this.credit(worker, task.amount);
    this.credit(this.treasuryAddress, task.fee);

    this.feedback(this.nullifierFor(worker), this.raterKey(task), OUTCOME.Paid, taskId);
    if (task.buyerAgentId !== 0n) this.outcome(task.buyerAgentId, taskId, OUTCOME.Paid);
    this.emit('TaskReleased', { taskId, worker, amount: task.amount, fee: task.fee });
  }

  /**
   * `raterKey = buyerAgentId != 0 ? bytes32(buyerAgentId) : bytes32(uint256(uint160(buyer)))`.
   * An agent that rotates its wallet keeps one voice; a wallet with no agent id gets its own.
   */
  private raterKey(task: Task): Hex {
    return task.buyerAgentId !== 0n
      ? pad(numberToHex(task.buyerAgentId), { size: 32 })
      : pad(task.buyer, { size: 32 });
  }

  private feedback(nullifier: bigint, raterKey: Hex, outcome: number, taskId: bigint): void {
    const record = this.record(nullifier);
    const key = raterKey.toLowerCase();
    const previous = record.slots.get(key);
    const newRater = previous === undefined;

    // A repeat from the same rater updates its slot and does not add a voice.
    if (newRater) record.distinctRaters += 1n;
    record.score += outcomeValue(outcome) - (previous === undefined ? 0n : outcomeValue(previous));
    record.slots.set(key, outcome);
    // `completed` counts tasks, so it moves even when the rater does not.
    if (outcome === OUTCOME.Paid || outcome === OUTCOME.ResolvedToWorker) record.completed += 1n;

    this.emit('Feedback', { nullifierHash: nullifier, raterKey, outcome, taskId, newRater });
  }

  private outcome(agentId: bigint, taskId: bigint, outcome: number): void {
    this.emit('Outcome', { agentId, taskId, outcome });
  }

  private record(nullifier: bigint): ReputationRecord {
    const key = nullifier.toString();
    let record = this.reputation.get(key);
    if (!record) {
      record = { score: 0n, completed: 0n, distinctRaters: 0n, slots: new Map() };
      this.reputation.set(key, record);
    }
    return record;
  }

  private nullifierFor(worker: Address): bigint {
    return this.workers.get(lower(worker))?.nullifier ?? 0n;
  }

  private markKey(agentId: bigint, specHash: Hex): string {
    return `${agentId}:${specHash.toLowerCase()}`;
  }

  private mustExist(taskId: bigint): Task {
    const task = this.tasks.get(taskId.toString());
    if (!task || task.state === TASK_STATE.None) throw new ChainRevert('BadState');
    return task;
  }

  private clearClaim(worker: Address): void {
    this.activeClaims.delete(lower(worker));
  }

  /** A settled task stops counting against the buyer's open cap. */
  private closeTask(buyer: Address): void {
    const open = this.openTasks.get(lower(buyer)) ?? 0n;
    if (open > 0n) this.openTasks.set(lower(buyer), open - 1n);
  }

  private credit(to: Address, units: bigint): void {
    this.balances.set(lower(to), (this.balances.get(lower(to)) ?? 0n) + units);
  }

  private debit(from: Address, units: bigint): void {
    this.balances.set(lower(from), (this.balances.get(lower(from)) ?? 0n) - units);
  }

  private emit(name: string, args: Record<string, unknown>): void {
    this.pending.push({ name, args, txHash: this.txHash, logIndex: this.pending.length });
  }

  /**
   * One write, one "transaction". A revert leaves nothing behind — every method checks before
   * it mutates — and the events it would have emitted never reach the log.
   */
  /** Records the call, honours an armed revert, then runs the write as one transaction. */
  private write<T>(
    fn: string,
    role: FakeChainRole,
    args: readonly unknown[],
    body: () => T,
  ): Promise<TxResult & T> {
    this.calls.push({ fn, role, args });
    const armed = this.armedRevert;
    if (armed !== undefined) {
      this.armedRevert = undefined;
      return Promise.reject(new ChainRevert(armed));
    }
    return this.transaction(body);
  }

  private async transaction<T>(body: () => T): Promise<TxResult & T> {
    this.txCounter += 1;
    this.txHash = keccak256(stringToHex(`legwork-fake-tx-${this.txCounter}`));
    this.pending = [];

    const extra = body();

    this.blockNumber += 1n;
    const events = this.pending;
    this.log.push(...events);
    this.pending = [];
    return { hash: this.txHash, blockNumber: this.blockNumber, events, ...(extra ?? ({} as T)) };
  }

  private emptyTask(): Task {
    return {
      taskType: 0,
      specHash: pad('0x', { size: 32 }),
      amount: 0n,
      fee: 0n,
      buyer: ZERO_ADDRESS,
      area: '',
      buyerAgentId: 0n,
      worker: ZERO_ADDRESS,
      state: TASK_STATE.None,
      postedAt: 0n,
      claimedAt: 0n,
      submittedAt: 0n,
      claimTTL: 0,
      submitTTL: 0,
      disputeWindow: 0,
      proofHash: pad('0x', { size: 32 }),
    };
  }
}

/** `Paid` and `ResolvedToWorker` are +1; `ResolvedToBuyer` is −1. */
function outcomeValue(outcome: number): bigint {
  return outcome === OUTCOME.ResolvedToBuyer ? -1n : 1n;
}
