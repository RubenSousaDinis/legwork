'use client';

import { useLiveDashboard } from '../lib/live/useLiveDashboard';
import type { DashboardData } from '../lib/data/types';
import { MissionControl } from './MissionControl';

/**
 * Mission control on the 3-s poll. A client component rather than T-26's render-prop
 * `LiveDashboard`, because a server page cannot hand a function across the boundary; the
 * poll itself is the same `useLiveDashboard`, and demo data is returned untouched.
 */
export function LiveMissionControl({ initial, taskId }: { initial: DashboardData; taskId?: string }) {
  const data = useLiveDashboard(initial, taskId ? { taskId } : {});
  return <MissionControl data={data} />;
}
