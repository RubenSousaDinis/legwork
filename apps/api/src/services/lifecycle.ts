/**
 * The worker's path through a task, and the shared vocabulary the routes above it speak.
 *
 * ## Routes served from this file (T-17 PR1)
 *
 * | Route | Auth | Body / query | 200 | Other |
 * |---|---|---|---|---|
 * | `GET /tasks/list?area=&lat=&lon=` | worker-session | — | `{tasks: WorkerTaskRow[]}` | — |
 * | `POST /tasks/:id/claim` | worker-session | — | `{tx, claim_expires_at, submit_deadline}` | 403 `forbidden`; 409 `{error: 'InCooldown', cooldown_until}` / `{error: 'AlreadyClaimed', active_task_id?}` / `{error: 'SeededCannotClaimExternal'}` |
 * | `POST /tasks/:id/release-claim` | worker-session | — | `{tx}` | 409 `conflict` |
 * | `POST /tasks/:id/submit` | worker-session | `{proofHash?, …per-type proof}` | `{tx, status: 'submitted'}` | 400 `invalid_request`; 409 `conflict` |
 * | `POST /tasks/:id/report` | worker-session | `{class}` | `{recorded: true}` | 404 |
 * | `GET /me/earnings` | worker-session | — | `{released_usdc, completed, score, distinct_raters}` | — |
 *
 * Three rules hold across all six.
 *
 * **The chain is the truth.** Every write goes out through the adapter's relayer methods —
 * `claimFor`, `releaseClaimFor`, `submitFor` — which `LiveChain` sends through `TxQueue` and
 * nothing else. After the write the row is re-read with `chain.getTask` and mirrored by
 * `mirrorFromChain`; no route ever guesses a state from the request it just served.
 *
 * **The worker sees the errand, never the buyer's claim about it.** `workerBrief` is the only
 * spec-derived text that leaves the server, it goes only to a worker-session, and it carries
 * the place and the question — never `claimed_open`, `claimed_hours`, `claimed_state` or
 * `source`. A worker who has been told the answer is not observing anything.
 *
 * **The worker's number is 3.00.** `price_usdc` is `tasks.amount_units`, which is what the
 * escrow pays the worker; the 15 % fee sits in `fee_units` on top and is the buyer's concern.
 *
 * The reuse and geofence checks that turn a submit into an auto-dispute live in
 * `proofChecks.ts`; the pass that pushes expirable and auto-releasable tasks forward is
 * `sweeper.ts`, and `reconcile.ts` is the mirror it runs first. `settleIfEligible` below is
 * that pass for one task, which is what `GET /tasks/:id` (T-19) calls on a status read.
 */
import {
  TASK_STATE,
  TASK_TYPES,
  TASK_TYPE_BIT,
  CALL_CONFIRM_TEMPLATES,
  fromUsdcUnits,
  taskStateName,
  type CallTemplateId,
  type TaskStateName,
  type TaskType,
} from '@legwork/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getChain } from '../chain';
import { getDb } from '../db/client';
import { tasks } from '../db/schema';
import { ApiError } from '../errors';
import { logger } from '../log';
import { distanceM } from './geo';

/** A `tasks` row, exactly as the frozen schema declares it. */
export type TaskRow = typeof tasks.$inferSelect;

/**
 * The shape `ChainAdapter.getTask` returns. Declared structurally rather than imported so
 * that `apps/api/src/chain.ts` stays the one module in this app that names `@legwork/chain`.
 */
export interface ChainTask {
  taskType: number;
  buyer: string;
  worker: string;
  state: number;
  postedAt: bigint;
  claimedAt: bigint;
  submittedAt: bigint;
  claimTTL: number;
  submitTTL: number;
  disputeWindow: number;
  proofHash: string;
}

/**
 * Every `error` name `ITaskEscrow` can revert with. `ChainRevert` puts the contract's name on
 * `Error.name`, so a revert is recognised by that name and not by an `instanceof` that would
 * drag the chain package into a route bundle.
 */
