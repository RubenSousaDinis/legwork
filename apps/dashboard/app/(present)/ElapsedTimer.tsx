'use client';

import { useServerNow } from './serverTime';

/** No featured task means there is no posting to count from, and nothing to invent. */
const NO_TASK = 't+—:— since posted';
/** What the server renders, before the client has an instant to show. */
const PLACEHOLDER = 't+--:-- since posted';

/**
 * `t+04:12 since posted`, and `t+1:02:05 since posted` once an hour has passed —
 * never `<n>h`. Clamped at `t+00:00` so a clock skew cannot print a negative.
 */
export function formatElapsed(postedAtIso: string, nowMs: number): string {
  const postedMs = Date.parse(postedAtIso);
  if (Number.isNaN(postedMs)) return NO_TASK;
  const total = Math.max(0, Math.floor((nowMs - postedMs) / 1000));
  const ss = String(total % 60).padStart(2, '0');
  const mm = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  if (hours > 0) return `t+${hours}:${String(mm).padStart(2, '0')}:${ss} since posted`;
  return `t+${String(mm).padStart(2, '0')}:${ss} since posted`;
}

export interface ElapsedTimerProps {
  /** `featured.postedAt`, or `null` when there is no featured funded task. */
  fromIso: string | null;
  /**
   * Same contract as `Clock`: `undefined` keeps its own server-synced time, a number
   * or `null` means the parent owns the instant. `PresentCanvas` passes the clock's.
   */
  nowMs?: number | null;
}

/**
 * Demo mode anchors `postedAt` to load-time − 252 s, so the canvas reads `t+04:12`
 * the moment it appears and keeps counting on both sides of the labeled cut.
 */
export function ElapsedTimer({ fromIso, nowMs }: ElapsedTimerProps) {
  if (nowMs === undefined) return <SyncedElapsedTimer fromIso={fromIso} />;
  return <ElapsedFace fromIso={fromIso} ms={nowMs} />;
}

function SyncedElapsedTimer({ fromIso }: { fromIso: string | null }) {
  const { nowMs } = useServerNow();
  return <ElapsedFace fromIso={fromIso} ms={nowMs} />;
}

function ElapsedFace({ fromIso, ms }: { fromIso: string | null; ms: number | null }) {
  const text = fromIso === null ? NO_TASK : ms === null ? PLACEHOLDER : formatElapsed(fromIso, ms);
  return (
    <span className="mono present-elapsed" data-testid="elapsed-timer" data-floor="24">
      {text}
    </span>
  );
}
