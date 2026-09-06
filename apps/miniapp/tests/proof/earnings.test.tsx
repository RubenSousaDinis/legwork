import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: replace }) }));

const { EARNINGS_ONE_PAID, EARNINGS_ZERO } = await import('../../mocks/handlers');
const { setScenario } = await import('../../mocks/scenarios');
const { resetSessionForTests } = await import('../../lib/session');
const EarningsPage = (await import('../../app/earnings/page')).default;

/**
 * The earned-only rule: every figure on this page is one `GET /me/earnings` returned. No
 * seeded balance, no seeded score, no completion count the account did not do, and nothing
 * projected from what a shift "could" pay.
 */

beforeEach(() => {
  localStorage.clear();
  replace.mockClear();
  resetSessionForTests();
});

afterEach(cleanup);

describe('/earnings', () => {
  it('earningsEarnedOnly', async () => {
    setScenario({ earnings: 'zero' });
    render(<EarningsPage />);

    const zero = await screen.findByText('0.00');
    expect(zero.getAttribute('data-earnings')).toBe('released');
    expect(screen.getByText(/completed 0/).textContent).toBe(
      `completed ${EARNINGS_ZERO.completed} · score ${EARNINGS_ZERO.score} · distinct raters ${EARNINGS_ZERO.distinct_raters}`,
    );
    expect(screen.getByText('earned only — nothing seeded, nothing projected')).toBeTruthy();
    expect(screen.getByText('not spendable')).toBeTruthy();
    cleanup();

    resetSessionForTests();
    setScenario({ earnings: 'one_paid' });
    render(<EarningsPage />);

    expect((await screen.findByText('3.00')).getAttribute('data-earnings')).toBe('released');
    const tally = await waitFor(() => screen.getByText(/completed 1/));
    expect(tally.textContent).toBe(
      `completed ${EARNINGS_ONE_PAID.completed} · score ${EARNINGS_ONE_PAID.score} · distinct raters ${EARNINGS_ONE_PAID.distinct_raters}`,
    );

    // Nothing on the page is a figure the response did not carry. `4.6` and `11` are the
    // shapes a seeded balance or a projected count would take.
    const page = document.querySelector('[data-screen="earnings"]') as HTMLElement;
    expect(page.textContent).not.toContain('4.6');
    expect(page.textContent).not.toContain('11');
  });
});
