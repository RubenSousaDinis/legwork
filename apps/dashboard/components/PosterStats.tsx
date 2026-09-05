import type { PosterStatsData } from '../lib/data/types';

export interface PosterStatsProps {
  stats: PosterStatsData;
}

export function PosterStats({ stats }: PosterStatsProps) {
  return (
    <section className="poster-stats card">
      <div className="section-label">posters</div>
      <p className="poster-stats-line" data-floor="24">
        external posters {stats.distinctExternalBuyers} · external tasks {stats.externalTasks}
      </p>
      <p className="mono poster-stats-note">excludes allowlisted buyers</p>
    </section>
  );
}
