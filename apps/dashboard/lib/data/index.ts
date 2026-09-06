import { demoDashboardData, getDemoRefusals, getDemoTaskReceipt } from './demo';
import { getLiveDashboardData, type LiveDashboardOptions } from './live';
import type { DashboardData, DataMode, GetDashboardDataOptions } from './types';

export * from './types';
export { demoDashboardData, getDemoRefusals, getDemoTaskReceipt, getLiveDashboardData };
export { getLiveRefusals } from './live';
export { getTaskReceipt } from './receipt';
export type { TaskReceipt, TaskResponse } from './receipt';

/** An unset `DATA_MODE` means demo, so a fresh checkout renders something honest. */
export function resolveDataMode(mode?: string | null): DataMode {
  return mode === 'live' ? 'live' : 'demo';
}

/**
 * The shape `live` renders before the first fetch resolves, and the one it keeps when
 * every source is down. Zeros and empties — never a demo number in live mode.
 */
export function emptyLiveData(nowMs: number): DashboardData {
  return {
    dataMode: 'live',
    featured: null,
    totals: { lockedUsdc: 0, releasedTodayUsdc: 0, refundedUsdc: 0 },
    feed: [],
    agent: { id: '', score: null, paidOnProof: 0, marks: 0 },
    pool: { real: 0, seeded: 0, rows: [] },
    screening: [],
    preflight: {
      active: 0,
      verified: 0,
      seeded: 0,
      scoreFloor: 0,
      medianMinutes: null,
      medianSource: 'n/a',
      nReal: 0,
    },
    posterStats: { distinctExternalBuyers: 0, externalTasks: 0 },
    generatedAt: new Date(nowMs).toISOString(),
  };
}

/**
 * `mode` is read from `process.env.DATA_MODE` by the caller — on the server only,
 * never from a `NEXT_PUBLIC_*` var and never in a client bundle.
 *
 * Synchronous, and kept that way: `app/page.tsx` and `app/opengraph-image.tsx` call it
 * without `await` and both are frozen to this task. In live mode it returns the empty
 * shape; `loadDashboardData` below is the awaited form that actually reads the
 * deployment, and it is what every T-26 route and `LiveDashboard` call.
 */
export function getDashboardData(
  mode?: string | null,
  opts: GetDashboardDataOptions = {},
): DashboardData {
  const nowMs = opts.nowMs ?? Date.now();
  if (resolveDataMode(mode) === 'live') return emptyLiveData(nowMs);
  return demoDashboardData({ nowMs, ...(opts.state ? { state: opts.state } : {}) });
}

export type LoadDashboardDataOptions = GetDashboardDataOptions & LiveDashboardOptions;

/**
 * The awaited entry point. `live` reads `/public/*` and the subgraph through
 * `getLiveDashboardData`; `demo` is T-10's mapping, unchanged.
 */
export async function loadDashboardData(
  mode?: string | null,
  opts: LoadDashboardDataOptions = {},
): Promise<DashboardData> {
  if (resolveDataMode(mode) === 'live') {
    return getLiveDashboardData(opts.taskId ? { taskId: opts.taskId } : {});
  }
  const nowMs = opts.nowMs ?? Date.now();
  return demoDashboardData({ nowMs, ...(opts.state ? { state: opts.state } : {}) });
}
