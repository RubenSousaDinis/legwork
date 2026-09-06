'use client';

import { CompareTwoProof, NOTE_MAX_CHARS, type CompareTwoSpec } from '@legwork/shared';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Chip } from '../../../components/ui/Chip';
import { apiFetch } from '../../../lib/api';
import { clearActiveClaim } from '../../tasks/activeClaim';
import { ComparePaidState } from './ComparePaidState';

/**
 * Two things side by side, one choice, one line — and no travel.
 *
 * `compare-two` is the only task type that asks nothing of where the worker is standing. It
 * takes no photograph, reads no location and never calls `POST /proofs`: the proof is the
 * judgement, so the whole submission is a choice and a sentence. The copy under the pair says
 * both of those out loud before the worker taps anything, because a screen that stays silent
 * about it is a screen that looks like it is quietly collecting something.
 *
 * Nothing is preselected. `A` is not a default and `neither` is not a failure — the worker is
 * paid for the judgement, and the copy says that too.
 *
 * The money is the API's. `amount_usdc` from `GET /tasks/:id` is printed as it arrives; the
 * agent pays 3.45, escrow locks 3.45, the worker receives the posted 3.00 and the 0.45 fee is
 * on top of it. Nothing here subtracts anything from anything.
 */

/**
 * The worker-facing question for each of the six criteria, verbatim. T-45's worker docs read
 * this map rather than re-typing the questions beside it.
 */
export const CRITERION_QUESTION: Record<CompareTwoSpec['criterion_id'], string> = {
  more_legible: 'Which is more legible?',
  matches_reference: 'Which matches the reference?',
  better_lit: 'Which is better lit?',
  same_place: 'Which shows the same place as the reference?',
  which_is_newer: 'Which is newer?',
  which_is_open: 'Which one is open?',
};

export const CHOICES = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'neither', label: 'Neither' },
] as const;

export type Choice = (typeof CHOICES)[number]['value'];

/** Both lines sit under the pair and stay there until the judgement is handed in. */
export const PAID_FOR_THE_JUDGEMENT =
  "you are paid for the judgement, not for a particular answer — 'neither' pays the same as 'a'";
export const NO_TRAVEL = 'no travel, no camera, no location for this task';

export const REASON_LABEL = 'one line: why?';
export const SUBMIT_LABEL = 'SUBMIT';
export const CLOSE_LABEL = 'Close';
export const REFERENCE_LABEL = 'reference';

export const WAITING_LINE = 'Submitted · waiting for release';
export const SUBMIT_FAILED = 'The submission did not go through. Try again in a moment.';

/** No red anywhere: a refund or a dispute is news, not an error state. */
export const REFUNDED_LINE = 'The task was refunded to the buyer — nothing was paid out.';
export const DISPUTED_LINE = 'Disputed — the operator will resolve it. Nothing has been paid yet.';

/** T-33's wording, to the character — the same event should not read two ways. */
export function autoDisputeLine(reason: string | undefined): string {
  const named = reason === undefined ? 'the API flagged it' : reason;
  return `Submitted, but flagged: ${named}. The operator will resolve it — nothing has been paid yet.`;
}

const BASESCAN_TX = 'https://sepolia.basescan.org/tx/';

/** `TaskView` in `api-contract.ts`, narrowed to what this screen reads. */
type TaskView = {
  task_id: string;
  status: 'open' | 'claimed' | 'submitted' | 'released' | 'refunded' | 'disputed' | 'resolved';
  amount_usdc: number;
  submitted_at?: string;
  proof?: { captured_at: string };
  tx: { post: string; claim?: string; submit?: string; release?: string };
  poll_after_seconds: number;
};

type SubmitResponse = {
  tx: string;
  status: 'submitted' | 'disputed';
  auto_dispute_reason?: string;
};

type Phase = 'choosing' | 'submitting' | 'waiting' | 'settled';

const TERMINAL = new Set(['released', 'refunded', 'disputed', 'resolved']);

