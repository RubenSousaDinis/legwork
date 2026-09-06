/**
 * `POST /tasks/:id/submit` — the worker hands in the proof, the relayer anchors it.
 *
 * The plain path is: schema, ownership of the proof row, `submitFor`, mirror, observation.
 * On top of it sit the two checks that make this API the default reviewer while the buyer's
 * agent is asleep — content-hash reuse for the same place and type, and a ~150 m geofence
 * (`proofChecks.ts`). Each is **submit then dispute**, both onchain, and neither is ever a 4xx:
 * refusing to submit would leave the worker with no record that they went, and a dispute the
 * buyer can see is more honest than a silent drop.
 *
 * The GPS downgrade is the third branch and the one that is easiest to get wrong. A phone with
 * no fix is not evidence of anything, so the worker taps to confirm they are at the place, the
 * geofence is skipped rather than failed, and the observation is written at 0.6 instead of 0.9.
 * Accepted and labelled — never accepted and dressed up as proof.
 */
import { getAddress, isAddress, keccak256, toBytes } from 'viem';
import {
  CompareTwoProof,
  GEOFENCE_M,
  TASK_STATE,
  CallConfirmProof,
  PhotoOfProof,
  VerifyOpenProof,
  canonicalJson,
  type CallTemplateId,
  type TaskType,
} from '@legwork/shared';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { route, preflight, pathParam } from '@/src/http/route';
import { ApiError } from '@/src/errors';
import { getChain } from '@/src/chain';
import { getDb } from '@/src/db/client';
import { observations, proofs, screeningLog, tasks } from '@/src/db/schema';
import { logger } from '@/src/log';
import { requireWorkerSession } from '@/src/session';
import {
  GEOFENCE_RULE_ID,
  REUSE_RULE_ID,
  checkGeofence,
  checkReuse,
  type GeofenceResult,
  type ProofLocation,
  type ReuseResult,
} from '@/src/services/proofChecks';
import {
  loadTask,
  mirrorFromChain,
  placeIdOf,
  revertName,
  sameAddress,
  taskTypeOf,
  type TaskRow,
} from '@/src/services/lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TaskId = /^\d+$/;
const KECCAK = /^0x[0-9a-f]{64}$/;

/** The two types whose evidence is a file in the private bucket, uploaded first by `/proofs`. */
const PHOTO_TYPES = new Set<TaskType>(['verify-open', 'photo-of']);

/** 10-schemas §8. `compare-two` is a judgement rather than an observation; see below. */
const CONFIDENCE = { full: 0.9, gpsDowngraded: 0.6, selfReported: 0.5, compareTwo: 0.8 } as const;

/** What an auto-disputed observation is worth. Kept, labelled, and trusted by nothing. */
const DISPUTED_CONFIDENCE = 0.1;

/** Which `CLAIM_TYPES` member a call-confirm template answers. */
const CLAIM_TYPE_BY_TEMPLATE = {
  open_now: 'open_now',
  have_item: 'item_in_stock',
  price_of: 'price',
  accepts_payment: 'payment',
  closes_at_today: 'hours',
  takes_reservation: 'reservation',
} as const satisfies Record<CallTemplateId, string>;

interface ParsedProof {
  /** What goes onchain and into `tasks.proof_hash`. */
  proofHash: `0x${string}`;
  /** The answer as the buyer's agent will read it, wrapped by T-19 as untrusted worker text. */
  answer: string;
  note?: string;
  /** `null` when there is no stored artefact behind the hash — a call or a comparison. */
  evidenceHash: `0x${string}` | null;
  claimType?: string;
  confidence: number;
  observedAt: Date;
  /** Where the phone said it was when it captured, or `null` for an errand with no photo. */
  location: ProofLocation | null;
}

const unknownProof = (): ApiError =>
  ApiError.of('invalid_request', { field: 'proofHash', reason: 'unknown proof for this worker' });

/**
 * Parses the body with the per-type proof schema and settles what the proof hash is.
 *
 * For the two photo types the hash is the worker's file, uploaded to `/proofs` beforehand, so
 * it has to be theirs and it has to match `photo_hash`. For a call or a comparison there is no
 * file, so the server hashes the canonical proof body itself — a worker cannot hand in a hash
 * of something the server never saw.
 */
