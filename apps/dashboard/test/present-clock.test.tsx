import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Clock, formatClock } from '../app/(present)/Clock';
import { ElapsedTimer, formatElapsed } from '../app/(present)/ElapsedTimer';

/**
 * The clock is the continuity proof across the labeled cut, so what is under test is
 * that it reads the *server's* instant and not the machine rendering it. The two are
 * five and a half hours apart below, which no rounding can hide.
 */

const ORIGIN = 'http://localhost:3000';
/** The API's clock, as it comes back on a `Date` header. */
const SERVER_DATE = 'Thu, 10 Sep 2026 14:32:05 GMT';
const SERVER_MS = Date.parse(SERVER_DATE);
/** The laptop's clock: hours off, and never the one that reaches the frame. */
const LAPTOP = '2026-09-10T09:00:00Z';

const healthz = http.get(`${ORIGIN}/api/healthz`, () =>
  HttpResponse.json({ ok: true }, { headers: { date: SERVER_DATE } }),
);

const server = setupServer(healthz);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.useRealTimers();
});
afterAll(() => server.close());

/**
 * Advances fake timers in small steps until `check` holds, so the msw round trip
 * inside the sync has room to land. Faking the clock does not fake the network.
 */
async function settle(check: () => boolean, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if (check()) return;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  throw new Error('the clock never synced');
}

describe('present clock', () => {
  it('clockUsesServerTime', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(LAPTOP);

    const clock = render(<Clock />);
    const face = () => clock.container.querySelector('[data-testid="wall-clock"]') as HTMLElement;
    await settle(() => face().getAttribute('data-source') === 'server');

    expect(face().textContent).toBe(formatClock(SERVER_MS));
    expect(face().textContent).not.toBe(formatClock(Date.now()));
    expect(face().getAttribute('data-source')).toBe('server');
    // The floored element's own text is the time and nothing else, in every beat.
    expect(face().textContent).toMatch(/^\d\d:\d\d:\d\d$/);
    expect(clock.container.textContent).not.toContain('· local');
    cleanup();

    // The phone's `captured_at` is on the same clock, so `t+04:12` is the same
    // `t+04:12` in both frames of the cut.
    const timer = render(
      <ElapsedTimer fromIso={new Date(SERVER_MS - 252_000).toISOString()} />,
    );
    const elapsed = () =>
      timer.container.querySelector('[data-testid="elapsed-timer"]') as HTMLElement;
    await settle(() => elapsed().textContent === 't+04:12 since posted');
    expect(elapsed().textContent).toBe('t+04:12 since posted');
    cleanup();

    // The API is down. The fallback is never silent: the source flips and the frame
    // says so, rather than quietly showing the laptop's time as if it were the API's.
    server.use(
      http.get(`${ORIGIN}/api/healthz`, () => HttpResponse.error()),
    );
    const offline = render(<Clock />);
    const offlineFace = () =>
      offline.container.querySelector('[data-testid="wall-clock"]') as HTMLElement;
    await settle(() => offlineFace().textContent !== '--:--:--');
    expect(offlineFace().getAttribute('data-source')).toBe('local');
    expect(offline.container.textContent).toContain('· local');
    expect(offlineFace().textContent).toBe(formatClock(Date.now()));
  });

  it('clockUsesServerTime · formatElapsed', () => {
    const posted = '2026-09-10T14:00:00.000Z';
    const at = (seconds: number) => formatElapsed(posted, Date.parse(posted) + seconds * 1000);

    expect(at(252)).toBe('t+04:12 since posted');
    // An hour is `t+h:mm:ss`, never `<n>h`.
    expect(at(3725)).toBe('t+1:02:05 since posted');
    // A clock skew cannot print a negative.
    expect(at(-5)).toBe('t+00:00 since posted');
    // No featured task means nothing to count from, and nothing is invented.
    expect(formatElapsed('not-an-instant', Date.parse(posted))).toBe('t+—:— since posted');
  });
});
