'use client';

import { Footprint } from '../../components/Footprint';
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
 *
 * The card is white on the paper ground and the mint tint appears exactly once inside it,
 * around the money. Before this pass the receipt and the header's verified banner were the
 * same tinted block at the same weight, so the screen had two equal claims on the eye and
 * neither of them was the payout. Now the photo and the figure are the beat, the route line
 * between them draws why one produced the other, and everything else is small print.
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
          which `next/image` cannot fetch, size or optimise. The box is `.lw-thumb--proof`
          — a plate short enough that the figure below it lands on the same screen. */}
      <img
        alt="the proof photo you handed in"
        className="lw-thumb lw-thumb--proof"
        src={proofThumbnailUrl}
      />

      {/*
        DESIGN-SPEC "The idea": request → route → proof, drawn as a divider. The photo's own
        timestamp is where the route starts and the footprint is where it ends, and directly
        under the footprint is the money — which is the whole claim this product makes, drawn
        rather than described, on the one screen where it actually happened.
      */}
      <p className="lw-route">
        <span className="lw-route__stamp" data-proof="captured_at">
          {`photo · timestamp ${captureTime(capturedAt)}`}
        </span>
        <span aria-hidden="true" className="lw-route__line" />
        <Footprint size={24} />
      </p>

      {/*
        The word, the figure and its unit are one element because the released amount's text
        is `Released · 3.00 USDC` and `tests/proof/paidState.test.tsx` pins it as one string.
        Nothing here is a flex item: flex would strip the spaces either side of the `·` and
        the one before `USDC`, which is what turned the line into `Released·3.00USDC`. The
        line is inline, `nowrap`, and every part of it clears the phone's 20 px floor — the
        scale carries the hierarchy, the wrapping does not.
      */}
      <p className="lw-paid__money">
        <span className="lw-paid__amount" data-floor="20" data-released="usdc">
          <span className="lw-paid__word">Released</span>
          <span className="lw-paid__word"> · </span>
          <span className="lw-paid__figure">{amountUsdc.toFixed(2)}</span>
          <span className="lw-paid__unit"> USDC</span>
        </span>
        <span className="lw-paid__caveat">
          <Chip tone="neutral" floor={20}>
            {NOT_SPENDABLE}
          </Chip>
        </span>
      </p>

      {/* The chip sits under the amount on its own row: on a 390 px phone it and the
          completed line cannot share one and stay above 20 px. */}
      <p className="lw-paid__tx">
        <Chip tone="verified" floor={20}>
          <a data-hit="44" href={`${BASESCAN_TX}${releaseTx}`} rel="noreferrer" target="_blank">
            {`tx ${shortTx(releaseTx)} ↗`}
          </a>
        </Chip>
      </p>

      <p className="lw-paid__completed" data-completed="true" data-floor="20">
        {COMPLETED_LINE}
        {KEPT_THE_RATE}
      </p>

      {/*
        The way out, docked. On a phone the four tabs are fixed to the thumb zone, and a
        receipt this tall put the block action underneath them — a paid worker's last sight
        was the top third of a black rectangle. The dock rides above `.lw-nav__tabs` and the
        safe area at every scroll position, the way the earnings bar already does, so the
        whole button is on screen the moment the money lands.

        The button classes are on the anchor itself — a `Button` inside a link would be two
        nested interactive elements over one 56 px target.
      */}
      <p className="lw-paid__dock">
        <a
          className="lw-button lw-button--primary lw-button--lg lw-button--full"
          data-hit="44"
          href="/tasks"
        >
          Back to tasks
        </a>
      </p>
    </div>
  );
}
