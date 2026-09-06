'use client';

import { clockTime } from '../../lib/format';
import { useServerNow, type ClockSource } from './serverTime';

/**
 * `HH:MM:SS`, 24-hour, in the viewer's local zone — the same zone the phone shows,
 * because both machines read the same instant off the API's clock and only the
 * formatting is local. Re-exported here rather than re-implemented: T-10's `clockTime`
 * is already the one formatter every surface uses.
 */
export function formatClock(ms: number): string {
  return clockTime(ms);
}

/** What the server renders, before the client has an instant to show. */
const PLACEHOLDER = '--:--:--';

export interface ClockProps {
  /**
   * The instant to show. Leave it `undefined` and the clock keeps its own
   * server-synced time; pass a number — or `null` before hydration — and the parent
   * owns it, which is how `PresentCanvas` hands the same instant to `ElapsedTimer`
   * and how the OG image and the tests freeze the frame.
   */
  nowMs?: number | null;
  /** Only read with a pinned `nowMs`; the hook supplies its own otherwise. */
  source?: ClockSource;
}

export function Clock({ nowMs, source }: ClockProps) {
  // A branch on the prop, never a branch around the hook: the two faces are separate
  // components so the hook is either always called or never called.
  if (nowMs === undefined) return <SyncedClock />;
  return <ClockFace ms={nowMs} source={source ?? 'server'} />;
}

function SyncedClock() {
  const { nowMs, source } = useServerNow();
  return <ClockFace ms={nowMs} source={source} />;
}

/**
 * The suffix is a sibling of the floored element, not part of it: the wall clock's
 * own text is `HH:MM:SS` and nothing else, in every beat.
 */
function ClockFace({ ms, source }: { ms: number | null; source: ClockSource }) {
  return (
    <span className="present-clock-group">
      <span
        className="mono present-clock"
        data-testid="wall-clock"
        data-floor="24"
        data-source={source}
      >
        {ms === null ? PLACEHOLDER : formatClock(ms)}
      </span>
      {/*
        If this shows on Day 8 the API is down and the frame is on the laptop's clock.
        It is never in the filmed live frame — that is the whole point of showing it.
      */}
      {source === 'local' ? (
        <span className="mono present-clock-source" data-testid="wall-clock-source">
          · local
        </span>
      ) : null}
    </span>
  );
}
