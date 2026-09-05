// OWNER: T-19
/** The `preflight_workers` shape: who could actually run this errand, before anybody pays. */
import { z } from 'zod';
import { TASK_TYPES } from '@legwork/shared';
import { route, preflight } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { getConfig } from '@/src/config';
import { fail } from '@/src/services/statusBus';
import { PUBLIC_RATE_LIMIT, publicJson } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({
  task_type: z.enum(TASK_TYPES),
  area: z.string().regex(/^[0-9b-hjkmnp-z]{5}$/, 'expected a 5-character geohash'),
});

/**
 * TODO(T-27): replace with `preflightWorkers({task_type, area})` from
 * `src/services/preflight.ts`.
 *
 * Zeros and `median_source: 'n/a'`, which is what "we have not counted yet" looks like. An
 * invented median would be the one number an agent would trust and should not.
 */
const preflightWorkers = async (_query: z.infer<typeof Query>) => ({
  active: 0,
  verified: 0,
  seeded: 0,
  median_minutes: null,
  median_source: 'n/a' as const,
  n_real: 0,
  score_floor: 0,
  dashboard_url: getConfig().DASHBOARD_URL ?? 'http://localhost:3000',
});

export const GET = route(async (req) => {
  rateLimit(`public:${clientKey(req)}`, PUBLIC_RATE_LIMIT);

  const url = new URL(req.url);
  const parsed = Query.safeParse({
    task_type: url.searchParams.get('task_type'),
    area: url.searchParams.get('area'),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(400, {
      error: 'invalid_request',
      field: issue ? issue.path.map(String).join('.') || '(root)' : '(root)',
      reason: issue?.message ?? 'invalid request',
    });
  }

  return publicJson(await preflightWorkers(parsed.data));
});

export const OPTIONS = preflight;
