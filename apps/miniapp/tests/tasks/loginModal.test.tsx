import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
const { default: RootPage } = await import('../../app/(auth)/page');
const { VERIFY_CTA } = await import('../../components/UnverifiedBanner');

beforeEach(() => {
  localStorage.clear();
  resetSessionForTests();
  resetAuthModalForTests();
  setSessionState({ status: 'unverified' });
  setScenario({ earnings: 'unauthorized' });
});

afterEach(() => {
  cleanup();
  resetAuthModalForTests();
});

describe('the board opens login in a modal', () => {
  it('loginModalOpensFromTheBoard', async () => {
    render(
      <>
        <header className="lw-header">
          <SiteNav />
        </header>
        <RootPage />
      </>,
    );

    await screen.findByText('Is it open right now?');

    const boardCta = document.querySelector('[data-cta="verify"]') as HTMLButtonElement;
    expect(boardCta).not.toBeNull();
    expect(boardCta.tagName).toBe('BUTTON');
    expect(boardCta.textContent).toBe(VERIFY_CTA);
    expect(boardCta.getAttribute('data-hit')).toBe('44');

    const pathBefore = window.location.pathname;
    fireEvent.click(boardCta);

    expect(await screen.findByText('Verify once. Claim tasks nearby.')).toBeTruthy();
    expect(document.querySelector('.lw-modal [data-step="landing"]')).not.toBeNull();
    expect(document.querySelector('dialog')).toBeNull();
    expect(window.location.pathname).toBe(pathBefore);
    expect(window.location.pathname).not.toBe('/verify');
  });
});
