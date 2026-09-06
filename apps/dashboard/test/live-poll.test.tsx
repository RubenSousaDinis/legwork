import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPoller, type PollResult } from '../lib/live/poll';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('poller', () => {
  it('pollShortCircuitsOnUnchanged', async () => {
    // ---- `changed: false` costs nothing downstream ---------------------------
    const onChange = vi.fn();
    let calls = 0;
    const unchanged = createPoller<number>({
      fetchOnce: async () => {
        calls += 1;
        return { value: calls, changed: false };
      },
      onChange,
      isHidden: () => false,
    });
    await vi.advanceTimersByTimeAsync(9000);
    expect(calls).toBe(3);
    expect(onChange).toHaveBeenCalledTimes(0);
    unchanged.dispose();

    // ---- the API's own backoff is honoured -----------------------------------
    const at: number[] = [];
    const backoff = createPoller<number>({
      fetchOnce: async () => {
        at.push(Date.now());
        return { value: 1, pollAfterSeconds: 7 };
      },
      onChange: vi.fn(),
      isHidden: () => false,
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(at).toHaveLength(1);
    // Still nothing at the plain 3 s interval: the wait is `max(interval, 7 s)`.
    await vi.advanceTimersByTimeAsync(3000);
    expect(at).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(at).toHaveLength(2);
    expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(7000);
    backoff.dispose();

    // ---- an identical mapped result fires `onChange` once ---------------------
    const same = vi.fn();
    const identical = createPoller<{ marks: number }>({
      fetchOnce: async () => ({ value: { marks: 0 } }),
      onChange: same,
      isHidden: () => false,
    });
    await vi.advanceTimersByTimeAsync(12000);
    expect(same).toHaveBeenCalledTimes(1);
    identical.dispose();

    // ---- requests never overlap ----------------------------------------------
    let inFlight = 0;
    let overlapped = false;
    let completed = 0;
    const slow = createPoller<number>({
      // Each response takes longer than the interval; the next tick is scheduled only
      // after this one has been awaited.
      fetchOnce: () => {
        inFlight += 1;
        if (inFlight > 1) overlapped = true;
        return new Promise<PollResult<number>>((resolve) => {
          setTimeout(() => {
            inFlight -= 1;
            completed += 1;
            resolve({ value: completed });
          }, 5000);
        });
      },
      onChange: vi.fn(),
      isHidden: () => false,
    });
    await vi.advanceTimersByTimeAsync(30000);
    expect(overlapped).toBe(false);
    expect(completed).toBeGreaterThan(1);
    slow.dispose();
  });

  it('pollerPausesWhileHiddenAndStopsOnDispose', async () => {
    let calls = 0;
    let hidden = true;
    const poller = createPoller<number>({
      fetchOnce: async () => {
        calls += 1;
        return { value: calls };
      },
      onChange: vi.fn(),
      isHidden: () => hidden,
    });

    // A hidden tab costs nothing at all: no request, just the next check.
    await vi.advanceTimersByTimeAsync(12000);
    expect(calls).toBe(0);

    hidden = false;
    await vi.advanceTimersByTimeAsync(3000);
    expect(calls).toBe(1);

    poller.dispose();
    await vi.advanceTimersByTimeAsync(30000);
    expect(calls).toBe(1);
  });

  it('pollerSurvivesAFailedFetch', async () => {
    const onError = vi.fn();
    const onChange = vi.fn();
    let calls = 0;
    const poller = createPoller<number>({
      fetchOnce: async () => {
        calls += 1;
        if (calls === 1) throw new Error('network down');
        return { value: calls };
      },
      onChange,
      onError,
      isHidden: () => false,
    });
    await vi.advanceTimersByTimeAsync(6000);
    expect(onError).toHaveBeenCalledTimes(1);
    // The loop keeps its rhythm rather than dying on one bad response.
    expect(onChange).toHaveBeenCalledTimes(1);
    poller.dispose();
  });
});
