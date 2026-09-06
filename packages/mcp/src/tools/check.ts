/**
 * `check_task` — the dry run. Same screening as a real post, no payment, no mark.
 *
 * A refusal comes back exactly as the API wrote it, including the no-retry sentence. Nothing
 * here summarises it, softens it or tries a second time: an agent that rephrases a refused
 * spec and posts it again is the behaviour the sentence exists to prevent.
 */
import type { z } from 'zod';
import type { RefusalPayload, TaskType } from '@legwork/shared';
import { dashboardUrlFor, type ToolContext } from '../context';
import { postCheck } from '../http';
import { toolResult, type ToolResult } from './result';

export interface CheckArgs {
  task_type: TaskType;
  spec: Record<string, unknown>;
}

export interface CheckAccepted {
  accepted: true;
  spec_hash: string;
  price_usdc: number;
  dashboard_url: string;
}

export type CheckResult = CheckAccepted | z.infer<typeof RefusalPayload>;

/** A 422 body is a refusal; it travels untouched. */
export function isRefusal(body: unknown): body is z.infer<typeof RefusalPayload> {
  return typeof body === 'object' && body !== null && (body as { refused?: unknown }).refused === true;
}

export async function checkTaskTool(
  ctx: ToolContext,
  args: CheckArgs,
): Promise<ToolResult<CheckResult>> {
  const { body } = await postCheck<unknown>(ctx, { task_type: args.task_type, spec: args.spec });
  if (isRefusal(body)) return toolResult(body);

  const accepted = body as { spec_hash: string; price_usdc: number };
  return toolResult({
    accepted: true as const,
    spec_hash: accepted.spec_hash,
    price_usdc: accepted.price_usdc,
    dashboard_url: dashboardUrlFor(ctx),
  });
}
