/**
 * A recorded Studio, served from a fixture.
 *
 * It answers the two preflight documents by applying their own `where` clauses to the recorded
 * world and projecting only the fields each document selects — which is what a real response
 * is. Keeping the excluded rows in the fixture rather than pre-filtering them is deliberate:
 * it is the only way a test can show that the inactive worker and the neighbouring area are
 * dropped, instead of showing that they were never there.
 *
 * Nothing here opens a socket. There is no live Studio URL anywhere in this package.
 */
import type { SubgraphSource } from '../../src/context';
import type { PreflightCompletionRow, PreflightWorkerRow } from '../../src/preflight/queries';
import { PREFLIGHT_COMPLETIONS_QUERY, PREFLIGHT_WORKERS_QUERY } from '../../src/preflight/queries';
import fixture from './preflight-studio.json';

export type VariantName = 'A' | 'B';

export interface WorldWorker extends PreflightWorkerRow {
  reset: boolean;
  area: string;
}

export interface WorldTask extends PreflightCompletionRow {
  taskType: number;
  state: string;
  area: string;
}

export const NOW_SECONDS: number = fixture.now;
export const AREA: string = fixture.area;
export const TASK_TYPE = fixture.task_type as 'verify-open';
export const WORLD_WORKERS = fixture.workers as WorldWorker[];

export function worldTasks(variant: VariantName): WorldTask[] {
  return fixture.variants[variant] as WorldTask[];
}

/** `where: { area, reset: false, lastCompletedAt_gte: $since }`, then the selection set. */
function serveWorkers(area: string, since: number): PreflightWorkerRow[] {
  return WORLD_WORKERS.filter(
    (w) =>
      w.area === area &&
      !w.reset &&
      w.lastCompletedAt !== null &&
      Number(w.lastCompletedAt) >= since,
  ).map(({ id, seeded, taskTypes, score, completed, lastCompletedAt }) => ({
    id,
    seeded,
    taskTypes,
    score,
    completed,
    lastCompletedAt,
  }));
}

/** `where: { area, taskType, state: "Released", releasedAt_gte: $since }`, then the selection set. */
function serveTasks(
  variant: VariantName,
  area: string,
  taskType: number,
  since: number,
): PreflightCompletionRow[] {
  return worldTasks(variant)
    .filter(
      (t) =>
        t.area === area &&
        t.taskType === taskType &&
        t.state === 'Released' &&
        t.releasedAt !== null &&
        Number(t.releasedAt) >= since,
    )
    .map(({ id, seeded, claimedAt, submittedAt, releasedAt, worker }) => ({
      id,
      seeded,
      claimedAt,
      submittedAt,
      releasedAt,
      worker,
    }));
}

export interface RecordedCall {
  document: string;
  variables: Record<string, unknown>;
}

export interface FakeStudio extends SubgraphSource {
  readonly calls: RecordedCall[];
}

export function fakeStudio(variant: VariantName): FakeStudio {
  const calls: RecordedCall[] = [];

  return {
    calls,
    async query<T>(document: string, variables: Record<string, unknown> = {}): Promise<T> {
      calls.push({ document, variables });
      const since = Number(variables.since);

      if (document === PREFLIGHT_WORKERS_QUERY) {
        return { workers: serveWorkers(String(variables.area), since) } as T;
      }
      if (document === PREFLIGHT_COMPLETIONS_QUERY) {
        return {
          tasks: serveTasks(variant, String(variables.area), Number(variables.taskType), since),
        } as T;
      }
      throw new Error('the fixture only answers the two preflight documents');
    },
  };
}
