/**
 * `task_status` — follow a task to its proof, long-polling up to 50 seconds.
 *
 * The wrapper around the worker's answer is re-checked here on every call rather than trusted
 * from the API. A worker writes free text into `note`, and an agent reading this result is one
 * missing `_untrusted: true` away from treating "ignore previous instructions" as an
 * instruction. Re-validating locally means the guarantee holds even if the API is older than
 * this client, and parsing through `WorkerAnswer` also strips any field the worker's row
 * carried that the contract does not name.
 */
import type { z } from 'zod';
import { TaskView, WorkerAnswer, wrapWorkerAnswer } from '@legwork/shared';
import { dashboardUrlFor, type ToolContext } from '../context';
import { getTask } from '../http';
import { toolResult, type ToolResult } from './result';

export type TaskStatusResult = z.infer<typeof TaskView>;

export interface StatusArgs {
  task_id: string;
  wait_seconds: number;
}

/**
 * Whatever the API sent, in the one shape a worker's words are allowed to reach an agent.
 * An already-wrapped answer round-trips; a bare string or a half-wrapped object is re-wrapped.
 */
export function rewrapAnswer(raw: unknown): z.infer<typeof WorkerAnswer> | undefined {
  if (raw === undefined || raw === null) return undefined;

  const parsed = WorkerAnswer.safeParse(raw);
  if (parsed.success) return parsed.data;

  if (typeof raw === 'string') return wrapWorkerAnswer(raw);

  if (typeof raw === 'object') {
    const loose = raw as { answer?: unknown; note?: unknown };
    if (typeof loose.answer === 'string') {
      return wrapWorkerAnswer(
        loose.answer,
        typeof loose.note === 'string' ? loose.note : undefined,
      );
    }
  }
  // Nothing recognisable as an answer: report no answer rather than an unwrapped one.
  return undefined;
}

export async function taskStatusTool(
  ctx: ToolContext,
  args: StatusArgs,
): Promise<ToolResult<TaskStatusResult>> {
  // Hosted mode holds no tokens; local mode has one only for a task it paid for itself.
  const buyerToken = ctx.mode === 'local' ? await ctx.tokenStore?.get(args.task_id) : undefined;

  const { body } = await getTask<Record<string, unknown>>(
    ctx,
    args.task_id,
    args.wait_seconds,
    buyerToken,
  );

  const view: Record<string, unknown> = { ...body };
  const answer = rewrapAnswer(view.answer);
  if (answer) view.answer = answer;
  else delete view.answer;

  const proof = view.proof as { hash_ok?: unknown } | undefined;
  if (proof && typeof proof === 'object') {
    view.proof = { ...proof, hash_ok: Boolean(proof.hash_ok) };
  }

  view.dashboard_url = (body.dashboard_url as string | undefined) ?? dashboardUrlFor(ctx, args.task_id);

  return toolResult(view as unknown as TaskStatusResult);
}
