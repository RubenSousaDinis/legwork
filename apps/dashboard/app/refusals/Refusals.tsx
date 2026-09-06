import { ABUSE_CLASSES, NO_RETRY_SENTENCE, type AbuseClass } from '@legwork/shared';
import { Chip } from '../../components/Chip';
import { MonoTag } from '../../components/MonoTag';
import { shortHash } from '../../lib/format';
import type { DemoRefusals } from '../../lib/data/demo';
import type { DataMode } from '../../lib/data/types';
import './refusals.css';

/**
 * Class counts and hand-picked examples. **Never a raw live feed.**
 *
 * `/public/refusals.recent` is deliberately not a prop here: there is nothing on this
 * page for a live entry to render into, so a `spec`, a payer, an `agent_id` or a mark
 * tx cannot reach the page even if the API starts sending them. `ScreeningLog` is not
 * used either — it renders `#<agentId>` for a marked line, and a requester identity has
 * no place on a public surface.
 */

export interface RefusalsProps {
  counts: Record<AbuseClass, number>;
  total: number;
  examples: DemoRefusals['examples'];
  dataMode: DataMode;
  /** `refusals unavailable` when the counts could not be read. Never a demo number. */
  note?: string;
}

export function Refusals({ counts, total, examples, dataMode, note }: RefusalsProps) {
  return (
    <main className="refusals" data-testid="refusals" data-mode={dataMode}>
      <header className="refusals-head">
        <h1 className="card-title">Refusals</h1>
        <p className="refusals-lede">a refused task moves no money</p>
        <div className="refusals-chips">
          {dataMode === 'demo' ? <Chip tone="demo">DEMO DATA</Chip> : null}
          {dataMode === 'live' ? <Chip tone="neutral">counts live · examples demo data</Chip> : null}
          <Chip tone="refusal">task-refused</Chip>
        </div>
        {note ? <p className="mono refusals-note">{note}</p> : null}
      </header>

      {/* The six classes in id order, imported from the frozen tuple and never retyped. */}
      <section className="refusals-counts card">
        <div className="section-label">classes</div>
        <ul className="refusals-class-list">
          {ABUSE_CLASSES.map((abuseClass) => (
            <li key={abuseClass} className="refusals-class" data-class={abuseClass}>
              <span className="numeral refusals-count">{counts[abuseClass]}</span>
              <span className="refusals-class-label">{abuseClass}</span>
            </li>
          ))}
        </ul>
        <p className="mono refusals-total">total {total}</p>
      </section>

      <section className="refusals-examples card">
        <div className="section-label">hand-picked examples (demo data)</div>
        <ul className="refusals-example-list">
          {examples.map((example) => (
            <li key={example.specHash} className="refusals-example">
              <MonoTag type={example.taskType} />
              <p className="refusals-example-line" data-testid="refusal-example">
                {example.class} · {example.reason} · {example.ruleId} · spec{' '}
                {shortHash(example.specHash)}
              </p>
            </li>
          ))}
        </ul>
        <p className="refusals-no-retry">
          <span className="section-label">what the agent receives</span>
          <span className="mono refusals-no-retry-line">{NO_RETRY_SENTENCE}</span>
        </p>
      </section>
    </main>
  );
}
