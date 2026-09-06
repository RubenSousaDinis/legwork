/**
 * `preflight_workers`, computed server-side.
 *
 * `GET /public/preflight` and the hosted MCP tool both land here, and both run the same
 * `computePreflight` the local MCP server runs against its own subgraph. One implementation is
 * the point: the number an agent is shown before it pays cannot depend on which door it came
 * through.
 *
 * With no `SUBGRAPH_QUERY_URL` the answer is zeros and `median_source: 'n/a'`, which is what
 * "we have not counted yet" looks like. An invented median is the one number an agent would
 * trust and should not.
 */
import type { z } from 'zod';
import type { Preflight, TaskType } from '@legwork/shared';
import { EMPTY_PREFLIGHT, fetchPreflight } from '@legwork/mcp/preflight';
import { createSubgraphClient } from '@legwork/subgraph-client';
import { getConfig } from '@/src/config';

export interface PreflightQuery {
  task_type: TaskType;
  area: string;
}

export type PreflightResult = z.infer<typeof Preflight>;

export async function getPreflight(
  query: PreflightQuery,
  now: () => number = Date.now,
): Promise<PreflightResult> {
  const config = getConfig();
  const dashboard_url = config.DASHBOARD_URL ?? 'http://localhost:3000';

  if (!config.SUBGRAPH_QUERY_URL) return { ...EMPTY_PREFLIGHT, dashboard_url };

  const client = createSubgraphClient({
    url: config.SUBGRAPH_QUERY_URL,
    ...(config.GRAPH_API_KEY ? { apiKey: config.GRAPH_API_KEY } : {}),
  });

  const counts = await fetchPreflight(client, query, Math.floor(now() / 1000));
  return { ...counts, dashboard_url };
}

/** The name `GET /public/preflight` (T-19) reaches for; the same function either way. */
export const preflightWorkers = getPreflight;
