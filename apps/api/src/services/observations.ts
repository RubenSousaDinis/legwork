/**
 * One `Observation` per completed task: the fact, with the task stripped away.
 *
 * "Farmácia Central was closed at 14:32 on the 12th, photo hash 0x…, worker verified, GPS
 * inside the fence" is a statement about a place at a time. The task that bought it is a
 * wrapper — a record keyed by `place_key` can be re-checked or sold later without a
 * marketplace, and it is what lets the dashboard say the one line the deck promises:
 * "we checked N places; the listing was wrong about M".
 *
 * Three rules hold the file up.
 *
 * **Confidence is a stated rule, never a score.** `confidenceFor` returns one of exactly four
 * values — 0, 0.5, 0.6, 0.9 — in a fixed order, seeded first. There is no interpolation and no
 * fifth value. A `call-confirm` is a self-reported answer + timestamp (unverified) and is
 * labelled 0.5 wherever it is shown; a photo whose phone had no fix, whose accuracy is wider
 * than the fence, or which was captured outside the window is accepted and downgraded to 0.6
 * rather than dressed up as 0.9.
 *
 * **Seeded rows are demo data.** They are stored, labelled `seeded: true`, carry confidence 0
 * and are excluded from every aggregate. `listingDelta` never counts one, so the sentence is
 * about real observations only.
 *
 * **The record has no coordinate and no prose.** `claim.value` is the worker's enum answer and
 * never their note; the exact coordinate stays in the private `tasks`/`proofs` columns and is
 * read here only to measure a distance. `worker_nullifier` is on the row and is stripped by
 * the public view — a nullifier-keyed movement history is the one thing this table must not
 * become (10-schemas §8).
 */
import {
  CONFIDENCE,
  GEOFENCE_M,
  Observation as ObservationSchema,
  type CallTemplateId,
  type Observation,
  type SOURCES,
  type TaskType,
} from '@legwork/shared';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Hex } from 'viem';
import { getChain } from '../chain';
import { getDb, type Db } from '../db/client';
import { adminAudit, observations, proofs, tasks } from '../db/schema';
import { distanceM } from './geo';
import { placeIdOf, taskCoordinate, taskTypeOf, type TaskRow } from './lifecycle';

export type ProofRow = typeof proofs.$inferSelect;
export type ObservationRow = typeof observations.$inferSelect;

/** The four values the v0 rule can produce. No interpolation, no fifth. */
export type Confidence = 0 | 0.5 | 0.6 | 0.9;

/** The two errands whose evidence is a file in the private bucket. */
const PHOTO_TYPES = new Set<TaskType>(['verify-open', 'photo-of']);

/**
 * How far either side of the claim/submit pair a capture may sit and still count as inside
 * the window. Phone clocks drift and the relayer's mirror lands a moment after the write.
 */
export const TIMESTAMP_SLACK_S = 60;

/** Which `CLAIM_TYPES` member a call-confirm template answers (brief §2). */
const CLAIM_TYPE_BY_TEMPLATE = {
  open_now: 'open_now',
  have_item: 'item_in_stock',
  price_of: 'price',
  accepts_payment: 'payment',
  closes_at_today: 'hours',
  takes_reservation: 'reservation',
} as const satisfies Record<CallTemplateId, Observation['claim']['type']>;

/** A task is completed once the money has moved to the worker, and only then. */
const COMPLETED_STATES = ['released', 'resolved'] as const;

/**
 * What `buildObservation` is given. Everything it needs and nothing it could dial for: the
 * function is pure so the confidence rule can be read, argued with and tested on its own.
 *
 * `resolvedToBuyer` is `undefined` when the direction of a resolution is not known. A
 * `resolved` task is only observed when it is known to have gone to the worker — see the
 * INTERFACE REQUEST on the PR: `tasks` records that a dispute was resolved but not which way,
 * so an unknown direction is treated as the buyer's and produces no observation.
 */
export interface ObservationInput {
  task: TaskRow;
  proof: ProofRow | null;
  workerSeeded: boolean;
  workerNullifier: Hex;
  resolvedToBuyer?: boolean;
}

const numberOrNull = (value: string | null): number | null => (value === null ? null : Number(value));

