import { shortHash, timeOf } from '../lib/format';
import { MonoTag } from './MonoTag';
import { StatusBadge } from './StatusBadge';
import type { ScreeningLine } from '../lib/data/types';

export interface ScreeningLogProps {
  lines: ScreeningLine[];
  present?: boolean;
  max?: number;
}

/** Join class, rule id and reason with no stray separator. */
function refusedParts(line: ScreeningLine): string {
  return [line.ruleId, line.reason].filter((part): part is string => Boolean(part)).join(' · ');
}

/**
 * Renders only the fields of `ScreeningLine`. There is no spec text to render and
 * no requester identity anywhere in the shape, so neither can leak onto the page.
 */
export function ScreeningLog({ lines, present = false, max }: ScreeningLogProps) {
  const shown = typeof max === 'number' ? lines.slice(0, max) : lines;
  return (
    <section className={present ? 'screening card card-present' : 'screening card'}>
      <div className="section-label">screening log</div>
      <ul className="screening-lines" data-testid="screening-log">
        {shown.map((line, i) => {
          const rest = refusedParts(line);
          return (
            <li
              key={`${line.at}-${i}`}
              className={line.outcome === 'refused' ? 'screening-line is-refused' : 'screening-line'}
              data-outcome={line.outcome}
            >
              <span className="mono screening-at">{timeOf(line.at)}</span>
              <StatusBadge status={line.outcome} size="sm" />
              <MonoTag type={line.taskType} />
              {line.outcome === 'refused' ? (
                <span className="screening-reason" data-floor="32">
                  {line.class ? <span className="screening-class">{line.class}</span> : null}
                  {rest ? (
                    <>
                      {line.class ? ' · ' : ''}
                      {rest}
                    </>
                  ) : null}
                </span>
              ) : line.reason ? (
                <span className="screening-reason-passed" data-floor="24">
                  {line.reason}
                </span>
              ) : null}
              <span className="mono screening-spec">spec {shortHash(line.specHash)}</span>
              {line.marked && line.agentId ? (
                <span className="mono screening-mark">
                  task-refused → #{line.agentId}
                  {line.markTx ? ' · tx ↗' : ''}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
