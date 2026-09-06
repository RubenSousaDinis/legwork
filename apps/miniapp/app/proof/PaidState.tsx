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
    <div className="lw-card" data-paid-state="released">
      {/* A plain `img`: the source is an object URL for a blob this phone holds in memory,
          which `next/image` cannot fetch, size or optimise. */}
      <img
        alt="the proof photo you handed in"
        src={proofThumbnailUrl}
        style={{
          borderRadius: 'var(--r-button)',
          display: 'block',
          maxHeight: '320px',
          objectFit: 'cover',
          width: '100%',
        }}
      />

      <p
        className="lw-placeholder"
        data-proof="captured_at"
        style={{ margin: 'var(--s-2) 0 var(--s-4)' }}
      >
        {`photo · timestamp ${captureTime(capturedAt)}`}
      </p>

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

      <p
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--s-2)',
          margin: 'var(--s-3) 0 0',
        }}
      >
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
        Back to tasks
      </a>
    </div>
  );
}
