import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));

const { setScenario } = await import('../../mocks/scenarios');
const { ACTIVE_CLAIM_KEY } = await import('../../app/tasks/activeClaim');
const { TaskList } = await import('../../app/tasks/TaskList');
const { Countdown } = await import('../../components/Countdown');

const TITLE = 'Padaria Central · Rua de Alcobaça 12, Leiria';

beforeEach(() => {
  localStorage.clear();
  replace.mockClear();
  push.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('the edges of the list', () => {
  it('emptyStateSaysTheListRefreshes', async () => {
    setScenario({ tasks: 'empty' });
    render(<TaskList />);

    expect(
      await screen.findByText('No open tasks near you right now — the list refreshes every 3 s.'),
    ).toBeTruthy();
  });

  it('countdownExpiresOnceAndDoesNotTurnAmber', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    let now = Date.parse('2026-09-06T10:00:00.000Z');

    render(
      <Countdown
        label="claim expires in"
        now={() => now}
        onExpire={onExpire}
        until="2026-09-06T10:00:03.000Z"
      />,
    );
    expect(screen.getByText('00:03')).toBeTruthy();

    now += 3000;
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByText('00:00')).toBeTruthy();
    expect(onExpire).toHaveBeenCalledTimes(1);

    // Still ticking, still one call — and still ink, because amber means a refusal.
    now += 5000;
    act(() => vi.advanceTimersByTime(5000));
    expect(onExpire).toHaveBeenCalledTimes(1);
    const clock = document.querySelector('[data-countdown]') as HTMLElement;
    expect(clock.outerHTML).not.toContain('--refusal');
  });

  it('expiredClaimReturnsToThePool', async () => {
    // The fixture's claim expired at 10:22Z; standing after it means the clock starts at zero.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-06T11:00:00.000Z') });

    render(<TaskList />);
    const summary = await screen.findByText(TITLE);
    fireEvent.click(summary.closest('button') as HTMLButtonElement);
    fireEvent.click(await screen.findByText('CLAIM'));

    expect(await screen.findByText('claim expired — it returned to the pool')).toBeTruthy();
    expect(localStorage.getItem(ACTIVE_CLAIM_KEY)).toBeNull();

    // The next poll un-pins it: the task is back on the list like any other open row.
    await waitFor(() => expect(document.querySelector('[data-claimed="true"]')).toBeNull(), {
      timeout: 4000,
    });
    expect(screen.getByText(TITLE)).toBeTruthy();
  });
});
