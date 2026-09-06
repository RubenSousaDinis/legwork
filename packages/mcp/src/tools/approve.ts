/**
 * `approve_task` — release the escrow against a submitted proof.
 *
 * The buyer token is the whole of the authorisation, so a missing one stops the tool before
 * any request goes out: a call to `/approve` without it would be a 401 the agent has to
 * interpret, and this way the answer names the fix instead.
 */
import type { z } from 'zod';
import { INSTALL_LINE, type TxResult } from '@legwork/shared';
import { dashboardUrlFor, type ToolContext } from '../context';
import { postApprove } from '../http';
import { toolError, toolResult, type ToolResult } from './result';

export type ApproveResult = z.infer<typeof TxResult> & { dashboard_url: string };

export const BUYER_TOKEN_REQUIRED = `buyer_token required: pass the token hire_human returned, or install the local server: ${INSTALL_LINE}`;

/** The argument first, then — local mode only — the token this machine stored at hire time. */
export async function resolveBuyerToken(
  ctx: ToolContext,
  taskId: string,
  fromArgs?: string,
): Promise<string | undefined> {
  if (fromArgs) return fromArgs;
  if (ctx.mode !== 'local') return undefined;
  return ctx.tokenStore?.get(taskId);
}

export async function approveTaskTool(
  ctx: ToolContext,
  args: { task_id: string; buyer_token?: string },
): Promise<ToolResult<ApproveResult | { dashboard_url: string }>> {
  const dashboard_url = dashboardUrlFor(ctx, args.task_id);
  const token = await resolveBuyerToken(ctx, args.task_id, args.buyer_token);
  if (!token) return toolError(BUYER_TOKEN_REQUIRED, { dashboard_url });

  const { body } = await postApprove<z.infer<typeof TxResult>>(ctx, args.task_id, token);
  return toolResult({ ...body, dashboard_url });
}
