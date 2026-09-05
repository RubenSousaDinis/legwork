// OWNER: T-19
/**
 * How much demand came from outside. Counts only — never a `payer`, never an `agent_id`:
 * an address on a public page is a standing invitation to grief whoever holds it.
 */
import { route, preflight } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { PUBLIC_RATE_LIMIT, publicJson } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * TODO(T-30): replace with `listPosters()` from `src/services/posters.ts`.
 *
 * `source: 'stub'` is in the body on purpose. A zero that cannot say whether it counted
 * nothing or counted nothing yet is the kind of number this project does not ship.
 */
const listPosters = async () => ({
  distinct_external_buyers: 0,
  external_tasks: 0,
  source: 'stub' as const,
});

export const GET = route(async (req) => {
  rateLimit(`public:${clientKey(req)}`, PUBLIC_RATE_LIMIT);
  return publicJson(await listPosters());
});

export const OPTIONS = preflight;
