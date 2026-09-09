import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@worldcoin/idkit', () => ({ IDKitRequestWidget: () => null }));
vi.mock('@worldcoin/minikit-js', () => ({
  MiniKit: { install: vi.fn(), isInstalled: vi.fn(() => false), walletAuth: vi.fn(), user: {} },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const { resetSessionForTests, setSessionState } = await import('../lib/session');
const { setScenario } = await import('../mocks/scenarios');
const { VERIFY_BUTTON } = await import('../app/(auth)/Landing');
const VerifyPage = (await import('../app/(auth)/verify/page')).default;
const { UnverifiedTasks } = await import('../app/tasks/UnverifiedTasks');

beforeEach(() => {
  localStorage.clear();
  resetSessionForTests();
  setSessionState({ status: 'unverified' });
  setScenario({ earnings: 'unauthorized' });
});

afterEach(cleanup);

describe('the auth flow lives at /verify', () => {
  it('verifyLivesAtItsOwnRoute', async () => {
    render(<VerifyPage />);
    expect(await screen.findByRole('button', { name: VERIFY_BUTTON })).toBeTruthy();
    expect(document.querySelector('[data-auth-step="landing"]')).not.toBeNull();
    expect(document.querySelector('[data-step="landing"]')).not.toBeNull();
    cleanup();

    render(<UnverifiedTasks />);
    const cta = await screen.findByRole('link', { name: 'Verify with World ID' });
    expect(cta.getAttribute('href')).toBe('/verify');
  });
});
