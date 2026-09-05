import { Chip } from './Chip';
import { HighlightedWorker } from './WorkerPool';
import { poolString } from '../lib/format';
import type { PoolData, PreflightData } from '../lib/data/types';

export interface PreflightTrioProps {
  preflight: PreflightData;
  pool: PoolData;
  /** In present mode this card is the Supply card: trio + highlighted row + pool chip. */
  present?: boolean;
}

/**
 * A median is either computed from real completions — and says how few — or it is
 * labelled `seeded`. It is never presented as a live figure.
 */
export function medianLabel(p: PreflightData): string {
  if (p.medianMinutes === null || p.medianSource === 'n/a') return '—';
  if (p.medianSource === 'real') return `${p.medianMinutes} min (real, n=${p.nReal})`;
  return `${p.medianMinutes} min (seeded)`;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="preflight-stat">
      <span className="numeral preflight-number" data-floor="32">
        {value}
      </span>
      <span className="mono preflight-label" data-floor="32">
        {label}
      </span>
    </div>
  );
}

export function PreflightTrio({ preflight, pool, present = false }: PreflightTrioProps) {
  return (
    <section className={present ? 'preflight card card-present' : 'preflight card'}>
      <div className="section-label">{present ? 'supply' : 'preflight'}</div>

      <div className="preflight-trio" data-testid="preflight-trio">
        <Stat value={preflight.active} label="active" />
        <Stat value={preflight.verified} label="verified" />
        <Stat value={preflight.seeded} label="seeded" />
      </div>

      <p className="mono preflight-meta" data-floor="24">
        score ≥ {preflight.scoreFloor} · median {medianLabel(preflight)}
      </p>

      {present ? (
        <>
          <HighlightedWorker pool={pool} />
          <div className="pool-headline">
            <Chip tone="seeded">{poolString(pool.real, pool.seeded)}</Chip>
          </div>
        </>
      ) : null}
    </section>
  );
}
