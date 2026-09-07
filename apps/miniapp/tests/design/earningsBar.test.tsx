import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const { EARNINGS_ONE_PAID } = await import('../../mocks/handlers');
const { setScenario } = await import('../../mocks/scenarios');
const { TaskList } = await import('../../app/tasks/TaskList');

/**
 * The bar at the bottom of `/tasks`. Every figure on it is `released_usdc` from
 * `GET /me/earnings` — earned only, `0.00` for a fresh account, nothing seeded and nothing
 * projected — and the line beside it says testnet before anybody taps through.
 */

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

async function barFigure(): Promise<HTMLElement> {
  return (await waitFor(() => {
    const node = document.querySelector('[data-earnings-bar] [data-earnings="released"]');
    expect(node).not.toBeNull();
    return node;
  })) as HTMLElement;
}

describe('the earnings bar', () => {
  it('earningsBarShowsReleasedOnly', async () => {
    setScenario({ earnings: 'one_paid' });
    render(<TaskList />);

    await waitFor(async () =>
      expect((await barFigure()).textContent).toBe(EARNINGS_ONE_PAID.released_usdc.toFixed(2)),
    );

    const bar = document.querySelector('[data-earnings-bar]') as HTMLAnchorElement;
    expect(bar.tagName).toBe('A');
    expect(bar.getAttribute('href')).toBe('/earnings');
    expect(bar.getAttribute('data-hit')).toBe('44');
    expect(bar.textContent).toContain('testnet USDC — not spendable');

    const figure = await barFigure();
    expect(figure.getAttribute('data-floor')).toBe('20');
    expect((figure.nextElementSibling as HTMLElement).textContent).toBe('USDC');

    cleanup();

    // A fresh account reads `0.00`, and that zero is the honest answer.
    setScenario({ earnings: 'zero' });
    render(<TaskList />);
    await waitFor(async () => expect((await barFigure()).textContent).toBe('0.00'));

    // Nothing seeded and nothing projected rides along with it.
    const zeroBar = document.querySelector('[data-earnings-bar]') as HTMLElement;
    expect(zeroBar.textContent).not.toContain('4.6');
    expect(screen.queryByText('seeded', { selector: '[data-earnings-bar] *' })).toBeNull();
  });
});
