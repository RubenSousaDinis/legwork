// OWNER: T-19
/**
 * How much demand came from outside. Counts only — never a `payer`, never an `agent_id`:
 * an address on a public page is a standing invitation to grief whoever holds it.
 *
 * Both numbers come off the `posters` ledger T-30 writes on every accepted task, where
 * `allowlisted` is what `ITaskEscrow.allowlistedBuyer` said about the payer. An allowlisted
 * payer is the operator's own demo wallet; everybody else is a real outside agent, and
 * `external_tasks` is every task one of those has funded. `source` says which ledger a zero
 * came from, so a zero can never mean "not counted yet".
 */
import { eq, sql } from 'drizzle-orm';
import { route, preflight } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { getDb } from '@/src/db/client';
import { posters, tasks } from '@/src/db/schema';
import { listPosters } from '@/src/services/posters';
import { CACHE_RARE, PUBLIC_RATE_LIMIT, publicJson } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface PosterStats {
  distinct_external_buyers: number;
  external_tasks: number;
  source: 'posters';
}

export async function posterStats(db = getDb()): Promise<PosterStats> {
  const { distinct_external_buyers } = await listPosters({ db });
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .innerJoin(posters, sql`lower(${posters.payer}) = lower(${tasks.payer})`)
    .where(eq(posters.allowlisted, false));
  return {
    distinct_external_buyers,
    external_tasks: Number(row?.count ?? 0),
    source: 'posters',
  };
}

export const GET = route(async (req) => {
  rateLimit(`public:${clientKey(req)}`, PUBLIC_RATE_LIMIT);
  return publicJson(await posterStats(), CACHE_RARE);
});

export const OPTIONS = preflight;
