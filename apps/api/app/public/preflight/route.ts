// OWNER: T-19
/**
 * The `preflight_workers` shape: who could actually run this errand, before anybody pays.
 * The numbers come from `src/services/preflight.ts` (T-27) — the same `computePreflight` the
 * hosted MCP tool and the local server run, so the count an agent sees cannot depend on the door.
 */
import { z } from 'zod';
import { TASK_TYPES } from '@legwork/shared';
import { route, preflight } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { preflightWorkers } from '@/src/services/preflight';
import { fail } from '@/src/services/statusBus';
import { PUBLIC_RATE_LIMIT, publicJson } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({
  task_type: z.enum(TASK_TYPES),
  area: z.string().regex(/^[0-9b-hjkmnp-z]{5}$/, 'expected a 5-character geohash'),
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