export const ESCROW_REVERTS = new Set([
  'AlreadyClaimed', 'AmountOutOfRange', 'AttestationExpired', 'AttestationUsed', 'BadAttestation',
  'BadClass', 'BadState', 'BadTaskType', 'DisputeWindowClosed', 'DisputeWindowOpen',
  'DuplicateNullifier', 'EnforcedPause', 'ERC20InsufficientBalance', 'HasActiveClaim',
  'InCooldown', 'MarkCooldown', 'NotBuyer', 'NotClaimant', 'NotExpired', 'NotWorker',
  'OverOpenCap', 'SeededCannotClaimExternal', 'SubmitWindowClosed', 'UnknownNullifier',
  'WorkerAlreadyBound',
]);

/** The contract's own error name, or `undefined` when this was not a revert. */
export function revertName(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  return ESCROW_REVERTS.has(err.name) ? err.name : undefined;
}

// ---------------------------------------------------------------- small conversions

/** `tasks.state` is the lowercase wire status; the chain speaks ordinals. Never compared raw. */
export function dbState(state: number): string {
  return taskStateName(state).toLowerCase();
}

export function stateName(row: Pick<TaskRow, 'state'>): TaskStateName {
  const name = (Object.keys(TASK_STATE) as TaskStateName[]).find(
    (n) => n.toLowerCase() === row.state.toLowerCase(),
  );
  if (!name) throw new Error(`unknown task state: ${row.state}`);
  return name;
}

/** `tasks.task_type` is the on-chain bit, not an index. */
export function taskTypeOf(bit: number): TaskType {
  const type = TASK_TYPES.find((t) => TASK_TYPE_BIT[t] === bit);
  if (!type) throw new Error(`unknown task type bit: ${bit}`);
  return type;
}

export const secondsToDate = (seconds: bigint): Date => new Date(Number(seconds) * 1000);
export const dateToSeconds = (date: Date): bigint => BigInt(Math.floor(date.getTime() / 1000));

const numberOrNull = (value: string | null): number | null =>
  value === null ? null : Number(value);

// ---------------------------------------------------------------- loading and mirroring

/** The row, or the 404 every route here would otherwise have to spell out itself. */
export async function loadTask(taskId: bigint): Promise<TaskRow> {
  const rows = await getDb().select().from(tasks).where(eq(tasks.taskId, taskId)).limit(1);
  const row = rows[0];
  if (!row) throw ApiError.of('not_found');
  return row;
}

/** Case-insensitive: an address from a JWT and one from a chain read differ in checksum only. */
export const sameAddress = (a: string | null | undefined, b: string | null | undefined): boolean =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/**
 * Writes the chain's answer over the row and returns what the row now says.
 *
 * Only the six mirrored columns move, plus whichever transaction hash the caller just
 * produced. Everything else on a task — the spec, the payer, the buyer token — belongs to
 * whoever wrote it and is not the chain's to overwrite.
 */
export async function mirrorFromChain(
  row: TaskRow,
  chainTask: ChainTask,
  tx?: { claim?: string; submit?: string; release?: string },
): Promise<TaskRow> {
  const state = dbState(chainTask.state);
  const zeroHash = /^0x0{64}$/.test(chainTask.proofHash);
  const isZeroAddress = /^0x0{40}$/.test(chainTask.worker);

  const patch = {
    state,
    worker: isZeroAddress ? null : chainTask.worker,
    claimedAt: chainTask.claimedAt === 0n ? null : secondsToDate(chainTask.claimedAt),
    submittedAt: chainTask.submittedAt === 0n ? null : secondsToDate(chainTask.submittedAt),
    proofHash: zeroHash ? null : chainTask.proofHash,
    ...(state === 'released' && !row.releasedAt ? { releasedAt: new Date() } : {}),
    ...(tx?.claim ? { txClaim: tx.claim } : {}),
    ...(tx?.submit ? { txSubmit: tx.submit } : {}),
    ...(tx?.release ? { txRelease: tx.release } : {}),
    updatedAt: new Date(),
  };

  const updated = await getDb()
    .update(tasks)
    .set(patch)
    .where(eq(tasks.taskId, row.taskId))
    .returning();
  return updated[0] ?? { ...row, ...patch };
}

// ---------------------------------------------------------------- claimability

