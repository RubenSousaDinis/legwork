'use client';

import { ABUSE_CLASSES, type AbuseClass } from '@legwork/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { apiFetch } from '../../../lib/api';
import { clearActiveClaim } from '../../tasks/activeClaim';

/**
 * Walking away from a task that smells like abuse, in one screen and two requests — in that
 * order, never in parallel.
 *
 * **Release first, report second.** The release is the part that matters to the worker: it
 * hands the claim back inside the window, relayed, with no gas and no cooldown, so the phone
 * is free either way. A report sent first would leave a worker who is still holding a task
 * they have just accused; a report sent after a release that failed would be a record against
 * a buyer with no matching claim behind it. So a failed release stops here and nothing is
 * reported.
 *
 * The report itself is not a verdict. The API escalates to an `AbuseMark` only after operator
 * review, or when two different verified workers report the same buyer — the copy says so
 * before the worker taps anything, so nobody believes they have just punished someone.
 *
 * The screen shows no money — a report moves none — and no buyer or agent identity.
 */

export const REPORT_HEADING = 'Report task';

/** All three visible before any tap: what this costs, what it does, and what it does not do. */
export const FREE_AND_ANONYMOUS = 'reporting is free and anonymous to the buyer';
export const NO_GAS = 'no gas — the relayer releases your claim';
export const OPERATOR_REVIEWS =
  'the operator reviews reports; a mark is written only after review or when two different verified workers report the same buyer';
export const COPY_LINES = [FREE_AND_ANONYMOUS, NO_GAS, OPERATOR_REVIEWS] as const;

export const PICKER_LABEL = 'what was wrong with it?';
export const REPORT_LABEL = 'Report and release claim';
export const CANCEL_LABEL = 'Cancel';
export const BACK_TO_TASKS = 'Back to tasks';
export const REPORTED_LINE = 'Reported · claim released';
export const RELEASE_FAILED = 'could not release the claim — try again';
export const REPORT_FAILED = 'the report did not go through — your claim was released';

type Phase = 'choosing' | 'sending' | 'done';

export type ReportFormProps = { taskId: string };

export function ReportForm({ taskId }: ReportFormProps) {
  const router = useRouter();
  const [chosen, setChosen] = useState<AbuseClass | null>(null);
  const [phase, setPhase] = useState<Phase>('choosing');
  const [error, setError] = useState<string | null>(null);

  const onReport = useCallback(async () => {
    if (chosen === null || phase !== 'choosing') return;
    setError(null);
    setPhase('sending');

    // First: hand the claim back. Relayed, free, and inside the window there is no cooldown.
    try {
      await apiFetch<{ tx: string }>(`/tasks/${taskId}/release-claim`, { method: 'POST' });
    } catch {
      // Nothing is reported against a claim that is still held.
      setError(RELEASE_FAILED);
      setPhase('choosing');
      return;
    }

    // The claim is gone from the phone the moment the API says it is gone from the chain.
    clearActiveClaim();

    // Then: the class, which is a report and not a mark.
    try {
      await apiFetch<{ recorded: true }>(`/tasks/${taskId}/report`, {
        method: 'POST',
        body: JSON.stringify({ class: chosen }),
      });
    } catch {
      setError(REPORT_FAILED);
      setPhase('done');
      return;
    }

    setPhase('done');
  }, [chosen, phase, taskId]);

  if (phase === 'done' && error === null) {
    return (
      <div className="lw-card" data-state="reported">
        <p data-floor="20" style={{ margin: '0 0 var(--s-4)' }}>
          {REPORTED_LINE}
        </p>
        {/* The button classes on the anchor itself — a `Button` inside a link would be two
            nested interactive elements over one 56 px target. */}
        <a
          className="lw-button lw-button--primary lw-button--lg lw-button--full"
          data-hit="44"
          href="/tasks"
          style={{ textDecoration: 'none' }}
        >
          {BACK_TO_TASKS}
        </a>
      </div>
    );
  }

  return (
    <div data-screen="report">
      {COPY_LINES.map((line) => (
        <p data-copy="report" key={line} style={{ fontSize: '16px', margin: '0 0 var(--s-2)' }}>
          {line}
        </p>
      ))}

      <fieldset
        data-picker="abuse-class"
        style={{ border: 'none', margin: 'var(--s-5) 0 var(--s-4)', padding: 0 }}
      >
        <legend className="lw-section-label" style={{ padding: 0 }}>
          {PICKER_LABEL}
        </legend>

        {/* The six labels come from `packages/shared`, in id order. Nothing here re-types one. */}
        {ABUSE_CLASSES.map((abuseClass) => (
          <label
            key={abuseClass}
            style={{
              alignItems: 'center',
              borderBottom: '1px solid var(--paper-border)',
              display: 'flex',
              fontSize: '16px',
              gap: 'var(--s-3)',
              minHeight: '44px',
            }}
          >
            <input
              checked={chosen === abuseClass}
              data-class={abuseClass}
              data-hit="44"
              name="abuse-class"
              onChange={() => setChosen(abuseClass)}
              type="radio"
              value={abuseClass}
            />
            <span>{abuseClass}</span>
          </label>
        ))}
      </fieldset>

      {error === null ? null : (
        <p
          data-error="report"
          style={{ color: 'var(--refusal-on-paper)', fontSize: '16px', margin: '0 0 var(--s-4)' }}
        >
          {error}
        </p>
      )}

      <div data-floor="20" style={{ marginBottom: 'var(--s-3)' }}>
        <Button
          disabled={chosen === null || phase === 'sending'}
          full
          onClick={() => void onReport()}
          size="lg"
          variant="primary"
        >
          {REPORT_LABEL}
        </Button>
      </div>

      <Button onClick={() => router.back()} variant="ghost">
        {CANCEL_LABEL}
      </Button>
    </div>
  );
}
