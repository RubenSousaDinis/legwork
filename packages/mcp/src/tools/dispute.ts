/**
 * `dispute_task` — contest a submitted proof inside the dispute window.
 *
 * Same authorisation as approve, same early stop when the token is missing. The reason travels
 * to the API unchanged; this package neither shortens it nor decides whether it is a good one.
 */
import type { z } from 'zod';
import type { TxResult } from '@legwork/shared';
import { dashboardUrlFor, type ToolContext } from '../context';
import { postDispute } from '../http';
import { BUYER_TOKEN_REQUIRED, resolveBuyerToken, type ApproveResult } from './approve';
import { toolError, toolResult, type ToolResult } from './result';

export async function disputeTaskTool(
  ctx: ToolContext,
  args: { task_id: string; reason: string; buyer_token?: string },
): Promise<ToolResult<ApproveResult | { dashboard_url: string }>> {
  const dashboard_url = dashboardUrlFor(ctx, args.task_id);
  const token = await resolveBuyerToken(ctx, args.task_id, args.buyer_token);
  if (!token) return toolError(BUYER_TOKEN_REQUIRED, { dashboard_url });

  const { body } = await postDispute<z.infer<typeof TxResult>>(
    ctx,
    args.task_id,
    args.reason,
    token,
  );
  return toolResult({ ...body, dashboard_url });
}
