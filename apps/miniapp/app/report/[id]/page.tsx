'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { VerifiedChip } from '../../../components/ui/VerifiedChip';
import { apiFetch } from '../../../lib/api';
import { CREDENTIAL_LEVEL } from '../../../lib/env';
import { requireVerified } from '../../../lib/session';
import { readActiveClaim, type ActiveClaim } from '../../tasks/activeClaim';
import { REPORT_HEADING, ReportForm } from './ReportForm';

/**
 * `/report/<task_id>` — the way out of a task that should not have been posted.
 *
 * The same two gates as every claimant screen: `requireVerified()` sends an unverified
 * visitor back to `/`, and the stored claim has to be *this* task. A worker cannot report a
 * task they are not holding, which is what keeps a report attached to a real claim.
 *
 * The header carries the title and nothing else. No price, no buyer, no agent id, no spec —
 * a report moves no money and names no one, and this screen shows neither.
 */

export const OPENING_LINE = 'Opening the report screen…';
export const WRONG_TASK_LINE = 'That task is not the one you are holding — back to the list…';

/** `undefined` while the claim has not been read yet — the first paint must not redirect. */
type ClaimState = ActiveClaim | null | undefined;

type WorkerTaskRow = { task_id: string; title: string };

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = requireVerified();
  const router = useRouter();

  const [claim, setClaim] = useState<ClaimState>(undefined);
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    const stored = readActiveClaim();
    setClaim(stored);
    if (stored === null || stored.task_id !== id) router.replace('/tasks');
  }, [id, router]);

  // The title is the worker's own claimed row in `GET /tasks/list` — the one piece of the
  // task this screen shows, so the worker can see they are reporting the right one.
  useEffect(() => {
    let live = true;
    void apiFetch<{ tasks: WorkerTaskRow[] }>('/tasks/list')
      .then((data) => {
        const row = data.tasks.find((candidate) => candidate.task_id === id);
        if (live && row !== undefined) setTitle(row.title);
      })
      .catch(() => {
        // A readout, not a gate: the header shows the id on its own rather than blocking.
      });
    return () => {
      live = false;
    };
  }, [id]);

  if (session.status !== 'verified' || claim === undefined) {
    return <p className="lw-placeholder">{OPENING_LINE}</p>;
  }

  if (claim === null || claim.task_id !== id) {
    return <p className="lw-placeholder">{WRONG_TASK_LINE}</p>;
  }

  const level = session.level === 'selfie' ? 'selfie' : CREDENTIAL_LEVEL;

  return (
    <div data-screen="report-page">
      <header style={{ marginBottom: 'var(--s-5)' }}>
        {/* The verified chip stays in the header here too: above the fold, always. */}
        <p style={{ margin: '0 0 var(--s-3)' }}>
          <VerifiedChip compact level={level} state={session} />
        </p>
        <h1 className="lw-h1" style={{ marginBottom: 'var(--s-2)' }}>
          {REPORT_HEADING}
        </h1>
        <p className="lw-placeholder" data-report="title" style={{ margin: 0 }}>
          {title ?? `Task ${id}`}
        </p>
      </header>

      <ReportForm taskId={id} />
    </div>
  );
}