async function parseProof(row: TaskRow, caller: string, raw: unknown): Promise<ParsedProof> {
  const type = taskTypeOf(row.taskType);
  const body = (raw ?? {}) as Record<string, unknown>;

  if (PHOTO_TYPES.has(type)) {
    const proof = type === 'verify-open' ? VerifyOpenProof.parse(raw) : PhotoOfProof.parse(raw);
    const proofHash = body.proofHash;
    if (typeof proofHash !== 'string' || !KECCAK.test(proofHash) || proofHash !== proof.photo_hash) {
      throw ApiError.of('invalid_request', {
        field: 'proofHash',
        reason: 'proofHash must equal photo_hash',
      });
    }

    // The uploaded file has to belong to the worker handing it in. Without this, one worker's
    // proof hash is another worker's free submission.
    const owned = await getDb()
      .select()
      .from(proofs)
      .where(and(eq(proofs.hash, proofHash), sql`lower(${proofs.worker}) = lower(${caller})`))
      .limit(1);
    const uploaded = owned[0];
    if (!uploaded) throw unknownProof();

    return {
      proofHash: proofHash as `0x${string}`,
      answer: proof.answer,
      ...(proof.note === undefined ? {} : { note: proof.note }),
      evidenceHash: proofHash as `0x${string}`,
      claimType: type === 'verify-open' ? 'open_now' : 'photo',
      // GPS is self-reported and spoofable; we anchor it, geofence it and dispute outside the
      // radius — we do not prove it. A worker whose phone had no fix is accepted and labelled.
      confidence: proof.gps_unavailable ? CONFIDENCE.gpsDowngraded : CONFIDENCE.full,
      observedAt: new Date(proof.captured_at),
      location: {
        exactLat: uploaded.exactLat,
        exactLon: uploaded.exactLon,
        // Either side saying "no fix" is a downgrade: the row is what `/proofs` recorded at
        // upload, the body is what the worker is stating now, and they should agree.
        gpsUnavailable: uploaded.gpsUnavailable || proof.gps_unavailable,
      },
    };
  }

  if (type === 'call-confirm') {
    const proof = CallConfirmProof.parse(raw);
    return {
      proofHash: keccak256(toBytes(canonicalJson(proof))),
      answer: proof.answer,
      ...(proof.note === undefined ? {} : { note: proof.note }),
      evidenceHash: null,
      claimType: CLAIM_TYPE_BY_TEMPLATE[proof.template_id],
      confidence: CONFIDENCE.selfReported,
      observedAt: new Date(proof.called_at),
      // A phone call has no place to be far from.
      location: null,
    };
  }

  const proof = CompareTwoProof.parse(raw);
  return {
    proofHash: keccak256(toBytes(canonicalJson(proof))),
    answer: proof.choice,
    note: proof.reason,
    evidenceHash: null,
    confidence: CONFIDENCE.compareTwo,
    observedAt: new Date(),
    location: null,
  };
}

