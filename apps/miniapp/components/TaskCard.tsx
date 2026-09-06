'use client';

import { DEFAULT_CLAIM_TTL_S, type TaskType } from '@legwork/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { clearActiveClaim } from '../app/tasks/activeClaim';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { Countdown } from './Countdown';
import { MonoTag } from './ui/MonoTag';
import { StatusBadge } from './ui/StatusBadge';

/**
 * One row of `GET /tasks`, in its three states: collapsed, expanded, and claimed.
 *
 * The price shown is `price_usdc` — the posted rate the worker keeps, never a figure with the
 * fee taken out of it. The agent pays 3.45, escrow locks 3.45, the worker receives 3.00 and
 * the fee is 0.45 on top; this screen only ever shows the worker's 3.00.
 */

/**
 * `WorkerBrief` in `api-contract.ts` — place and question fields only, never `claimed_*` or
 * `source`. Every field is optional, and a row that carries none of them renders the
 * type-derived copy on its own.
 */
export type TaskBrief = {
  place?: { name: string; street_address: string; locality: string };
  question?: string;
  subject?: string;
  subject_detail?: string;
  phone?: string;
  template_question?: string;
  slots?: Record<string, string>;
  criterion_id?: string;
};

/** `WorkerTaskRow` in `api-contract.ts`. */
export type TaskRow = {
  task_id: string;
  task_type: TaskType;
  title: string;
  price_usdc: number;
  distance_m?: number;
  claim_expires_in_s?: number;
  state: 'open' | 'claimed';
  seeded: boolean;
  brief?: TaskBrief;
};

/** The caller's own live claim — `localStorage['legwork.activeClaim.v1']`, verbatim. */
export type TaskCardClaim = {
  task_id: string;
  claim_expires_at: string;
  submit_deadline: string;
  tx: string;
};

export type TaskCardProps = {
  row: TaskRow;
  expanded: boolean;
  onToggle: () => void;
  onClaim: () => void;
  claim?: TaskCardClaim;
  onRelease: () => void;
  error?: string;
};

const BASESCAN_TX = 'https://sepolia.basescan.org/tx/';

export const RELAYED_CHIP = 'relayed claim · gas paid by Legwork';
export const PAID_FOR_THE_PROOF = 'you are paid for the proof, not the answer';
export const CLAIM_EXPIRED = 'claim expired — it returned to the pool';

/** The claim window as a sentence. 1800 s is 30 min; never written as a bare `30m`. */
export const TTL_LINE = `claim within ${Math.round(DEFAULT_CLAIM_TTL_S / 60)} min`;

const QUESTION: Record<TaskType, string> = {
  'verify-open': 'Is it open right now?',
  'photo-of': 'Photograph the subject named in the title',
  'call-confirm': 'Call and ask the template question shown after you claim',
  'compare-two': 'Pick A or B against the criterion shown after you claim',
};

const PROOF_REQUIREMENTS: Record<TaskType, string> = {
  'verify-open': 'photo of the door + hours sign · location · timestamp',
  'photo-of': 'photo of the door + hours sign · location · timestamp',
  'call-confirm': 'your answer + the time you called — self-reported, unverified',
  'compare-two': 'one choice + one line',
};

/** `~180 m` at street scale, `~1.2 km` beyond it — never a raw metre count, never a coordinate. */
export function formatDistance(distance_m?: number): string {
  if (distance_m === undefined || !Number.isFinite(distance_m)) return '—';
  if (distance_m >= 1000) return `~${(distance_m / 1000).toFixed(1)} km`;
  return `~${Math.round(distance_m / 10) * 10} m`;
}

/** First 6 characters, then the last 4 — the hash is a link, not something to read out. */
export function shortTx(tx: string): string {
  return `${tx.slice(0, 6)}…${tx.slice(-4)}`;
}

