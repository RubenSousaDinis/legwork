import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { EscrowMeter } from '../components/EscrowMeter';
import { PresentCanvas } from '../app/(present)/PresentCanvas';
import { demoDashboardData } from '../lib/data/demo';
import type {
  DashboardData,
  DashboardTotals,
  FeaturedState,
  FeaturedTask,
  ScreeningLine,
  TaskRowData,
} from '../lib/data/types';

/** jsdom has no media queries; the meter and the mark counter both ask for one. */
function stubReducedMotion(matches: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => stubReducedMotion(false));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Frozen, so the clock and `postedAt` are identical between renders. */
const NOW = Date.parse('2026-09-05T11:20:00.000Z');
const POSTED_AT = new Date(NOW - 252_000).toISOString();
const CAPTURED_AT = new Date(NOW - 62_000).toISOString();

/**
 * The money block, never retyped per beat: the agent pays 3.45, the escrow locks
 * 3.45, the worker receives 3.00 and the fee is 0.45 on top.
 */
const MONEY = { agentPays: 3.45, escrowLocked: 3.45, workerReceives: 3.0, fee: 0.45 };

/**
 * The day before the release lands: one escrow locked, nothing paid out yet. Chosen
 * so `3.00` can only ever come from the meter's own amount and never from the totals
 * line — the submitted beat has to be provably free of it.
 */
const TOTALS: DashboardTotals = { lockedUsdc: 3.45, releasedTodayUsdc: 0, refundedUsdc: 0 };

/**
 * Every `d.dd` figure the meter may render across the three beats. `10.00` is the
 * per-task cap and `0.00` the refunded total, both on the totals line. There is no
 * fourth number, and in particular nothing between 3.45 and 3.00.
 */
const ALLOWED_AMOUNTS = ['3.45', '3.00', '0.45', '0.00', '10.00'];

function featured(state: FeaturedState, proofPresent = state !== 'locked'): FeaturedTask {
  return {
    taskId: 'demo-1',
    state,
    ...MONEY,
    postedAt: POSTED_AT,
    proofPresent,
    ...(state === 'released' ? { releaseTx: '0x8f2a1c4d9b7e3a5f6c8d0e2b4a6c8e0f1a3c5d7e' } : {}),
    ...(proofPresent ? { proofCapturedAt: CAPTURED_AT } : {}),
  };
}

function amountsIn(text: string): string[] {
  return text.match(/\d+\.\d\d/g) ?? [];
}

