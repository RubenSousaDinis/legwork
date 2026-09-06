import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ABUSE_CLASSES, NO_RETRY_SENTENCE } from '@legwork/shared';
import { Refusals } from '../app/refusals/Refusals';
import { getDemoRefusals } from '../lib/data/demo';
import { refusalCounts, type WireRefusals } from '../lib/data/live';
import { fixtures } from '../lib/data/fixtures/live/handlers';

afterEach(cleanup);

describe('refusals page', () => {
  it('refusalsNeverRawSpec', () => {
    // The live fixture carries the four things a public surface may never render.
    const raw = fixtures.refusals1;
    const recent = raw.recent[0]!;
    expect(recent.spec).toBe('SPEC-LEAK');
    expect(recent.payer).toBe('0xPAYER');
    expect(recent.agent_id).toBe('8004-1207');
    expect(recent.mark_tx).toBe('0xMARK');

    // The page is composed exactly as `app/refusals/page.tsx` composes it in live mode:
    // counts from the API, examples from demo data, `recent` nowhere in the props.
    const demo = getDemoRefusals();
    const { container } = render(
      <Refusals
        // The recorded JSON widens its enums to `string`; the wire type is the shape
        // the adapter actually reads, and the extra leak fields ride along untouched.
        counts={refusalCounts(raw as unknown as WireRefusals)}
        total={raw.total}
        examples={demo.examples}
        dataMode="live"
      />,
    );
    const html = container.innerHTML;
    const text = container.textContent ?? '';

    for (const leak of ['SPEC-LEAK', '0xPAYER', '8004-1207', '0xMARK']) {
      expect(html).not.toContain(leak);
    }

    // All six classes, verbatim and in id order, each with its count. Zero renders `0`.
    const labels = [...container.querySelectorAll('.refusals-class')].map((li) => ({
      label: li.querySelector('.refusals-class-label')?.textContent,
      count: li.querySelector('.refusals-count')?.textContent,
    }));
    expect(labels.map((l) => l.label)).toEqual([...ABUSE_CLASSES]);
    expect(labels.find((l) => l.label === 'authentication circumvention')?.count).toBe('1');
    expect(labels.filter((l) => l.count === '0')).toHaveLength(5);
    expect(text).toContain('total 1');

    // The hand-picked example and the sentence the refused agent is handed.
    const examples = [...container.querySelectorAll('[data-testid="refusal-example"]')];
    expect(examples).toHaveLength(1);
    expect(examples[0]?.textContent).toContain('authentication circumvention');
    expect(text.split(NO_RETRY_SENTENCE)).toHaveLength(2); // exactly once
    expect(text).toContain('what the agent receives');

    // Live counts, demo examples, said out loud.
    expect([...container.querySelectorAll('.chip')].map((c) => c.textContent)).toContain(
      'counts live · examples demo data',
    );
    expect(text).toContain('a refused task moves no money');
    // The tag is `task-refused`, and there is no `DEMO DATA` chip in live mode.
    expect([...container.querySelectorAll('.chip')].map((c) => c.textContent)).not.toContain(
      'DEMO DATA',
    );
  });

  it('refusalsInDemoModeChipsItselfAndCountsTheSameJson', () => {
    const demo = getDemoRefusals();
    const { container } = render(
      <Refusals
        counts={demo.counts}
        total={demo.total}
        examples={demo.examples}
        dataMode="demo"
      />,
    );
    const chips = [...container.querySelectorAll('.chip')].map((c) => c.textContent);
    expect(chips).toContain('DEMO DATA');
    expect(chips).not.toContain('counts live · examples demo data');
    expect(demo.counts['authentication circumvention']).toBe(1);
    expect(demo.total).toBe(1);
  });

  it('refusalsSaysWhenTheCountsCouldNotBeRead', () => {
    const demo = getDemoRefusals();
    const { container } = render(
      <Refusals
        counts={refusalCounts(null)}
        total={0}
        examples={demo.examples}
        dataMode="live"
        note="refusals unavailable"
      />,
    );
    // A source that failed says so; it never borrows a demo number to fill the gap.
    expect(container.textContent).toContain('refusals unavailable');
    expect(container.textContent).toContain('total 0');
  });
});
