'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The clock present mode films by.
 *
 * The wall clock and `t+mm:ss since posted` are the continuity proof across the
 * labeled cut, so they have to show the same time the phone shows. The phone's
 * `captured_at` is the API's clock; the laptop running the dashboard is a third
 * machine and may be seconds off. So the offset is read from the `Date` header of
 * `/api/healthz` — the API's clock, or the dashboard host's when the rewrite serves
 * the response itself. Both are NTP; the viewer's laptop is never the source.
 *
 * The round trip is halved rather than ignored: `Date.parse(date)` is the instant the
 * response was written, which is about `(t1 - t0) / 2` before it was read.
 */

export type ClockSource = 'server' | 'local';

export interface ServerOffset {
  /** Add to `Date.now()` to get the server's clock. */
  offsetMs: number;
  source: ClockSource;
}

/** The public health endpoint, same-origin through T-10's `/api/:path*` rewrite. */
export const HEALTHZ_URL = '/api/healthz';

/**
 * The honest fallback. Never a silent one: `source: 'local'` is what puts the
 * `· local` suffix on the clock, and if that shows in a take the API is down.
 */
const LOCAL: ServerOffset = { offsetMs: 0, source: 'local' };

export async function fetchServerOffset(url: string = HEALTHZ_URL): Promise<ServerOffset> {
  try {
    const t0 = Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    const t1 = Date.now();
    // Any response with a `Date` header will do — a 404 from the rewrite still
    // carries the host's clock, and that is a clock, not a failure.
    const date = res.headers.get('date');
    if (!date) return LOCAL;
    const serverMs = Date.parse(date);
    if (Number.isNaN(serverMs)) return LOCAL;
    return { offsetMs: serverMs + (t1 - t0) / 2 - t1, source: 'server' };
  } catch {
    return LOCAL;
  }
}

export interface UseServerNowOptions {
  /** How often the offset is read again. */
  resyncMs?: number;
  /** How often the returned instant advances. */
  tickMs?: number;
}

export interface ServerNow {
  /**
   * `Date.now() + offsetMs`, or `null` before the first client tick. Server-rendered
   * markup cannot know the viewer's instant, so the components render a placeholder
   * until this is a number rather than hydrating into a different string.
   */
  nowMs: number | null;
  source: ClockSource;
}

/**
 * One server-synced instant, shared by the clock and the elapsed timer so the two
 * can never disagree about what "now" is inside a single frame.
 */
export function useServerNow({
  resyncMs = 60_000,
  tickMs = 250,
}: UseServerNowOptions = {}): ServerNow {
  const offsetRef = useRef(0);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [source, setSource] = useState<ClockSource>('local');

  useEffect(() => {
    let live = true;

    const read = () => {
      if (live) setNowMs(Date.now() + offsetRef.current);
    };

    const sync = async () => {
      const next = await fetchServerOffset();
      if (!live) return;
      if (next.source === 'server') {
        offsetRef.current = next.offsetMs;
        setSource('server');
      } else {
        // A re-sync failure keeps the last offset — the clock must not jump back to
        // the laptop's time mid-take — and says so with the suffix instead.
        setSource('local');
      }
      read();
    };

    read();
    void sync();
    const tick = setInterval(read, tickMs);
    const resync = setInterval(() => {
      void sync();
    }, resyncMs);

    return () => {
      live = false;
      clearInterval(tick);
      clearInterval(resync);
    };
  }, [resyncMs, tickMs]);

  return { nowMs, source };
}
