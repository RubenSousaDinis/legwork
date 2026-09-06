'use client';

import { NOTE_MAX_CHARS, type TaskType } from '@legwork/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Countdown } from '../../components/Countdown';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { MonoTag } from '../../components/ui/MonoTag';
import { apiFetch } from '../../lib/api';
import { getPosition, type GpsResult } from '../../lib/gps';
import { clearActiveClaim, type ActiveClaim } from '../tasks/activeClaim';
import {
  AnswerToggle,
  CharacterField,
  EMPTY_ANSWER,
  isAnswerComplete,
  type AnswerState,
} from './AnswerToggle';
import { LocationStep } from './Downgrade';
import { reencodeImage } from './image';
import { PaidState } from './PaidState';
import { uploadProof, type ProofsResponse } from './upload';

/**
 * Capture → location → answer → SUBMIT → released. The beat the whole submission rests on.
 *
 * Two rules shape everything below. **The photo is the thing**: it is required on every path,
 * it is re-encoded before it leaves the phone, and the released state cannot render without
 * it. **The location is never faked**: a webview with no fix sends no `lat`/`lon` at all and
 * the worker's tapped confirmation goes in its place, disclosed on the receipt — there is no
 * branch here that writes a zero coordinate.
 *
 * The money is the API's. `amount_usdc` from `GET /tasks/:id` is printed as it arrives; the
 * agent pays 3.45, escrow locks 3.45, the worker receives the posted 3.00 and the 0.45 fee is
 * on top of it. Nothing on this screen subtracts anything from anything.
 */

export const CAPTURE_LABEL = 'Take the photo';
export const RETAKE_LABEL = 'Retake';
export const SUBMIT_LABEL = 'SUBMIT';
export const SUBMIT_WITHIN = 'submit within';
export const NOTE_LABEL = 'note (optional)';
export const REPORT_TASK_LABEL = 'Report task';

/** Both lines sit under the capture button and stay there until the proof is handed in. */
export const PAID_FOR_THE_PROOF =
  "you are paid for the proof, not the answer — 'closed' pays the same as 'open'";
export const NO_PEOPLE = "don't photograph people";

export const WAITING_LINE = 'Submitted · waiting for release';
export const REENCODE_FAILED =
  'That photo could not be prepared on this phone. Take it again.';
export const UPLOAD_FAILED = 'The upload did not go through. Try again in a moment.';
export const SUBMIT_FAILED = 'The submission did not go through. Try again in a moment.';

/** No red anywhere: a refund or a dispute is news, not an error state. */
export const REFUNDED_LINE = 'The task was refunded to the buyer — nothing was paid out.';
export const DISPUTED_LINE = 'Disputed — the operator will resolve it. Nothing has been paid yet.';

export function autoDisputeLine(reason: string | undefined): string {
  const named = reason === undefined ? 'the API flagged it' : reason;
  return `Submitted, but flagged: ${named}. The operator will resolve it — nothing has been paid yet.`;
}

const BASESCAN_TX = 'https://sepolia.basescan.org/tx/';

/** `TaskView` in `api-contract.ts`, narrowed to what this screen reads. */
type TaskView = {
  task_id: string;
  status: 'open' | 'claimed' | 'submitted' | 'released' | 'refunded' | 'disputed' | 'resolved';
  task_type: TaskType;
  amount_usdc: number;
  proof?: { captured_at: string };
  tx: { post: string; claim?: string; submit?: string; release?: string };
  poll_after_seconds: number;
};

type SubmitResponse = {
  tx: string;
  status: 'submitted' | 'disputed';
  auto_dispute_reason?: string;
};
type WorkerTaskRow = { task_id: string; title: string };

type Photo = { blob: Blob; url: string };
type Phase = 'capture' | 'submitting' | 'waiting' | 'settled';

const TERMINAL = new Set(['released', 'refunded', 'disputed', 'resolved']);

