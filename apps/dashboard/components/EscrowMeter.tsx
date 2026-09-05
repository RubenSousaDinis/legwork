import type { CSSProperties } from 'react';
import { MAX_TASK_AMOUNT_USDC } from '@legwork/shared';
import { timeOf, usdc } from '../lib/format';
import type { DashboardTotals, FeaturedState, FeaturedTask } from '../lib/data/types';

export interface EscrowMeterProps {
  /**
   * Only ever the featured *funded* task. A refused row has no escrow and never
   * reaches this component, so a refusal cannot move the meter.
   */
  featured: FeaturedTask | null;
  totals: DashboardTotals;
  present?: boolean;
}

/** How far the fill has travelled from the request dot toward the footprint. */
const PROGRESS: Record<FeaturedState, number> = {
  locked: 0.5,
  submitted: 0.85,
  released: 1,
  refunded: 0,
};

/**
 * My own drawing of a bare footprint: a sole and a heel, two rounded shapes.
 * Nothing here is traced from the pre-kickoff pack.
 */
function Footprint({ dimmed }: { dimmed: boolean }) {
  return (
    <svg
      className="meter-footprint"
      viewBox="0 0 24 34"
      role="img"
      aria-label="proof"
      fill={dimmed ? 'var(--fg-4)' : 'var(--verified-500)'}
    >
      <path d="M7.4 2.2c6.2 0 10.4 4.2 10.4 10.1 0 5.3-3.4 8.6-6.9 8.6-3.9 0-6.1-3.6-6.1-8.7 0-3.9.2-7 1-9.2a1.7 1.7 0 0 1 1.6-.8z" />
      <ellipse cx="12.4" cy="28.4" rx="5.2" ry="3.9" />
    </svg>
  );
}

export function EscrowMeter({ featured, totals, present = false }: EscrowMeterProps) {
  // No featured funded task: the meter rests at LOCKED 0.00, progress 0.
  const state: FeaturedState = featured?.state ?? 'locked';
  // Rule (2): the meter never says RELEASED without a proof reference beside it.
  // Without a proof it stays on the submitted wording.
  const showsRelease = state === 'released' && featured?.proofPresent === true;
  const displayState: FeaturedState = state === 'released' && !showsRelease ? 'submitted' : state;
  const progress = PROGRESS[displayState];

  const locked = featured ? featured.escrowLocked : 0;
  const toWorker = featured ? featured.workerReceives : 0;
  const fee = featured ? featured.fee : 0;

  const stateWord =
    displayState === 'released' ? 'RELEASED' : displayState === 'refunded' ? 'REFUNDED' : displayState === 'submitted' ? 'SUBMITTED' : 'LOCKED';

  return (
    <section
      className={present ? 'meter meter-present card' : 'meter card'}
      data-testid="escrow-meter"
      data-state={displayState}
      data-progress={String(progress)}
    >
      <div className="section-label">escrow</div>

      <div className="meter-route" data-progress={String(progress)}>
        <span className="meter-dot" aria-hidden="true" />
        <span className="meter-track">
          <span className="meter-fill" style={{ '--fill': progress } as CSSProperties} />
        </span>
        <Footprint dimmed={displayState === 'refunded'} />
      </div>

      <p className="meter-line">
        <span className="meter-state" data-floor="32">
          {stateWord}
        </span>{' '}
        <span className="meter-amount" data-floor="32">
          {usdc(displayState === 'released' ? toWorker : locked)}
        </span>
        {displayState === 'released' ? (
          <span className="meter-tail" data-floor="32">
            {' → worker · +'}
            {usdc(fee)} fee
          </span>
        ) : null}
        {displayState === 'refunded' ? (
          <span className="meter-tail" data-floor="32">
            {' → buyer'}
          </span>
        ) : null}
      </p>

      {showsRelease ? (
        <p className="meter-proof" data-floor="32">
          proof ✓ {featured?.proofCapturedAt ? timeOf(featured.proofCapturedAt) : 'on file'}
        </p>
      ) : null}

      <p className="meter-totals mono">
        locked in open tasks {usdc(totals.lockedUsdc)} · released today{' '}
        {usdc(totals.releasedTodayUsdc)} · refunded {usdc(totals.refundedUsdc)} · per-task cap{' '}
        {usdc(MAX_TASK_AMOUNT_USDC)} · Base Sepolia · USDC
      </p>

      <p className="meter-note mono">a refused task moves no money.</p>
    </section>
  );
}
