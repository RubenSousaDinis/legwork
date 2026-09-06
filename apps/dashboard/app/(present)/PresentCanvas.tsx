'use client';

import { AgentCard } from '../../components/AgentCard';
import { Chip } from '../../components/Chip';
import { EscrowMeter } from '../../components/EscrowMeter';
import { PreflightTrio } from '../../components/PreflightTrio';
import { ScreeningLog } from '../../components/ScreeningLog';
import { TaskRow } from '../../components/TaskRow';
import { Wordmark } from '../../components/Wordmark';
import { LiveDashboard } from '../../lib/live/LiveDashboard';
import { Clock } from './Clock';
import { ElapsedTimer } from './ElapsedTimer';
import { useServerNow, type ClockSource } from './serverTime';
import type { DashboardData } from '../../lib/data/types';
import './present.css';

/**
 * The cards a take may drop. The escrow meter and row 1 are not on this list and
 * never will be: they are the shot.
 */
export type HideCard = 'agent' | 'supply' | 'screening' | 'row2' | 'row3';

/**
 * `data-hidden` is written in this order whatever order the query asked for, so two
 * takes that cut the same cards produce the same attribute.
 */
const HIDE_ORDER: readonly HideCard[] = ['agent', 'supply', 'screening', 'row2', 'row3'];

/**
 * How many screening lines present mode shows. The right column carries the log and
 * two feed rows in 932 design px, and the demo refusal alone wraps to four lines at
 * its 32 px floor — so the log shows the refusals and stops there rather than
 * overflowing its card, which is what T-39 measured on the Day-5 gate.
 */
const PRESENT_SCREENING_LINES = 2;

export interface PresentCanvasProps {
  data: DashboardData;
  /** Freezes the clock and the elapsed timer; tests and T-47's frame pass it. */
  nowMs?: number;
  /** The cards this take cuts. Order does not matter; unknown names never get here. */
  hideCards?: HideCard[];
  /** `?task=` — pins the filmed task through T-26's poll in live mode. */
  taskId?: string;
}

/**
 * The sparse video canvas: escrow meter, agent card, the Supply card, the screening
 * log, three task rows, the wall clock and the elapsed timer. Nothing else — this is
 * not the nine-card mock.
 *
 * Geometry is in design units against `--u`; the centre column sits at x 680–1240,
 * inside the 656–1264 band that survives a 9:16 crop.
 *
 * In live mode the canvas is mounted inside T-26's `LiveDashboard`, so the meter,
 * the rows, the screening log and the mark counter all refresh on the same 3-s poll
 * and the operator films one surface rather than four that disagree.
 */
export function PresentCanvas({ data, nowMs, hideCards = [], taskId }: PresentCanvasProps) {
  const frozen = typeof nowMs === 'number' ? { nowMs } : {};

  if (data.dataMode === 'live') {
    return (
      <LiveDashboard initial={data} {...(taskId ? { taskId } : {})}>
        {(live) => <Stage data={live} hideCards={hideCards} {...frozen} />}
      </LiveDashboard>
    );
  }
  return <Stage data={data} hideCards={hideCards} {...frozen} />;
}

function Stage({
  data,
  nowMs,
  hideCards,
}: {
  data: DashboardData;
  nowMs?: number;
  hideCards: HideCard[];
}) {
  const hidden = HIDE_ORDER.filter((card) => hideCards.includes(card));
  const isHidden = (card: HideCard) => hidden.includes(card);

  const rows = data.feed.slice(0, 3);
  const [row1, row2, row3] = rows;

  return (
    <div
      className="stage"
      data-testid="present-stage"
      data-mode={data.dataMode}
      data-hidden={hidden.join(',')}
    >
      <header className="present-header">
        <div className="present-header-top">
          <Wordmark className="present-wordmark" />
          <PresentTime postedAt={data.featured?.postedAt ?? null} {...(nowMs === undefined ? {} : { nowMs })} />
        </div>
        <div className="present-chips">
          {data.dataMode === 'demo' ? <Chip tone="demo">DEMO DATA</Chip> : null}
          <Chip tone="neutral">Base Sepolia · USDC</Chip>
          <Chip tone="neutral">testnet USDC — not spendable</Chip>
        </div>
      </header>

      <div className="present-columns">
        <div className="present-col present-col-left" data-column="left">
          {isHidden('agent') ? null : <AgentCard agent={data.agent} present />}
          {isHidden('supply') ? null : (
            <PreflightTrio preflight={data.preflight} pool={data.pool} present />
          )}
        </div>

        <div className="present-col present-col-centre" data-column="centre">
          <EscrowMeter featured={data.featured} totals={data.totals} present />
          {row1 ? (
            <div className="present-row" data-row="1">
              <TaskRow row={row1} present />
            </div>
          ) : null}
        </div>

        <div className="present-col present-col-right" data-column="right">
          {isHidden('screening') ? null : (
            <ScreeningLog lines={data.screening} present max={PRESENT_SCREENING_LINES} />
          )}
          {row2 && !isHidden('row2') ? (
            <div className="present-row" data-row="2">
              <TaskRow row={row2} present />
            </div>
          ) : null}
          {row3 && !isHidden('row3') ? (
            <div className="present-row" data-row="3">
              <TaskRow row={row3} present />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * One instant for both readouts. The clock and the timer are the continuity proof
 * across the labeled cut, so they are driven from a single `useServerNow` rather than
 * two that could land a tick apart.
 */
function PresentTime({ postedAt, nowMs }: { postedAt: string | null; nowMs?: number }) {
  // A frozen frame reads no clock at all: no fetch, no interval, nothing to settle.
  if (typeof nowMs === 'number') return <TimeFace postedAt={postedAt} ms={nowMs} source="server" />;
  return <SyncedTime postedAt={postedAt} />;
}

function SyncedTime({ postedAt }: { postedAt: string | null }) {
  const { nowMs, source } = useServerNow();
  return <TimeFace postedAt={postedAt} ms={nowMs} source={source} />;
}

function TimeFace({
  postedAt,
  ms,
  source,
}: {
  postedAt: string | null;
  ms: number | null;
  source: ClockSource;
}) {
  return (
    <div className="present-time">
      <Clock nowMs={ms} source={source} />
      <ElapsedTimer fromIso={postedAt} nowMs={ms} />
    </div>
  );
}
