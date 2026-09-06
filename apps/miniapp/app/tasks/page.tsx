'use client';

import { requireVerified } from '../../lib/session';
import { TaskList } from './TaskList';

/**
 * `/tasks` — where a verified worker lands after registering, and where they come back to.
 * `requireVerified()` sends anyone else to `/`; until the session probe settles there is
 * nothing to show but the fact that it is being checked.
 */
export default function TasksPage() {
  const session = requireVerified();

  if (session.status !== 'verified') {
    return <p className="lw-placeholder">Opening your task list…</p>;
  }

  return <TaskList />;
}