/** `poll_after_seconds` is the API's own pacing; a 0 on a non-terminal row still waits a beat. */
function pollDelayMs(task: TaskView): number {
  return Math.max(task.poll_after_seconds, 1) * 1000;
}

export type CompareViewProps = {
  taskId: string;
  spec: CompareTwoSpec;
};

export function CompareView({ taskId, spec }: CompareViewProps) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [reason, setReason] = useState('');
  const [zoom, setZoom] = useState<'a' | 'b' | 'reference' | null>(null);

  const [phase, setPhase] = useState<Phase>('choosing');
  const [submission, setSubmission] = useState<SubmitResponse | null>(null);
  const [task, setTask] = useState<TaskView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reason.trim();
  const canSubmit = phase === 'choosing' && choice !== null && trimmed !== '';

  const onSubmit = useCallback(async () => {
    if (!canSubmit || choice === null) return;

    // The schema is the one the API parses. A body that cannot pass it here would come back
    // as a 400 after the claim was spent, so it never leaves the phone.
    const proof = CompareTwoProof.safeParse({ choice, reason: trimmed });
    if (!proof.success) {
      setError(SUBMIT_FAILED);
      return;
    }

    setError(null);
    setPhase('submitting');

    // `answer` is the submit route's own field and `choice`/`reason` are the per-type half of
    // `CompareTwoProof`. There is no `proofHash`: nothing was uploaded, and the route makes
    // it optional for exactly this type.
    let result: SubmitResponse;
    try {
      result = await apiFetch<SubmitResponse>(`/tasks/${taskId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answer: proof.data.choice, ...proof.data }),
      });
    } catch {
      setError(SUBMIT_FAILED);
      setPhase('choosing');
      return;
    }

    // The claim is spent either way — submitted or auto-disputed, this is no longer a task
    // the worker can go and do again.
    clearActiveClaim();
    setSubmission(result);
    setPhase(result.status === 'submitted' ? 'waiting' : 'settled');
  }, [canSubmit, choice, taskId, trimmed]);

  // The long poll. It ends on a terminal row and on unmount, and nowhere else — a screen that
  // stopped early would leave the worker looking at "waiting for release" after they were paid.
  useEffect(() => {
    if (phase !== 'waiting') return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const view = await apiFetch<TaskView>(`/tasks/${taskId}?wait=50`);
        if (!live) return;
        setTask(view);
        if (TERMINAL.has(view.status)) {
          setPhase('settled');
          return;
        }
        timer = setTimeout(() => void poll(), pollDelayMs(view));
      } catch {
        if (live) timer = setTimeout(() => void poll(), 3000);
      }
    };

    void poll();
    return () => {
      live = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [phase, taskId]);

  const released = task !== null && task.status === 'released' && task.tx.release !== undefined;

  if (zoom !== null) {
    const item = zoom === 'reference' ? spec.reference : spec[zoom];
    return item === undefined ? null : (
      <Zoomed label={zoom} item={item} onClose={() => setZoom(null)} />
    );
  }

  if (phase === 'settled' && released && task !== null) {
    return (
      <ComparePaidState
        a={spec.a}
        amountUsdc={task.amount_usdc}
        b={spec.b}
        capturedAt={task.proof?.captured_at ?? task.submitted_at ?? ''}
        choice={choice}
        reason={trimmed}
        releaseTx={task.tx.release as string}
      />
    );
  }

  if (phase === 'settled') {
    return <SettledWithoutRelease submission={submission} task={task} />;
  }

  if (phase === 'waiting') {
    return <Waiting submission={submission} />;
  }

  return (
    <div data-screen="compare">
      <p className="lw-section-label" data-question="criterion" style={{ margin: '0 0 var(--s-3)' }}>
        {CRITERION_QUESTION[spec.criterion_id]}
      </p>

      {spec.reference === undefined ? null : (
        <div
          className="lw-card"
          data-reference="true"
          style={{ marginBottom: 'var(--s-4)', padding: 'var(--s-3)' }}
        >
          <p
            style={{
              color: 'var(--ink-text-3)',
              fontFamily: 'var(--font-mono)',
              fontSize: '15px',
              margin: '0 0 var(--s-2)',
            }}
          >
            {REFERENCE_LABEL}
          </p>
          <Option item={spec.reference} label="reference" onZoom={() => setZoom('reference')} />
        </div>
      )}

      {/* Two equal columns. At a 390 px viewport the 16 px page padding and the 12 px gap
          leave 173 px a side, above the 160 px floor. */}
      <div
        data-pair="true"
        style={{
          display: 'grid',
          gap: 'var(--s-3)',
          gridTemplateColumns: '1fr 1fr',
          marginBottom: 'var(--s-4)',
        }}
      >
        <PairCard item={spec.a} label="A" onZoom={() => setZoom('a')} />
        <PairCard item={spec.b} label="B" onZoom={() => setZoom('b')} />
      </div>

      <p data-copy="paid-for-the-judgement" style={{ fontSize: '16px', margin: '0 0 var(--s-2)' }}>
        {PAID_FOR_THE_JUDGEMENT}
      </p>
      <p data-copy="no-travel" style={{ fontSize: '16px', margin: '0 0 var(--s-4)' }}>
        {NO_TRAVEL}
      </p>

      <div data-answer="compare-two" style={{ marginBottom: 'var(--s-4)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
          {CHOICES.map((option) => (
            // The `Button` primitive is T-24's and takes no `aria-pressed`, so a segmented
            // control uses its classes directly — the same move T-33's `Segmented` makes.
            <button
              aria-pressed={choice === option.value}
              className={`lw-button ${choice === option.value ? 'lw-button--primary' : 'lw-button--ghost'}`}
              data-floor="20"
              data-hit="44"
              data-option={option.value}
              key={option.value}
              onClick={() => setChoice(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 'var(--s-4)' }}>
        <label style={{ display: 'block' }}>
          <span className="lw-section-label">{REASON_LABEL}</span>
          <textarea
            data-field="reason"
            data-hit="44"
            maxLength={NOTE_MAX_CHARS}
            // The cap is enforced here as well as by the attribute: `maxLength` stops typing
            // and a paste in a browser, but nothing stops a webview autofill from arriving
            // longer than the schema allows.
            onChange={(event) => setReason(event.target.value.slice(0, NOTE_MAX_CHARS))}
            required
            rows={2}
            style={{
              border: '1px solid var(--paper-border-2)',
              borderRadius: 'var(--r-button)',
              display: 'block',
              font: 'inherit',
              marginTop: 'var(--s-2)',
              minHeight: '44px',
              padding: 'var(--s-2)',
              width: '100%',
            }}
            value={reason}
          />
        </label>
        <p className="lw-placeholder" data-counter="reason" style={{ margin: 'var(--s-1) 0 0' }}>
          {`${reason.length}/${NOTE_MAX_CHARS}`}
        </p>
      </div>

      <div data-floor="20">
        <Button disabled={!canSubmit} full onClick={() => void onSubmit()} size="lg" variant="primary">
          {SUBMIT_LABEL}
        </Button>
      </div>

      {error === null ? null : (
        <p data-error="compare" style={{ color: 'var(--ink-text)', margin: 'var(--s-3) 0 0' }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** One side of the pair: a paper card, its letter in mono, and the option itself. */
function PairCard({
  item,
  label,
  onZoom,
}: {
  item: CompareTwoSpec['a'];
  label: 'A' | 'B';
  onZoom: () => void;
}) {
  return (
    <div
      className="lw-card"
      data-card={label.toLowerCase()}
      style={{ minWidth: 0, padding: 'var(--s-3)' }}
    >
      <p
        style={{
          color: 'var(--ink-text-2)',
          fontFamily: 'var(--font-mono)',
          fontSize: '16px',
          margin: '0 0 var(--s-2)',
        }}
      >
        {label}
      </p>
      <Option item={item} label={label} onZoom={onZoom} />
    </div>
  );
}

/**
 * An image in a square box that opens full width on a tap, or the text itself at 16 px.
 * `loading="eager"` because both halves of a comparison have to arrive together — a lazy
 * second image is a comparison against a blank box. The referrer never leaves the phone.
 */
function Option({
  item,
  label,
  onZoom,
}: {
  item: CompareTwoSpec['a'];
  label: 'A' | 'B' | 'reference';
  onZoom: () => void;
}) {
  if (item.kind === 'text') {
    return (
      <p data-text={label.toLowerCase()} style={{ fontSize: '16px', margin: 0 }}>
        {item.text}
      </p>
    );
  }

  return (
    <button
      data-hit="44"
      data-zoom={label.toLowerCase()}
      onClick={onZoom}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        display: 'block',
        padding: 0,
        width: '100%',
      }}
      type="button"
    >
      {/* A plain `img`: the buyer's evidence, served from wherever the buyer put it, which
          `next/image` cannot size or optimise. */}
      <img
        alt={label === 'reference' ? 'reference' : `option ${label}`}
        loading="eager"
        referrerPolicy="no-referrer"
        src={item.url}
        style={{
          aspectRatio: '1 / 1',
          borderRadius: 'var(--r-button)',
          display: 'block',
          objectFit: 'cover',
          width: '100%',
        }}
      />
    </button>
  );
}

/** The tapped option, full width, over the paper ground — and one 44 px way back. */
function Zoomed({
  item,
  label,
  onClose,
}: {
  item: CompareTwoSpec['a'];
  label: 'a' | 'b' | 'reference';
  onClose: () => void;
}) {
  return (
    <div data-zoomed={label}>
      <div style={{ marginBottom: 'var(--s-4)' }}>
        <Button onClick={onClose} variant="ghost">
          {CLOSE_LABEL}
        </Button>
      </div>
      <img
        alt={label === 'reference' ? 'reference' : `option ${label.toUpperCase()}`}
        loading="eager"
        referrerPolicy="no-referrer"
        src={item.url}
        style={{ borderRadius: 'var(--r-card)', display: 'block', width: '100%' }}
      />
    </div>
  );
}

function TxChip({ tx }: { tx: string }) {
  return (
    <Chip tone="neutral" floor={20}>
      <a data-hit="44" href={`${BASESCAN_TX}${tx}`} rel="noreferrer" target="_blank">
        {`tx ${tx.slice(0, 6)}…${tx.slice(-4)} ↗`}
      </a>
    </Chip>
  );
}

function Waiting({ submission }: { submission: SubmitResponse | null }) {
  return (
    <div className="lw-card" data-state="waiting">
      <p data-floor="20" style={{ margin: '0 0 var(--s-3)' }}>
        {WAITING_LINE}
      </p>
      {submission === null ? null : <TxChip tx={submission.tx} />}
    </div>
  );
}

/**
 * Everything that is not a release, said plainly and in amber rather than red: an
 * auto-dispute at submit time, a plain dispute, a refund. None of them shows a figure —
 * no money moved.
 */
function SettledWithoutRelease({
  submission,
  task,
}: {
  submission: SubmitResponse | null;
  task: TaskView | null;
}) {
  const line =
    submission !== null && submission.status === 'disputed'
      ? autoDisputeLine(submission.auto_dispute_reason)
      : task?.status === 'refunded'
        ? REFUNDED_LINE
        : DISPUTED_LINE;

  return (
    <div className="lw-card" data-state="settled">
      <p data-floor="20" style={{ color: 'var(--refusal-on-paper)', margin: '0 0 var(--s-3)' }}>
        {line}
      </p>
      {submission === null ? null : <TxChip tx={submission.tx} />}
    </div>
  );
}
