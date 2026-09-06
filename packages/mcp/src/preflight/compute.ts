/**
 * Who could actually take this errand, split honestly.
 *
 * `verified` and `seeded` are two numbers and never one total: a demo phone is not a market.
 * The median follows the same rule — it is computed from real completions when there are any
 * and labelled `median_source: 'real'`; when there are none it falls back to the seeded ones
 * and says `'seeded'`, which is the label that stops a demo number reading like a real one.
 * `n_real` is the count behind a real median, so a caller can see exactly how thin it is.
 */
import { TASK_TYPE_BIT, type TaskType } from '@legwork/shared';
import type { PreflightCompletionRow, PreflightWorkerRow } from './queries';

/** Seven days, in seconds. "Active" means "completed a task inside this window". */
export const ACTIVE_WINDOW_S = 7 * 86400;

export interface PreflightInput {
  task_type: TaskType;
  workers: PreflightWorkerRow[];
  tasks: PreflightCompletionRow[];
}

export interface PreflightCounts {
  active: number;
  verified: number;
  seeded: number;
  median_minutes: number | null;
  median_source: 'real' | 'seeded' | 'n/a';
  n_real: number;
  score_floor: number;
}

export function activeSince(nowSeconds: number, windowSeconds = ACTIVE_WINDOW_S): number {
  return nowSeconds - windowSeconds;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Claim to submission, in minutes. A task missing either stamp has no duration to report. */
function minutesToSubmit(task: PreflightCompletionRow): number | null {
  if (task.claimedAt === null || task.submittedAt === null) return null;
  const seconds = Number(task.submittedAt) - Number(task.claimedAt);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds / 60;
}

/** `Worker.score` is an integer `BigInt!` in the index; a decimal string is still a number here. */
function scoreOf(worker: PreflightWorkerRow): number {
  const n = Number(worker.score);
  return Number.isFinite(n) ? n : 0;
}

function minScore(workers: PreflightWorkerRow[]): number | null {
  if (workers.length === 0) return null;
  return workers.reduce((lowest, w) => Math.min(lowest, scoreOf(w)), Infinity);
}

/**
 * Reduce the two recorded lists into the counts `preflight_workers` reports.
 *
 * `nowSeconds` fixes the seven-day window. The documents already filter on it server-side;
 * re-checking here is what keeps a stale or hand-built response from quietly counting a worker
 * who has not finished anything in three weeks.
 */
export function computePreflight(input: PreflightInput, nowSeconds: number): PreflightCounts {
  const since = activeSince(nowSeconds);
  const bit = TASK_TYPE_BIT[input.task_type];

  const kept = input.workers.filter((w) => {
    if ((w.taskTypes & bit) === 0) return false;
    if (w.lastCompletedAt === null) return false;
    return Number(w.lastCompletedAt) >= since;
  });

  const verifiedWorkers = kept.filter((w) => !w.seeded);
  const seededWorkers = kept.filter((w) => w.seeded);

  const realMinutes: number[] = [];
  const seededMinutes: number[] = [];
  for (const task of input.tasks) {
    if (task.worker === null) continue;
    if (task.releasedAt === null || Number(task.releasedAt) < since) continue;
    const minutes = minutesToSubmit(task);
    if (minutes === null) continue;
    if (task.worker.seeded) seededMinutes.push(minutes);
    else realMinutes.push(minutes);
  }

  const floor = minScore(verifiedWorkers) ?? minScore(seededWorkers) ?? 0;

  const counts = {
    active: verifiedWorkers.length + seededWorkers.length,
    verified: verifiedWorkers.length,
    seeded: seededWorkers.length,
    n_real: realMinutes.length,
    score_floor: floor,
  };

  if (realMinutes.length > 0) {
    return {
      ...counts,
      median_minutes: Math.round(median(realMinutes) as number),
      median_source: 'real',
    };
  }

  const seededMedian = median(seededMinutes);
  return {
    ...counts,
    median_minutes: seededMedian === null ? null : Math.round(seededMedian),
    median_source: seededMedian === null ? 'n/a' : 'seeded',
  };
}
