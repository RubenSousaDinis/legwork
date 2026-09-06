import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { PresentCanvas } from '../app/(present)/PresentCanvas';
import { demoDashboardData } from '../lib/data/demo';
import { getLiveDashboardData } from '../lib/data/live';
import {
  fixtures,
  liveHandlers,
  liveServer,
  SUBGRAPH_URL,
} from '../lib/data/fixtures/live/handlers';
import { poolString } from '../lib/format';
import type { DashboardData } from '../lib/data/types';

/** jsdom has no media queries; the mark counter and the meter both ask for one. */
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
});

const server = liveServer();

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUBGRAPH_QUERY_URL = SUBGRAPH_URL;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
afterAll(() => server.close());

/** Frozen, so the canvas never reaches for a clock and two renders are comparable. */
const NOW = Date.parse('2026-09-05T11:20:00.000Z');

function demo(): DashboardData {
  return demoDashboardData({ nowMs: NOW });
}

/**
 * Advances fake timers in small steps until `check` holds, so a real msw round trip
 * inside the poll has room to land. Faking the clock does not fake the network.
 */
async function settle(check: () => boolean, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if (check()) return;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  throw new Error('the poll never settled');
}

describe('present canvas', () => {
  it('hideCardsKeepsCentreFixed', () => {
    const data = demo();
    const centreOf = (root: HTMLElement) =>
      (root.querySelector('[data-column="centre"]') as HTMLElement).innerHTML;

    // No cuts: the whole canvas, and the attribute says so.
    const full = render(<PresentCanvas data={data} nowMs={NOW} hideCards={[]} />);
    expect(full.container.querySelectorAll('[data-testid="task-row"]')).toHaveLength(3);
    expect(
      (full.container.querySelector('.stage') as HTMLElement).getAttribute('data-hidden'),
    ).toBe('');
    const centreBefore = centreOf(full.container);
    cleanup();

    // Two cards cut from the left column. They render nothing at all — not an empty
    // card, not a placeholder chip.
    const cut = render(
      <PresentCanvas data={data} nowMs={NOW} hideCards={['agent', 'supply']} />,
    );
    expect(cut.container.querySelector('[data-testid="mark-counter"]')).toBeNull();
    expect(cut.container.textContent).not.toContain(poolString(data.pool.real, data.pool.seeded));
    expect(
      (cut.container.querySelector('.stage') as HTMLElement).getAttribute('data-hidden'),
    ).toBe('agent,supply');

    // The shot is untouched: the meter, row 1, the clock and the timer are all there,
    // each still carrying the floor it claims.
    const meter = cut.container.querySelector('[data-testid="escrow-meter"]') as HTMLElement;
    expect(meter).not.toBeNull();
    expect(meter.querySelector('[data-floor="32"]')).not.toBeNull();
    const centreRow = cut.container.querySelector(
      '[data-column="centre"] [data-testid="task-row"]',
    ) as HTMLElement;
    expect(centreRow).not.toBeNull();
    expect(centreRow.closest('[data-row]')?.getAttribute('data-row')).toBe('1');
    const clock = cut.container.querySelector('[data-testid="wall-clock"]') as HTMLElement;
    const elapsed = cut.container.querySelector('[data-testid="elapsed-timer"]') as HTMLElement;
    expect(clock.getAttribute('data-floor')).toBe('24');
    expect(elapsed.getAttribute('data-floor')).toBe('24');

    // Nothing in the centre column moved or changed.
    expect(centreOf(cut.container)).toBe(centreBefore);
    cleanup();

    // The cut order T-47 follows: row3, then row2. One row left, and it is row 1.
    const rowsCut = render(
      <PresentCanvas data={data} nowMs={NOW} hideCards={['row2', 'row3']} />,
    );
    expect(rowsCut.container.querySelectorAll('[data-testid="task-row"]')).toHaveLength(1);
    expect(
      (rowsCut.container.querySelector('.stage') as HTMLElement).getAttribute('data-hidden'),
    ).toBe('row2,row3');
    expect(centreOf(rowsCut.container)).toBe(centreBefore);
  });

  it('presentCanvasPollsInLiveMode', async () => {
    // Nothing marked yet: one refusal in the feed, no `Mark` entity on the subgraph.
    server.use(...liveHandlers(fixtures.refusals1, fixtures.marks0));
    const initial = await getLiveDashboardData();
    expect(initial.dataMode).toBe('live');
    expect(initial.agent.marks).toBe(0);

    vi.useFakeTimers();
    const { container } = render(<PresentCanvas data={initial} nowMs={NOW} />);
    expect(container.querySelector('[data-testid="mark-counter"]')?.textContent).toBe('0');

    // The mark lands on the subgraph. The canvas is inside T-26's poll, so the agent
    // card follows it without the page being reloaded.
    server.use(...liveHandlers(fixtures.refusals1, fixtures.marks1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await settle(
      () => container.querySelector('[data-testid="mark-counter"]')?.textContent === '1',
    );
    expect(container.querySelector('[data-testid="mark-counter"]')?.textContent).toBe('1');
  });
});
