import { usdc } from '../lib/format';
import { Chip } from './Chip';
import { MonoTag } from './MonoTag';
import { StatusBadge } from './StatusBadge';
import type { TaskRowData } from '../lib/data/types';

export interface TaskRowProps {
  row: TaskRowData;
  present?: boolean;
}

/** A phone call can only ever be a self-report, and every surface has to say so. */
const CALL_CONFIRM_DISCLOSURE = 'self-reported answer + timestamp (unverified)';

/**
 * The component guarantees the disclosure rather than trusting the adapter to add it,
 * so a live row cannot lose it. Appended once: a meta that already ends with it is
 * left alone.
 */
export function metaWithDisclosure(row: TaskRowData): string {
  if (row.type !== 'call-confirm' || row.meta.endsWith(CALL_CONFIRM_DISCLOSURE)) return row.meta;
  return row.meta ? `${row.meta} · ${CALL_CONFIRM_DISCLOSURE}` : CALL_CONFIRM_DISCLOSURE;
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
        <StatusBadge status={row.state} floor={24} />
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
          {metaWithDisclosure(row)}
        </span>
        {row.seeded ? <Chip tone="seeded">seeded</Chip> : null}
        {row.tx ? <Chip tone="neutral">tx ↗</Chip> : null}
      </div>
    </article>
  );
}
