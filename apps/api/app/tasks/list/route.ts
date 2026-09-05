/**
 * `GET /tasks/list?area=&lat=&lon=` — the worker's board.
 *
 * It lives at `/tasks/list` and not at `/tasks` so that `app/tasks/route.ts` stays POST-only
 * and T-16 and T-17 never share a file. See the brief's path note and the INTERFACE REQUEST
 * on the PR.
 */
import { getAddress, isAddress } from 'viem';
import { z } from 'zod';
import { route, preflight } from '@/src/http/route';
import { getChain } from '@/src/chain';
import { requireWorkerSession } from '@/src/session';
import { sweepIfDue } from '@/src/services/sweeper';
import {
  listCandidates,
  rowIsExpirable,
  sameAddress,
  stateName,
  toWorkerTaskRow,
  type WorkerTaskRow,
} from '@/src/services/lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Geohash5 = z.string().regex(/^[0-9b-hjkmnp-z]{5}$/, 'expected a five-character geohash');
const Coordinate = z.coerce.number();

const Query = z.object({
  area: Geohash5.optional(),
  lat: Coordinate.min(-90).max(90).optional(),
  lon: Coordinate.min(-180).max(180).optional(),
});

/** `''` is what an absent query parameter looks like once it has been through a URL. */
function queryOf(url: URL): z.infer<typeof Query> {
  const raw: Record<string, string> = {};
  for (const key of ['area', 'lat', 'lon']) {
    const value = url.searchParams.get(key);
    if (value !== null && value !== '') raw[key] = value;
  }
  return Query.parse(raw);
}

export const GET = route(async (req) => {
  const session = await requireWorkerSession(req);
  const caller = isAddress(session.worker) ? getAddress(session.worker) : session.worker;

  // Whoever loads the board pushes it forward first: an expirable task is stale to everyone
  // reading it, and there is no keeper coming to notice.
  await sweepIfDue();

  const query = queryOf(new URL(req.url));
  const chain = getChain();
  const [now, callerSeeded] = await Promise.all([
    chain.now(),
    isAddress(caller) ? chain.isSeeded(caller) : Promise.resolve(false),
  ]);

  const candidates = await listCandidates(query.area);

  // One `allowlistedBuyer` read per distinct payer per request, not one per row: a board of
  // twenty tasks from one demo payer is one chain call.
  const allowlisted = new Map<string, boolean>();
  const isAllowlisted = async (payer: string): Promise<boolean> => {
    const key = payer.toLowerCase();
    const cached = allowlisted.get(key);
    if (cached !== undefined) return cached;
    const value = isAddress(payer) ? await chain.allowlistedBuyer(getAddress(payer)) : false;
    allowlisted.set(key, value);
    return value;
  };

  const rows: WorkerTaskRow[] = [];
  for (const row of candidates) {
    const own = stateName(row) === 'Claimed' && sameAddress(row.worker, caller);
    // Open, or claimed past its TTL — which is open to everyone but the stale claimant.
    if (!own && stateName(row) !== 'Open' && !rowIsExpirable(row, now)) continue;

    // A seeded worker is demo staff: they may only take tasks from an allowlisted payer, and
    // the board never shows them work they would be refused at the door.
    const seeded = await isAllowlisted(row.payer);
    if (callerSeeded && !seeded) continue;

    rows.push(
      toWorkerTaskRow(row, {
        now,
        seeded,
        ownClaim: own,
        ...(query.lat !== undefined && query.lon !== undefined
          ? { from: { lat: query.lat, lon: query.lon } }
          : {}),
      }),
    );
  }

  // Nearest first when the mini-app said where it is; newest first otherwise.
  if (query.lat !== undefined && query.lon !== undefined) {
    rows.sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
  }

  return Response.json({ tasks: rows });
});

export const OPTIONS = preflight;
