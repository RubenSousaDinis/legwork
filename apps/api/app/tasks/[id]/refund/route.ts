// OWNER: T-19
/**
 * Nobody claimed it, or nobody submitted in time. `expire` sends the whole 3.45 — the 3.00
 * the worker would have kept plus the 0.45 fee — back to the buyer who paid it.
 *
 * Never gated by the paused flag: a stop is for posting and claiming, and it must never trap
 * an agent's money in an errand nobody ran.
 */
import { route, preflight, pathParam } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { getDb } from '@/src/db/client';
import { getChain } from '@/src/chain';
import { logger } from '@/src/log';
import { requireBuyerToken } from '@/src/services/buyerToken';
import {
  applyTransition,
  chainFailure,
  eligibleAction,
  expiresAt,
  fail,
  readTask,
  statusOf,
} from '@/src/services/statusBus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req, ctx) => {
  rateLimit(`buyer-verb:${clientKey(req)}`, { limit: 60, windowS: 60 });

  const raw = await pathParam(ctx, 'id');
  if (!/^\d+$/.test(raw)) return fail(404, { error: 'not_found' });
  const taskId = BigInt(raw);

  const db = getDb();
  const row = await readTask(db, taskId);
  if (!row) return fail(404, { error: 'not_found' });

  requireBuyerToken(req, row);

  const nowS = Math.floor(Date.now() / 1000);
  if (eligibleAction(row, nowS) !== 'expire') {
    const eligible = expiresAt(row);
    return fail(409, {
      error: 'not_eligible',
      status: statusOf(row),
      eligible_at: eligible === null ? null : new Date(eligible * 1000).toISOString(),
    });
  }

  let hash: string;
  try {
    ({ hash } = await getChain().expire(taskId));
  } catch (err) {
    return chainFailure(err);
  }

  // The settlement hash is the receipt for the refund; without it a refunded task on the
  // dashboard has a state and no way to check it. No amount goes in the body — the money
  // figures live on the task, and 3.45 is what came back.
  await applyTransition(db, taskId, { state: 'refunded', txColumn: 'tx_release', tx: hash });
  logger.info({ task_id: raw, action: 'refund', status: 'refunded', tx: hash }, 'buyer_verb');

  return Response.json({ task_id: raw, status: 'refunded', tx: hash });
});

export const OPTIONS = preflight;
