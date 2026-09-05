import { usdc } from '../lib/format';
import { Chip } from './Chip';
import { MonoTag } from './MonoTag';
import { StatusBadge } from './StatusBadge';
import type { TaskRowData } from '../lib/data/types';

export interface TaskRowProps {
  row: TaskRowData;
  present?: boolean;
}

export function TaskRow({ row, present = false }: TaskRowProps) {
  const refused = row.state === 'refused';
  return (
    <article
      className={`task-row${refused ? ' task-row-refused' : ''}${present ? ' task-row-present' : ''}`}
      data-testid="task-row"
      data-state={row.state}
      data-seeded={row.seeded ? 'true' : 'false'}
    >
      <div className="task-row-head">
        <MonoTag type={row.type} />
        <h3 className="task-row-title" data-floor="24">
          {row.title}
        </h3>
        <StatusBadge status={row.state} />
      </div>

      {/*
        A refused task moves no money, so a refused row shows none: no price, no
        `agent paid`. Saying so out loud is the honest substitute.
      */}
      {refused ? (
        <p className="task-row-nomoney mono" data-floor="24">
          no money moved
        </p>
      ) : (
        <div className="task-row-money">
          <span className="numeral task-row-price" data-floor="24">
            {usdc(row.priceUsdc)}
          </span>
          <span className="mono task-row-unit" data-floor="24">
            USDC
          </span>
          <span className="mono task-row-paid" data-floor="24">
            agent paid {usdc(row.agentPaysUsdc)}
          </span>
        </div>
      )}

      {row.refusal ? (
        <p className="task-row-refusal" data-floor="32">
          {row.refusal.class ? `${row.refusal.class} · ` : ''}
          {row.refusal.reason}
        </p>
      ) : null}

      <div className="task-row-foot">
        <span className="mono task-row-meta" data-floor="24">
          {row.meta}
        </span>
        {row.seeded ? <Chip tone="seeded">seeded</Chip> : null}
        {row.tx ? <Chip tone="neutral">tx ↗</Chip> : null}
      </div>
    </article>
  );
}
