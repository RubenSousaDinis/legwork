import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

import type { TaskRow } from '../../components/TaskCard';

const { TaskCard, TTL_LINE } = await import('../../components/TaskCard');

/**
 * The expanded card, top to bottom. The order is the design's, and the two things it is
 * easiest to get wrong while moving markup into classes are pinned beside it: the price is
 * still a figure with its unit as a separate node, and the claim window is still muted mono
 * rather than amber — amber on this surface means a refusal.
 */
const ROW: TaskRow = {
  task_id: '1024',
  task_type: 'verify-open',
  title: 'Padaria Central · Rua de Alcobaça 12, Leiria',
  price_usdc: 3.0,
  distance_m: 180,
  state: 'open',
  seeded: false,
  brief: {
    place: { name: 'Padaria Central', street_address: 'Rua de Alcobaça 12', locality: 'Leiria' },
    question: 'Is it open right now?',
  },
};

afterEach(cleanup);

describe('the expanded task card', () => {
  it('taskCardRowsInDesignOrder', () => {
    const { container } = render(
      <TaskCard expanded onClaim={() => {}} onRelease={() => {}} onToggle={() => {}} row={ROW} />,
    );

    const rows = Array.from(container.querySelectorAll('[data-row]')).map((node) =>
      node.getAttribute('data-row'),
    );
    expect(rows).toEqual(['type', 'name', 'meta', 'question', 'proof', 'claim', 'relayed']);

    // The price: the posted rate the worker keeps, and its unit beside it as its own node.
    const figure = container.querySelector('[data-price="usdc"]') as HTMLElement;
    expect(figure.textContent).toBe('3.00');
    const unit = figure.nextElementSibling as HTMLElement;
    expect(unit.textContent).toBe('USDC');
    expect(unit.className).toContain('lw-price__unit');

    // The claim window, in the muted mono of the meta — nothing amber anywhere near it.
    const ttl = container.querySelector('[data-ttl]') as HTMLElement;
    expect(ttl.textContent).toBe(TTL_LINE);
    expect(ttl.className).not.toContain('refusal');
    expect(ttl.outerHTML).not.toContain('--refusal');

    // The meta line: the place, the distance, and what the worker keeps.
    const meta = container.querySelector('[data-row="meta"]') as HTMLElement;
    expect(meta.textContent).toBe('Rua de Alcobaça 12, Leiria · ~180 m · you keep the full 3.00');

    // The relayed claim says so in the accent, because a relayed claim is good news.
    const relayed = container.querySelector('[data-row="relayed"] .lw-chip') as HTMLElement;
    expect(relayed.getAttribute('data-tone')).toBe('verified');
  });

  it('taskCardRowsInDesignOrder — no place on the brief', () => {
    const { container } = render(
      <TaskCard
        expanded
        onClaim={() => {}}
        onRelease={() => {}}
        onToggle={() => {}}
        row={{ ...ROW, brief: undefined }}
      />,
    );

    const meta = container.querySelector('[data-row="meta"]') as HTMLElement;
    expect(meta.textContent).toBe('~180 m · you keep the full 3.00');
  });
});
