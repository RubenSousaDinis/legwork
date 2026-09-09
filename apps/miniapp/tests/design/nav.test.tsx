import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@worldcoin/idkit', () => ({ IDKitRequestWidget: () => null }));
vi.mock('@worldcoin/minikit-js', () => ({
  MiniKit: { install: vi.fn(), isInstalled: vi.fn(() => false), walletAuth: vi.fn(), user: {} },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const { resetSessionForTests, setSessionState } = await import('../../lib/session');
const { setScenario } = await import('../../mocks/scenarios');
const { resetAuthModalForTests } = await import('../../components/AuthModal');
const { SiteNav } = await import('../../components/SiteNav');
const { VerifiedState } = await import('../../components/VerifiedState');
const { VERIFY_CTA } = await import('../../components/UnverifiedBanner');

const VERIFIED = {
  status: 'verified' as const,
  nullifier: '1001',
  level: 'orb',
  mode: 'walletAuth' as const,
  worker: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  registered: true,
};

function renderHeader(state: typeof VERIFIED | { status: 'unverified' }) {
  setSessionState(state);
  return render(
    <header className="lw-header">
      <span className="lw-header__brand">
        <span className="lw-wordmark">LEGWORK</span>
      </span>
      <SiteNav />
      <VerifiedState />
    </header>,
  );
}

beforeEach(() => {
  localStorage.clear();
  resetSessionForTests();
  resetAuthModalForTests();
  setScenario({ earnings: 'unauthorized' });
  setSessionState({ status: 'unverified' });
});

afterEach(() => {
  cleanup();
  resetAuthModalForTests();
});

describe('site nav', () => {
  it('navCarriesLoginWhenOutAndLogoutWhenIn', () => {
    const loggedOut = renderHeader({ status: 'unverified' });
    const nav = loggedOut.container.querySelector('.lw-nav');
    expect(nav).not.toBeNull();
    expect(loggedOut.container.querySelectorAll('.lw-nav').length).toBe(1);

    expect(screen.getByRole('button', { name: VERIFY_CTA })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Logout' })).toBeNull();

    const tappables = Array.from(nav!.querySelectorAll('a, button'));
    expect(tappables.length).toBeGreaterThan(0);
    for (const node of tappables) {
      expect(node.getAttribute('data-hit')).toBe('44');
    }
    cleanup();

    const loggedIn = renderHeader(VERIFIED);
    const inNav = loggedIn.container.querySelector('.lw-nav');
    expect(inNav).not.toBeNull();
    expect(loggedIn.container.querySelectorAll('.lw-nav').length).toBe(1);

    expect(screen.getByRole('button', { name: 'Logout' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: VERIFY_CTA })).toBeNull();

    for (const node of Array.from(inNav!.querySelectorAll('a, button'))) {
      expect(node.getAttribute('data-hit')).toBe('44');
    }
  });
});
