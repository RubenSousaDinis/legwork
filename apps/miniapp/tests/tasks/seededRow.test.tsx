import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));

import type { TaskRow } from '../../components/TaskCard';

const { TaskCard } = await import('../../components/TaskCard');
const { TaskList } = await import('../../app/tasks/TaskList');

/**
 * A seeded row is honest on both counts or it is not honest at all: it wears the `seeded`
 * chip, and it does not offer a button whose only possible answer is a 409. The board those
 * rows sit on is no longer one town's board either, which is the other half of this file —
 * three countries, two of them nowhere near Leiria.
 */
const ROW: TaskRow = {
  task_id: '1101',
  task_type: 'verify-open',
  title: 'Curry 36 · Mehringdamm 36, Berlin',
  price_usdc: 3.0,
  distance_m: 180,
  state: 'open',
  seeded: true,
  brief: {
    place: {
      name: 'Curry 36',
      street_address: 'Mehringdamm 36',
      locality: 'Berlin',
      country: 'DE',
    },
    question: 'Is it open right now?',
  },
};

function renderRow(row: TaskRow) {
  return render(
    <TaskCard expanded onClaim={() => {}} onRelease={() => {}} onToggle={() => {}} row={row} />,
  );
}

beforeEach(() => {
  localStorage.clear();
  replace.mockClear();
  push.mockClear();
});

afterEach(cleanup);

describe('a seeded row', () => {
  it('seededRowHasNoClaimButton', () => {
    const { container } = renderRow(ROW);

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((button) => button.textContent === 'CLAIM')).toBe(false);
    expect(screen.queryByText('CLAIM')).toBeNull();

    // The chip does not go with the button: the row still says what it is.
    const chip = container.querySelector('.lw-chip[data-tone="seeded"]') as HTMLElement;
    expect(chip.textContent).toBe('seeded');
    expect(chip.getAttribute('data-floor')).toBe('20');
  });

  it('seededRowSaysWhyItCannotBeClaimed', () => {
    const { container } = renderRow(ROW);

    const line = container.querySelector('[data-claim="seeded"]') as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.textContent).toContain('Not claimable');
    expect(line.textContent).toContain('no escrow');
    expect(line.getAttribute('data-floor')).toBe('20');

    // In the claim slot, where the button was — not appended after the card.
    expect(line.closest('[data-row="claim"]')).not.toBeNull();
  });

  it('realRowStillHasTheClaimButton', () => {
    const { container } = renderRow({ ...ROW, seeded: false });

    const claim = container.querySelector('[data-row="claim"]') as HTMLElement;
    expect(within(claim).getByText('CLAIM').tagName).toBe('BUTTON');
    expect(claim.querySelector('[data-claim="confirm"]')).not.toBeNull();
    expect(claim.querySelector('[data-claim="seeded"]')).toBeNull();
    expect(container.querySelector('.lw-chip[data-tone="seeded"]')).toBeNull();
  });

  it('boardMixesSeededAndRealRowsFromThreeCountries', async () => {
    render(<TaskList />);

    await screen.findByText('Padaria Central · Rua de Alcobaça 12, Leiria');

    const rows = document.querySelectorAll('[data-task]');
    expect(rows.length).toBeGreaterThanOrEqual(5);

    const seeded = document.querySelectorAll('.lw-chip[data-tone="seeded"]');
    expect(seeded.length).toBeGreaterThanOrEqual(3);

    expect(screen.getByText(/Curry 36/)).toBeTruthy();
    expect(screen.getByText(/Strand Book Store/)).toBeTruthy();
  });
});
