/**
 * The read side of the task API, and the one place a worker's text becomes a `WorkerAnswer`.
 *
 * Routes served on top of this module (T-19):
 *
 * | Method | Path | Auth | Answers |
 * |---|---|---|---|
 * | GET  | `/tasks/:id?wait=0..50` | public (+ optional `X-Buyer-Token`) | `TaskView` + `changed` + `poll_after_seconds`; `ETag` / `If-None-Match` |
 * | POST | `/tasks/:id/approve`    | buyer token | `{task_id, status:'released', tx}` |
 * | POST | `/tasks/:id/dispute`    | buyer token | `{task_id, status:'disputed', tx}` |
 * | POST | `/tasks/:id/refund`     | buyer token | `{task_id, status:'refunded', tx}`, 409 until eligible |
 * | GET  | `/public/feed`          | public | last 20 rows, allowlisted fields only |
 * | GET  | `/public/task/:id`      | public | one row, allowlisted fields only |
 * | GET  | `/public/refusals`      | public | six zero-filled classes, recent, demo examples |
 * | GET  | `/public/posters`       | public | external demand |
 * | GET  | `/public/preflight`     | public | the `preflight_workers` shape |
 * | POST | `/admin/{pause,unpause,resolve,reset-demo,reset-worker,seed-demo}` | admin key | `{ok:true, tx?}`, audit-logged |
 *
 * Vercel Hobby kills a function at 60 seconds, so the long poll waits at most 50 and says
 * `changed: false, poll_after_seconds: 1` when it gives up. It never pretends the row moved.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { keccak256 } from 'viem';
import {
  LONGPOLL_MAX_S,
  PUBLIC_COORD_DECIMALS,
  bitmaskToTaskTypes,
  fromUsdcUnits,
  wrapWorkerAnswer,
  type TaskType,
  type WorkerAnswer,
} from '@legwork/shared';
import { getConfig } from '../config';
import type { Db } from '../db/client';
import { proofs, tasks } from '../db/schema';

export type TaskRow = typeof tasks.$inferSelect;
export type ProofRow = typeof proofs.$inferSelect;

/** The three states in which nothing further can happen to a task. */
export const TERMINAL_STATES = ['released', 'refunded', 'resolved'] as const;

/** The four states in which a worker has already answered, so the answer may be shown. */
const ANSWERABLE_STATES = ['submitted', 'released', 'disputed', 'resolved'] as const;

// --------------------------------------------------------------------- stubs

/**
 * TODO(T-17): replace with `settleIfEligible` from `src/services/lifecycle.ts`.
 *
 * The lazy settlement path. `GET /tasks/:id` calls it whenever `eligibleAction` says the
 * task has outrun a deadline, so a status read is what makes an auto-release happen without
 * a cron. Until T-17 merges this returns `null` and the route behaves exactly as it will
 * afterwards, minus the chain call.
 */
export const lifecycle = {
  settleIfEligible: async (_id: bigint): Promise<null> => null,
};

/**
 * TODO(T-18): replace with `rehash` from `src/services/proofStore.ts`, `signProofUrl` from
 * `src/services/signedUrl.ts` and `round100m` from `src/services/geo.ts`.
 *
 * T-18 owns the proof store, the URL signing secret and the rounding helper; none of those
 * three modules exists on `main` yet, and none of them is mine to create. What is here is a
 * seam of the same shape, marked for deletion, so the buyer and public views can be written
 * and tested now and the swap is three imports later. `store` is the in-memory stand-in for
 * `MemoryProofStore`.
 */
export const proofDeps = {
  store: new Map<string, Uint8Array>(),

  /**
   * `hash_ok`: re-hash the bytes we would serve and compare them with the hash the chain
   * anchored. Computed at response time on every request and never written back to a column —
   * a `hash_ok` cached as `true` is a claim about the past, not a check.
   *
   * `task_status` and the proof card re-hash the served file and show "hash matches onchain ✓" —
   * an anchor nobody checks is decoration.
   */
  async rehash(hash: string): Promise<boolean> {
    const bytes = proofDeps.store.get(hash);
    if (!bytes) return false;
    const actual = Buffer.from(keccak256(bytes).slice(2), 'hex');
    const expected = Buffer.from(hash.replace(/^0x/, ''), 'hex');
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  },

  /** A signed, expiring URL into the private bucket. Only a valid buyer token gets one. */
  signProofUrl(hash: string, expiresAtS: number): string {
    const base = getConfig().API_BASE_URL ?? 'http://localhost:3001';
    const mac = createHmac('sha256', getConfig().PROOF_URL_SECRET)
      .update(`${hash}:${expiresAtS}`, 'utf8')
      .digest('hex');
    return `${base}/proofs/${hash}?exp=${expiresAtS}&sig=${mac}`;
  },

  /** The verifier side of `signProofUrl`; the buyer test asserts the URL it was handed. */
  verifyProofUrl(url: string): { ok: boolean; hash: string; expiresAtS: number } {
    const parsed = new URL(url);
    const hash = parsed.pathname.split('/').pop() ?? '';
    const expiresAtS = Number(parsed.searchParams.get('exp'));
    const presented = parsed.searchParams.get('sig') ?? '';
    const expected = createHmac('sha256', getConfig().PROOF_URL_SECRET)
      .update(`${hash}:${expiresAtS}`, 'utf8')
      .digest('hex');
    const ok =
      presented.length === expected.length &&
      timingSafeEqual(Buffer.from(presented, 'hex'), Buffer.from(expected, 'hex'));
    return { ok, hash, expiresAtS };
  },

  /** Three decimals, about 100 metres. The exact coordinate never leaves the private record. */
  round100m(lat: number, lon: number): { lat: number; lon: number } {
    const factor = 10 ** PUBLIC_COORD_DECIMALS;
    return { lat: Math.round(lat * factor) / factor, lon: Math.round(lon * factor) / factor };
  },
};

