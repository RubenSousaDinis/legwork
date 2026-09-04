import { BigInt, Bytes, log } from "@graphprotocol/graph-ts";
import {
  BuyerAllowlisted,
  ClaimExpired,
  ClaimReleased,
  TaskClaimed,
  TaskDisputed,
  TaskPosted,
  TaskRefunded,
  TaskReleased,
  TaskResolved,
  TaskSubmitted,
} from "../../generated/TaskEscrow/TaskEscrow";
import { Task, Worker } from "../../generated/schema";
import { getOrCreateBuyer, getOrCreateWorker, getPosterStats } from "../lib/entities";
import {
  STATE_CLAIMED,
  STATE_DISPUTED,
  STATE_OPEN,
  STATE_REFUNDED,
  STATE_RELEASED,
  STATE_RESOLVED,
  STATE_SUBMITTED,
} from "../lib/state";

function taskId(id: BigInt): string {
  return id.toString();
}

/** One completion: the counter and the recency stamp move together, never apart. */
function creditCompletion(worker: Worker, timestamp: BigInt): void {
  worker.completed = worker.completed + 1;
  worker.lastCompletedAt = timestamp;
  worker.save();
}

export function handleTaskPosted(event: TaskPosted): void {
  const result = getOrCreateBuyer(event.params.buyer);
  const buyer = result.buyer;
  buyer.taskCount = buyer.taskCount + 1;

  const task = new Task(taskId(event.params.taskId));
  task.taskType = event.params.taskType;
  task.specHash = event.params.specHash;
  task.amount = event.params.amount;
  task.fee = event.params.fee;
  task.buyer = buyer.id;
  task.buyerAgentId = event.params.buyerAgentId;
  task.worker = null;
  task.state = STATE_OPEN;
  task.area = event.params.area;
  task.postedAt = event.block.timestamp;
  task.claimedAt = null;
  task.submittedAt = null;
  task.releasedAt = null;
  task.proofHash = null;
  task.seeded = false;
  task.txPost = event.transaction.hash;
  task.txClaim = null;
  task.txSubmit = null;
  task.txRelease = null;
  task.save();

  // PosterStats counts external demand only. The operator allowlists its own buyer at
  // deploy time (T-14) before it posts anything, so an honest green demo reads
  // `distinctExternalBuyers: 0` — that is the number the W3 gate is judged on and it is
  // never dressed up as real outside interest.
  if (!buyer.allowlisted) {
    const stats = getPosterStats();
    stats.externalTasks = stats.externalTasks + 1;
    if (!buyer.countedExternal) {
      stats.distinctExternalBuyers = stats.distinctExternalBuyers + 1;
      buyer.countedExternal = true;
    }
    stats.save();
  }
  buyer.save();
}

export function handleTaskClaimed(event: TaskClaimed): void {
  const task = Task.load(taskId(event.params.taskId));
  if (task == null) return;

  const worker = getOrCreateWorker(event.params.worker, event.block.timestamp);
  worker.save();

  task.worker = worker.id;
  task.claimedAt = event.block.timestamp;
  task.txClaim = event.transaction.hash;
  task.state = STATE_CLAIMED;
  // A task is seeded exactly when the human doing it is. Copied at claim, cleared the
  // moment the claim goes away, so the dashboard's seeded chip can never outlive it.
  task.seeded = worker.seeded;
  task.save();
}

/** Shared by ClaimReleased and ClaimExpired: the task goes back on the board, unseeded. */
function unclaim(id: BigInt): void {
  const task = Task.load(taskId(id));
  if (task == null) return;

  task.worker = null;
  task.claimedAt = null;
  task.txClaim = null;
  task.seeded = false;
  task.state = STATE_OPEN;
  task.save();
}

export function handleClaimReleased(event: ClaimReleased): void {
  unclaim(event.params.taskId);
}

/**
 * Lazy expiry: the escrow logs this for the stale claimant immediately before the
 * `TaskClaimed` that displaces them, in the same transaction, so plain log order
 * already puts the un-claim before the new claim. No ordering fix-up is needed.
 */
export function handleClaimExpired(event: ClaimExpired): void {
  unclaim(event.params.taskId);
}

export function handleTaskSubmitted(event: TaskSubmitted): void {
  const task = Task.load(taskId(event.params.taskId));
  if (task == null) return;

  task.submittedAt = event.block.timestamp;
  task.proofHash = event.params.proofHash;
  task.txSubmit = event.transaction.hash;
  task.state = STATE_SUBMITTED;
  task.save();
}

export function handleTaskReleased(event: TaskReleased): void {
  const task = Task.load(taskId(event.params.taskId));
  if (task == null) return;

  task.releasedAt = event.block.timestamp;
  task.txRelease = event.transaction.hash;
  task.state = STATE_RELEASED;
  task.save();

  const worker = getOrCreateWorker(event.params.worker, event.block.timestamp);
  creditCompletion(worker, event.block.timestamp);
}

export function handleTaskDisputed(event: TaskDisputed): void {
  const task = Task.load(taskId(event.params.taskId));
  if (task == null) return;

  task.state = STATE_DISPUTED;
  task.save();
}

/**
 * `toBuyer == false` means the worker was paid, so the completion counters advance
 * exactly as they do on `TaskReleased`. That is what keeps `Worker.completed` equal to
 * the on-chain `completed(nullifier)`.
 */
export function handleTaskResolved(event: TaskResolved): void {
  const task = Task.load(taskId(event.params.taskId));
  if (task == null) return;

  task.state = STATE_RESOLVED;
  task.save();

  if (event.params.toBuyer) return;

  const workerId = task.worker;
  if (workerId === null) return;
  const worker = Worker.load(workerId as Bytes);
  if (worker == null) return;
  creditCompletion(worker, event.block.timestamp);
}

export function handleTaskRefunded(event: TaskRefunded): void {
  const task = Task.load(taskId(event.params.taskId));
  if (task == null) return;

  task.state = STATE_REFUNDED;
  task.save();
}

/**
 * Interim rule until `Buyer.taskCount` / `countedExternal` are wired into a recompute:
 * set the flag, leave both counters alone, and say so in the log rather than quietly
 * leaving a stale number behind. The demo orders allowlist-then-post, so the counters
 * are exact under this rule.
 */
export function handleBuyerAllowlisted(event: BuyerAllowlisted): void {
  const result = getOrCreateBuyer(event.params.buyer);
  const buyer = result.buyer;
  buyer.allowlisted = event.params.allowed;
  buyer.save();

  log.warning("PosterStats not recomputed: Buyer.taskCount pending INTERFACE REQUEST", []);
}
