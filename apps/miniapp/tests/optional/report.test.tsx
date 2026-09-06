import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordBodies, recordRequests, renderPage, type RequestLog } from './harness';

const replace = vi.fn();
const back = vi.fn();
/** One stable object, as `useRouter()` hands back in the app. */
const router = { replace, push: replace, back };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const { ABUSE_CLASSES } = await import('@legwork/shared');
const { REPORT_RESPONSE } = await import('../../mocks/handlers');
const { server } = await import('../../mocks/server');
const { ACTIVE_CLAIM_KEY } = await import('../../app/tasks/activeClaim');
const { resetSessionForTests } = await import('../../lib/session');
const ReportPage = (await import('../../app/report/[id]/page')).default;

/**
 * Walking away from a task that smells like abuse. The whole test is about order: the claim
 * is released first and the class is reported second, and a release that fails reports
 * nothing at all.
 */

const TASK_ID = '9';
const CLAIM = {
  task_id: TASK_ID,
  claim_expires_at: '2026-09-06T10:22:00.000Z',
  submit_deadline: '2026-09-06T10:52:00.000Z',
  tx: `0x${'0c1d2e3f405162738495a6b7c8d9eaf0'.repeat(2)}`,
};

const COPY_LINES = [
  'reporting is free and anonymous to the buyer',
  'no gas — the relayer releases your claim',
  'the operator reviews reports; a mark is written only after review or when two different verified workers report the same buyer',
];

let requests: { log: RequestLog; stop: () => void };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(ACTIVE_CLAIM_KEY, JSON.stringify(CLAIM));
  replace.mockClear();
  back.mockClear();
  resetSessionForTests();
  requests = recordRequests();
});

afterEach(() => {
  requests.stop();
  cleanup();
});

/** Only what this screen posts to its own task — the title read is a GET and not part of it. */
function postsToTask(log: RequestLog): string[] {
  return log.filter((entry) => entry.startsWith(`POST /tasks/${TASK_ID}/`));
}

async function openReportScreen(): Promise<void> {
  renderPage(ReportPage, TASK_ID);
  await waitFor(() => expect(document.querySelector('[data-screen="report"]')).not.toBeNull());
}

function pick(abuseClass: string): void {
  fireEvent.click(document.querySelector(`[data-class="${abuseClass}"]`) as HTMLInputElement);
}

function reportButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Report and release claim' }) as HTMLButtonElement;
}

describe('report task', () => {
  it('reportReleasesThenReports', async () => {
    const reports = recordBodies('report', REPORT_RESPONSE);
    await openReportScreen();

    // All three lines are on the screen before anything is tapped.
    for (const line of COPY_LINES) expect(screen.getByText(line)).not.toBeNull();

    // The six labels, verbatim and in id order, from `packages/shared`.
    const rows = Array.from(document.querySelectorAll('[data-picker="abuse-class"] input'));
    expect(rows.map((row) => row.getAttribute('value'))).toEqual([...ABUSE_CLASSES]);
    for (const abuseClass of ABUSE_CLASSES) expect(screen.getByText(abuseClass)).not.toBeNull();
    expect(rows.every((row) => (row as HTMLInputElement).checked)).toBe(false);

    // Nothing is chosen, so there is nothing to report yet.
    expect(reportButton().disabled).toBe(true);

    pick('credential fraud');
    expect(reportButton().disabled).toBe(false);
    fireEvent.click(reportButton());

    await waitFor(() => expect(screen.queryByText('Reported · claim released')).not.toBeNull());

    // Release first, report second — exactly those two, in that order.
    expect(postsToTask(requests.log)).toEqual([
      `POST /tasks/${TASK_ID}/release-claim`,
      `POST /tasks/${TASK_ID}/report`,
    ]);
    expect(reports).toEqual([{ class: 'credential fraud' }]);

    // `clearActiveClaim()` ran: the phone is no longer holding this task.
    expect(localStorage.getItem(ACTIVE_CLAIM_KEY)).toBeNull();

    // A report moves no money, so no figure appears anywhere on the screen.
    expect(document.body.textContent).not.toMatch(/USDC|3\.45|3\.00|0\.45/);
  });

  it('reportReleasesThenReports — a failed release reports nothing', async () => {
    server.use(
      http.post('*/api/tasks/:id/release-claim', () =>
        HttpResponse.json({ error: 'AlreadyClaimed' }, { status: 409 }),
      ),
    );
    const reports = recordBodies('report', REPORT_RESPONSE);
    await openReportScreen();

    pick('credential fraud');
    fireEvent.click(reportButton());

    await waitFor(() =>
      expect(screen.queryByText('could not release the claim — try again')).not.toBeNull(),
    );

    expect(postsToTask(requests.log)).toEqual([`POST /tasks/${TASK_ID}/release-claim`]);
    expect(reports).toEqual([]);
    expect(screen.queryByText('Reported · claim released')).toBeNull();
    // The claim is still the worker's — it was never released.
    expect(localStorage.getItem(ACTIVE_CLAIM_KEY)).not.toBeNull();
  });
});
