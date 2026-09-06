'use client';

import { CompareTwoSpec, type TaskType } from '@legwork/shared';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { Countdown } from '../../../components/Countdown';
import { MonoTag } from '../../../components/ui/MonoTag';
import { VerifiedChip } from '../../../components/ui/VerifiedChip';
import { apiFetch } from '../../../lib/api';
import { CREDENTIAL_LEVEL } from '../../../lib/env';
import { requireVerified } from '../../../lib/session';
import { readActiveClaim, type ActiveClaim } from '../../tasks/activeClaim';
import { CompareView } from './CompareView';

/**
 * `/compare/<task_id>` — the travel-free screen, for the one task this worker is holding.
 *
 * Three gates, in order. `requireVerified()` sends an unverified visitor back to `/`. The
 * stored claim has to be *this* task, or the worker goes back to `/tasks`. And the task has
 * to actually be a `compare-two`: anything else belongs to T-33's proof flow, which needs a
 * camera this screen does not open.
 *
 * `GET /tasks/:id/spec` is the one route that shows spec text to a human, and only to the
 * current claimant. It arrives here and nowhere else — the pair is never in the list, never
 * in the public feed and never on the dashboard.
 */

export const SUBMIT_WITHIN = 'submit within';
export const OPENING_LINE = 'Opening your comparison…';
export const WRONG_TASK_LINE = 'That task is not the one you are holding — back to the list…';
export const SPEC_UNAVAILABLE = 'That comparison could not be loaded. Try again in a moment.';

/** `undefined` while the claim has not been read yet — the first paint must not redirect. */
type ClaimState = ActiveClaim | null | undefined;

type SpecResponse = { task_type: TaskType; spec: Record<string, unknown> };
type SpecState =
  | { status: 'loading' }
  | { status: 'ready'; spec: CompareTwoSpec }
  | { status: 'unavailable' };

type WorkerTaskRow = { task_id: string; title: string };

export default function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = requireVerified();
  const router = useRouter();

  const [claim, setClaim] = useState<ClaimState>(undefined);
  const [spec, setSpec] = useState<SpecState>({ status: 'loading' });
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    const stored = readActiveClaim();
    setClaim(stored);
    if (stored === null || stored.task_id !== id) router.replace('/tasks');
  }, [id, router]);

  // The spec, claimant-only. A task of any other type is T-33's screen, not this one.
  useEffect(() => {
    let live = true;
    void apiFetch<SpecResponse>(`/tasks/${id}/spec`)
      .then((response) => {
        if (!live) return;
        if (response.task_type !== 'compare-two') {
          router.replace(`/proof/${id}`);
          return;
        }
        const parsed = CompareTwoSpec.safeParse(response.spec);
        setSpec(parsed.success ? { status: 'ready', spec: parsed.data } : { status: 'unavailable' });
      })
      .catch(() => {
        if (live) setSpec({ status: 'unavailable' });
      });
    return () => {
      live = false;
    };
  }, [id, router]);

  // The title is the worker's own claimed row in `GET /tasks/list`; `GET /tasks/:id` is a
  // public shape and carries no title, and the spec route carries no title either.
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
    <div data-screen="compare-page">
      <header style={{ marginBottom: 'var(--s-5)' }}>
        {/* The verified chip stays in the header on this screen too: above the fold, always. */}
        <p style={{ margin: '0 0 var(--s-3)' }}>
          <VerifiedChip compact level={level} state={session} />
        </p>
        <h1 className="lw-h1" data-compare="title" style={{ marginBottom: 'var(--s-3)' }}>
          {title ?? `Task ${id}`}
        </h1>
        <p style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', margin: '0 0 var(--s-3)' }}>
          <MonoTag>compare-two</MonoTag>
        </p>
        <Countdown label={SUBMIT_WITHIN} until={claim.submit_deadline} />
      </header>

      {spec.status === 'ready' ? <CompareView spec={spec.spec} taskId={id} /> : null}
      {spec.status === 'loading' ? <p className="lw-placeholder">{OPENING_LINE}</p> : null}
      {spec.status === 'unavailable' ? (
        <p data-error="spec" style={{ fontSize: '16px' }}>
          {SPEC_UNAVAILABLE}
        </p>
      ) : null}
    </div>
  );
}
