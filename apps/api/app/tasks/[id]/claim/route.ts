/**
 * `POST /tasks/:id/claim` — the worker takes an errand, the relayer pays the gas.
 *
 * The worker never signs. Everything below is `claimFor(taskId, worker)` sent by the relayer
 * key through `TxQueue`, and every pre-check here is one the contract runs again: a race that
 * slips past this pass reverts with the same name and comes back as the same 409.
 */
import { getAddress, isAddress } from 'viem';
import { route, preflight, pathParam } from '@/src/http/route';
import { ApiError } from '@/src/errors';
import { getChain } from '@/src/chain';
import { requireWorkerSession } from '@/src/session';
import {
  assertClaimableBy,
  claimDeadlines,
  loadTask,
  mirrorFromChain,
  revertName,
  secondsToDate,
  type ClaimBlock,
} from '@/src/services/lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The 409 carries the contract's error name rather than the envelope's `conflict`, because
 * the mini-app shows a different screen for each of the three and a shared code would make it
 * parse prose. See the INTERFACE REQUEST on the PR.
 */
function conflict(body: ClaimBlock): Response {
  return Response.json(body, { status: 409 });
}

const TaskId = /^\d+$/;

export const POST = route(async (req, ctx) => {
  const session = await requireWorkerSession(req);
  const id = await pathParam(ctx, 'id');
  if (!TaskId.test(id)) throw ApiError.of('not_found');
  const taskId = BigInt(id);

  if (!isAddress(session.worker)) throw ApiError.of('forbidden', { reason: 'not_worker' });
  const caller = getAddress(session.worker);

  const row = await loadTask(taskId);
  const chain = getChain();

  // The registry is the record. A session is a claim about who this is; `isWorker` is who the
  // chain says may work.
  if (!(await chain.isWorker(caller))) throw ApiError.of('forbidden', { reason: 'not_worker' });

  const [now, cooldownUntil, activeClaim, isSeeded, chainTask] = await Promise.all([
    chain.now(),
    chain.cooldownUntil(caller),
    chain.activeClaimOf(caller),
    chain.isSeeded(caller),
    chain.getTask(taskId),
  ]);
  const buyerAllowlisted = isAddress(chainTask.buyer)
    ? await chain.allowlistedBuyer(getAddress(chainTask.buyer))
    : false;

  const blocked = assertClaimableBy(chainTask, now, {
    cooldownUntil,
    activeClaim,
    isSeeded,
    buyerAllowlisted,
  });
  if (blocked) return conflict(blocked);

  let tx: { hash: string };
  try {
    tx = await chain.claimFor(taskId, caller);
  } catch (err) {
    const name = revertName(err);
    // The contract's answer beats ours: the pre-checks above raced, and this is the truth.
    if (name === 'InCooldown') {
      const until = await chain.cooldownUntil(caller);
      return conflict({
        error: 'InCooldown',
        cooldown_until: secondsToDate(until).toISOString(),
      });
    }
    if (name === 'AlreadyClaimed' || name === 'HasActiveClaim') {
      const active = await chain.activeClaimOf(caller);
      return conflict({
        error: 'AlreadyClaimed',
        ...(active === 0n ? {} : { active_task_id: active.toString() }),
      });
    }
    if (name === 'SeededCannotClaimExternal') return conflict({ error: 'SeededCannotClaimExternal' });
    if (name) throw ApiError.of('conflict', { reason: name });
    throw err;
  }

  // Never guessed from the request: the row is whatever `getTask` says it is now.
  const settled = await chain.getTask(taskId);
  await mirrorFromChain(row, settled, { claim: tx.hash });

  return Response.json({ tx: tx.hash, ...claimDeadlines(settled) });
});

export const OPTIONS = preflight;
