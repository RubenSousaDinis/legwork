'use client';

import type { CompareTwoSpec } from '@legwork/shared';
import { Chip } from '../../../components/ui/Chip';

/**
 * The released state for a `compare-two`, and the rule it exists to keep: **the proof is
 * above the money**.
 *
 * A comparison hands in no photograph, so T-33's `PaidState` — which renders nothing without
 * a thumbnail — cannot draw this receipt at all. The proof here is the judgement itself: the
 * pair the worker was shown, which of the two they picked, and the line they wrote. All three
 * sit above `Released`, and the component renders nothing at all without a choice, so escrow
 * releasing on its own is not a state this screen can reach.
 *
 * The amount is `amount_usdc` from `GET /tasks/:id`, passed in and printed. It is never
 * computed here and never `amount − fee`: the agent pays 3.45, escrow locks 3.45, the worker
 * receives the posted 3.00 and the 0.45 fee rides on top.
 */

const BASESCAN_TX = 'https://sepolia.basescan.org/tx/';

export const NOT_SPENDABLE = 'testnet USDC — not spendable';
export const COMPLETED_LINE = '+1 completed';
export const BACK_TO_TASKS = 'Back to tasks';
export const NEITHER_WORD = 'neither';

/** A text option is quoted back at a glance, not re-read in full. */
export const SUMMARY_MAX_CHARS = 80;

type CompareItem = CompareTwoSpec['a'];

export type ComparePaidStateProps = {
  /** `null` renders nothing — see above. */
  choice: 'a' | 'b' | 'neither' | null;
  a: CompareItem;
  b: CompareItem;
  reason: string;
  amountUsdc: number;
  releaseTx: string;
  capturedAt: string;
};

/** First 6 characters, then the last 4 — a hash is a link, not something to read out. */
export function shortTx(tx: string): string {
  return `${tx.slice(0, 6)}…${tx.slice(-4)}`;
}

/** `14:32` on the worker's own clock. The instant itself stays the API's ISO string. */
export function judgedTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** The first 80 characters of a text option, ellipsised when there is more behind them. */
export function summarize(item: CompareItem): string {
  const text = item.text ?? '';
  return text.length > SUMMARY_MAX_CHARS ? `${text.slice(0, SUMMARY_MAX_CHARS)}…` : text;
}

export function ComparePaidState({
  choice,
  a,
  b,
  reason,
  amountUsdc,
  releaseTx,
  capturedAt,
}: ComparePaidStateProps) {
  if (choice === null) return <div data-paid-state="none" />;

  const at = judgedTime(capturedAt);

  return (
    <div className="lw-card" data-paid-state="released">
      {/* The proof, first and unconditionally. */}
      <div data-chosen={choice} style={{ marginBottom: 'var(--s-3)' }}>
        {choice === 'neither' ? (
          <p
            data-floor="20"
            style={{
              color: 'var(--verified-700)',
              fontFamily: 'var(--font-mono)',
              fontSize: '20px',
              margin: 0,
            }}
          >
            {NEITHER_WORD}
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--s-3)', gridTemplateColumns: '1fr 1fr' }}>
            <PairSummary chosen={choice === 'a'} item={a} label="A" />
            <PairSummary chosen={choice === 'b'} item={b} label="B" />
          </div>
        )}
      </div>

      <p data-reason="true" style={{ fontSize: '16px', margin: '0 0 var(--s-3)' }}>
        {`“${reason}”`}
      </p>

      {at === '' ? null : (
        <p className="lw-placeholder" data-judged="at" style={{ margin: '0 0 var(--s-4)' }}>
          {`judgement · timestamp ${at}`}
        </p>
      )}

      <p
        data-floor="20"
        data-released="usdc"
        style={{
          color: 'var(--verified-700)',
          fontFamily: 'var(--font-display)',
          fontSize: '40px',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          margin: 0,
        }}
      >
        {`Released · ${amountUsdc.toFixed(2)} USDC`}
      </p>

      <p style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', margin: 'var(--s-3) 0 0' }}>
        <Chip tone="verified" floor={20}>
          <a data-hit="44" href={`${BASESCAN_TX}${releaseTx}`} rel="noreferrer" target="_blank">
            {`tx ${shortTx(releaseTx)} ↗`}
          </a>
        </Chip>
        <Chip tone="neutral" floor={20}>
          {NOT_SPENDABLE}
        </Chip>
      </p>

      <p data-floor="20" data-completed="true" style={{ margin: 'var(--s-3) 0 var(--s-4)' }}>
        {COMPLETED_LINE}
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

/** One side of the pair as it appears on the receipt: a thumbnail, or the first 80 characters. */
function PairSummary({
  item,
  label,
  chosen,
}: {
  item: CompareItem;
  label: 'A' | 'B';
  chosen: boolean;
}) {
  return (
    <div
      data-option={label.toLowerCase()}
      data-picked={chosen ? 'true' : 'false'}
      style={{
        background: chosen ? 'var(--verified-tint-light)' : 'var(--paper-0)',
        border: `1px solid ${chosen ? 'var(--verified-border-light)' : 'var(--paper-border)'}`,
        borderRadius: 'var(--r-button)',
        padding: 'var(--s-2)',
      }}
    >
      <p
        style={{
          color: chosen ? 'var(--verified-700)' : 'var(--ink-text-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: '16px',
          margin: '0 0 var(--s-2)',
        }}
      >
        {label}
      </p>
      {item.kind === 'image' ? (
        // A plain `img`: the buyer's evidence, served from wherever the buyer put it, so
        // `next/image` cannot size or optimise it and the referrer never leaves the phone.
        <img
          alt={`option ${label}`}
          referrerPolicy="no-referrer"
          src={item.url}
          style={{
            aspectRatio: '1 / 1',
            borderRadius: 'var(--r-tag)',
            display: 'block',
            objectFit: 'cover',
            width: '100%',
          }}
        />
      ) : (
        <p style={{ fontSize: '16px', margin: 0 }}>{summarize(item)}</p>
      )}
    </div>
  );
}
