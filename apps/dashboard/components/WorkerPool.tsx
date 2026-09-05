import { poolString } from '../lib/format';
import { Chip } from './Chip';
import type { PoolData } from '../lib/data/types';

export interface WorkerPoolProps {
  pool: PoolData;
}

/** `orb` is an onchain World ID proof; `selfie` is the cloud Selfie Check. */
export function credentialLabel(level: 'selfie' | 'orb'): string {
  return level === 'orb' ? 'sandbox World ID' : 'sandbox Selfie Check';
}

/**
 * The one highlighted real worker. `minutesReal` is rendered only when a real
 * completion time exists — an absent one is left off, never filled with a guess.
 */
export function HighlightedWorker({ pool }: { pool: PoolData }) {
  const w = pool.highlighted;
  if (!w) return null;
  return (
    <p className="pool-highlight" data-testid="highlighted-worker" data-floor="24">
      <span className="mono">{w.id}</span>
      {' · verified human ✓ · '}
      <Chip tone="verified">{credentialLabel(w.level)}</Chip>
      {typeof w.minutesReal === 'number' ? (
        <span className="mono"> · {w.minutesReal} min (real)</span>
      ) : null}
    </p>
  );
}

export function WorkerPool({ pool }: WorkerPoolProps) {
  return (
    <section className="worker-pool card">
      <div className="section-label">worker pool</div>

      {/* The pool headline is the only total on this card. */}
      <div className="pool-headline">
        <Chip tone="seeded">{poolString(pool.real, pool.seeded)}</Chip>
      </div>

      <HighlightedWorker pool={pool} />

      <ul className="pool-rows">
        {pool.rows.map((row) => (
          <li
            key={row.id}
            className={row.seeded ? 'pool-row pool-row-seeded' : 'pool-row'}
            data-seeded={row.seeded ? 'true' : 'false'}
          >
            <span className="mono pool-row-id">{row.id}</span>
            <span className="mono pool-row-area">{row.area}</span>
            <span className="mono pool-row-count">{row.completed} done</span>
            {row.seeded ? <Chip tone="seeded">seeded</Chip> : null}
          </li>
        ))}
      </ul>

      <p className="mono pool-note">a sample of the seeded pool · demo data</p>
    </section>
  );
}
