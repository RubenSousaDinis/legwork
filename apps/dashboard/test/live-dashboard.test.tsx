import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { AgentCard } from '../components/AgentCard';
import { EscrowMeter } from '../components/EscrowMeter';
import { WorkerPool } from '../components/WorkerPool';
import { LiveDashboard } from '../lib/live/LiveDashboard';
import { getLiveDashboardData } from '../lib/data/live';
import {
  fixtures,
  liveHandlers,
  liveServer,
  subgraphHandler,
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
    // The refusals feed is constant throughout: it supplies the screening line and the
    // class label. What moves is the subgraph `Mark` entity, which is the only place a
    // mark against an agent is recorded — the public API carries no requester identity.
    server.use(...liveHandlers(fixtures.refusals1, fixtures.marks0));
    const initial = await getLiveDashboardData();
    expect(initial.agent.id).toBe('8004-1207');
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

    // The refusal is marked onchain between one poll and the next.
    server.use(subgraphHandler(fixtures.marks1));
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
    server.use(...liveHandlers(fixtures.refusals0, fixtures.marks0));
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
    server.use(...liveHandlers(fixtures.refusals1, fixtures.marks1));
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

  it('credentialLevelSurvivesThePoll', async () => {
    server.use(...liveHandlers(fixtures.refusals1, fixtures.marks0));
    // What the server renders: `WORLD_CREDENTIAL_LEVEL=orb` resolved on the server.
    const fromServer = await getLiveDashboardData({ level: 'orb' });
    expect(fromServer.pool.highlighted?.level).toBe('orb');

    vi.useFakeTimers();
    const { container } = render(
      <LiveDashboard initial={fromServer}>
        {(data) => <WorkerPool pool={data.pool} />}
      </LiveDashboard>,
    );
    const chips = () => [...container.querySelectorAll('.chip')].map((c) => c.textContent);
    expect(chips()).toContain('sandbox World ID');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await settle(() => true);

    // The browser cannot read a server-only env, so the poll carries the level it was
    // given. Without that the chip would silently downgrade to `sandbox Selfie Check`.
    expect(chips()).toContain('sandbox World ID');
    expect(chips()).not.toContain('sandbox Selfie Check');
  });
});
