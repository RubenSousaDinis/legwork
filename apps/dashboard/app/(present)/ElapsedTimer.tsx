'use client';

import { useEffect, useState } from 'react';
import { elapsed } from '../../lib/format';

/**
 * `t+mm:ss since posted`. Demo mode anchors `postedAt` to load-time − 252 s, so the
 * canvas reads `t+04:12` the moment it appears and keeps counting on both sides of
 * the labeled cut.
 */
export function ElapsedTimer({ fromIso, nowMs }: { fromIso: string; nowMs?: number }) {
  const [tick, setTick] = useState<number | null>(nowMs ?? null);

  useEffect(() => {
    if (typeof nowMs === 'number') return;
    setTick(Date.now());
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [nowMs]);

  return (
    <span className="mono present-elapsed" data-testid="elapsed-timer" data-floor="24">
      {tick === null ? 't+--:-- since posted' : elapsed(fromIso, tick)}
    </span>
  );
}
