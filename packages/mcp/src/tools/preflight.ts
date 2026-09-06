/**
 * `preflight_workers` — how many people could take this errand near here, before anyone pays.
 *
 * Two sources, one shape. With a subgraph the counts come from the index directly; without
 * one the tool asks the API's `GET /public/preflight`, which runs the same `computePreflight`
 * server-side. It never guesses: no subgraph and no reachable API means zeros and `'n/a'`.
 */
import type { z } from 'zod';
import type { Preflight } from '@legwork/shared';
import { dashboardUrlFor, type ToolContext } from '../context';
import { getPublicPreflight } from '../http';
import { fetchPreflight, type PreflightArgs } from '../preflight/index';
import { toolResult, type ToolResult } from './result';

export type PreflightResult = z.infer<typeof Preflight>;

export async function preflightWorkersTool(
  ctx: ToolContext,
  args: PreflightArgs,
  now: () => number = Date.now,
): Promise<ToolResult<PreflightResult>> {
  const dashboard_url = dashboardUrlFor(ctx);

  if (ctx.subgraph) {
    const counts = await fetchPreflight(ctx.subgraph, args, Math.floor(now() / 1000));
    return toolResult({ ...counts, dashboard_url });
  }

  const { body } = await getPublicPreflight<PreflightResult>(ctx, args);
  return toolResult({ ...body, dashboard_url });
}
