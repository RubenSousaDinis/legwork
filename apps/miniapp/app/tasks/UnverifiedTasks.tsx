'use client';

import type { TaskType } from '@legwork/shared';
import { useEffect, useState } from 'react';
import { UnverifiedBanner, type UnverifiedTask } from '../../components/UnverifiedBanner';
import { apiFetch } from '../../lib/api';

/**
 * `/tasks` for a visitor with no session: the real open list at the real prices behind
 * T-42's banner. The rows come from the public feed — no session, no cookie — and every
 * row's button is disabled until the visitor verifies.
 *
 * `GET /public/feed` carries `price_usdc` (the worker's rate, 3.00) and no title, so the
 * row is titled `<type> · <area>` — bounded words, never spec text.
 */

/** `PublicTaskView` in `api-contract.ts`, narrowed to what a locked row shows. */
type PublicFeedRow = {
  task_id: string;
  state: string;
  task_type: TaskType;
  price_usdc: number;
  area: string;
  seeded: boolean;
  title?: string;
};

export const FEED_UNAVAILABLE = 'The task list could not be loaded. Try again in a moment.';

export function toUnverifiedTask(row: PublicFeedRow): UnverifiedTask {
  return {
    task_id: row.task_id,
    task_type: row.task_type,
    title: row.title ?? `${row.task_type} · ${row.area}`,
    price_usdc: row.price_usdc,
    seeded: row.seeded,
  };
}

export function UnverifiedTasks() {
  const [tasks, setTasks] = useState<UnverifiedTask[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void apiFetch<{ tasks: PublicFeedRow[] }>('/public/feed')
      .then((data) => {
        if (!live) return;
        setTasks(data.tasks.filter((row) => row.state === 'open').map(toUnverifiedTask));
      })
      .catch(() => {
        // The banner still renders — verification is the offer, the rows are the preview.
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div data-screen="tasks-unverified">
      <UnverifiedBanner tasks={tasks ?? []} verifyHref="/" />
      {failed ? (
        <p data-error="feed" style={{ fontSize: '16px', margin: 'var(--s-3) 0 0' }}>
          {FEED_UNAVAILABLE}
        </p>
      ) : null}
    </div>
  );
}