export const POST = route(async (req, ctx) => {
  const session = await requireWorkerSession(req);
  const id = await pathParam(ctx, 'id');
  if (!TaskId.test(id)) throw ApiError.of('not_found');
  const taskId = BigInt(id);

  if (!isAddress(session.worker)) throw ApiError.of('forbidden', { reason: 'not_worker' });
  const caller = getAddress(session.worker);

  const row = await loadTask(taskId);
  const chain = getChain();
  const [now, chainTask] = await Promise.all([chain.now(), chain.getTask(taskId)]);

  // Claimed, by this worker, inside the submit window — the contract's three conditions,
  // asked here so a late worker gets a sentence instead of a revert.
  const claimedByCaller = chainTask.state === TASK_STATE.Claimed && sameAddress(chainTask.worker, caller);
  if (!claimedByCaller) throw ApiError.of('conflict', { reason: 'not_claimed_by_caller' });
  if (now > chainTask.claimedAt + BigInt(chainTask.submitTTL)) {
    throw ApiError.of('conflict', { reason: 'SubmitWindowClosed' });
  }

  const raw = await req.json().catch(() => {
    throw ApiError.of('invalid_request', { field: '(root)', reason: 'expected a JSON body' });
  });
  const proof = await parseProof(row, caller, raw);

  let tx: { hash: string };
  try {
    tx = await chain.submitFor(taskId, caller, proof.proofHash);
  } catch (err) {
    const name = revertName(err);
    if (name) throw ApiError.of('conflict', { reason: name });
    throw err;
  }

  // The checks read the database as it stands *before* this submission is mirrored onto it, so
  // neither of them can match the task against itself. Both exclude this task id anyway.
  const reuse = await checkReuse({ proofHash: proof.proofHash, task: row });
  const geofence = checkGeofence({ proof: proof.location, task: row });
  const decision = autoDisputeFor(reuse, geofence);

  const settled = await chain.getTask(taskId);
  const mirrored = await mirrorFromChain(row, settled, { submit: tx.hash });
  await getDb()
    .update(tasks)
    .set({
      answer: proof.answer,
      note: proof.note ?? null,
      ...(decision ? { autoDisputeReason: decision.reason } : {}),
      updatedAt: new Date(),
    })
    .where(eq(tasks.taskId, taskId));

  const placeId = placeIdOf(row);
  if (proof.evidenceHash) {
    await getDb()
      .update(proofs)
      .set({ taskId, ...(placeId ? { placeId } : {}) })
      .where(eq(proofs.hash, proof.evidenceHash));
  }

  if (!decision) {
    await recordObservation(row, session.nullifier, proof, await chain.isSeeded(caller));
    return Response.json({ tx: tx.hash, status: 'submitted' });
  }

  // Submit *then* dispute, both onchain. Never a 4xx and never a silent drop: refusing the
  // submission would leave the worker with no record that they went, and the buyer with
  // nothing to look at. The log line names the rule and the spec hash, never the spec.
  let disputeTx: string | undefined;
  try {
    disputeTx = (await chain.dispute(taskId)).hash;
    await mirrorFromChain(mirrored, await chain.getTask(taskId));
  } catch (err) {
    // The window is open the moment after a submit, so this is close to unreachable — but a
    // dispute that did not land is not one this route may claim happened.
    logger.warn(
      { task_id: taskId.toString(), rule_id: decision.ruleId, revert: revertName(err) },
      'auto_dispute_failed',
    );
  }

  // An auto-dispute is an outcome, not a refusal: `class` stays null and `marked` stays false.
  // Nothing here marks, and `markIfIdentified` is not imported anywhere in this file.
  await getDb().insert(screeningLog).values({
    id: randomUUID(),
    taskType: taskTypeOf(row.taskType),
    class: null,
    reason: decision.reason_text,
    ruleId: decision.ruleId,
    specHash: row.specHash,
    marked: false,
  });

  await recordObservation(
    row,
    session.nullifier,
    { ...proof, confidence: DISPUTED_CONFIDENCE },
    await chain.isSeeded(caller),
  );

  if (!disputeTx) return Response.json({ tx: tx.hash, status: 'submitted' });
  return Response.json({
    tx: tx.hash,
    status: 'disputed',
    auto_dispute_reason: decision.reason,
    dispute_tx: disputeTx,
  });
});

interface AutoDispute {
  reason: 'proof_reuse' | 'geofence';
  ruleId: string;
  /** The `screening_log` line. Says what was seen, never what the spec said. */
  reason_text: string;
}

/**
 * Reuse is checked first because it is the stronger statement: the same bytes handed in twice
 * for the same place and type is a replay whatever the coordinate says, and one auto-dispute
 * per submission is enough to make the point.
 */
function autoDisputeFor(reuse: ReuseResult, geofence: GeofenceResult): AutoDispute | undefined {
  if (reuse.hit) {
    return {
      reason: 'proof_reuse',
      ruleId: REUSE_RULE_ID,
      reason_text: `proof content hash seen before on task ${reuse.other_task_id} for this place and type`,
    };
  }
  if ('hit' in geofence && geofence.hit) {
    return {
      reason: 'geofence',
      ruleId: GEOFENCE_RULE_ID,
      reason_text: `capture ${geofence.distance_m} m from the place, outside the ${GEOFENCE_M} m fence`,
    };
  }
  return undefined;
}

/**
 * One observation per task.
 *
 * `compare-two` writes none: `observations.place_key` and `geohash5` are `NOT NULL`, a
 * comparison has no place at all, and `CLAIM_TYPES` has no member for it — 10-schemas calls it
 * a judgement rather than an observation. The choice and the reason are on the task row, which
 * is where `WorkerAnswer` reads them from. See the INTERFACE REQUEST on the PR.
 */
async function recordObservation(
  row: TaskRow,
  nullifier: string,
  proof: ParsedProof,
  workerSeeded: boolean,
): Promise<void> {
  const placeId = placeIdOf(row);
  if (!proof.claimType || !placeId) return;

  const seeded = row.seeded || workerSeeded;
  await getDb()
    .insert(observations)
    .values({
      observationId: `obs-${row.taskId}`,
      placeKey: placeId,
      claimType: proof.claimType,
      claimValue: proof.answer,
      evidenceHash: proof.evidenceHash,
      // Private, and never in `PublicObservation`: a nullifier-keyed movement history is the
      // one thing this table must not become.
      workerNullifier: nullifier,
      observedAt: proof.observedAt,
      // A seeded row is demo data: confidence 0, excluded from every aggregate.
      confidence: String(seeded ? 0 : proof.confidence),
      taskId: row.taskId,
      seeded,
      geohash5: row.area,
    })
    .onConflictDoNothing();
}

export const OPTIONS = preflight;
