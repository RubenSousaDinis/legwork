/**
 * The two checks that make this API the default reviewer while the buyer's agent is asleep.
 *
 * Both are run at submit time, both **auto-dispute**, and neither is ever a refusal to submit:
 * the worker's `submitFor` goes onchain first and a `dispute` follows it, so a worker who went
 * to the place has a record that they did and a buyer has something to look at. There is no
 * revert, no mempool race and no silent drop — `auto_dispute_reason` names which check fired
 * and a `screening_log` row records it beside the gate's own decisions.
 *
 * What each one honestly is:
 *
 * - `checkReuse` compares raw content hashes. The same file handed in twice for the same place
 *   and the same kind of errand is a replay, whoever uploads it. It says nothing about two
 *   different photos of the same door.
 * - `checkGeofence` compares the coordinate the worker's phone reported at capture with the
 *   coordinate the place was geocoded to at post time. GPS is self-reported and spoofable; we
 *   anchor it, geofence it, and dispute outside the radius — we do not prove it. A phone with
 *   no fix is not accused: the worker taps to confirm they are at the place, the check is
 *   skipped, and the observation is written at the lower confidence that admits it.
 */
import { GEOFENCE_M } from '@legwork/shared';
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { getDb } from '../db/client';
import { proofs, tasks } from '../db/schema';
import { distanceM } from './geo';
import { placeIdOf, taskCoordinate, type TaskRow } from './lifecycle';

export type ReuseResult = { hit: true; other_task_id: string } | { hit: false };

export type GeofenceResult =
  | { hit: true; distance_m: number }
  | { hit: false }
  | { skipped: 'gps_unavailable' };

/** The `rule_id` each check writes to `screening_log`; the dashboard quotes these. */
export const REUSE_RULE_ID = 'submit-reuse';
export const GEOFENCE_RULE_ID = 'submit-geofence';

export interface ReuseInput {
  proofHash: string;
  task: TaskRow;
}

/**
 * Has this exact content already been handed in for this place and this kind of errand?
 *
 * Two ways a hash can already be spent, and both count: a `proofs` row carrying it is already
 * bound to another task, or another `tasks` row already anchored it. The task being submitted
 * is excluded from both — it is about to own this hash itself, and a task cannot replay itself.
 *
 * Place and type are the whole scope. The same photo for a different place, or for a different
 * question about the same place, is a different observation and passes.
 */
export async function checkReuse({ proofHash, task }: ReuseInput): Promise<ReuseResult> {
  const placeId = placeIdOf(task);
  if (!placeId) return { hit: false };

  const db = getDb();

  const [viaProofs, viaTasks] = await Promise.all([
    db
      .select({ taskId: proofs.taskId })
      .from(proofs)
      .where(and(eq(proofs.hash, proofHash), isNotNull(proofs.taskId), ne(proofs.taskId, task.taskId))),
    db
      .select({ taskId: tasks.taskId })
      .from(tasks)
      .where(and(eq(tasks.proofHash, proofHash), ne(tasks.taskId, task.taskId))),
  ]);

  const candidates = [
    ...new Set([...viaProofs, ...viaTasks].map((row) => row.taskId).filter((id) => id !== null)),
  ];
  if (candidates.length === 0) return { hit: false };

  const others = await db.select().from(tasks).where(inArray(tasks.taskId, candidates));

  for (const other of others) {
    if (other.taskType !== task.taskType) continue;
    if (placeIdOf(other) !== placeId) continue;
    return { hit: true, other_task_id: other.taskId.toString() };
  }
  return { hit: false };
}

/** What the geofence needs from a `proofs` row: where the phone said it was, or that it could not say. */
export interface ProofLocation {
  exactLat: string | null;
  exactLon: string | null;
  gpsUnavailable: boolean;
}

export interface GeofenceInput {
  /** `null` for an errand with no photo at all — a phone call has no place to be far from. */
  proof: ProofLocation | null;
  task: TaskRow;
}

/**
 * Is the capture at least `GEOFENCE_M` from the place the buyer's spec named?
 *
 * `>=` and not `>`: 150 m is the outside of the fence, and the brief's radius is the first
 * distance that disputes. A missing coordinate on either side is not a hit — a check that
 * cannot run has found nothing, and accusing a worker on an absence is the opposite of the
 * point.
 */
export function checkGeofence({ proof, task }: GeofenceInput): GeofenceResult {
  if (!proof) return { hit: false };
  if (proof.gpsUnavailable) return { skipped: 'gps_unavailable' };

  const place = taskCoordinate(task);
  const capture = coordinateOf(proof);
  if (!place || !capture) return { hit: false };

  const distance = distanceM(capture, place);
  return distance >= GEOFENCE_M ? { hit: true, distance_m: Math.round(distance) } : { hit: false };
}

function coordinateOf(proof: ProofLocation): { lat: number; lon: number } | undefined {
  if (proof.exactLat === null || proof.exactLon === null) return undefined;
  return { lat: Number(proof.exactLat), lon: Number(proof.exactLon) };
}
