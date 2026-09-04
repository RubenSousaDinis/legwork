import { Address, BigInt } from "@graphprotocol/graph-ts";
import { Buyer, PosterStats, Worker } from "../../generated/schema";

/** The `PosterStats` singleton id. There is exactly one row. */
export const POSTER_STATS_ID: string = "global";

/**
 * Load a `Worker`, or create the row with every non-null field at its zero value.
 *
 * `seeded` starts `false` here and stays `false` unless the `WorkerSeeded` handler
 * sets it: this function is deliberately not a writer of that field, so no ordering
 * of events can make a real worker look seeded or the reverse.
 */
export function getOrCreateWorker(address: Address, timestamp: BigInt): Worker {
  let worker = Worker.load(address);
  if (worker != null) return worker;

  worker = new Worker(address);
  worker.nullifier = BigInt.zero();
  worker.seeded = false;
  worker.reset = false;
  worker.area = "";
  worker.taskTypes = 0;
  worker.completed = 0;
  worker.lastCompletedAt = null;
  worker.score = BigInt.zero();
  worker.distinctRaters = 0;
  worker.registeredAt = timestamp;
  return worker;
}

/**
 * Load a `Buyer`, or create it un-allowlisted with nothing counted yet.
 *
 * `countedExternal` — not "did this call create the row" — is what `TaskPosted` uses to
 * decide whether this poster is a new distinct external buyer. `Buyer.tasks` is
 * `@derivedFrom` and unreadable inside a mapping, and a row can exist before its first
 * post because `BuyerAllowlisted` created it.
 */
export function getOrCreateBuyer(address: Address): Buyer {
  let buyer = Buyer.load(address);
  if (buyer != null) return buyer;

  buyer = new Buyer(address);
  buyer.allowlisted = false;
  buyer.taskCount = 0;
  buyer.countedExternal = false;
  return buyer;
}

/** The singleton, created with both counters at zero on first use. */
export function getPosterStats(): PosterStats {
  let stats = PosterStats.load(POSTER_STATS_ID);
  if (stats != null) return stats;

  stats = new PosterStats(POSTER_STATS_ID);
  stats.distinctExternalBuyers = 0;
  stats.externalTasks = 0;
  return stats;
}
