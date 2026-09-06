/**
 * The subgraph half of `preflight_workers`: two queries out, one set of counts back.
 *
 * The same function runs in two places — inside the local MCP server when it has a subgraph
 * URL of its own, and inside the Task API behind `GET /public/preflight`. One implementation
 * is the point: the hosted server and the local one cannot disagree about how many workers
 * are out there.
 */
import type { TaskType } from '@legwork/shared';
import { TASK_TYPE_BIT } from '@legwork/shared';
import type { SubgraphSource } from '../context';
import { activeSince, computePreflight, type PreflightCounts } from './compute';
import {
  PREFLIGHT_COMPLETIONS_QUERY,
  PREFLIGHT_WORKERS_QUERY,
  type PreflightCompletionsData,
  type PreflightQueryData,
} from './queries';

export interface PreflightArgs {
  task_type: TaskType;
  area: string;
}

export async function fetchPreflight(
  source: SubgraphSource,
  args: PreflightArgs,
  nowSeconds: number,
): Promise<PreflightCounts> {
  const since = String(activeSince(nowSeconds));

  const [workerData, completionData] = await Promise.all([
    source.query<PreflightQueryData>(PREFLIGHT_WORKERS_QUERY, { area: args.area, since }),
    source.query<PreflightCompletionsData>(PREFLIGHT_COMPLETIONS_QUERY, {
      area: args.area,
      taskType: TASK_TYPE_BIT[args.task_type],
      since,
    }),
  ]);

  return computePreflight(
    { task_type: args.task_type, workers: workerData.workers, tasks: completionData.tasks },
    nowSeconds,
  );
}

/** What "we have not counted yet" looks like. An invented median is the one number to avoid. */
export const EMPTY_PREFLIGHT: PreflightCounts = {
  active: 0,
  verified: 0,
  seeded: 0,
  median_minutes: null,
  median_source: 'n/a',
  n_real: 0,
  score_floor: 0,
};

export { ACTIVE_WINDOW_S, activeSince, computePreflight } from './compute';
export type { PreflightCounts, PreflightInput } from './compute';
export {
  PREFLIGHT_COMPLETIONS_QUERY,
  PREFLIGHT_WORKERS_QUERY,
  type PreflightCompletionRow,
  type PreflightWorkerRow,
} from './queries';