export interface ClaimBlock {
  error: 'InCooldown' | 'AlreadyClaimed' | 'SeededCannotClaimExternal';
  cooldown_until?: string;
  active_task_id?: string;
}

export interface ClaimPreflight {
  cooldownUntil: bigint;
  activeClaim: bigint;
  isSeeded: boolean;
  buyerAllowlisted: boolean;
}

/**
 * The pre-checks, in T-01 §2's order, from chain reads only.
 *
 * Returns the 409 body to send, or `undefined` when the claim may go to the relayer. The
 * contract runs the same checks again and reverts with the same names — this is the pass that
 * saves a worker the gas and the wait, never the pass that decides.
 */
export function assertClaimableBy(
  chainTask: ChainTask,
  now: bigint,
  pre: ClaimPreflight,
): ClaimBlock | undefined {
  if (pre.cooldownUntil > now) {
    return { error: 'InCooldown', cooldown_until: secondsToDate(pre.cooldownUntil).toISOString() };
  }
  if (pre.activeClaim !== 0n) {
    return { error: 'AlreadyClaimed', active_task_id: pre.activeClaim.toString() };
  }
  if (pre.isSeeded && !pre.buyerAllowlisted) return { error: 'SeededCannotClaimExternal' };
  if (!isClaimable(chainTask, now)) return { error: 'AlreadyClaimed' };
  return undefined;
}

/** `Open`, or a `Claimed` whose claim TTL has run out — the contract's own lazy expiry. */
export function isClaimable(chainTask: ChainTask, now: bigint): boolean {
  if (chainTask.state === TASK_STATE.Open) return true;
  return chainTask.state === TASK_STATE.Claimed && now > chainTask.claimedAt + BigInt(chainTask.claimTTL);
}

/**
 * The row's own view of the same lazy expiry: a `claimed` task whose claim TTL has run out.
 * The list route asks this of a mirrored row; `isClaimable` asks it of the chain's answer.
 */
export function rowIsExpirable(row: Pick<TaskRow, 'state' | 'claimedAt' | 'claimTtlS'>, now: bigint): boolean {
  if (stateName(row) !== 'Claimed' || !row.claimedAt) return false;
  return now > dateToSeconds(row.claimedAt) + BigInt(row.claimTtlS);
}

/** `claimedAt + claimTTL` and `claimedAt + submitTTL`, as the ISO instants the mini-app counts down to. */
export function claimDeadlines(chainTask: ChainTask): {
  claim_expires_at: string;
  submit_deadline: string;
} {
  return {
    claim_expires_at: secondsToDate(chainTask.claimedAt + BigInt(chainTask.claimTTL)).toISOString(),
    submit_deadline: secondsToDate(chainTask.claimedAt + BigInt(chainTask.submitTTL)).toISOString(),
  };
}

// ---------------------------------------------------------------- lazy settlement

/** What a task has outrun, if anything. `null` means the deadlines are still in the future. */
export type EligibleAction = 'expire' | 'autoRelease';

/**
 * The one predicate the sweeper, `POST /admin/sweep` and T-19's status read all share.
 *
 * The comparisons mirror `ITaskEscrow` exactly — `>=` for the dispute window, `>` for both
 * expiries. Offering a settlement the contract then reverts on is worse than waiting one more
 * second for it, so this is deliberately never the more generous of the two operators.
 */
export function eligibleAction(
  row: Pick<
    TaskRow,
    'state' | 'postedAt' | 'claimedAt' | 'submittedAt' | 'claimTtlS' | 'submitTtlS' | 'disputeWindowS'
  >,
  now: bigint,
): EligibleAction | null {
  switch (stateName(row)) {
    case 'Submitted':
      if (!row.submittedAt) return null;
      return now >= dateToSeconds(row.submittedAt) + BigInt(row.disputeWindowS) ? 'autoRelease' : null;
    case 'Open':
      return now > dateToSeconds(row.postedAt) + BigInt(row.claimTtlS) ? 'expire' : null;
    case 'Claimed':
      if (!row.claimedAt) return null;
      return now > dateToSeconds(row.claimedAt) + BigInt(row.submitTtlS) ? 'expire' : null;
    default:
      return null;
  }
}