/** How long after the dispute window a buyer's proof URL stays valid: one hour. */
export const PROOF_URL_GRACE_S = 3600;

// ------------------------------------------------------------------- waiting

/**
 * `?wait=` in seconds. Anything that is not a non-negative number is `0`, and anything above
 * the ceiling is the ceiling — a client that asks for 120 is answered in 50, not refused.
 */
export function parseWait(raw: string | null): number {
  const parsed = parseInt(raw ?? '', 10);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return Math.min(parsed, LONGPOLL_MAX_S);
}

/**
 * A short, stable fingerprint of everything a status reader cares about.
 *
 * Deliberately not `updated_at`: two writes in the same millisecond would look like one, and
 * a row touched without moving would look like a change. These eight fields are exactly what
 * `TaskView` renders, so `changed` is true when and only when the view is different.
 */
export function versionOf(row: TaskRow): string {
  const material = JSON.stringify([
    row.state,
    row.worker,
    row.claimedAt,
    row.submittedAt,
    row.releasedAt,
    row.txClaim,
    row.txSubmit,
    row.txRelease,
  ]);
  return createHash('sha256').update(material, 'utf8').digest('hex').slice(0, 16);
}

/** The only sleep in this module. Tests replace it; nothing else may call `setTimeout`. */
export const deps = {
  sleep: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),
};

export async function readTask(db: Db, taskId: bigint): Promise<TaskRow | undefined> {
  const rows = await db.select().from(tasks).where(eq(tasks.taskId, taskId)).limit(1);
  return rows[0];
}

export async function readProof(db: Db, hash: string): Promise<ProofRow | undefined> {
  const rows = await db.select().from(proofs).where(eq(proofs.hash, hash)).limit(1);
  return rows[0];
}

/**
 * Poll the row once a second until its version moves or the budget runs out.
 *
 * The loop is bounded twice on purpose: `i < maxWaitS` caps the number of database reads
 * even when `deps.sleep` is stubbed to return instantly, and the deadline check caps the
 * wall clock even when a read is slow. Vercel kills the function at 60 seconds and a poll
 * that came back because the platform hung up is indistinguishable from a network fault.
 */
export async function waitForChange(
  db: Db,
  taskId: bigint,
  baseline: string,
  maxWaitS: number,
): Promise<{ row: TaskRow | undefined; changed: boolean }> {
  const deadline = Date.now() + maxWaitS * 1000;
  let row = await readTask(db, taskId);

  for (let i = 0; i < maxWaitS; i++) {
    if (Date.now() >= deadline) break;
    await deps.sleep(1000);
    row = (await readTask(db, taskId)) ?? row;
    if (row && versionOf(row) !== baseline) return { row, changed: true };
  }
  return { row, changed: false };
}

// ------------------------------------------------------------------ deadlines

export type EligibleAction = 'autoRelease' | 'expire';

const epochS = (at: Date | null): number | null => (at ? Math.floor(at.getTime() / 1000) : null);

/**
 * What the escrow would let anybody do to this task right now, in seconds since the epoch.
 *
 * The comparisons mirror `ITaskEscrow` exactly — `>=` for the dispute window, `>` for both
 * expiries — because a route that offers a settlement the contract then reverts on is worse
 * than one that waits a second longer. Pure: T-17's sweeper imports it.
 */
