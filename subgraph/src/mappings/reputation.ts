import { BigInt } from "@graphprotocol/graph-ts";
import { Feedback as FeedbackEvent } from "../../generated/Reputation/Reputation";
import { Feedback, Task, Worker } from "../../generated/schema";

/**
 * Outcome ordinals mirror `contracts/src/interfaces/Outcomes.sol`: 1 Paid, 2 ResolvedToWorker,
 * 3 ResolvedToBuyer. The first two are worth +1 to a worker's score, the third −1.
 */
function outcomeValue(outcome: i32): BigInt {
  if (outcome == 3) return BigInt.fromI32(-1);
  if (outcome == 1 || outcome == 2) return BigInt.fromI32(1);
  return BigInt.zero();
}

/**
 * One rater, one slot. The `Feedback` entity **is** the slot — id `<worker>-<raterKey>` —
 * so a rater who scores the same worker twice replaces their own earlier value and adds
 * no second voice. That is what stops one buyer manufacturing a reputation.
 *
 * The worker is resolved through the task, not through the nullifier: the escrow only
 * emits `Feedback` for a task whose worker is already set, and the index is keyed by
 * address.
 */
export function handleFeedback(event: FeedbackEvent): void {
  const task = Task.load(event.params.taskId.toString());
  if (task == null) return;

  const workerId = task.worker;
  if (workerId === null) return;

  const worker = Worker.load(workerId);
  if (worker == null) return;

  const slotId = worker.id.toHexString() + "-" + event.params.raterKey.toHexString();
  const value = outcomeValue(event.params.outcome);

  let slot = Feedback.load(slotId);
  if (slot == null) {
    slot = new Feedback(slotId);
    worker.score = worker.score.plus(value);
  } else {
    // Replace, never accumulate: back out what this rater said last time first.
    worker.score = worker.score.minus(outcomeValue(slot.outcome)).plus(value);
  }

  slot.worker = worker.id;
  slot.raterKey = event.params.raterKey;
  slot.outcome = event.params.outcome;
  slot.task = task.id;
  slot.newRater = event.params.newRater;
  slot.at = event.block.timestamp;
  slot.save();

  // A voice is counted once, and only when the contract says this rater is new.
  if (event.params.newRater) {
    worker.distinctRaters = worker.distinctRaters + 1;
  }
  worker.save();
}
