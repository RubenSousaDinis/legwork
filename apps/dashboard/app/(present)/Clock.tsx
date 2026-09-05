'use client';

import { useEffect, useState } from 'react';
import { clockTime } from '../../lib/format';

/**
 * The wall clock. `nowMs` freezes it for tests and for the composited frame; without
 * it the clock renders a placeholder on the server and starts ticking after hydration,
 * so the markup never disagrees with itself. T-43 syncs the source to the API.
 */
export function Clock({ nowMs }: { nowMs?: number }) {
  const [tick, setTick] = useState<number | null>(nowMs ?? null);

  useEffect(() => {
    if (typeof nowMs === 'number') return;
    setTick(Date.now());
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [nowMs]);

  return (
    <span className="mono present-clock" data-testid="wall-clock" data-floor="24">
      {tick === null ? '--:--:--' : clockTime(tick)}
    </span>
  );
}