export function eligibleAction(row: TaskRow, nowS: number): EligibleAction | null {
  const state = String(row.state).toLowerCase();

  if (state === 'submitted') {
    const submitted = epochS(row.submittedAt);
    if (submitted !== null && nowS >= submitted + row.disputeWindowS) return 'autoRelease';
    return null;
  }
  if (state === 'open') {
    const posted = epochS(row.postedAt);
    if (posted !== null && nowS > posted + row.claimTtlS) return 'expire';
    return null;
  }
  if (state === 'claimed') {
    const claimed = epochS(row.claimedAt);
    if (claimed !== null && nowS > claimed + row.submitTtlS) return 'expire';
  }
  return null;
}

/** The instant a task becomes eligible for the expiry refund, or `null` if it never will. */
export function expiresAt(row: TaskRow): number | null {
  const state = String(row.state).toLowerCase();
  if (state === 'open') {
    const posted = epochS(row.postedAt);
    return posted === null ? null : posted + row.claimTtlS;
  }
  if (state === 'claimed') {
    const claimed = epochS(row.claimedAt);
    return claimed === null ? null : claimed + row.submitTtlS;
  }
  return null;
}

// ------------------------------------------------------------------- writing

export type TxColumn = 'tx_claim' | 'tx_submit' | 'tx_release';

export interface Transition {
  state: string;
  /** The moment the state was reached; written to that state's timestamp column. */
  at?: Date;
  txColumn?: TxColumn;
  tx?: string;
}

/** Which timestamp column each state owns. `refunded` and `resolved` settle, so both land in `released_at`. */
const TIMESTAMP_COLUMN: Record<string, 'claimed_at' | 'submitted_at' | 'released_at'> = {
  claimed: 'claimed_at',
  submitted: 'submitted_at',
  released: 'released_at',
  refunded: 'released_at',
  resolved: 'released_at',
};

/**
 * The single writer of a task row in this task.
 *
 * Every caller reaches it only after the chain has returned a transaction hash, so the row
 * never claims a settlement that did not happen. `updated_at` moves on every transition;
 * `versionOf` does not read it, so a no-op write cannot fake a `changed`.
 */
export async function applyTransition(
  db: Db,
  taskId: bigint,
  transition: Transition,
): Promise<TaskRow | undefined> {
  const state = transition.state.toLowerCase();
  const column = TIMESTAMP_COLUMN[state];

  await db
    .update(tasks)
    .set({
      state,
      updatedAt: new Date(),
      ...(column === 'claimed_at' && transition.at ? { claimedAt: transition.at } : {}),
      ...(column === 'submitted_at' && transition.at ? { submittedAt: transition.at } : {}),
      ...(column === 'released_at' && transition.at ? { releasedAt: transition.at } : {}),
      ...(transition.txColumn === 'tx_claim' && transition.tx ? { txClaim: transition.tx } : {}),
      ...(transition.txColumn === 'tx_submit' && transition.tx ? { txSubmit: transition.tx } : {}),
      ...(transition.txColumn === 'tx_release' && transition.tx ? { txRelease: transition.tx } : {}),
    })
    .where(eq(tasks.taskId, taskId));

  return readTask(db, taskId);
}

// -------------------------------------------------------------------- viewing

export interface TxSet {
  post?: string;
  claim?: string;
  submit?: string;
  release?: string;
}

export interface ProofView {
  hash: string;
  hash_ok: boolean;
  url?: string;
  captured_at: string;
  coordinate_rounded?: { lat: number; lon: number };
  gps_unavailable: boolean;
}

export interface TaskViewBody {
  task_id: string;
  status: string;
  task_type: TaskType;
  amount_usdc: number;
  fee_usdc: number;
  area: string;
  posted_at: string;
  claimed_at?: string;
  submitted_at?: string;
  released_at?: string;
  answer?: WorkerAnswer;
  proof?: ProofView;
  tx: TxSet;
  dashboard_url: string;
}

/** The on-chain `taskType` is a single bit of the bitmask; the API speaks the name. */
export function taskTypeName(bit: number): TaskType {
  const [name] = bitmaskToTaskTypes(bit);
  if (!name) throw new Error(`unknown task type bit: ${bit}`);
  return name;
}

export const statusOf = (row: TaskRow): string => String(row.state).toLowerCase();

export function dashboardUrl(taskId: bigint): string {
  const base = getConfig().DASHBOARD_URL ?? 'http://localhost:3000';
  return `${base}/task/${taskId.toString()}`;
}

/** Absent keys are omitted; a `tx` field is never `null`, because "null" reads as "failed". */
export function txSetOf(row: TaskRow): TxSet {
  return {
    ...(row.txPost ? { post: row.txPost } : {}),
    ...(row.txClaim ? { claim: row.txClaim } : {}),
    ...(row.txSubmit ? { submit: row.txSubmit } : {}),
    ...(row.txRelease ? { release: row.txRelease } : {}),
  };
}

