import { BigInt } from "@graphprotocol/graph-ts";
import {
  WorkerRegistered,
  WorkerReset,
  WorkerSeeded,
} from "../../generated/WorkerRegistry/WorkerRegistry";
import { getOrCreateWorker } from "../lib/entities";

/**
 * A real human, verified through World ID before the registry ever saw them.
 * `seeded` is written `false` by `getOrCreateWorker` and never touched here.
 */
export function handleWorkerRegistered(event: WorkerRegistered): void {
  const worker = getOrCreateWorker(event.params.worker, event.block.timestamp);
  worker.nullifier = event.params.nullifierHash;
  worker.reset = false;
  worker.area = event.params.area;
  worker.taskTypes = event.params.taskTypes;
  worker.completed = 0;
  worker.lastCompletedAt = null;
  worker.score = BigInt.zero();
  worker.distinctRaters = 0;
  worker.registeredAt = event.block.timestamp;
  worker.save();
}

/**
 * The demo rows. This handler is the **only** writer of `Worker.seeded` in the whole
 * subgraph: seeded is never inferred from an address list, an area or an id range, so
 * "1 real · +20 seeded" on the dashboard is a fact the chain emitted, not a guess.
 */
export function handleWorkerSeeded(event: WorkerSeeded): void {
  const worker = getOrCreateWorker(event.params.worker, event.block.timestamp);
  worker.nullifier = event.params.syntheticNullifier;
  worker.seeded = true;
  worker.area = event.params.area;
  worker.taskTypes = event.params.taskTypes;
  worker.save();
}

/**
 * A reset unbinds the nullifier on chain. The row stays: it is history, not a delete,
 * and every reader excludes `reset == true` itself.
 */
export function handleWorkerReset(event: WorkerReset): void {
  const worker = getOrCreateWorker(event.params.worker, event.block.timestamp);
  worker.reset = true;
  worker.save();
}
