import type { PreflightCounts, PreflightSource, TaskRow, WorkerRow } from './types';

/** Seven days, in seconds. "Active" means "completed a task inside this window". */
export const ACTIVE_WINDOW_S = 604800;

/** The oldest timestamp still inside the active window, given a clock reading. */
export function activeSince(nowSeconds: number, windowSeconds = ACTIVE_WINDOW_S): number {
  return nowSeconds - windowSeconds;
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Claim to release, in whole minutes. A task with either stamp missing has no duration. */
function minutesToComplete(task: TaskRow): number | null {
  if (task.claimedAt === null || task.releasedAt === null) return null;
  const seconds = Number(task.releasedAt) - Number(task.claimedAt);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds / 60;
}

/**
 * Reduce the rows the subgraph returned into the counts `preflight_workers` reports.
 *
 * The split is the honest part: `verified` and `seeded` are separate numbers, never one
 * total, and the median is taken from **real** completions when there are any. When there
 * are none it falls back to the seeded ones and says so — `median_source: 'seeded'` is the
 * label that stops a demo number reading like a market number. `n_real` is the count
 * behind the real median, so a caller can see exactly how thin it is.
 */
export function reducePreflight(source: PreflightSource): PreflightCounts {
  const workers = source.workers;
  const seededById = new Map<string, boolean>(
    workers.map((w: WorkerRow) => [w.id.toLowerCase(), w.seeded]),
  );

  const verified = workers.filter((w) => !w.seeded).length;
  const seeded = workers.filter((w) => w.seeded).length;

  const realMinutes: number[] = [];
  const seededMinutes: number[] = [];
  for (const task of source.tasks) {
    const workerId = task.worker?.id.toLowerCase();
    if (workerId === undefined || !seededById.has(workerId)) continue;
    const minutes = minutesToComplete(task);
    if (minutes === null) continue;
    if (seededById.get(workerId) === true) seededMinutes.push(minutes);
    else realMinutes.push(minutes);
  }

  if (realMinutes.length > 0) {
    return {
      active: workers.length,
      verified,
      seeded,
      median_minutes: medianOf(realMinutes),
      median_source: 'real',
      n_real: realMinutes.length,
    };
  }

  const seededMedian = medianOf(seededMinutes);
  return {
    active: workers.length,
    verified,
    seeded,
    median_minutes: seededMedian,
    median_source: seededMedian === null ? 'n/a' : 'seeded',
    n_real: 0,
  };
}