const seconds = (date: Date): number => Math.floor(date.getTime() / 1000);

/**
 * A seeded worker *or* a seeded task makes the row demo data.
 *
 * §2 says `seeded = workerSeeded`; §10 says a seeded row is excluded from every aggregate and
 * the honesty rules say a seeded task always carries the chip. A real worker can complete a
 * demo task, and counting that place in "we checked N places" would put demo data behind a
 * number the deck reads out loud. T-17's writer already stores `row.seeded || workerSeeded`,
 * so this also keeps one task from getting two different answers depending on which path
 * materialised it. Flagged on the PR as a deliberate widening.
 */
function seededFor(input: ObservationInput): boolean {
  return input.workerSeeded || input.task.seeded;
}

/**
 * Was the capture inside the fence, precise enough to mean it, and inside the TTLs?
 *
 * Every clause has to hold. A missing coordinate on either side is not "inside": a check that
 * could not run has proved nothing, and 0.9 is the value that claims it did.
 */
function photoIsAnchored(input: ObservationInput): boolean {
  const { task, proof } = input;
  if (!proof || proof.gpsUnavailable) return false;

  const place = taskCoordinate(task);
  const lat = numberOrNull(proof.exactLat);
  const lon = numberOrNull(proof.exactLon);
  if (!place || lat === null || lon === null) return false;
  if (distanceM({ lat, lon }, place) > GEOFENCE_M) return false;

  const accuracy = numberOrNull(proof.exactAccuracyM);
  if (accuracy === null || accuracy > GEOFENCE_M) return false;

  const { claimedAt, submittedAt, submitTtlS } = task;
  if (!claimedAt || !submittedAt) return false;
  if (seconds(submittedAt) > seconds(claimedAt) + submitTtlS) return false;

  const captured = seconds(proof.capturedAt);
  return (
    captured >= seconds(claimedAt) - TIMESTAMP_SLACK_S &&
    captured <= seconds(submittedAt) + TIMESTAMP_SLACK_S
  );
}

/**
 * The v0 confidence rule, in the order 10-schemas §8 states it. Seeded is checked before
 * everything: demo data is worth 0 however good the photo behind it looks.
 *
 * `compare-two` is a judgement rather than an observation and has no confidence at all;
 * `buildObservation` returns `null` for it before reaching here. Called directly with one
 * anyway, this answers the downgraded 0.6 rather than inventing a fifth value.
 */
export function confidenceFor(input: ObservationInput): Confidence {
  if (seededFor(input)) return CONFIDENCE.seeded;
  if (taskTypeOf(input.task.taskType) === 'call-confirm') return CONFIDENCE.selfReported;
  return photoIsAnchored(input) ? CONFIDENCE.full : CONFIDENCE.gpsDowngraded;
}

/** Which claim a task answers. `undefined` where there is none — only `compare-two`. */
function claimTypeFor(task: TaskRow): Observation['claim']['type'] | undefined {
  const type = taskTypeOf(task.taskType);
  if (type === 'verify-open') return 'open_now';
  if (type === 'photo-of') return 'photo';
  if (type !== 'call-confirm') return undefined;

  const templateId = (task.specJson as Record<string, unknown>).template_id;
  return typeof templateId === 'string' && templateId in CLAIM_TYPE_BY_TEMPLATE
    ? CLAIM_TYPE_BY_TEMPLATE[templateId as CallTemplateId]
    : undefined;
}

/** Has this task ended with the worker paid? Nothing else is observed. */
function isCompleted(input: ObservationInput): boolean {
  const state = input.task.state.toLowerCase();
  if (state === 'released') return true;
  return state === 'resolved' && input.resolvedToBuyer === false;
}

/**
 * The record, or `null` where there is no fact to record.
 *
 * `null` covers `compare-two` (a judgement, not an observation), every state short of the
 * worker being paid, `refunded`, `disputed` and a dispute resolved to the buyer — and a
 * completed task that somehow carries no place or no answer, because an observation without
 * either is not a statement about anything.
 *
 * `observation_id` is `obs-<task_id>` and not a UUID: one task is one observation, so a second
 * pass over the same task has to produce the same key or the upsert stops being idempotent.
 */
