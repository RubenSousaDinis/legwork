// OWNER: T-19
/**
 * The buyer rejects the proof, inside the window. The money stays locked until the operator
 * resolves it; `reason` is for the log and the operator, and never goes on chain.
 */
import { z } from 'zod';
import { route, preflight, pathParam } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { getDb } from '@/src/db/client';
import { getChain } from '@/src/chain';
import { logger } from '@/src/log';
import { tasks } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireBuyerToken } from '@/src/services/buyerToken';
import {
  applyTransition,
  chainFailure,
  fail,
  readTask,
  statusOf,
} from '@/src/services/statusBus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ reason: z.string().min(1).max(300) });

export const POST = route(async (req, ctx) => {
  rateLimit(`buyer-verb:${clientKey(req)}`, { limit: 60, windowS: 60 });

  const raw = await pathParam(ctx, 'id');
  if (!/^\d+$/.test(raw)) return fail(404, { error: 'not_found' });
  const taskId = BigInt(raw);

  const db = getDb();
  const row = await readTask(db, taskId);
  if (!row) return fail(404, { error: 'not_found' });

  requireBuyerToken(req, row);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(400, {
      error: 'invalid_request',
      field: issue ? issue.path.map(String).join('.') || '(root)' : '(root)',
      reason: issue?.message ?? 'invalid request',
    });
  }

  const status = statusOf(row);
  const submittedAtS = row.submittedAt ? Math.floor(row.submittedAt.getTime() / 1000) : null;
  const nowS = Math.floor(Date.now() / 1000);
  if (status !== 'submitted' || submittedAtS === null || nowS >= submittedAtS + row.disputeWindowS) {
    return fail(409, { error: 'dispute_window_closed' });
  }

  let hash: string;
  try {
    ({ hash } = await getChain().dispute(taskId));
  } catch (err) {
    return chainFailure(err);
  }

  await applyTransition(db, taskId, { state: 'disputed' });
  // The reason is the buyer's words about a worker; it is kept beside the task for the
  // operator who has to resolve it, and it never reaches the chain or a public surface.
  await db.update(tasks).set({ disputeReason: parsed.data.reason }).where(eq(tasks.taskId, taskId));
  logger.info({ task_id: raw, reason: parsed.data.reason }, 'dispute');

  return Response.json({ task_id: raw, status: 'disputed', tx: hash });
});

export const OPTIONS = preflight;
