'use client';

import { useEffect, useRef, useState } from 'react';
import { Chip } from './Chip';
import type { AgentData } from '../lib/data/types';

export interface AgentCardProps {
  agent: AgentData;
  present?: boolean;
}

/** The amber pulse on the mark numeral, in ms. T-43 owns the polish. */
const MARK_PULSE_MS = 600;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function AgentCard({ agent, present = false }: AgentCardProps) {
  const [settled, setSettled] = useState(agent.marks);
  const [pulse, setPulse] = useState<{ from: number; to: number } | null>(null);
  const previous = useRef(agent.marks);

  useEffect(() => {
    const from = previous.current;
    const to = agent.marks;
    previous.current = to;
    if (to <= from) {
      setSettled(to);
      return;
    }
    if (prefersReducedMotion()) {
      setSettled(to);
      setPulse(null);
      return;
    }
    setPulse({ from, to });
    const timer = setTimeout(() => {
      setSettled(to);
      setPulse(null);
    }, MARK_PULSE_MS);
    return () => clearTimeout(timer);
  }, [agent.marks]);

  return (
    <section className={present ? 'agent-card card card-present' : 'agent-card card'}>
      <div className="section-label">agent</div>

      <p className="agent-id mono" data-floor="24">
        #{agent.id}
      </p>
      {agent.label ? <p className="agent-label">{agent.label}</p> : null}
      {/* A score is rendered only when there is one; nothing stands in for it. */}
      {agent.score !== null ? (
        <p className="agent-score mono" data-floor="24">
          score {agent.score}
        </p>
      ) : null}

      <p className="agent-paid" data-floor="24">
        {agent.paidOnProof} {agent.paidOnProof === 1 ? 'task' : 'tasks'} paid on proof
      </p>

      <div className="agent-marks">
        <span
          className={pulse ? 'numeral mark-numeral is-animating' : 'numeral mark-numeral'}
          data-testid="mark-counter"
          data-value={String(settled)}
          {...(pulse ? { 'data-from': String(pulse.from), 'data-to': String(pulse.to) } : {})}
          data-floor="24"
        >
          {agent.marks}
        </span>
        <span className="mark-label mono" data-floor="24">
          marks
        </span>
      </div>
      {agent.lastMarkClass ? (
        <p className="agent-mark-class" data-floor="24">
          task-refused:{agent.lastMarkClass}
        </p>
      ) : null}

      <div className="agent-chips">
        <Chip tone="neutral">ERC-8004 identity</Chip>
      </div>
    </section>
  );
}