export function buildObservation(input: ObservationInput): Observation | null {
  const { task, proof } = input;
  if (!isCompleted(input)) return null;

  const claimType = claimTypeFor(task);
  const placeKey = placeIdOf(task);
  if (!claimType || !placeKey) return null;

  // The enum the worker tapped, never their note: `tasks.note` is the buyer's to read,
  // wrapped as untrusted worker text, and it never reaches a place-keyed record.
  const value = task.answer;
  if (!value) return null;

  const isPhoto = PHOTO_TYPES.has(taskTypeOf(task.taskType));
  // No `tasks.called_at` column exists for call-confirm, so `submitted_at` stands in — the
  // fallback §13 names. See the INTERFACE REQUEST on the PR.
  const observedAt = (isPhoto ? proof?.capturedAt : null) ?? task.submittedAt ?? task.releasedAt;
  if (!observedAt) return null;

  const record: Observation = {
    observation_id: `obs-${task.taskId}`,
    place_key: placeKey,
    claim: { type: claimType, value },
    evidence_hash: isPhoto ? ((proof?.hash as Hex | undefined) ?? null) : null,
    worker_nullifier: input.workerNullifier,
    observed_at: observedAt.toISOString(),
    confidence: confidenceFor(input),
    task_id: task.taskId.toString(),
    seeded: seededFor(input),
  };

  // Parsed, not trusted: the frozen schema is what a consumer will read this back with, so a
  // record that would not survive the round trip must not reach the table.
  return ObservationSchema.parse(record);
}

// ---------------------------------------------------------------- the verify-open delta

/** A `VerifyOpenSpec.source`: which listing the buyer's claim came from. */
export type ListingSource = (typeof SOURCES)[number];

/** The three fields of a `VerifyOpenSpec` the delta needs. Read here, returned nowhere. */
export interface ListingSpec {
  claimed_open: boolean | null;
  claimed_hours: string | null;
  source: ListingSource;
}

export interface SourceDelta {
  checked_places: number;
  wrong_listings: number;
}

export interface ListingDelta {
  checked_places: number;
  wrong_listings: number;
  by_source: Record<string, SourceDelta>;
  sentence: string;
}

/**
 * "we checked N places; the listing was wrong about M".
 *
 * Counted over non-seeded `open_now` observations of `verify-open` tasks only — membership in
 * `specs` is what says a row came from one, so a `call-confirm` answering the same question
 * never enters. A listing with nothing to be wrong about (`claimed_open: null`) and an answer
 * that saw nothing (`unclear`) count in neither total: a place we could not read is not a
 * place we checked.
 *
 * One place counts once, at its latest observation. A shop that was shut this morning and open
 * this afternoon is one place with one current state, not two checks.
 */
export function listingDelta(
  rows: readonly Observation[],
  specs: ReadonlyMap<string, ListingSpec>,
): ListingDelta {
  const latest = new Map<string, { row: Observation; spec: ListingSpec }>();

  for (const row of rows) {
    if (row.seeded || row.claim.type !== 'open_now') continue;
    if (row.claim.value === 'unclear') continue;
    const spec = specs.get(row.task_id);
    if (!spec || spec.claimed_open === null) continue;

    const held = latest.get(row.place_key);
    if (!held || row.observed_at > held.row.observed_at) latest.set(row.place_key, { row, spec });
  }

  const by_source: Record<string, SourceDelta> = {};
  let checked_places = 0;
  let wrong_listings = 0;

  for (const { row, spec } of latest.values()) {
    const bucket = (by_source[spec.source] ??= { checked_places: 0, wrong_listings: 0 });
    checked_places += 1;
    bucket.checked_places += 1;

    const wrong =
      (spec.claimed_open === true && row.claim.value === 'closed') ||
      (spec.claimed_open === false && row.claim.value === 'open');
    if (wrong) {
      wrong_listings += 1;
      bucket.wrong_listings += 1;
    }
  }

  return {
    checked_places,
    wrong_listings,
    by_source,
    sentence: `we checked ${checked_places} places; the listing was wrong about ${wrong_listings}`,
  };
}

// ---------------------------------------------------------------- materialising

