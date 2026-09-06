'use client';

import type { ReactNode } from 'react';
import type { DashboardData } from '../data/types';
import { useLiveDashboard } from './useLiveDashboard';

export interface LiveDashboardProps {
  /** Rendered on the server first, so the page is never blank while the poll warms up. */
  initial: DashboardData;
  taskId?: string;
  children: (data: DashboardData) => ReactNode;
}

/**
 * A render prop rather than a layout: T-43 mounts `PresentCanvas` inside it and T-39
 * mounts mission control, and neither component has to learn anything about polling.
 */
export function LiveDashboard({ initial, taskId, children }: LiveDashboardProps) {
  const data = useLiveDashboard(initial, taskId ? { taskId } : {});
  return <>{children(data)}</>;
}
