import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { AgentCard } from '../components/AgentCard';
import { EscrowMeter } from '../components/EscrowMeter';
import { LiveDashboard } from '../lib/live/LiveDashboard';
import { getLiveDashboardData } from '../lib/data/live';
import {
  fixtures,
  liveHandlers,
  liveServer,
  refusalsHandler,
  SUBGRAPH_URL,
} from '../lib/data/fixtures/live/handlers';

const server = liveServer();

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUBGRAPH_QUERY_URL = SUBGRAPH_URL;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.useRealTimers();
});
afterAll(() => server.close());

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

describe('live dashboard', () => {
  it('markCounterAnimates', async () => {
    server.use(...liveHandlers(fixtures.refusals0));
    const initial = await getLiveDashboardData();
    expect(initial.agent.marks).toBe(0);

    vi.useFakeTimers();
    const { container } = render(
      <LiveDashboard initial={initial}>
        {(data) => (
          <>
            <EscrowMeter featured={data.featured} totals={data.totals} />
            <AgentCard agent={data.agent} />
          </>
        )}
      </LiveDashboard>,
    );

    const counter = () => container.querySelector('[data-testid="mark-counter"]')!;
    const meter = () => container.querySelector('[data-testid="escrow-meter"]')!;

    expect(counter().getAttribute('data-value')).toBe('0');
    const meterBefore = meter().outerHTML;

    // The refusal is marked between one poll and the next.
    server.use(refusalsHandler(fixtures.refusals1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await settle(() => counter().classList.contains('is-animating'));

    // Mid-pulse: the numeral is travelling and says where from and where to.
    expect(counter().className).toContain('is-animating');
    expect(counter().getAttribute('data-from')).toBe('0');
    expect(counter().getAttribute('data-to')).toBe('1');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(counter().getAttribute('data-value')).toBe('1');
    expect(counter().classList.contains('is-animating')).toBe(false);
    expect(container.textContent).toContain('task-refused:authentication circumvention');

    // Rule (2): a refused task moves no money, so the meter is byte-identical.
    expect(meter().outerHTML).toBe(meterBefore);
    expect(meterBefore).toContain('data-state="released"');
  });

  it('liveDashboardLeavesDemoDataAlone', async () => {
    // A demo canvas never opens a socket: no handler is touched, and msw's
    // `onUnhandledRequest: 'error'` would fail this test if one were.
    server.use(...liveHandlers(fixtures.refusals0));
    const live = await getLiveDashboardData();
    const demoShaped = { ...live, dataMode: 'demo' as const };

    vi.useFakeTimers();
    const seen: string[] = [];
    render(
      <LiveDashboard initial={demoShaped}>
        {(data) => {
          seen.push(data.dataMode);
          return <AgentCard agent={data.agent} />;
        }}
      </LiveDashboard>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(new Set(seen)).toEqual(new Set(['demo']));
  });

  it('liveDashboardPinsTheFilmedTaskThroughThePoll', async () => {
    server.use(...liveHandlers(fixtures.refusals1));
    const initial = await getLiveDashboardData({ taskId: '8' });
    expect(initial.featured?.taskId).toBe('8');

    vi.useFakeTimers();
    const { container } = render(
      <LiveDashboard initial={initial} taskId="8">
        {(data) => <EscrowMeter featured={data.featured} totals={data.totals} />}
      </LiveDashboard>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await settle(() => true);

    // The pin survives the poll: the newer released row does not take the meter over.
    const meter = container.querySelector('[data-testid="escrow-meter"]')!;
    expect(meter.getAttribute('data-state')).toBe('locked');
    expect(meter.textContent).toContain('3.45');
  });
});