/**
 * What the writers need. Injected so a test hands in pglite and `FakeChain` and nothing here
 * reaches for a second client or a clock of its own.
 */
export interface ObservationDeps {
  db?: Db;
  chain?: ChainReader;
  now?: () => Date;
}

/**
 * The two registry reads this file makes. Declared structurally rather than imported, so
 * `src/chain.ts` stays the one module in this app that names `@legwork/chain`.
 */
export interface ChainReader {
  isSeeded(a: Hex): Promise<boolean>;
  nullifierOf(a: Hex): Promise<bigint>;
}

interface WorkerFacts {
  seeded: boolean;
  nullifier: Hex;
}

/**
 * One registry round trip per worker per process. A seeded flag never flips except by
 * `resetWorker`, and a nullifier is bound once and for the life of the registration, so a
 * sweep over 200 tasks by a handful of workers is a handful of reads.
 */
const workerCache = new Map<string, WorkerFacts>();

/** Vitest only: a fresh cache between cases, and after a `resetWorker`. */
export function resetWorkerCacheForTests(): void {
  workerCache.clear();
}

async function workerFacts(chain: ChainReader, worker: string): Promise<WorkerFacts> {
  const key = worker.toLowerCase();
  const held = workerCache.get(key);
  if (held) return held;

  const address = worker as Hex;
  const [seeded, nullifier] = await Promise.all([chain.isSeeded(address), chain.nullifierOf(address)]);
  const facts: WorkerFacts = { seeded, nullifier: `0x${nullifier.toString(16)}` };
  workerCache.set(key, facts);
  return facts;
}

/**
 * Which way a resolved dispute went, for the tasks named.
 *
 * `tasks` records that a dispute was resolved and not which way, so the answer is recovered
 * from the audit row `/admin/resolve` wrote — matched on the release transaction hash, which
 * is unique. A task with no matching row stays absent from the map and is read as unknown,
 * which `isCompleted` treats as the buyer's: an observation the operator may have judged
 * worthless is worse than a missing one. See the INTERFACE REQUEST on the PR.
 */
async function resolvedToBuyerBy(db: Db, rows: readonly TaskRow[]): Promise<Map<string, boolean>> {
  const byTx = new Map<string, string>();
  for (const row of rows) {
    if (row.state.toLowerCase() === 'resolved' && row.txRelease) byTx.set(row.txRelease, row.taskId.toString());
  }
  if (byTx.size === 0) return new Map();

  const audits = await db
    .select({ tx: adminAudit.tx, payload: adminAudit.payload })
    .from(adminAudit)
    .where(and(eq(adminAudit.action, '/admin/resolve'), inArray(adminAudit.tx, [...byTx.keys()])));

  const out = new Map<string, boolean>();
  for (const audit of audits) {
    const taskId = audit.tx ? byTx.get(audit.tx) : undefined;
    const body = (audit.payload as { body?: Record<string, unknown> } | null)?.body;
    if (taskId && typeof body?.to_buyer === 'boolean') out.set(taskId, body.to_buyer);
  }
  return out;
}

/** The `observations` row an `Observation` becomes. `geohash5` is the task's area — never a coordinate. */
function toRow(record: Observation, task: TaskRow): typeof observations.$inferInsert {
  return {
    observationId: record.observation_id,
    placeKey: record.place_key,
    claimType: record.claim.type,
    claimValue: record.claim.value,
    evidenceHash: record.evidence_hash,
    workerNullifier: record.worker_nullifier,
    observedAt: new Date(record.observed_at),
    confidence: String(record.confidence),
    taskId: task.taskId,
    seeded: record.seeded,
    geohash5: task.area,
  };
}

/** The `Observation` an `observations` row is. The inverse of `toRow`, minus `geohash5`. */
export function toObservation(row: ObservationRow): Observation {
  return {
    observation_id: row.observationId,
    place_key: row.placeKey,
    claim: { type: row.claimType as Observation['claim']['type'], value: row.claimValue },
    evidence_hash: row.evidenceHash,
    worker_nullifier: row.workerNullifier,
    observed_at: row.observedAt.toISOString(),
    confidence: (row.confidence === null ? null : Number(row.confidence)) as Observation['confidence'],
    task_id: row.taskId.toString(),
    seeded: row.seeded,
  };
}

