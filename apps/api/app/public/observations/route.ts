/**
 * `GET /public/observations` — the record wall, and the one line the deck promises.
 *
 * Two things are served together on purpose. `delta` is the sentence — "we checked N places;
 * the listing was wrong about M" — over real observations only; `observations` is the rows
 * behind it, so the number is never a claim a reader has to take on faith.
 *
 * The response is assembled field by field from `PublicObservation`, which is the frozen
 * `Observation` **minus** the worker's nullifier, plus `worker_verified`. Spreading a row
 * would be one keystroke and would publish that nullifier — and a nullifier-keyed movement
 * history is the one thing 10-schemas §8 refuses outright. There is no coordinate here at
 * all: the record never carried one, so `PUBLIC_COORD_DECIMALS` has nothing to round.
 *
 * `syncObservations` runs first. There is no keeper process, so a completed task becomes an
 * observation because somebody loaded this page — the same lazy shape as the escrow's claim
 * expiry.
 */
import { OSM_PLACE_ID, type PublicObservation } from '@legwork/shared';
import { and, desc, eq } from 'drizzle-orm';
import { route, preflight } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { ApiError } from '@/src/errors';
import { getDb } from '@/src/db/client';
import { observations } from '@/src/db/schema';
import {
  listingDelta,
  listingSpecsFor,
  syncObservations,
  toObservation,
  type ListingDelta,
} from '@/src/services/observations';
import { PUBLIC_RATE_LIMIT } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Rows are small and the sentence moves slowly; half a minute of cache is honest. */
const CACHE_CONTROL = 'public, max-age=30';

/** How many rows come back with the delta. */
const PAGE_SIZE = 50;

/** How far back the sentence counts. One place counts once, so this is places, not tasks. */
const DELTA_SCAN = 2000;

/** The `Observation`, minus the nullifier, plus what a reader actually wants to know. */
export interface PublicObservationView extends PublicObservation {
  /** A real human behind a verified registration. `false` is a seeded demo row, always chipped. */
  worker_verified: boolean;
}

export interface ObservationsResponse {
  place_id?: string;
  delta: ListingDelta;
  observations: PublicObservationView[];
  /**
   * Rendered beside the sentence, never as fine print. Called `disclosure` and not `note`
   * because `note` is the worker's free text, which never reaches a public surface — one key
   * name, one meaning.
   */
  disclosure: string;
}

export const DELTA_DISCLOSURE = 'real observations only; seeded rows excluded';

/**
 * Built key by key from the nine fields, never by deleting from a row: a spread with one
 * deletion would silently start leaking the day a tenth column is added, and this is the
 * boundary where a leak is a movement history.
 */
function publicView(row: ReturnType<typeof toObservation>): PublicObservationView {
  return {
    observation_id: row.observation_id,
    place_key: row.place_key,
    claim: { type: row.claim.type, value: row.claim.value },
    evidence_hash: row.evidence_hash,
    observed_at: row.observed_at,
    confidence: row.confidence,
    task_id: row.task_id,
    seeded: row.seeded,
    worker_verified: !row.seeded,
  };
}

export const GET = route(async (req) => {
  rateLimit(`public:${clientKey(req)}`, PUBLIC_RATE_LIMIT);

  const url = new URL(req.url);
  const placeId = url.searchParams.get('place_id');
  if (placeId !== null && !OSM_PLACE_ID.test(placeId)) {
    throw ApiError.of('invalid_request', {
      field: 'place_id',
      reason: 'an OpenStreetMap id: node/…, way/… or relation/…',
    });
  }
  const includeSeeded = url.searchParams.get('include_seeded') === '1';

  // Lazy materialisation, before the read: a task released a second ago is a record now.
  const db = getDb();
  await syncObservations({ db });

  // The sentence is about the whole corpus and never about the filter — `place_id` narrows
  // the rows a reader is looking at, not the number the deck reads out loud.
  const real = (
    await db
      .select()
      .from(observations)
      .where(and(eq(observations.seeded, false), eq(observations.claimType, 'open_now')))
      .orderBy(desc(observations.observedAt))
      .limit(DELTA_SCAN)
  ).map(toObservation);

  const specs = await listingSpecsFor(db, real.map((row) => BigInt(row.task_id)));
  const delta = listingDelta(real, specs);

  const filters = [
    ...(placeId === null ? [] : [eq(observations.placeKey, placeId)]),
    ...(includeSeeded ? [] : [eq(observations.seeded, false)]),
  ];
  const rows = await db
    .select()
    .from(observations)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(observations.observedAt))
    .limit(PAGE_SIZE);

  const body: ObservationsResponse = {
    ...(placeId === null ? {} : { place_id: placeId }),
    delta,
    observations: rows.map((row) => publicView(toObservation(row))),
    disclosure: DELTA_DISCLOSURE,
  };
  return Response.json(body, { headers: { 'cache-control': CACHE_CONTROL } });
});

export const OPTIONS = preflight;
