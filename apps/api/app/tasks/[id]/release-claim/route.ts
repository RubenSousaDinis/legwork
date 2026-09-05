/**
 * `POST /tasks/:id/release-claim` — the worker gives an errand back.
 *
 * Giving up inside the TTL is free: the contract charges no cooldown for it, because a worker
 * who hands a task back promptly is doing the board a favour and should not be taught not to.
 */
import { getAddress, isAddress } from 'viem';
import { route, preflight, pathParam } from '@/src/http/route';
import { ApiError } from '@/src/errors';
import { getChain } from '@/src/chain';
import { requireWorkerSession } from '@/src/session';
import { loadTask, mirrorFromChain, revertName, sameAddress, stateName } from '@/src/services/lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TaskId = /^\d+$/;

export const POST = route(async (req, ctx) => {
  const session = await requireWorkerSession(req);
  const id = await pathParam(ctx, 'id');
  if (!TaskId.test(id)) throw ApiError.of('not_found');
  const taskId = BigInt(id);

  if (!isAddress(session.worker)) throw ApiError.of('forbidden', { reason: 'not_worker' });
  const caller = getAddress(session.worker);

  const row = await loadTask(taskId);
  if (stateName(row) !== 'Claimed' || !sameAddress(row.worker, caller)) {
    throw ApiError.of('conflict', { reason: 'not_claimed_by_caller' });
  }

  const chain = getChain();
  let tx: { hash: string };
  try {
    tx = await chain.releaseClaimFor(taskId, caller);
  } catch (err) {
    const name = revertName(err);
    if (name) throw ApiError.of('conflict', { reason: name });
    throw err;
  }

  await mirrorFromChain(row, await chain.getTask(taskId), { release: tx.hash });
  return Response.json({ tx: tx.hash });
});

export const OPTIONS = preflight;
