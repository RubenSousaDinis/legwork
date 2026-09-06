import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@worldcoin/idkit', () => ({ IDKitRequestWidget: () => null }));
vi.mock('@worldcoin/minikit-js', () => ({
  MiniKit: { install: vi.fn(), isInstalled: vi.fn(() => false), walletAuth: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const BANNER = 'Verified human ✓ · World ID · one account per person';

const VERIFIED = {
  status: 'verified' as const,
  nullifier: `0x${'1f3e5a7c9b0d2468ace02468ace02468'.repeat(2)}`,
  mode: 'walletAuth' as const,
  worker: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  registered: true,
};

/**
 * The header is `app/layout.tsx`'s, reproduced here because a layout is not renderable on its
 * own: a sticky `<header>` before `<main>`, so the verification state is above the fold on
 * every route and on every phone.
 */
async function renderHeaderAndPage(level: 'selfie' | 'orb') {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_WORLD_CREDENTIAL_LEVEL', level);

  const { VerifiedState } = await import('../components/VerifiedState');
  const { setSessionState } = await import('../lib/session');
  const AuthPage = (await import('../app/(auth)/page')).default;

  setSessionState({ ...VERIFIED, level });

  return render(
    <>
      <header className="lw-header">
        <span className="lw-wordmark">LEGWORK</span>
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
  vi.unstubAllEnvs();
});

describe('layout', () => {
  it('verifiedChipAboveFold', async () => {
    for (const [level, chip] of [
      ['selfie', 'sandbox Selfie Check'],
      ['orb', 'sandbox World ID'],
    ] as const) {
      const { container } = await renderHeaderAndPage(level);

      // The sticky header, not merely somewhere on the page: `main` scrolls, the header does not.
      const header = container.querySelector('header');
      expect(header).not.toBeNull();

      const line = header?.querySelector('.lw-verified-line') ?? null;
      expect(
        line,
        `the sticky header renders no verified banner at level ${level} — it holds ` +
          `"${header?.textContent ?? ''}"`,
      ).not.toBeNull();
      expect(line?.textContent).toContain(BANNER);
      expect(line?.getAttribute('data-floor')).toBe('20');

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
