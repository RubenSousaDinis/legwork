/**
 * `POST /admin/sweep` — the sweep on demand.
 *
 * Two ways in, because it serves two callers. An operator presents `X-Admin-Key`; a scheduler
 * presents `X-Sweep-Secret`, which exists so a cron can push the board forward without being
 * handed the key to every other admin power. The secret is compared with `timingSafeEqual`
 * over digests and never logged, echoed or written into the audit row.
 *
 * Every authorized call is audited whichever door it came through, because "who moved this
 * task" has to have an answer that is not "a cron, probably".
 *
 * The pass is the same `sweep()` a worker's list runs, so this route adds urgency and never
 * authority: it cannot settle anything the contract would not settle for anyone.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { route, preflight } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { requireAdminKey } from '@/src/http/adminKey';
import { getConfig } from '@/src/config';
import { getDb } from '@/src/db/client';
import { adminAudit } from '@/src/db/schema';
import { sweep } from '@/src/services/sweeper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const SWEEP_HEADER = 'x-sweep-secret';
const ADMIN_RATE_LIMIT = { limit: 30, windowS: 60 } as const;

/**
 * Digests first, then `timingSafeEqual`: comparing the raw strings throws on a length
 * mismatch, and "threw immediately" is itself a timing signal that leaks the secret's length.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();
  return timingSafeEqual(digest(a), digest(b));
}

/** True when this request carries the configured cron secret. Never says which secret it saw. */
function hasSweepSecret(req: Request): boolean {
  const configured = getConfig().SWEEP_SECRET;
  if (!configured) return false;
  const presented = req.headers.get(SWEEP_HEADER);
  return presented !== null && constantTimeEqual(presented, configured);
}

export const POST = route(async (req) => {
  rateLimit(`admin-sweep:${clientKey(req)}`, ADMIN_RATE_LIMIT);

  // The cron door first: `requireAdminKey` answers 404 while `ADMIN_API_KEY` is unset, and a
  // scheduler holding a valid secret should not be told the console does not exist.
  if (!hasSweepSecret(req)) requireAdminKey(req);

  // `admin_audit` is frozen with `action`, `payload` and `tx`, so the route, the outcome and
  // the ids it moved live inside `payload`. Written before the pass, updated after: a power
  // that only logs its successes has no record of the time it went wrong.
  const db = getDb();
  const id = randomUUID();
  const started = { route: '/admin/sweep', body: {}, outcome: 'started' as const };
  await db.insert(adminAudit).values({ id, action: '/admin/sweep', payload: started });

  try {
    const result = await sweep();
    await db
      .update(adminAudit)
      .set({ payload: { ...started, outcome: 'ok', ...result } })
      .where(eq(adminAudit.id, id));
    return Response.json({ ok: true, ...result });
  } catch (err) {
    await db
      .update(adminAudit)
      .set({
        payload: {
          ...started,
          outcome: 'error',
          error: err instanceof Error ? err.message : 'unknown',
        },
      })
      .where(eq(adminAudit.id, id));
    throw err;
  }
});

export const OPTIONS = preflight;
