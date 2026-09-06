'use client';

import { useSession, useSessionReady } from '../../lib/session';
import { TaskList } from './TaskList';
import { UnverifiedTasks } from './UnverifiedTasks';

/**
 * `/tasks` — where a verified worker lands after registering, and where they come back to.
 *
 * A visitor with no session is not sent away: they see the real list at the real prices
 * behind T-42's `Verify to claim` banner, with every row locked, and the CTA takes them to
 * `/`. Until the session probe settles there is nothing to show but the fact that it is
 * being checked — the first paint must neither redirect nor lock a worker's own list.
 */
export default function TasksPage() {
  const session = useSession();
  const ready = useSessionReady();

  if (!ready || session.status === 'verifying') {
    return <p className="lw-placeholder">Opening your task list…</p>;
  }

  if (session.status !== 'verified') {
    return <UnverifiedTasks />;
  }

  return <TaskList />;
}