/**
 * The worker's text, wrapped.
 *
 * `note` is copied exactly as T-17 stored it (already capped at 120 characters) and is never
 * interpolated into another string: the agent receives it as data carrying `_untrusted: true`,
 * which is the whole defence against a worker writing instructions into a note.
 */
export function answerOf(row: TaskRow): WorkerAnswer | undefined {
  if (!ANSWERABLE_STATES.includes(statusOf(row) as (typeof ANSWERABLE_STATES)[number])) return undefined;
  if (!row.answer) return undefined;
  return wrapWorkerAnswer(row.answer, row.note ?? undefined);
}

/**
 * The proof card, re-hashed on every request.
 *
 * `url` appears only under `reveal` — a valid buyer token — and expires one hour after the
 * dispute window closes, which is the last moment the buyer could still act on it.
 */
export async function proofViewOf(
  row: TaskRow,
  proofRow: ProofRow | null,
  options: { reveal: boolean },
): Promise<ProofView | undefined> {
  if (!row.proofHash || !proofRow) return undefined;

  const hasGps = !proofRow.gpsUnavailable && proofRow.exactLat !== null && proofRow.exactLon !== null;
  const submittedAtS = epochS(row.submittedAt) ?? Math.floor(Date.now() / 1000);
  const expiresAtS = submittedAtS + row.disputeWindowS + PROOF_URL_GRACE_S;

  return {
    hash: row.proofHash,
    hash_ok: await proofDeps.rehash(row.proofHash),
    ...(options.reveal ? { url: proofDeps.signProofUrl(row.proofHash, expiresAtS) } : {}),
    captured_at: proofRow.capturedAt.toISOString(),
    ...(hasGps
      ? { coordinate_rounded: proofDeps.round100m(Number(proofRow.exactLat), Number(proofRow.exactLon)) }
      : {}),
    gps_unavailable: proofRow.gpsUnavailable,
  };
}

/**
 * `TaskView` minus `changed` and `poll_after_seconds`, which only the route knows.
 *
 * Built field by field from an allowlist. Nothing here reads `spec_json`, `exact_lat/lon`,
 * `buyer_token_hash`, `payer`, `agent_id` or `auth_nonce`, and spreading the row would be
 * the one edit that quietly undoes that.
 */
export async function buildTaskView(
  row: TaskRow,
  proofRow: ProofRow | null,
  options: { reveal: boolean },
): Promise<TaskViewBody> {
  const answer = answerOf(row);
  const proof = await proofViewOf(row, proofRow, options);

  return {
    task_id: row.taskId.toString(),
    status: statusOf(row),
    task_type: taskTypeName(row.taskType),
    amount_usdc: fromUsdcUnits(row.amountUnits),
    fee_usdc: fromUsdcUnits(row.feeUnits),
    area: row.area,
    posted_at: row.postedAt.toISOString(),
    ...(row.claimedAt ? { claimed_at: row.claimedAt.toISOString() } : {}),
    ...(row.submittedAt ? { submitted_at: row.submittedAt.toISOString() } : {}),
    ...(row.releasedAt ? { released_at: row.releasedAt.toISOString() } : {}),
    ...(answer ? { answer } : {}),
    ...(proof ? { proof } : {}),
    tx: txSetOf(row),
    dashboard_url: dashboardUrl(row.taskId),
  };
}

/** Terminal → stop polling. Gave up waiting → try again at once. Otherwise → three seconds. */
export function pollAfterSeconds(row: TaskRow, changed: boolean, waited: boolean): number {
  if (TERMINAL_STATES.includes(statusOf(row) as (typeof TERMINAL_STATES)[number])) return 0;
  if (waited && !changed) return 1;
  return 3;
}

// ------------------------------------------------------------ chain failures

/**
 * A body for the codes `ApiError` does not carry. `src/errors.ts` owns a closed vocabulary
 * (T-08) and `bad_state`, `not_eligible`, `dispute_window_closed`, `chain_revert` and
 * `chain_unavailable` are the frozen contract's, so these routes return the response rather
 * than widening a file they do not own.
 */
export function fail(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

/**
 * `ChainRevert` carries the contract's error name in both `name` and `message` — nothing
 * else in this stack does, and a viem transport error never does. Matched structurally so
 * `@legwork/chain` keeps being imported from exactly one file, `src/chain.ts`.
 */
export function isChainRevert(err: unknown): err is Error {
  return err instanceof Error && err.name !== 'Error' && err.name === err.message;
}

/**
 * A decoded revert is the contract's answer and belongs in a 409 under its own name. Anything
 * else is the network between us and the node, and saying `chain_unavailable` is honest where
 * a 409 would blame the caller for our RPC.
 */
export function chainFailure(err: unknown): Response {
  if (isChainRevert(err)) return fail(409, { error: 'chain_revert', name: err.name });
  return fail(503, { error: 'chain_unavailable' });
}