describe('present meter', () => {
  it('meterAnimatesOnceOnRelease', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const seen: string[] = [];
    const { container, rerender } = render(
      <EscrowMeter featured={featured('locked')} totals={TOTALS} present />,
    );
    const meter = () => container.querySelector('[data-testid="escrow-meter"]') as HTMLElement;

    // The mount is not a movement: as far as anyone watching is concerned the meter
    // has always been locked, and `data-transitions` says so.
    expect(meter().getAttribute('data-transitions')).toBe('0');
    expect(meter().className).not.toContain('is-transitioning');
    expect(meter().textContent).toContain('3.45');
    const lockedProgress = Number(meter().getAttribute('data-progress'));
    seen.push(meter().textContent ?? '');

    // `locked → submitted` moves the fill and nothing else: no number changes, and
    // this is not the beat the video films, so nothing is counted.
    act(() => {
      rerender(<EscrowMeter featured={featured('submitted')} totals={TOTALS} present />);
    });
    expect(meter().getAttribute('data-transitions')).toBe('0');
    expect(meter().className).not.toContain('is-transitioning');
    expect(meter().textContent).toContain('3.45');
    expect(meter().textContent).not.toContain('3.00');
    expect(Number(meter().getAttribute('data-progress'))).toBeGreaterThan(lockedProgress);
    seen.push(meter().textContent ?? '');

    // The one movement, counted once.
    act(() => {
      rerender(<EscrowMeter featured={featured('released')} totals={TOTALS} present />);
    });
    expect(meter().getAttribute('data-transitions')).toBe('1');
    expect(meter().className).toContain('is-transitioning');
    expect(Number(meter().getAttribute('data-transition-ms'))).toBeLessThanOrEqual(800);
    expect(meter().textContent).toContain('RELEASED');
    expect(meter().textContent).toContain('3.00');
    expect(meter().textContent).toContain('0.45');
    expect(meter().textContent).toContain('proof ✓');
    seen.push(meter().textContent ?? '');

    // No counting animation: not one of the three frames carries an interpolated
    // figure, because the numerals are plain text swapped in a single render.
    for (const text of seen) {
      for (const amount of amountsIn(text)) {
        expect(ALLOWED_AMOUNTS, `unexpected figure on the meter: ${amount}`).toContain(amount);
      }
    }

    // Re-rendering with unchanged props changes nothing, and the class comes off on
    // its own after the declared duration.
    act(() => {
      rerender(<EscrowMeter featured={featured('released')} totals={TOTALS} present />);
    });
    expect(meter().getAttribute('data-transitions')).toBe('1');
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(meter().className).not.toContain('is-transitioning');
    expect(meter().getAttribute('data-transitions')).toBe('1');

    // Reduced motion is instant: the same variable the CSS transitions and the class
    // timer read resolves to 0ms.
    cleanup();
    stubReducedMotion(true);
    const reduced = render(<EscrowMeter featured={featured('released')} totals={TOTALS} present />);
    const reducedMeter = reduced.container.querySelector(
      '[data-testid="escrow-meter"]',
    ) as HTMLElement;
    expect(reducedMeter.style.getPropertyValue('--meter-ms')).toBe('0ms');
  });

  it('meterStaticOnRefusal', () => {
    const before: DashboardData = demoDashboardData({ nowMs: NOW, state: 'locked' });

    const refusedRow: TaskRowData = {
      taskId: 'demo-refused-new',
      type: 'call-confirm',
      title: 'Confirm by phone — Leiria',
      priceUsdc: 0,
      agentPaysUsdc: 0,
      state: 'refused',
      meta: 'via hire_human · no money moved',
      seeded: false,
      refusal: {
        class: 'authentication circumvention',
        reason: 'asks the worker to read a one-time code aloud from another person handset',
      },
    };
    const refusedLine: ScreeningLine = {
      at: new Date(NOW - 4000).toISOString(),
      outcome: 'refused',
      taskType: 'call-confirm',
      class: 'authentication circumvention',
      reason: 'asks the worker to read a one-time code aloud from another person handset',
      specHash: '0x8f2a1c4d9b7e3a5f6c8d0e2b4a6c8e0f1a3c5d7e',
      marked: true,
      agentId: before.agent.id,
    };

    const { container, rerender } = render(<PresentCanvas data={before} nowMs={NOW} />);
    const meterHtml = (
      container.querySelector('[data-testid="escrow-meter"]') as HTMLElement
    ).outerHTML;

    const after: DashboardData = {
      ...before,
      feed: [refusedRow, ...before.feed],
      screening: [refusedLine, ...before.screening],
      agent: { ...before.agent, marks: before.agent.marks + 1 },
    };
    act(() => {
      rerender(<PresentCanvas data={after} nowMs={NOW} />);
    });

    const meter = container.querySelector('[data-testid="escrow-meter"]') as HTMLElement;
    expect(meter.outerHTML).toBe(meterHtml);
    expect(meter.getAttribute('data-transitions')).toBe('0');
    expect(meter.className).not.toContain('is-transitioning');

    // And the refusal really did reach the canvas — a meter that stays still because
    // nothing happened proves nothing.
    const counter = container.querySelector('[data-testid="mark-counter"]') as HTMLElement;
    expect(counter.className).toContain('is-animating');
    expect(counter.getAttribute('data-to')).toBe('1');
  });
});
