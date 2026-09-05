import { ABUSE_CLASS_ID, type AbuseClass } from '@legwork/shared';
import type { SubgraphClient } from './client';
import {
  ACTIVE_WORKERS_QUERY,
  MARKS_BY_AGENT_QUERY,
  POSTER_STATS_QUERY,
  RECENT_TASKS_QUERY,
  RELEASED_TASKS_BY_WORKERS_QUERY,
  TASK_QUERY,
} from './queries';
import type { MarkRow, PosterStatsRow, PreflightSource, TaskRow, WorkerRow } from './types';

const DEFAULT_PAGE = 100;

/**
 * The six class ids as labels, derived from the shared enum rather than re-typed. This
 * is the only place in the read path where a class id becomes words: the mappings store
 * the integer and nothing else, so a rename in `@legwork/shared` cannot leave a stale
 * label behind in the index.
 */
const ABUSE_CLASS_BY_ID = new Map<number, AbuseClass>(
  (Object.keys(ABUSE_CLASS_ID) as AbuseClass[]).map((label) => [ABUSE_CLASS_ID[label], label]),
);

export interface ActiveWorkersArgs {
  /** One of `TASK_TYPE_BIT` — a worker matches when their bitmask includes it. */
  taskTypeBit: number;
  /** A geohash-5, or a shorter prefix of one. Never a coordinate. */
  areaPrefix: string;
  /** Unix seconds: the start of the active window. */
  sinceTs: number;
  first?: number;
}

/**
 * Who could take this kind of task near here.
 *
 * "Active" is two things at once: a worker who completed a task inside the window, and a
 * worker who registered inside the window and has not completed one yet. The second row
 * is the demo phone before its first errand — it is the "1 verified" the dashboard shows,
 * and dropping it would make a real human invisible. Workers with `reset == true` are
 * always excluded.
 */
export async function activeWorkers(
  client: SubgraphClient,
  args: ActiveWorkersArgs,
): Promise<PreflightSource> {
  const first = args.first ?? DEFAULT_PAGE;
  const data = await client.query<{
    completedRecently: WorkerRow[];
    newlyRegistered: WorkerRow[];
  }>(ACTIVE_WORKERS_QUERY, {
    areaPrefix: args.areaPrefix,
    sinceTs: String(args.sinceTs),
    first,
  });

  const byId = new Map<string, WorkerRow>();
  for (const worker of [...data.completedRecently, ...data.newlyRegistered]) {
    // GraphQL has no bitwise AND, so the bitmask is matched here rather than in `where`.
    if ((worker.taskTypes & args.taskTypeBit) === 0) continue;
    if (worker.reset) continue;
    byId.set(worker.id.toLowerCase(), worker);
  }
  const workers = [...byId.values()];

  if (workers.length === 0) return { workers, tasks: [] };

  const released = await client.query<{ tasks: TaskRow[] }>(RELEASED_TASKS_BY_WORKERS_QUERY, {
    workers: workers.map((w) => w.id),
    sinceTs: String(args.sinceTs),
    first,
  });
  return { workers, tasks: released.tasks };
}

export async function task(client: SubgraphClient, id: string): Promise<TaskRow | null> {
  const data = await client.query<{ task: TaskRow | null }>(TASK_QUERY, { id });
  return data.task;
}

export async function recentTasks(client: SubgraphClient, n: number): Promise<TaskRow[]> {
  const data = await client.query<{ tasks: TaskRow[] }>(RECENT_TASKS_QUERY, { first: n });
  return data.tasks;
}

/**
 * The external-poster counters. Both exclude allowlisted buyers, so when the operator is
 * the only poster this reads `0` — that is the honest number, not a broken one.
 */
export async function posterStats(client: SubgraphClient): Promise<PosterStatsRow | null> {
  const data = await client.query<{ posterStats: PosterStatsRow | null }>(POSTER_STATS_QUERY);
  return data.posterStats;
}

/** Marks against one agent, each carrying the label its `classId` stands for. */
export async function marksByAgent(
  client: SubgraphClient,
  agentId: string | number | bigint,
  first = DEFAULT_PAGE,
): Promise<MarkRow[]> {
  const data = await client.query<{ marks: Omit<MarkRow, 'abuseClass'>[] }>(MARKS_BY_AGENT_QUERY, {
    agentId: String(agentId),
    first,
  });
  return data.marks.map((mark) => {
    const abuseClass = ABUSE_CLASS_BY_ID.get(mark.classId);
    if (abuseClass === undefined) throw new Error(`unknown abuse class id: ${mark.classId}`);
    return { ...mark, abuseClass };
  });
}
