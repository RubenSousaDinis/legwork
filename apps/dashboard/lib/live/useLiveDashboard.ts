'use client';

import { useEffect, useState } from 'react';
import { getLiveDashboardData } from '../data/live';
import type { DashboardData } from '../data/types';
import { createPoller, DEFAULT_INTERVAL_MS } from './poll';

export interface UseLiveDashboardOptions {
  intervalMs?: number;
  /** The `?task=` pin, so the filmed task stays featured while it moves. */
  taskId?: string;
}

/**
 * The dashboard, re-read every 3 s. Demo data is returned untouched — a demo canvas
 * never opens a socket, and `DATA_MODE` is a server decision the client cannot revisit.
 */
export function useLiveDashboard(
  initial: DashboardData,
  opts: UseLiveDashboardOptions = {},
): DashboardData {
  const [data, setData] = useState<DashboardData>(initial);
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const taskId = opts.taskId;
  const isDemo = initial.dataMode === 'demo';

  useEffect(() => {
    setData(initial);
  }, [initial]);

  useEffect(() => {
    if (isDemo) return;
    const poller = createPoller<DashboardData>({
      fetchOnce: async () => ({ value: await getLiveDashboardData(taskId ? { taskId } : {}) }),
      intervalMs,
      onChange: setData,
    });
    return () => poller.dispose();
  }, [isDemo, intervalMs, taskId]);

  return isDemo ? initial : data;
}
