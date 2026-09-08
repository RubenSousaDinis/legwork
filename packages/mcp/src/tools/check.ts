/**
 * `check_task` — the dry run. Same screening as a real post, no payment, no mark.
 *
 * A refusal comes back exactly as the API wrote it, including the no-retry sentence. Nothing
 * here summarises it, softens it or tries a second time: an agent that rephrases a refused
 * spec and posts it again is the behaviour the sentence exists to prevent.
 */
import type { z } from 'zod';
import { PRICE_FLOOR_USDC, type RefusalPayload, type TaskType } from '@legwork/shared';
import { dashboardUrlFor, type ToolContext } from '../context';
import { postCheck } from '../http';
import { toolError, toolResult, type ToolResult } from './result';

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

/** A 2xx body with the two fields the accepted branch is built from. */
function isAccepted(body: unknown): body is { spec_hash: string; price_usdc: number } {
  if (typeof body !== 'object' || body === null) return false;
  const record = body as { spec_hash?: unknown; price_usdc?: unknown };
  return typeof record.spec_hash === 'string' && typeof record.price_usdc === 'number';
}

export async function checkTaskTool(
  ctx: ToolContext,
  args: CheckArgs,
): Promise<ToolResult<CheckResult | { dashboard_url: string }>> {
  // `POST /check` screens the same envelope `POST /tasks` would, and that envelope carries
  // an amount. The contract's `check_task` input has none, so the dry run is priced at the
  // floor for the type: the answer says what the errand costs at the least a worker is paid.
  const { status, body } = await postCheck<unknown>(ctx, {
    task_type: args.task_type,
    spec: args.spec,
    amount_usdc: PRICE_FLOOR_USDC[args.task_type],
  });
  if (isRefusal(body)) return toolResult(body);

  if (!isAccepted(body)) {
    // Not a refusal and not an acceptance: a schema failure naming its field, a rate limit, an
    // outage. That is the tooling, not a decision about the task, and it says so rather than
    // being dressed up as an accepted dry run the contract would then reject.
    const detail = typeof body === 'object' && body !== null ? JSON.stringify(body) : String(body);
    return toolError(`check_task: the API answered ${status} ${detail}`, {
      dashboard_url: dashboardUrlFor(ctx),
    });
  }

  return toolResult({
    accepted: true as const,
    spec_hash: body.spec_hash,
    price_usdc: body.price_usdc,
    dashboard_url: dashboardUrlFor(ctx),
  });
}
