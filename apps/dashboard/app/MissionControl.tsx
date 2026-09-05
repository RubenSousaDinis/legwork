import { AgentCard } from '../components/AgentCard';
import { Chip } from '../components/Chip';
import { EscrowMeter } from '../components/EscrowMeter';
import { PosterStats } from '../components/PosterStats';
import { PreflightTrio } from '../components/PreflightTrio';
import { ScreeningLog } from '../components/ScreeningLog';
import { SectionLabel } from '../components/SectionLabel';
import { TaskRow } from '../components/TaskRow';
import { WorkerPool } from '../components/WorkerPool';
import { Wordmark } from '../components/Wordmark';
import type { DashboardData } from '../lib/data/types';

/**
 * The normal, non-present mission control: feed left, escrow and agent centre,
 * pool / screening / preflight / posters right. Single column below 1280.
 */
export function MissionControl({ data }: { data: DashboardData }) {
  return (
    <main className="mission" data-testid="mission-control" data-mode={data.dataMode}>
      <header className="mission-header">
        <Wordmark />
        <div className="mission-chips">
          {data.dataMode === 'demo' ? <Chip tone="demo">DEMO DATA</Chip> : null}
          <Chip tone="neutral">Base Sepolia · USDC</Chip>
          <Chip tone="neutral">testnet USDC — not spendable</Chip>
          <Chip tone="neutral">operator-attested</Chip>
        </div>
      </header>

      <div className="mission-columns">
        <div className="mission-col">
          <SectionLabel>feed</SectionLabel>
          <ul className="feed-rows">
            {data.feed.map((row) => (
              <li key={row.taskId}>
                <TaskRow row={row} />
              </li>
            ))}
          </ul>
        </div>

        <div className="mission-col">
          <EscrowMeter featured={data.featured} totals={data.totals} />
          <AgentCard agent={data.agent} />
        </div>

        <div className="mission-col">
          <WorkerPool pool={data.pool} />
          <ScreeningLog lines={data.screening} />
          <PreflightTrio preflight={data.preflight} pool={data.pool} />
          <PosterStats stats={data.posterStats} />
        </div>
      </div>
    </main>
  );
}
