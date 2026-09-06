// OWNER: T-19
/**
 * The buyer accepts the proof. 3.00 to the worker, 0.45 to the treasury, and the task is done.
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

  const status = statusOf(row);
  if (status !== 'submitted') return fail(409, { error: 'bad_state', status });

  // The row is written only after the hash comes back: a task marked released without a
  // transaction is a receipt for money that never moved.
  let hash: string;
  try {
    ({ hash } = await getChain().approve(taskId));
  } catch (err) {
    return chainFailure(err);
  }

  await applyTransition(db, taskId, {
    state: 'released',
    at: new Date(),
    txColumn: 'tx_release',
    tx: hash,
  });
  logger.info({ task_id: raw, action: 'approve', status: 'released', tx: hash }, 'buyer_verb');

  return Response.json({ task_id: raw, status: 'released', tx: hash });
});

export const OPTIONS = preflight;
