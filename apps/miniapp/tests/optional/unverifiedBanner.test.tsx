import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UnverifiedBanner, type UnverifiedTask } from '../../components/UnverifiedBanner';

/**
 * The locked list. It renders with no provider, no session and no msw handler on purpose:
 * a banner that reached for a session or a network could not be the first thing a stranger
 * sees, and the assertion below is that it does neither.
 */

const TASKS: UnverifiedTask[] = [
  {
    task_id: '1024',
    task_type: 'verify-open',
    title: 'Padaria Central · Rua de Alcobaça 12, Leiria',
    price_usdc: 3.0,
  },
  {
    task_id: '1025',
    task_type: 'photo-of',
    title: 'Mercado Municipal · Largo 5 de Outubro, Leiria',
    price_usdc: 3.0,
    seeded: true,
  },
];

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

afterEach(cleanup);

describe('unverified state', () => {
  it('unverifiedShowsPrices', () => {
    const { container } = render(<UnverifiedBanner tasks={TASKS} />);

    const heading = screen.getByText('Verify to claim', { selector: 'p' });
    expect(heading.getAttribute('data-floor')).toBe('20');
    expect(
      screen.getByText('real tasks, real prices — verification takes about a minute'),
    ).not.toBeNull();

    // The worker's rate, twice over, at two decimals — never a deducted figure.
    expect(occurrences(container.textContent ?? '', '3.00')).toBe(2);
    expect(container.textContent).not.toContain('3.45');

    const locked = screen
      .getAllByRole('button', { name: 'Verify to claim' })
      .filter((node): node is HTMLButtonElement => node instanceof HTMLButtonElement);
    expect(locked.length).toBe(TASKS.length);
    for (const button of locked) {
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('aria-disabled')).toBe('true');
    }

    const cta = screen.getByText('Verify with World ID');
    expect(cta.getAttribute('href')).toBe('/');
    expect(cta.getAttribute('data-hit')).toBe('44');

    // Rule (9): the seeded row says so, and the real one does not.
    expect(screen.getAllByText('seeded').length).toBe(1);

    // The banner is first: everything else in the screen follows it in DOM order.
    const banner = container.querySelector('[data-banner="verify"]') as HTMLElement;
    const firstRow = container.querySelector('[data-task="1024"]') as HTMLElement;
    expect(banner.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('unverifiedShowsPrices — zero tasks', () => {
    render(<UnverifiedBanner tasks={[]} verifyHref="/" />);
    expect(screen.getByText('no open tasks right now')).not.toBeNull();
    expect(screen.queryAllByRole('button', { name: 'Verify to claim' }).length).toBe(0);
  });
});
