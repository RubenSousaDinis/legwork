'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
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
 * The one movement, in ms. Beat 7 is a single uncut shot and the meter has to read as
 * a change, so this is the declared duration and 800 is the hard cap. `present.css`
 * carries the same number as `--meter-ms`, and reduced motion drops that to `0ms`;
 * the class timer below reads whichever is in effect rather than assuming this one.
 */
const TRANSITION_MS = 700;

/** The states that are a payout. Everything else moves the fill and nothing else. */
const PAYOUT_STATES: readonly FeaturedState[] = ['released', 'refunded'];

/**
 * My own drawing of a bare footprint: a sole and a heel, two rounded shapes.
 * Nothing here is traced from the pre-kickoff pack.
 *
 * `currentColor` rather than a literal fill, so the colour is a CSS property the
 * `--meter-ms` transition can carry.
 */
function Footprint({ dimmed }: { dimmed: boolean }) {
  return (
    <svg
      className="meter-footprint"
      viewBox="0 0 24 34"
      role="img"
      aria-label="proof"
      fill="currentColor"
      style={{ color: dimmed ? 'var(--fg-4)' : 'var(--verified-500)' }}
    >
      <path d="M7.4 2.2c6.2 0 10.4 4.2 10.4 10.1 0 5.3-3.4 8.6-6.9 8.6-3.9 0-6.1-3.6-6.1-8.7 0-3.9.2-7 1-9.2a1.7 1.7 0 0 1 1.6-.8z" />
      <ellipse cx="12.4" cy="28.4" rx="5.2" ry="3.9" />
    </svg>
  );
}

/** `--meter-ms` as a number, or the declared duration when nothing resolves it. */
function resolvedMeterMs(el: HTMLElement | null): number {
  if (!el || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return TRANSITION_MS;
  }
  // The inline value first: under reduced motion the component sets it itself, and it
  // is the one declaration a stylesheet-less environment can still see.
  const raw =
    el.style.getPropertyValue('--meter-ms').trim() ||
    window.getComputedStyle(el).getPropertyValue('--meter-ms').trim();
  const ms = Number.parseFloat(raw);
  return Number.isNaN(ms) ? TRANSITION_MS : ms;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function EscrowMeter({ featured, totals, present = false }: EscrowMeterProps) {
  // No featured funded task: the meter rests at LOCKED 0.00, progress 0.
  const state: FeaturedState = featured?.state ?? 'locked';
  // Rule (2): the meter never says RELEASED without a proof reference beside it.
  // Without a proof it stays on the submitted wording.
  const showsRelease = state === 'released' && featured?.proofPresent === true;
  const displayState: FeaturedState = state === 'released' && !showsRelease ? 'submitted' : state;
  // With no featured funded task there is no money on the meter, so the route reads
  // empty: `LOCKED 0.00` at progress 0, not the resting half-fill of a locked task.
  const progress = featured ? PROGRESS[displayState] : 0;

  const locked = featured ? featured.escrowLocked : 0;
  const toWorker = featured ? featured.workerReceives : 0;
  const fee = featured ? featured.fee : 0;

  const stateWord =
    displayState === 'released' ? 'RELEASED' : displayState === 'refunded' ? 'REFUNDED' : displayState === 'submitted' ? 'SUBMITTED' : 'LOCKED';

  const root = useRef<HTMLElement | null>(null);
  // A ref, not state: the count is a fact about how many payouts have crossed this
  // component, and reading it must never itself schedule a render.
  const counted = useRef(0);
  // `null` until the first effect, so the initial state is never counted as a change.
  const previous = useRef<FeaturedState | null>(null);
  const [transitions, setTransitions] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(prefersReducedMotion());
  }, []);

  useEffect(() => {
    const from = previous.current;
    previous.current = state;
    // The mount is not a movement. `data-transitions` starts at 0 and stays there
    // until a payout actually crosses this component.
    if (from === null || from === state) return;
    // `locked → submitted` moves the fill and nothing else: no number changes, and
    // it is not the movement beat 7 films.
    if (!PAYOUT_STATES.includes(state)) return;

    counted.current += 1;
    setTransitions(counted.current);
    setTransitioning(true);
    const timer = setTimeout(() => setTransitioning(false), resolvedMeterMs(root.current));
    return () => clearTimeout(timer);
    // Keyed on the state alone: re-rendering with unchanged `featured` changes nothing.
  }, [state]);

  const className = [
    present ? 'meter meter-present card' : 'meter card',
    transitioning ? 'is-transitioning' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section
      ref={root}
      className={className}
      data-testid="escrow-meter"
      data-state={displayState}
      data-progress={String(progress)}
      data-transition-ms={String(TRANSITION_MS)}
      data-transitions={String(transitions)}
      // Reduced motion is instant, and says so in the same variable the CSS
      // transitions and the class timer both read.
      {...(reducedMotion ? { style: { '--meter-ms': '0ms' } as CSSProperties } : {})}
    >
      <div className="section-label">escrow</div>

      <div className="meter-route" data-progress={String(progress)}>
        <span className="meter-dot" aria-hidden="true" />
        <span className="meter-track">
          <span className="meter-fill" style={{ '--fill': progress } as CSSProperties} />
        </span>
        <Footprint dimmed={displayState === 'refunded'} />
      </div>

      {/*
        Every numeral below is plain text, swapped on the state change. Nothing counts,
        nothing tweens, and no intermediate figure exists in any frame: 3.45 becomes
        3.00 + 0.45 in one step or not at all.
      */}
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
