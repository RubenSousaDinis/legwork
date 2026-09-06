'use client';

import { useEffect, useRef, useState } from 'react';

export type CountdownProps = {
  /** ISO instant the clock runs down to — `claim_expires_at` here, `submit_deadline` in T-33. */
  until: string;
  label: string;
  onExpire?: () => void;
  /** Injectable clock so a fake-timer test can pin "now"; the app never passes it. */
  now?: () => number;
};

/**
 * `mm:ss` in mono, ticking once a second down to `00:00`, and then `onExpire` exactly once.
 *
 * The colour never changes with urgency. Amber is the refusal colour on every Legwork
 * surface, so a countdown that turned amber near zero would read as a refusal; a claim
 * running out is neither a refusal nor an error, so it stays ink the whole way down.
 */

const TICK_MS = 1000;

function secondsLeft(until: string, now: () => number): number {
  const ms = Date.parse(until) - now();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / TICK_MS);
}

function mmss(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function Countdown({ until, label, onExpire, now = Date.now }: CountdownProps) {
  const [seconds, setSeconds] = useState(() => secondsLeft(until, now));

  // `onExpire` is read through a ref so a caller passing a fresh closure every render does
  // not restart the interval — and `fired` keeps it to one call per deadline.
  const expire = useRef(onExpire);
  expire.current = onExpire;
  const fired = useRef(false);

  useEffect(() => {
    fired.current = false;
    setSeconds(secondsLeft(until, now));
    const id = setInterval(() => setSeconds(secondsLeft(until, now)), TICK_MS);
    return () => clearInterval(id);
  }, [until, now]);

  useEffect(() => {
    if (seconds > 0 || fired.current) return;
    fired.current = true;
    expire.current?.();
  }, [seconds]);

  return (
    <span
      className="lw-countdown"
      data-countdown={label}
      style={{ display: 'inline-flex', alignItems: 'baseline', gap: 'var(--s-2)' }}
    >
      <span className="lw-section-label">{label}</span>
      <span
        data-floor="20"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', lineHeight: 1.2 }}
      >
        {mmss(seconds)}
      </span>
    </span>
  );
}
