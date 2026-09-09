import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@worldcoin/idkit', () => ({ IDKitRequestWidget: () => null }));
vi.mock('@worldcoin/minikit-js', () => ({
  MiniKit: { install: vi.fn(), isInstalled: vi.fn(() => false), walletAuth: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/',
}));

const BANNER = {
  orb: 'Verified human ✓ · World ID · one account per person',
  selfie: 'Verified human ✓ · World ID · a live person, camera-checked',
} as const;

const VERIFIED = {
  status: 'verified' as const,
  nullifier: `0x${'1f3e5a7c9b0d2468ace02468ace02468'.repeat(2)}`,
  mode: 'walletAuth' as const,
  worker: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  registered: true,
};

const { VerifiedState } = await import('../components/VerifiedState');
const { SiteNav } = await import('../components/SiteNav');
const { resetSessionForTests, setSessionState } = await import('../lib/session');
const AuthPage = (await import('../app/(auth)/verify/page')).default;

/**
 * The header is `app/layout.tsx`'s, reproduced here because a layout is not renderable on its
 * own: brand, nav, verified state, then `<main>`, so the verification state is above the fold
 * on every route and on every phone.
 */
function renderHeaderAndPage(level: 'selfie' | 'orb') {
  resetSessionForTests();
  setSessionState({ ...VERIFIED, level });

  return render(
    <>
      <header className="lw-header">
        <span className="lw-header__brand">
          <span className="lw-wordmark">LEGWORK</span>
        </span>
        <SiteNav />
        <VerifiedState />
      </header>
      <main className="lw-main">
        <AuthPage />
      </main>
    </>,
  );
}

afterEach(() => {
  cleanup();
  resetSessionForTests();
});

describe('layout', () => {
  it('verifiedChipAboveFold', () => {
    for (const [level, chip] of [
      ['selfie', 'World ID · Selfie Check'],
      ['orb', 'World ID · Orb'],
    ] as const) {
      const { container } = renderHeaderAndPage(level);

      // The sticky header, not merely somewhere on the page: `main` scrolls, the header does not.
      const header = container.querySelector('header');
      expect(header).not.toBeNull();

      const line = header?.querySelector('.lw-verified-line') ?? null;
      expect(
        line,
        `the sticky header renders no verified banner at level ${level} — it holds ` +
          `"${header?.textContent ?? ''}"`,
      ).not.toBeNull();
      expect(line?.textContent).toBe(BANNER[level]);
      expect(line?.getAttribute('data-floor')).toBe('20');
      if (level === 'orb') {
        expect(line?.textContent).toContain('one account per person');
      } else {
        expect(line?.textContent).not.toContain('one account per person');
      }

      const sub = line?.querySelector('.lw-verified-line__sub');
      expect(sub?.childNodes).toHaveLength(1);
      expect(sub?.firstChild?.nodeType).toBe(Node.TEXT_NODE);

      // Above the fold means before `main` in DOM order.
      const main = container.querySelector('main');
      expect(main).not.toBeNull();
      expect(
        (line as Node).compareDocumentPosition(main as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

      const banner = line?.closest('.lw-verified-banner') as HTMLElement;
      expect(banner).not.toBeNull();
      expect(within(banner).getByText(chip)).toBeTruthy();

      cleanup();
    }
  });
});
