import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const { resetSessionForTests, setSessionState } = await import('../../lib/session');
const { default: RootPage } = await import('../../app/(auth)/page');
const { default: TasksPage } = await import('../../app/tasks/page');
const { VERIFY_CTA } = await import('../../components/UnverifiedBanner');

const VERIFIED = {
  status: 'verified' as const,
  nullifier: '1001',
  level: 'orb',
  mode: 'walletAuth' as const,
  worker: `0x${'1'.repeat(40)}`,
  registered: true,
};

beforeEach(() => {
  localStorage.clear();
  resetSessionForTests();
  setSessionState({ status: 'unverified' });
});

afterEach(cleanup);

describe('the list is the front page', () => {
  it('rootShowsTheListNotTheSignIn', async () => {
    render(<RootPage />);

    expect(await screen.findByText(VERIFY_CTA)).toBeTruthy();
    expect(document.querySelector('[data-screen="tasks-unverified"]')).not.toBeNull();
    expect(await screen.findByText('Is it open right now?')).toBeTruthy();

    const cta = screen.getByRole('button', { name: VERIFY_CTA });
    expect(cta.getAttribute('data-cta')).toBe('verify');
    expect(cta.getAttribute('data-hit')).toBe('44');
    expect(cta.getAttribute('href')).toBeNull();

    expect(document.querySelector('[data-auth-step]')).toBeNull();
    expect(document.querySelector('[data-step="landing"]')).toBeNull();
    expect(screen.queryByRole('link', { name: VERIFY_CTA })).toBeNull();
  });

  it('rootShowsTheWorkersOwnListWhenVerified', async () => {
    setSessionState(VERIFIED);
    render(<RootPage />);

    await waitFor(() => expect(document.querySelector('[data-screen="tasks"]')).not.toBeNull());
    expect(document.querySelector('[data-screen="tasks-unverified"]')).toBeNull();
    expect(document.querySelector('[data-auth-step]')).toBeNull();
  });

  it('tasksRouteStillResolves', async () => {
    const unverifiedRoot = render(<RootPage />);
    expect(await screen.findByText(VERIFY_CTA)).toBeTruthy();
    expect(unverifiedRoot.container.querySelector('[data-screen="tasks-unverified"]')).not.toBeNull();
    cleanup();

    const unverifiedTasks = render(<TasksPage />);
    expect(await screen.findByText(VERIFY_CTA)).toBeTruthy();
    expect(unverifiedTasks.container.querySelector('[data-screen="tasks-unverified"]')).not.toBeNull();
    cleanup();

    setSessionState(VERIFIED);
    const verifiedRoot = render(<RootPage />);
    await waitFor(() =>
      expect(verifiedRoot.container.querySelector('[data-screen="tasks"]')).not.toBeNull(),
    );
    cleanup();

    setSessionState(VERIFIED);
    const verifiedTasks = render(<TasksPage />);
    await waitFor(() =>
      expect(verifiedTasks.container.querySelector('[data-screen="tasks"]')).not.toBeNull(),
    );
  });

  it('previewRowNamesTheErrandOnce', async () => {
    render(<RootPage />);

    const row = (await screen.findByText('Is it open right now?')).closest('[data-task]') as HTMLElement;
    expect(row.getAttribute('data-task')).toBe('1024');
    expect(row.querySelector('.lw-monotag')?.textContent).toBe('verify-open');
    expect(row.textContent?.split('verify-open').length).toBe(2);
    expect(row.textContent).not.toContain('ez1dn');
  });
});
