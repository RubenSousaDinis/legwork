import type { PosterStatsData } from '../lib/data/types';

export interface PosterStatsProps {
  stats: PosterStatsData;
  /**
   * `HH:MM:SS` of the read behind these counts. Live mode passes the adapter's
   * `generatedAt`; demo mode leaves it off.
   */
  asOf?: string;
}

/**
 * External demand, counts only. Zero external posters is a real answer and says so in
 * words — a placeholder count here would be the one number on the page that is not
 * true.
 */
export function PosterStats({ stats, asOf }: PosterStatsProps) {
  const empty = stats.distinctExternalBuyers === 0 && stats.externalTasks === 0;
  return (
    <section className="poster-stats card">
      <div className="section-label">posters</div>
      <p className="poster-stats-line" data-floor="24">
        external posters {stats.distinctExternalBuyers} · external tasks {stats.externalTasks}
      </p>
      {empty ? (
        <p className="mono poster-stats-empty" data-floor="24">
          no external posters yet
        </p>
      ) : null}
      <p className="mono poster-stats-note">excludes allowlisted buyers</p>
      {asOf ? <p className="mono poster-stats-asof">as of {asOf}</p> : null}
    </section>
  );
}
