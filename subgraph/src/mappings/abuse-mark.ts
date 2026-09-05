import { Marked, Outcome as OutcomeEvent } from "../../generated/AbuseMark/AbuseMark";
import { Mark, Outcome } from "../../generated/schema";

/**
 * A refusal, recorded on chain. `classId` is stored as the integer it was emitted as —
 * the six labels live in `@legwork/shared` and are attached by the client, never
 * re-spelled here, so the index cannot drift from the enum.
 */
export function handleMarked(event: Marked): void {
  const id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const mark = new Mark(id);
  mark.agentId = event.params.agentId;
  mark.classId = event.params.classId;
  mark.specHash = event.params.specHash;
  mark.at = event.block.timestamp;
  mark.tx = event.transaction.hash;
  mark.save();
}

/** The outcome the escrow reported to the ERC-8004 registry, linked back to its task. */
export function handleOutcome(event: OutcomeEvent): void {
  const id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const outcome = new Outcome(id);
  outcome.agentId = event.params.agentId;
  outcome.task = event.params.taskId.toString();
  outcome.outcome = event.params.outcome;
  outcome.at = event.block.timestamp;
  outcome.save();
}