export interface Settlement {
  action: EligibleAction;
  tx: string;
}

/**
 * The sweep, for one task. A status read calls it, so a worker's money can arrive because
 * somebody looked at the page — there is no keeper process and nothing waits on a cron.
 *
 * The chain is asked first and the row is mirrored from the answer, because the deadline
 * arithmetic is only worth running against state the chain agrees with; a mirror that drifted
 * would otherwise offer a settlement that reverts. A revert here is logged and swallowed: this
 * is opportunistic work on somebody else's request, and it must never be the reason their
 * request fails.
 *
 * (`chain.getTask` + `mirrorFromChain` is `reconcileTask` inlined. `reconcile.ts` imports this
 * module, so importing it back would close a cycle for two lines.)
 */
export async function settleIfEligible(taskId: bigint): Promise<Settlement | null> {
  const rows = await getDb().select().from(tasks).where(eq(tasks.taskId, taskId)).limit(1);
  let row = rows[0];
  if (!row) return null;

  const chain = getChain();
  const [now, chainTask] = await Promise.all([chain.now(), chain.getTask(taskId)]);
  row = await mirrorFromChain(row, chainTask);

  const action = eligibleAction(row, now);
  if (!action) return null;

  let tx: { hash: string };
  try {
    tx = action === 'autoRelease' ? await chain.autoRelease(taskId) : await chain.expire(taskId);
  } catch (err) {
    // Two readers racing the same deadline is the normal case, not an error worth surfacing.
    logger.warn({ task_id: taskId.toString(), action, revert: revertName(err) }, 'settle_skipped');
    return null;
  }

  await mirrorFromChain(row, await chain.getTask(taskId));
  return { action, tx: tx.hash };
}

// ---------------------------------------------------------------- the worker's view

export interface BriefPlace {
  name: string;
  street_address: string;
  locality: string;
}

/** Only ever these keys. The buyer's own claim about the place is not one of them. */
export interface WorkerBrief {
  place?: BriefPlace;
  question?: string;
  subject?: string;
  subject_detail?: string;
  phone?: string;
  template_question?: string;
  slots?: Record<string, string>;
  a?: unknown;
  b?: unknown;
  criterion_id?: string;
}