/** `poll_after_seconds` is the API's own pacing; a 0 on a non-terminal row still waits a beat. */
function pollDelayMs(task: TaskView): number {
  return Math.max(task.poll_after_seconds, 1) * 1000;
}

export type ProofFlowProps = {
  taskId: string;
  claim: ActiveClaim;
  /** Injectable clock for the `called_at` a `call-confirm` worker records. */
  now?: () => Date;
};

export function ProofFlow({ taskId, claim, now }: ProofFlowProps) {
  const [task, setTask] = useState<TaskView | null>(null);
  const [title, setTitle] = useState<string | null>(null);

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'done'>('idle');
  const [gps, setGps] = useState<GpsResult | null>(null);
  const [confirmedAtPlace, setConfirmedAtPlace] = useState(false);
  const [answer, setAnswer] = useState<AnswerState>(EMPTY_ANSWER);
  const [note, setNote] = useState('');

  const [phase, setPhase] = useState<Phase>('capture');
  const [submission, setSubmission] = useState<SubmitResponse | null>(null);
  /** The server's timestamp for the photo — the phone's own clock never reaches the receipt. */
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The object URL outlives every render until the photo is replaced, and is revoked when it
  // is: a retake on a long shift would otherwise keep every discarded photo in memory.
  const photoUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (photoUrl.current !== null) URL.revokeObjectURL(photoUrl.current);
    },
    [],
  );

  // The task row, for `task_type` (which answer toggle) and `amount_usdc` (what was paid).
  useEffect(() => {
    let live = true;
    void apiFetch<TaskView>(`/tasks/${taskId}`)
      .then((view) => {
        if (live) setTask(view);
      })
      .catch(() => {
        // A readout, not a gate: the worker can still photograph and hand in.
      });
    return () => {
      live = false;
    };
  }, [taskId]);

  // The title is the worker's own claimed row in `GET /tasks/list`; `GET /tasks/:id` is a
  // public shape and carries no title.
  useEffect(() => {
    let live = true;
    void apiFetch<{ tasks: WorkerTaskRow[] }>('/tasks/list')
      .then((data) => {
        const row = data.tasks.find((candidate) => candidate.task_id === taskId);
        if (live && row !== undefined) setTitle(row.title);
      })
      .catch(() => {
        // Same: the header shows the id on its own rather than blocking the capture.
      });
    return () => {
      live = false;
    };
  }, [taskId]);

  const locate = useCallback(() => {
    setGpsStatus('locating');
    void getPosition().then((result) => {
      setGps(result);
      setGpsStatus('done');
    });
  }, []);

  const onCapture = useCallback(
    async (file: File) => {
      setError(null);
      let blob: Blob;
      try {
        blob = await reencodeImage(file);
      } catch {
        setError(REENCODE_FAILED);
        return;
      }
      if (photoUrl.current !== null) URL.revokeObjectURL(photoUrl.current);
      const url = URL.createObjectURL(blob);
      photoUrl.current = url;
      setPhoto({ blob, url });
      // Step 2 starts on its own — the worker is standing at the door, not reading a menu.
      locate();
    },
    [locate],
  );

  const onRetake = useCallback(() => {
    if (photoUrl.current !== null) URL.revokeObjectURL(photoUrl.current);
    photoUrl.current = null;
    setPhoto(null);
    setGps(null);
    setGpsStatus('idle');
    setConfirmedAtPlace(false);
    setError(null);
  }, []);

  const taskType = task?.task_type ?? null;
  const located = (gps !== null && gps.ok) || confirmedAtPlace;
  const canSubmit =
    phase === 'capture' &&
    photo !== null &&
    taskType !== null &&
    isAnswerComplete(taskType, answer) &&
    located;

  const onSubmit = useCallback(async () => {
    if (!canSubmit || photo === null || taskType === null || answer.answer === null) return;
    setError(null);
    setPhase('submitting');

    const form = new FormData();
    form.append('file', photo.blob, 'proof.jpg');
    if (gps !== null && gps.ok) {
      form.append('lat', String(gps.lat));
      form.append('lon', String(gps.lon));
      form.append('accuracy_m', String(gps.accuracy_m));
    } else {
      // No `lat`, no `lon`, not even an empty one: the downgrade declares that there is no
      // coordinate rather than sending a coordinate that means nothing.
      form.append('gps_unavailable', 'true');
      form.append('worker_confirmed_at_place', 'true');
    }

    let uploaded: ProofsResponse;
    try {
      uploaded = await uploadProof(form);
    } catch {
      setError(UPLOAD_FAILED);
      setPhase('capture');
      return;
    }

    setCapturedAt(uploaded.captured_at);

    const trimmedNote = note.trim();
    const body: Record<string, unknown> = {
      // `proofHash` is what the submit route takes; `photo_hash` is what the proof schemas
      // name, and the API checks they are the same value (§13).
      proofHash: uploaded.proofHash,
      answer: answer.answer,
      ...(trimmedNote === '' ? {} : { note: trimmedNote }),
      ...proofFields(taskType, answer, {
        proofHash: uploaded.proofHash,
        capturedAt: uploaded.captured_at,
        gps,
      }),
    };

    let result: SubmitResponse;
    try {
      result = await apiFetch<SubmitResponse>(`/tasks/${taskId}/submit`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    } catch {
      setError(SUBMIT_FAILED);
      setPhase('capture');
      return;
    }

    // The claim is spent either way — submitted or auto-disputed, this task is no longer one
    // the worker can go and do again.
    clearActiveClaim();
    setSubmission(result);
    setPhase(result.status === 'submitted' ? 'waiting' : 'settled');
  }, [answer, canSubmit, gps, note, photo, taskId, taskType]);

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

  const releaseTx = task !== null && task.status === 'released' ? task.tx.release : undefined;

  return (
    <div data-screen="proof">
      <header style={{ marginBottom: 'var(--s-5)' }}>
        <p style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', margin: '0 0 var(--s-2)' }}>
          <MonoTag>{taskType ?? 'task'}</MonoTag>
        </p>
        <h1 className="lw-h1" data-proof="title" style={{ marginBottom: 'var(--s-3)' }}>
          {title ?? `Task ${taskId}`}
        </h1>
        <Countdown label={SUBMIT_WITHIN} until={claim.submit_deadline} />
        {/* T-42's way out of a task that should not have been posted: release, then report. */}
        <p style={{ margin: 'var(--s-3) 0 0' }}>
          <a data-hit="44" data-link="report" href={`/report/${taskId}`} style={{ color: 'var(--ink-text-2)' }}>
            {REPORT_TASK_LABEL}
          </a>
        </p>
      </header>

      {phase === 'settled' && releaseTx !== undefined && task !== null ? (
        <PaidState
          amountUsdc={task.amount_usdc}
          capturedAt={capturedAt ?? task.proof?.captured_at ?? ''}
          proofThumbnailUrl={photo?.url ?? null}
          releaseTx={releaseTx}
        />
      ) : null}

      {phase === 'settled' && releaseTx === undefined ? (
        <SettledWithoutRelease submission={submission} task={task} />
      ) : null}

      {phase === 'waiting' ? <Waiting submission={submission} /> : null}

      {phase === 'capture' || phase === 'submitting' ? (
        <div className="lw-card">
          <Capture onCapture={onCapture} onRetake={onRetake} photo={photo} />

          <LocationStep
            confirmed={confirmedAtPlace}
            onConfirm={() => setConfirmedAtPlace(true)}
            onRetry={locate}
            result={gps}
            status={gpsStatus}
          />

          {photo !== null && taskType !== null ? (
            <>
              <AnswerToggle now={now} onChange={setAnswer} taskType={taskType} value={answer} />
              <CharacterField
                label={NOTE_LABEL}
                maxLength={NOTE_MAX_CHARS}
                name="note"
                onChange={setNote}
                value={note}
              />
            </>
          ) : null}

          <div data-floor="20">
            <Button disabled={!canSubmit} full onClick={() => void onSubmit()} size="lg" variant="primary">
              {SUBMIT_LABEL}
            </Button>
          </div>

          {error === null ? null : (
            <p data-error="proof" style={{ color: 'var(--ink-text)', margin: 'var(--s-3) 0 0' }}>
              {error}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Step 1. `capture="environment"` is the rear camera and no gallery by default — a proof is
 * something photographed at the place, not something chosen from the camera roll.
 */
function Capture({
  photo,
  onCapture,
  onRetake,
}: {
  photo: Photo | null;
  onCapture: (file: File) => Promise<void>;
  onRetake: () => void;
}) {
  return (
    <div style={{ marginBottom: 'var(--s-4)' }}>
      {photo === null ? (
        <label className="lw-file-label" data-floor="20" data-hit="44">
          {CAPTURE_LABEL}
          <input
            accept="image/*"
            capture="environment"
            className="lw-file-input"
            data-capture="photo"
            data-hit="44"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) void onCapture(file);
            }}
            type="file"
          />
        </label>
      ) : (
        <div>
          {/* A plain `img`: an object URL for a blob this phone holds in memory. */}
          <img
            alt="the photo you just took"
            data-thumbnail="proof"
            src={photo.url}
            style={{
              aspectRatio: '4 / 3',
              borderRadius: 'var(--r-button)',
              display: 'block',
              maxHeight: '320px',
              objectFit: 'cover',
              width: '100%',
            }}
          />
          <div style={{ marginTop: 'var(--s-3)' }}>
            <Button variant="ghost" onClick={onRetake}>
              {RETAKE_LABEL}
            </Button>
          </div>
        </div>
      )}

      {/* Directly under the button, before submit, and never behind a step. */}
      <p data-copy="paid-for-the-proof" style={{ fontSize: '16px', margin: 'var(--s-3) 0 0' }}>
        {PAID_FOR_THE_PROOF}
      </p>
      <p data-copy="no-people" style={{ fontSize: '16px', margin: 'var(--s-2) 0 0' }}>
        {NO_PEOPLE}
      </p>
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
 * Everything that is not a release, said plainly. An auto-dispute at submit time is the
 * common one; a refund and a plain dispute are the two the long poll can also land on.
 * None of them is red, and none of them shows a figure — no money moved.
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
      <p data-floor="20" style={{ margin: '0 0 var(--s-3)' }}>
        {line}
      </p>
      {submission === null ? null : <TxChip tx={submission.tx} />}
    </div>
  );
}

/**
 * The per-type half of the submit body, exactly as the proof schemas in `packages/shared`
 * define it. The invariant they enforce — `gps === null` if and only if `gps_unavailable` —
 * is the reason the downgrade branch writes all three fields together rather than leaving
 * one to a default.
 */
export function proofFields(
  taskType: TaskType,
  answer: AnswerState,
  context: { proofHash: string; capturedAt: string; gps: GpsResult | null },
): Record<string, unknown> {
  if (taskType === 'call-confirm') {
    return {
      template_id: answer.template_id,
      called_at: answer.called_at,
      ...(answer.price === undefined ? {} : { price: answer.price }),
      ...(answer.time === undefined ? {} : { time: answer.time }),
    };
  }

  if (taskType === 'compare-two') {
    return { choice: answer.choice, reason: answer.reason };
  }

  const fix = context.gps !== null && context.gps.ok ? context.gps : null;
  return {
    photo_hash: context.proofHash,
    // The server's `captured_at`, never the phone's clock.
    captured_at: context.capturedAt,
    gps: fix === null ? null : { lat: fix.lat, lon: fix.lon, accuracy_m: fix.accuracy_m },
    gps_unavailable: fix === null,
    worker_confirmed_at_place: fix === null,
  };
}
