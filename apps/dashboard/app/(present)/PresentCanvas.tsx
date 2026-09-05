import { AgentCard } from '../../components/AgentCard';
import { Chip } from '../../components/Chip';
import { EscrowMeter } from '../../components/EscrowMeter';
import { PreflightTrio } from '../../components/PreflightTrio';
import { ScreeningLog } from '../../components/ScreeningLog';
import { TaskRow } from '../../components/TaskRow';
import { Wordmark } from '../../components/Wordmark';
import { Clock } from './Clock';
import { ElapsedTimer } from './ElapsedTimer';
import type { DashboardData } from '../../lib/data/types';
import './present.css';

export interface PresentCanvasProps {
  data: DashboardData;
  /** Freezes the clock and the elapsed timer; tests and T-47's frame pass it. */
  nowMs?: number;
}

/**
 * The sparse video canvas: escrow meter, agent card, the Supply card, the screening
 * log, three task rows, the wall clock and the elapsed timer. Nothing else — this is
 * not the nine-card mock.
 *
 * Geometry is in design units against `--u`; the centre column sits at x 680–1240,
 * inside the 656–1264 band that survives a 9:16 crop.
 */
export function PresentCanvas({ data, nowMs }: PresentCanvasProps) {
  const rows = data.feed.slice(0, 3);
  const [centreRow, ...sideRows] = rows;

  return (
    <div className="stage" data-testid="present-stage" data-mode={data.dataMode}>
      <header className="present-header">
        <Wordmark className="present-wordmark" />
        <div className="present-time">
          <Clock {...(typeof nowMs === 'number' ? { nowMs } : {})} />
          {data.featured ? (
            <ElapsedTimer
              fromIso={data.featured.postedAt}
              {...(typeof nowMs === 'number' ? { nowMs } : {})}
            />
          ) : null}
        </div>
        <div className="present-chips">
          {data.dataMode === 'demo' ? <Chip tone="demo">DEMO DATA</Chip> : null}
          <Chip tone="neutral">Base Sepolia · USDC</Chip>
          <Chip tone="neutral">testnet USDC — not spendable</Chip>
        </div>
      </header>

      <div className="present-columns">
        <div className="present-col present-col-left">
          <AgentCard agent={data.agent} present />
          <PreflightTrio preflight={data.preflight} pool={data.pool} present />
        </div>

        <div className="present-col present-col-centre">
          <EscrowMeter featured={data.featured} totals={data.totals} present />
          {centreRow ? <TaskRow row={centreRow} present /> : null}
        </div>

        <div className="present-col present-col-right">
          <ScreeningLog lines={data.screening} present max={4} />
          {sideRows.map((row) => (
            <TaskRow key={row.taskId} row={row} present />
          ))}
        </div>
      </div>
    </div>
  );
}