export function TaskCard({
  row,
  expanded,
  onToggle,
  onClaim,
  claim,
  onRelease,
  error,
}: TaskCardProps) {
  const router = useRouter();
  const claimed = claim !== undefined && claim.task_id === row.task_id;
  const open = expanded || claimed;

  return (
    <li
      className="lw-card"
      data-task={row.task_id}
      data-claimed={claimed ? 'true' : 'false'}
      style={{ listStyle: 'none', marginBottom: 'var(--s-4)' }}
    >
      <button
        aria-expanded={open}
        className="lw-task-summary"
        data-hit="44"
        onClick={onToggle}
        style={{
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 'var(--s-2)',
          font: 'inherit',
          padding: 0,
          textAlign: 'left',
          width: '100%',
        }}
        type="button"
      >
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', alignItems: 'center' }}>
          <MonoTag>{row.task_type}</MonoTag>
          <StatusBadge status={row.state} size="sm" />
          {row.seeded ? (
            <Chip tone="seeded" floor={20}>
              seeded
            </Chip>
          ) : null}
        </span>

        <span
          className="lw-task-title"
          {...(claimed ? { 'data-floor': '20' } : {})}
          style={{ fontFamily: 'var(--font-body)', fontSize: claimed ? '20px' : '16px', fontWeight: 600 }}
        >
          {row.title}
        </span>

        <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)' }}>
          <span
            data-floor="20"
            data-price="usdc"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '28px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
            }}
          >
            {row.price_usdc.toFixed(2)}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', color: 'var(--ink-text-2)' }}>
            USDC
          </span>
        </span>

        <span
          style={{
            color: 'var(--ink-text-2)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--s-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: '15px',
          }}
        >
          <span data-distance="true">{formatDistance(row.distance_m)}</span>
          <span data-ttl="true">{TTL_LINE}</span>
        </span>
      </button>

      {open ? (
        <div className="lw-task-body" style={{ marginTop: 'var(--s-4)' }}>
          <p className="lw-section-label">Address</p>
          <p style={{ margin: '0 0 var(--s-3)' }}>{row.title}</p>

          <p className="lw-section-label">The question</p>
          <p style={{ margin: '0 0 var(--s-2)' }}>{QUESTION[row.task_type]}</p>
          <BriefDetail row={row} />

          <p className="lw-section-label">Proof required</p>
          <p style={{ margin: '0 0 var(--s-3)' }}>{PROOF_REQUIREMENTS[row.task_type]}</p>

          <p style={{ margin: '0 0 var(--s-4)', color: 'var(--ink-text-2)' }}>{PAID_FOR_THE_PROOF}</p>

          {claimed ? (
            <ClaimedActions claim={claim} onRelease={onRelease} router={router} taskId={row.task_id} />
          ) : (
            <div data-floor="20">
              <Button variant="primary" size="lg" full onClick={onClaim}>
                CLAIM
              </Button>
            </div>
          )}

          <p style={{ marginTop: 'var(--s-3)' }}>
            <Chip tone="neutral" floor={20}>
              {RELAYED_CHIP}
            </Chip>
          </p>

          {error === undefined ? null : (
            <p
              data-error="claim"
              style={{ color: 'var(--ink-text)', fontSize: '16px', margin: 'var(--s-2) 0 0' }}
            >
              {error}
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}

/**
 * What the worker is actually being asked, when the row says. The question line above is
 * derived from `task_type` and is the same for every task of that type; this is the one line
 * that differs — the thing to photograph, the question to read down the phone, the criterion
 * to pick against. A row whose `brief` does not carry it renders nothing extra.
 *
 * `verify-open` needs nothing more: "Is it open right now?" is the whole question.
 */
function BriefDetail({ row }: { row: TaskRow }) {
  const brief = row.brief;
  if (brief === undefined) return null;

  if (row.task_type === 'photo-of' && brief.subject !== undefined) {
    const detail = brief.subject_detail;
    return (
      <p data-brief="subject" style={{ margin: '0 0 var(--s-3)' }}>
        {detail === undefined ? brief.subject : `${brief.subject} — ${detail}`}
      </p>
    );
  }

  if (row.task_type === 'call-confirm' && brief.template_question !== undefined) {
    return (
      <p data-brief="template_question" style={{ margin: '0 0 var(--s-3)' }}>
        {brief.template_question}
      </p>
    );
  }

  if (row.task_type === 'compare-two' && brief.criterion_id !== undefined) {
    return (
      <p data-brief="criterion_id" style={{ margin: '0 0 var(--s-3)' }}>
        <MonoTag>{brief.criterion_id}</MonoTag>
      </p>
    );
  }

  return null;
}

type ClaimedActionsProps = {
  claim: TaskCardClaim;
  onRelease: () => void;
  router: ReturnType<typeof useRouter>;
  taskId: string;
};

/**
 * The claimed state. At `00:00` the claim is gone — the task went back to the pool — so the
 * actions go with it rather than sitting there ready to fail.
 *
 * Expiry clears `localStorage['legwork.activeClaim.v1']` here, where the clock is, rather than
 * through a prop `TaskCard` does not have: the stored claim is the one thing the card and the
 * list both read, so the next poll un-pins the card on its own.
 */
function ClaimedActions({ claim, onRelease, router, taskId }: ClaimedActionsProps) {
  // Reset during render, not in an effect: `Countdown` is a child, so its effects run first,
  // and a claim that is already past its deadline would have its `onExpire` undone by a
  // parent effect firing afterwards.
  const [clock, setClock] = useState({ until: claim.claim_expires_at, expired: false });
  if (clock.until !== claim.claim_expires_at) {
    setClock({ until: claim.claim_expires_at, expired: false });
  }

  const onExpire = useCallback(() => {
    clearActiveClaim();
    setClock((current) => ({ ...current, expired: true }));
  }, []);

  if (clock.expired) {
    return (
      <p data-claim="expired" data-floor="20" style={{ margin: 0 }}>
        {CLAIM_EXPIRED}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <Countdown label="claim expires in" onExpire={onExpire} until={claim.claim_expires_at} />

      <p style={{ margin: 0 }}>
        <Chip tone="neutral" floor={20}>
          <a data-hit="44" href={`${BASESCAN_TX}${claim.tx}`} rel="noreferrer" target="_blank">
            {`tx ${shortTx(claim.tx)} ↗`}
          </a>
        </Chip>
      </p>

      <Button variant="primary" size="lg" full onClick={() => router.push(`/proof/${taskId}`)}>
        Go to proof
      </Button>

      <Button variant="ghost" onClick={onRelease}>
        release this claim
      </Button>
    </div>
  );
}
