import { demoDashboardData } from './demo';
import type { DashboardData, DataMode, GetDashboardDataOptions } from './types';

export * from './types';
export { demoDashboardData };

/** An unset `DATA_MODE` means demo, so a fresh checkout renders something honest. */
export function resolveDataMode(mode?: string | null): DataMode {
  return mode === 'live' ? 'live' : 'demo';
}

/** The empty shape `live` returns until T-26 replaces this branch. */
function emptyLiveData(nowMs: number): DashboardData {
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
 */
export function getDashboardData(
  mode?: string | null,
  opts: GetDashboardDataOptions = {},
): DashboardData {
  const nowMs = opts.nowMs ?? Date.now();
  if (resolveDataMode(mode) === 'live') return emptyLiveData(nowMs);
  return demoDashboardData({ nowMs, ...(opts.state ? { state: opts.state } : {}) });
}