interface SpecPlace {
  place_id?: unknown;
  name?: unknown;
  street_address?: unknown;
  locality?: unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function briefPlace(spec: Record<string, unknown>): BriefPlace | undefined {
  const place = spec.place as SpecPlace | undefined;
  if (!place) return undefined;
  return {
    name: str(place.name),
    street_address: str(place.street_address),
    locality: str(place.locality),
  };
}

/** The place this task observes, as its OSM id. `compare-two` judges two items and has none. */
export function placeIdOf(row: Pick<TaskRow, 'specJson'>): string | undefined {
  const place = (row.specJson as Record<string, unknown>).place as SpecPlace | undefined;
  const id = place?.place_id;
  return typeof id === 'string' ? id : undefined;
}

/** `Do you have <item> in stock?` with the buyer's slot filled in — never buyer prose. */
export function templateQuestion(
  templateId: CallTemplateId,
  slots: Record<string, string>,
): string {
  const template = CALL_CONFIRM_TEMPLATES[templateId];
  let question: string = template.question;
  for (const [key, value] of Object.entries(slots)) question = question.replaceAll(`<${key}>`, value);
  return question;
}

/**
 * What a worker is shown about an errand.
 *
 * Built key by key rather than by deleting from the spec: a spread with four deletions would
 * silently start leaking the day a fifth field is added to a spec, and this is the boundary
 * where a leak means a worker was told what to find.
 */
export function workerBrief(row: Pick<TaskRow, 'taskType' | 'specJson'>): WorkerBrief {
  const spec = row.specJson as Record<string, unknown>;
  const type = taskTypeOf(row.taskType);

  if (type === 'verify-open') {
    return { place: briefPlace(spec), question: str(spec.question) };
  }
  if (type === 'photo-of') {
    return {
      place: briefPlace(spec),
      subject: str(spec.subject),
      ...(typeof spec.subject_detail === 'string' ? { subject_detail: spec.subject_detail } : {}),
    };
  }
  if (type === 'call-confirm') {
    const slots = (spec.slots ?? {}) as Record<string, string>;
    return {
      place: briefPlace(spec),
      phone: str(spec.phone),
      template_question: templateQuestion(spec.template_id as CallTemplateId, slots),
      slots,
    };
  }
  return { a: spec.a, b: spec.b, criterion_id: str(spec.criterion_id) };
}

/** `photo-of · Padaria Central · Rua Direita 12`; a `compare-two` has a criterion, not a place. */
export function titleOf(row: Pick<TaskRow, 'taskType' | 'specJson'>): string {
  const spec = row.specJson as Record<string, unknown>;
  const type = taskTypeOf(row.taskType);
  if (type === 'compare-two') return `compare-two · ${str(spec.criterion_id)}`;
  const place = briefPlace(spec);
  return `${type} · ${place?.name ?? ''} · ${place?.street_address ?? ''}`;
}

// ---------------------------------------------------------------- distance

/** The exact coordinate of a task's place. Private: it is used here and never serialised. */
export function taskCoordinate(
  row: Pick<TaskRow, 'exactLat' | 'exactLon'>,
): { lat: number; lon: number } | undefined {
  const lat = numberOrNull(row.exactLat);
  const lon = numberOrNull(row.exactLon);
  return lat === null || lon === null ? undefined : { lat, lon };
}

// ---------------------------------------------------------------- the list row

export interface WorkerTaskRow {
  task_id: string;
  task_type: TaskType;
  title: string;
  price_usdc: number;
  distance_m?: number;
  claim_expires_in_s?: number;
  state: string;
  seeded: boolean;
  brief: WorkerBrief;
}

export interface ListRowOptions {
  /** The caller's coordinate, when the mini-app sent one. */
  from?: { lat: number; lon: number };
  /** `true` when this row is the caller's own live claim, which the list always resumes. */
  ownClaim?: boolean;
  now: bigint;
  seeded: boolean;
}

/**
 * One row of `GET /tasks/list`.
 *
 * A claim whose TTL has run out is shown as `open` with `claim_expires_in_s: 0` — that is what
 * it is to everyone but the stale claimant, and the next claim clears it on the way past.
 */
export function toWorkerTaskRow(row: TaskRow, options: ListRowOptions): WorkerTaskRow {
  const own = options.ownClaim === true;
  const coordinate = taskCoordinate(row);
  const distance =
    options.from && coordinate ? Math.round(distanceM(options.from, coordinate)) : undefined;

  let claimExpiresInS: number | undefined;
  if (own && row.claimedAt) {
    const expiresAt = dateToSeconds(row.claimedAt) + BigInt(row.claimTtlS);
    claimExpiresInS = Math.max(0, Number(expiresAt - options.now));
  } else if (stateName(row) === 'Claimed') {
    claimExpiresInS = 0;
  }

  return {
    task_id: row.taskId.toString(),
    task_type: taskTypeOf(row.taskType),
    title: titleOf(row),
    // The worker's amount, never the buyer's total: 3.00 against a 3.45 lock.
    price_usdc: fromUsdcUnits(row.amountUnits),
    ...(distance === undefined ? {} : { distance_m: distance }),
    ...(claimExpiresInS === undefined ? {} : { claim_expires_in_s: claimExpiresInS }),
    state: own ? 'claimed' : 'open',
    seeded: options.seeded,
    brief: workerBrief(row),
  };
}

/**
 * Candidate rows for the list: everything open or claimed in the area, narrowed in memory to
 * the three cases §2 names. The board is small by design — a buyer may hold five open tasks —
 * so the time arithmetic is done here, against the chain's clock, rather than in SQL against
 * the database's.
 */
export async function listCandidates(area?: string): Promise<TaskRow[]> {
  const open = inArray(tasks.state, ['open', 'claimed']);
  return getDb()
    .select()
    .from(tasks)
    .where(area ? and(open, eq(tasks.area, area)) : open)
    .orderBy(sql`${tasks.postedAt} desc`);
}
