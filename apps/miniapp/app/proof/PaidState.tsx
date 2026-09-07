'use client';

import { Chip } from '../../components/ui/Chip';

/**
 * The released state, and the rule that makes it honest: **the proof photo is above it**.
 *
 * Not "beside it when convenient" — this component renders nothing at all without a
 * thumbnail. Escrow releasing on its own is the one image the submission must never produce,
 * so the guard lives in the component that draws the money rather than in the caller that
 * happens to have both.
 *
 * The amount is `amount_usdc` from `GET /tasks/:id`, passed in and printed. It is never
 * computed here, and never `amount − fee`: the agent pays 3.45, escrow locks 3.45, the worker
 * receives the posted 3.00 and the 0.45 fee rides on top.
 */

const BASESCAN_TX = 'https://sepolia.basescan.org/tx/';

export const NOT_SPENDABLE = 'testnet USDC — not spendable';
export const COMPLETED_LINE = '+1 completed';
export const KEPT_THE_RATE = ' · you kept the full posted rate';

export type PaidStateProps = {
  /** The photo that was handed in. `null` renders nothing — see above. */
  proofThumbnailUrl: string | null;
  amountUsdc: number;
  releaseTx: string;
  capturedAt: string;
};

/** First 6 characters, then the last 4 — a hash is a link, not something to read out. */
export function shortTx(tx: string): string {
  return `${tx.slice(0, 6)}…${tx.slice(-4)}`;
}

/** `14:32` on the worker's own clock. The instant itself stays the API's ISO string. */
export function captureTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

export function PaidState({ proofThumbnailUrl, amountUsdc, releaseTx, capturedAt }: PaidStateProps) {
  if (proofThumbnailUrl === null) return <div data-paid-state="none" />;

  return (
    <div className="lw-paid" data-paid-state="released" data-tone="verified">
      {/* A plain `img`: the source is an object URL for a blob this phone holds in memory,
          which `next/image` cannot fetch, size or optimise. Its box is the one inline style
          this screen keeps. */}
      <img
        alt="the proof photo you handed in"
        className="lw-thumb"
        src={proofThumbnailUrl}
        style={{ maxHeight: '320px' }}
      />

      <p className="lw-meta lw-meta--top" data-proof="captured_at">
        {`photo · timestamp ${captureTime(capturedAt)}`}
      </p>

      {/*
        The word, the figure and its unit are one element because the released amount's text
        is `Released · 3.00 USDC` and `tests/proof/paidState.test.tsx` pins it as one string.
        The scale carries the hierarchy instead: the label at the 16 px body floor, the
        figure at 38 px.
      */}
      <p className="lw-row lw-row--top">
        <span
          className="lw-stat lw-stat--lg lw-stat--released lw-paid__amount"
          data-floor="20"
          data-released="usdc"
        >
          <span className="lw-paid__word">Released</span>
          <span className="lw-paid__word"> · </span>
          <span>{amountUsdc.toFixed(2)}</span>
          <span className="lw-stat__unit"> USDC</span>
        </span>
        <Chip tone="neutral" floor={20}>
          {NOT_SPENDABLE}
        </Chip>
      </p>

      <p className="lw-meta lw-meta--top">
        <Chip tone="verified" floor={20}>
          <a data-hit="44" href={`${BASESCAN_TX}${releaseTx}`} rel="noreferrer" target="_blank">
            {`tx ${shortTx(releaseTx)} ↗`}
          </a>
        </Chip>
        <span data-completed="true">{COMPLETED_LINE}</span>
        <span>{KEPT_THE_RATE}</span>
      </p>

      {/* The button classes on the anchor itself — a `Button` inside a link would be two
          nested interactive elements over one 56 px target. */}
      <a
        className="lw-button lw-button--primary lw-button--lg lw-button--full"
        data-hit="44"
        href="/tasks"
      >
        Back to tasks
      </a>
    </div>
  );
}
