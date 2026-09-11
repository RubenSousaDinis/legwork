// OWNER: T-19
/**
 * What a stranger is allowed to see.
 *
 * Every object here is assembled field by field. Spreading a task row would be one keystroke
 * and would publish every private column the schema marks as such — the raw spec, the exact
 * coordinate, the buyer token digest, the payer, the agent id and the payment nonce — so the
 * allowlist is not a style preference, it is the privacy control. A public coordinate is
 * always the rounded one; a public answer is the enum, never the worker's note; a public
 * proof never carries a URL.
 */
import { getConfig } from '@/src/config';
import { round100m } from '@/src/services/geo';
import { rehash } from '@/src/services/proofStore';
import {
  answerOf,
  statusOf,
  taskTypeName,
  txSetOf,
  type ProofRow,
  type TaskRow,
  type TxSet,
} from '@/src/services/statusBus';
import { fromUsdcUnits, type TaskType } from '@legwork/shared';

/** Base Sepolia's explorer. Every hash on a public surface is a link somebody can follow. */
export const EXPLORER_TX = 'https://sepolia.basescan.org/tx/';

export const PUBLIC_RATE_LIMIT = { limit: 60, windowS: 60 } as const;

/**
 * Shared-cache policy for the public reads.
 *
 * These endpoints are polled, not requested once: the dashboard's present canvas asks four of
 * them on every tick, and it does that per viewer. `max-age` alone only talks to the browser,
 * so every viewer's every tick used to reach Postgres. On 2026-09-10 that emptied the
 * connection pool and *every* query started failing — the feed, the screening log, the caps
 * count, the idempotency insert — while `/healthz` still answered from a warm connection.
 *
 * `s-maxage` is what the CDN reads, and it collapses N viewers into one origin hit per window.
 * `stale-while-revalidate` means the refresh never blocks a viewer. `stale-if-error` is the one
 * that matters most here: where the CDN honours it, a struggling origin serves the last good
 * answer instead of a 500, which is exactly the failure this comment exists because of.
 *
 * The windows are chosen per endpoint from how fast the underlying number can actually move,
 * not from a single default — a board that lags three seconds is fine, a worker count that
 * lags thirty is fine, and a 500 is not.
 */
export interface CachePolicy {
  /** Seconds the shared cache may serve without asking the origin. */
  sMaxAge: number;
  /** Seconds it may keep serving a stale answer while it refreshes in the background. */
  staleWhileRevalidate: number;
}

export function cacheControl(policy: CachePolicy): string {
  return [
    'public',
    `s-maxage=${policy.sMaxAge}`,
    `stale-while-revalidate=${policy.staleWhileRevalidate}`,
    `stale-if-error=${policy.staleWhileRevalidate}`,
  ].join(', ');
}

/** The board and one task: they carry the beat a demo is watching, so they stay tight. */
export const CACHE_LIVE: CachePolicy = { sMaxAge: 3, staleWhileRevalidate: 60 };

/** Worker counts move on a seven-day window; a refusal tally moves when someone is refused. */
export const CACHE_SLOW: CachePolicy = { sMaxAge: 30, staleWhileRevalidate: 300 };

/** External posters change when a stranger posts, which so far is never. */
export const CACHE_RARE: CachePolicy = { sMaxAge: 60, staleWhileRevalidate: 600 };

export const PUBLIC_CACHE_CONTROL = cacheControl(CACHE_LIVE);

export interface PublicProofView {
  hash: string;
  hash_ok: boolean;
  captured_at: string;
  coordinate_rounded?: { lat: number; lon: number };
  gps_unavailable: boolean;
}

export interface PublicTaskView {
  task_id: string;
  state: string;
  task_type: TaskType;
  /** The posted rate the worker keeps: 3.00. The dashboard renders `3.00 + 0.45 = 3.45`. */
  price_usdc: number;
  fee_usdc: number;
  area: string;
  seeded: boolean;
  posted_at: string;
  claimed_at?: string;
  submitted_at?: string;
  released_at?: string;
  answer?: string;
  proof?: PublicProofView;
  /** Task place through `round100m`. Absent when the private row has no coordinate. */
  coordinate_rounded?: { lat: number; lon: number };
  /** Agent-supplied locality text from the envelope — never the POI's own name. */
  locality?: string;
  /** Agent-supplied ISO country from the envelope. */
  country?: string;
  tx: TxSet;
  links: TxSet;
  dashboard_url: string;
}

/** A response every public route shares: cheap to cache, never a private byte in it. */
export function publicJson(body: unknown, policy: CachePolicy = CACHE_LIVE): Response {
  return Response.json(body, { headers: { 'cache-control': cacheControl(policy) } });
}

function linksOf(tx: TxSet): TxSet {
  return Object.fromEntries(
    Object.entries(tx).map(([key, hash]) => [key, `${EXPLORER_TX}${hash}`]),
  ) as TxSet;
}

export async function publicTaskView(
  row: TaskRow,
  proofRow: ProofRow | null,
): Promise<PublicTaskView> {
  const tx = txSetOf(row);

  let proof: PublicProofView | undefined;
  if (row.proofHash && proofRow) {
    const hasGps =
      !proofRow.gpsUnavailable && proofRow.exactLat !== null && proofRow.exactLon !== null;
    proof = {
      hash: row.proofHash,
      // Re-hashed here, at response time, on every request. A `hash_ok` read from a column
      // would be a claim about a check somebody ran once.
      hash_ok: (await rehash(row.proofHash)).hash_ok,
      captured_at: proofRow.capturedAt.toISOString(),
      ...(hasGps
        ? {
            coordinate_rounded: round100m(Number(proofRow.exactLat), Number(proofRow.exactLon)),
          }
        : {}),
      gps_unavailable: proofRow.gpsUnavailable,
    };
  }

  const hasTaskGps = row.exactLat !== null && row.exactLon !== null;
  const place = (row.specJson as { place?: { locality?: string; country?: string } }).place;
  const locality =
    place && typeof place.locality === 'string' && typeof place.country === 'string'
      ? place.locality
      : undefined;
  const country =
    place && typeof place.locality === 'string' && typeof place.country === 'string'
      ? place.country
      : undefined;

  return {
    task_id: row.taskId.toString(),
    state: statusOf(row),
    task_type: taskTypeName(row.taskType),
    price_usdc: fromUsdcUnits(row.amountUnits),
    fee_usdc: fromUsdcUnits(row.feeUnits),
    area: row.area,
    seeded: row.seeded,
    posted_at: row.postedAt.toISOString(),
    ...(row.claimedAt ? { claimed_at: row.claimedAt.toISOString() } : {}),
    ...(row.submittedAt ? { submitted_at: row.submittedAt.toISOString() } : {}),
    ...(row.releasedAt ? { released_at: row.releasedAt.toISOString() } : {}),
    // The enum only, and only once the worker has answered. The note is the buyer's to
    // read, wrapped as untrusted data; it is never on a public surface.
    ...(answerOf(row) ? { answer: answerOf(row)?.answer } : {}),
    ...(proof ? { proof } : {}),
    ...(hasTaskGps
      ? { coordinate_rounded: round100m(Number(row.exactLat), Number(row.exactLon)) }
      : {}),
    ...(locality !== undefined && country !== undefined ? { locality, country } : {}),
    tx,
    links: linksOf(tx),
    dashboard_url: `${getConfig().DASHBOARD_URL ?? 'http://localhost:3000'}/task/${row.taskId.toString()}`,
  };
}
