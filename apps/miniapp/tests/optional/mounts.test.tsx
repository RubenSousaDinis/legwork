import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: replace }) }));

const { http, HttpResponse } = await import('msw');
const { server } = await import('../../mocks/server');
const { resetSessionForTests, setSessionState } = await import('../../lib/session');
const { ACTIVE_CLAIM_KEY } = await import('../../app/tasks/activeClaim');
const { default: TasksPage } = await import('../../app/tasks/page');
const { ProofFlow, REPORT_TASK_LABEL } = await import('../../app/proof/ProofFlow');
const { VERIFY_HEADING } = await import('../../components/UnverifiedBanner');

/**
 * T-42's two mount points, wired by the lead: the locked list on `/tasks` for a visitor with
 * no session, and the `Report task` link in the proof header.
 */

const TX = `0x${'aa11bb22cc33dd44ee55ff66aa11bb22'.repeat(2)}`;

/** Two `PublicTaskView` rows as `GET /public/feed` sends them: one open, one already released. */
const FEED = {
  tasks: [
    {
      task_id: '5',
      state: 'open',
      task_type: 'compare-two',
      price_usdc: 1,
      fee_usdc: 0.15,
      area: 'ez1dp',
      seeded: true,
      posted_at: '2026-09-05T10:05:00.000Z',
      tx: { post: TX },
      links: { post: `https://sepolia.basescan.org/tx/${TX}` },
      dashboard_url: 'http://localhost:3000/task/5',
    },
    {
      task_id: '7',
      state: 'released',
      task_type: 'verify-open',
      price_usdc: 3,
      fee_usdc: 0.45,
      area: 'ez1dp',
      seeded: false,
      posted_at: '2026-09-05T10:00:00.000Z',
      released_at: '2026-09-05T10:20:00.000Z',
      tx: { post: TX, claim: TX, submit: TX, release: TX },
      links: { post: `https://sepolia.basescan.org/tx/${TX}` },
      dashboard_url: 'http://localhost:3000/task/7',
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  replace.mockClear();
  resetSessionForTests();
});

afterEach(() => {
  cleanup();
});

describe('the two mount points', () => {
  it('unverifiedVisitorSeesTheLockedList', async () => {
    server.use(http.get('*/api/public/feed', () => HttpResponse.json(FEED)));
    setSessionState({ status: 'unverified' });

    render(<TasksPage />);

    // The banner first — the heading carries the floor, the locked rows repeat its words.
    const headings = await screen.findAllByText(VERIFY_HEADING);
    expect(headings.some((el) => el.getAttribute('data-floor') === '20')).toBe(true);
    // The open row at the worker's rate, titled by type and area; the released one never shows.
    await screen.findByText('compare-two · ez1dp');
    expect(screen.getByText('1.00 USDC')).toBeTruthy();
    expect(screen.queryByText('verify-open · ez1dp')).toBeNull();
    expect(screen.getByText('seeded')).toBeTruthy();
    for (const button of document.querySelectorAll('li button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    // A visitor is shown the offer, not sent away.
    expect(replace).not.toHaveBeenCalled();
    expect(document.querySelector('[data-screen="tasks"]')).toBeNull();
  });

  it('verifiedWorkerGetsTheList', async () => {
    setSessionState({
      status: 'verified',
      nullifier: '1001',
      level: 'selfie',
      mode: 'walletAuth',
      worker: `0x${'1'.repeat(40)}`,
      registered: true,
    });

    render(<TasksPage />);

    await waitFor(() => expect(document.querySelector('[data-screen="tasks"]')).not.toBeNull());
    expect(document.querySelector('[data-screen="tasks-unverified"]')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('proofHeaderLinksToReport', async () => {
    const claim = {
      task_id: '1024',
      claim_expires_at: '2026-09-06T10:22:00.000Z',
      submit_deadline: '2026-09-06T10:52:00.000Z',
      tx: TX,
    };
    localStorage.setItem(ACTIVE_CLAIM_KEY, JSON.stringify(claim));

    render(<ProofFlow claim={claim} taskId="1024" />);

    const link = (await screen.findByText(REPORT_TASK_LABEL)).closest('a');
    expect(link?.getAttribute('href')).toBe('/report/1024');
    expect(link?.getAttribute('data-hit')).toBe('44');
  });
});
