/**
 * `GET /tasks/:id/spec` — the spec, to the worker holding the task and to nobody else.
 *
 * This is the one route that shows spec fields to a human: the claimant needs the call
 * template and its slots, the photo subject, or the two items and the criterion to do the
 * errand. What it still never shows is what the buyer *claims* the answer is —
 * `claimed_open`, `claimed_hours`, `claimed_state`, `source` — because a worker who is told
 * what to find is paid for the answer, and the whole design pays for the proof.
 */
import { getAddress, isAddress } from 'viem';
import { route, preflight, pathParam } from '@/src/http/route';
import { ApiError } from '@/src/errors';
import { requireWorkerSession } from '@/src/session';
import { loadTask, sameAddress, taskTypeOf } from '@/src/services/lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TaskId = /^\d+$/;

/** The buyer's claims about the answer. Stripped here for the same reason `workerBrief` strips them. */
const BUYER_CLAIMS = ['claimed_open', 'claimed_hours', 'claimed_state', 'source'] as const;

/** Every spec field except the buyer's claims, copied key by key so a new claim field cannot slip through unnamed. */
export function claimantSpec(specJson: unknown): Record<string, unknown> {
  const spec = (specJson ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spec)) {
    if ((BUYER_CLAIMS as readonly string[]).includes(key)) continue;
    out[key] = value;
  }
  return out;
}

export const GET = route(async (req, ctx) => {
  const session = await requireWorkerSession(req);
  const id = await pathParam(ctx, 'id');
  if (!TaskId.test(id)) throw ApiError.of('not_found');

  if (!isAddress(session.worker)) throw ApiError.of('forbidden', { reason: 'not_worker' });
  const caller = getAddress(session.worker);

  const row = await loadTask(BigInt(id));
  // The current claimant only: a task nobody holds, or somebody else holds, is not this
  // worker's to read. 403 rather than 404 — the task exists, the caller is just not its worker.
  if (!sameAddress(row.worker, caller)) throw ApiError.of('forbidden', { reason: 'not_claimant' });

  return Response.json({ task_type: taskTypeOf(row.taskType), spec: claimantSpec(row.specJson) });
});

export const OPTIONS = preflight;