async function write(db: Db, task: TaskRow, record: Observation): Promise<Observation> {
  const values = toRow(record, task);
  await db
    .insert(observations)
    .values(values)
    .onConflictDoUpdate({ target: observations.observationId, set: values });
  return record;
}

/**
 * One task, materialised. Idempotent: the key is `obs-<task_id>` and the record is a pure
 * function of the row, so calling this twice writes the same row twice and changes nothing.
 */
export async function recordObservation(
  taskId: bigint,
  deps: ObservationDeps = {},
): Promise<Observation | null> {
  const db = deps.db ?? getDb();
  const chain = deps.chain ?? getChain();

  const [task] = await db.select().from(tasks).where(eq(tasks.taskId, taskId)).limit(1);
  if (!task) return null;

  const built = await buildFor(db, chain, task, await resolvedToBuyerBy(db, [task]));
  return built ? write(db, task, built) : null;
}

async function buildFor(
  db: Db,
  chain: ChainReader,
  task: TaskRow,
  resolutions: Map<string, boolean>,
): Promise<Observation | null> {
  if (!task.worker) return null;

  const proof = task.proofHash
    ? ((await db.select().from(proofs).where(eq(proofs.hash, task.proofHash)).limit(1))[0] ?? null)
    : null;

  const { seeded, nullifier } = await workerFacts(chain, task.worker);
  const resolvedToBuyer = resolutions.get(task.taskId.toString());

  return buildObservation({
    task,
    proof,
    workerSeeded: seeded,
    workerNullifier: nullifier,
    ...(resolvedToBuyer === undefined ? {} : { resolvedToBuyer }),
  });
}

/** At most this many tasks per pass, so a first call on a full table is still one request. */
export const SYNC_BATCH = 200;

/**
 * Lazy materialisation: every completed task that has no observation row yet gets one.
 *
 * The same shape as the escrow's lazy claim expiry — there is no keeper process, so the work
 * happens because somebody loaded a page. One query finds the gap (a left join on the
 * primary key, `null` where the row is missing); the pass is bounded, so a caller waits on a
 * fixed amount of work whatever the backlog is.
 */
export async function syncObservations(deps: ObservationDeps = {}): Promise<Observation[]> {
  const db = deps.db ?? getDb();
  const chain = deps.chain ?? getChain();

  const pending = await db
    .select({ task: tasks })
    .from(tasks)
    .leftJoin(observations, eq(observations.taskId, tasks.taskId))
    .where(and(inArray(tasks.state, [...COMPLETED_STATES]), isNull(observations.observationId)))
    .orderBy(desc(tasks.releasedAt))
    .limit(SYNC_BATCH);

  const rows = pending.map((r) => r.task);
  const resolutions = await resolvedToBuyerBy(db, rows);

  const written: Observation[] = [];
  for (const task of rows) {
    const built = await buildFor(db, chain, task, resolutions);
    if (built) written.push(await write(db, task, built));
  }
  return written;
}

/**
 * The `claimed_open`/`claimed_hours`/`source` behind the tasks named, read from the private
 * `spec_json`. It goes into `listingDelta` and comes back out as two integers — the buyer's
 * claim about a place never reaches a response.
 */
export async function listingSpecsFor(
  db: Db,
  taskIds: readonly bigint[],
): Promise<Map<string, ListingSpec>> {
  const out = new Map<string, ListingSpec>();
  if (taskIds.length === 0) return out;

  const rows = await db
    .select({ taskId: tasks.taskId, taskType: tasks.taskType, specJson: tasks.specJson })
    .from(tasks)
    .where(inArray(tasks.taskId, [...taskIds]));

  for (const row of rows) {
    if (taskTypeOf(row.taskType) !== 'verify-open') continue;
    const spec = row.specJson as Record<string, unknown>;
    out.set(row.taskId.toString(), {
      claimed_open: typeof spec.claimed_open === 'boolean' ? spec.claimed_open : null,
      claimed_hours: typeof spec.claimed_hours === 'string' ? spec.claimed_hours : null,
      source: (typeof spec.source === 'string' ? spec.source : 'none') as ListingSource,
    });
  }
  return out;
}
