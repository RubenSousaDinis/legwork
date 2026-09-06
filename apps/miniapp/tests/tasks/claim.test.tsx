import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordRequests } from './requests';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));

const { CLAIM_RESPONSE } = await import('../../mocks/handlers');
const { setScenario } = await import('../../mocks/scenarios');
const { ACTIVE_CLAIM_KEY } = await import('../../app/tasks/activeClaim');
const { TaskList } = await import('../../app/tasks/TaskList');

const TASK_ID = '1024';
const TITLE = 'Padaria Central · Rua de Alcobaça 12, Leiria';
const RELAYED = 'relayed claim · gas paid by Legwork';

/**
 * `claim_expires_at` in the fixture is a fixed 10:22Z, so every test that wants a *live* claim
 * has to stand before it — otherwise the countdown is already at `00:00` and the card is
 * showing the expiry copy instead of the actions. 09:52Z makes the claim exactly 1800 s long.
 */
const CLAIMED_AT = '2026-09-06T09:52:00.000Z';

let requests: ReturnType<typeof recordRequests>;

beforeEach(() => {
  localStorage.clear();
  replace.mockClear();
  push.mockClear();
  requests = recordRequests();
});

afterEach(() => {
  requests.stop();
  vi.useRealTimers();
  cleanup();
});

/** Open the first row and press its single CLAIM button. */
async function claimFirstTask(): Promise<void> {
  const summary = await screen.findByText(TITLE);
  fireEvent.click(summary.closest('button') as HTMLButtonElement);
  fireEvent.click(await screen.findByText('CLAIM'));
}

describe('claiming', () => {
  it('claimShowsCountdown', async () => {
    // Only `Date` is faked: msw answers over real timers, and the countdown reads the clock.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(CLAIMED_AT) });

    render(<TaskList />);
    await claimFirstTask();

    await waitFor(() =>
      expect(requests.count('POST', `/api/tasks/${TASK_ID}/claim`)).toBe(1),
    );

    const card = await waitFor(() => {
      const node = document.querySelector('[data-claimed="true"]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });

    // The claim is relayed and it says so, with the transaction linked rather than described.
    expect(screen.getByText(RELAYED)).toBeTruthy();
    const txLink = card.querySelector('a') as HTMLAnchorElement;
    expect(txLink.getAttribute('href')).toBe(
      `https://sepolia.basescan.org/tx/${CLAIM_RESPONSE.tx}`,
    );
    expect(txLink.textContent).toBe(
      `tx ${CLAIM_RESPONSE.tx.slice(0, 6)}…${CLAIM_RESPONSE.tx.slice(-4)} ↗`,
    );

    const clock = card.querySelector('[data-countdown]')?.textContent ?? '';
    expect(clock).toMatch(/(30:00|29:59)/);

    const stored = JSON.parse(localStorage.getItem(ACTIVE_CLAIM_KEY) ?? 'null');
    expect(stored).toEqual({
      task_id: TASK_ID,
      claim_expires_at: CLAIM_RESPONSE.claim_expires_at,
      submit_deadline: CLAIM_RESPONSE.submit_deadline,
      tx: CLAIM_RESPONSE.tx,
    });
  });

  it('releaseClaimCallsRoute', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(CLAIMED_AT) });

    render(<TaskList />);
    await claimFirstTask();
    await waitFor(() => expect(document.querySelector('[data-claimed="true"]')).not.toBeNull());

    fireEvent.click(screen.getByText('release this claim'));

    await waitFor(() =>
      expect(requests.count('POST', `/api/tasks/${TASK_ID}/release-claim`)).toBe(1),
    );
    await waitFor(() => expect(localStorage.getItem(ACTIVE_CLAIM_KEY)).toBeNull());

    // Back to the list: nothing is pinned, and both rows are there to be claimed again.
    await waitFor(() => expect(document.querySelector('[data-claimed="true"]')).toBeNull());
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.getByText('Mercado Municipal · Largo 5 de Outubro, Leiria')).toBeTruthy();

    // Exactly once — a second release would be a second relayed transaction.
    expect(requests.count('POST', `/api/tasks/${TASK_ID}/release-claim`)).toBe(1);
  });

  it('cooldownMessageOn409', async () => {
    setScenario({ claim: 'InCooldown' });
    render(<TaskList />);
    await claimFirstTask();
    expect((await screen.findByText(/claim again within 15 min/)).textContent).toBe(
      'You released or let a claim expire recently. You can claim again within 15 min.',
    );
    // Amber is the refusal colour; a claim someone else won is not a refusal.
    expect(document.querySelector('[data-error="claim"]')?.getAttribute('style')).toContain(
      'var(--ink-text)',
    );
    cleanup();

    setScenario({ claim: 'AlreadyClaimed' });
    render(<TaskList />);
    await screen.findByText(TITLE);
    const before = requests.count('GET', '/api/tasks/list');
    await claimFirstTask();
    expect(await screen.findByText(/claimed this task first/)).toBeTruthy();
    // The list was already wrong, so it asked again rather than waiting out the 3 s.
    await waitFor(() => expect(requests.count('GET', '/api/tasks/list')).toBe(before + 1));
    cleanup();

    setScenario({ claim: 'SeededCannotClaimExternal' });
    render(<TaskList />);
    await claimFirstTask();
    expect((await screen.findByText(/seeded demo worker/)).textContent).toBe(
      'This account is a seeded demo worker; it can only claim operator-funded tasks.',
    );
  });
});
