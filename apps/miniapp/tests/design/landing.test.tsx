import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@worldcoin/idkit', () => ({ IDKitRequestWidget: () => null }));
vi.mock('@worldcoin/minikit-js', () => ({
  MiniKit: { install: vi.fn(), isInstalled: vi.fn(() => false), walletAuth: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const { VerifiedState } = await import('../../components/VerifiedState');
const { resetSessionForTests, setSessionState } = await import('../../lib/session');
const { LANDING_FACTS, VERIFY_BUTTON, VERIFY_CAPTION } = await import('../../app/(auth)/Landing');
const AuthPage = (await import('../../app/(auth)/page')).default;

/**
 * The landing screen the first live run showed: a black button carrying a whole sentence in
 * uppercase, and `Verify to claim` said twice. Both are what these two tests hold shut.
 *
 * The header is `app/layout.tsx`'s, reproduced here because a layout is not renderable on
 * its own — the same shape `tests/verifiedChipAboveFold.test.tsx` uses.
 */
function renderHeaderAndLanding() {
  resetSessionForTests();
  setSessionState({ status: 'unverified' });

  return render(
    <>
      <header className="lw-header">
        <span className="lw-header__brand">
          <span className="lw-wordmark">LEGWORK</span>
        </span>
        <VerifiedState />
      </header>
      <main className="lw-main">
        <AuthPage />
      </main>
    </>,
  );
}

afterEach(cleanup);

describe('the landing card', () => {
  it('landingCtaIsOneShortLine', () => {
    const { container } = renderHeaderAndLanding();

    // The button says one short thing. Not a sentence, and nothing else inside it.
    const cta = screen.getByRole('button', { name: VERIFY_BUTTON });
    expect(cta.textContent).toBe(VERIFY_BUTTON);

    // What the label used to carry is the caption directly under it, in the same card.
    const caption = container.querySelector('[data-cta-caption]') as HTMLElement;
    expect(caption).not.toBeNull();
    expect(caption.textContent).toBe(VERIFY_CAPTION);
    // orb — the bundle default. The uniqueness clause is orb-only; see landingCaptionFollowsTheCredential.
    expect(caption.textContent).toBe('about 30 seconds · one account per person');
    expect(cta.closest('[data-step="landing"]')).toBe(caption.closest('[data-step="landing"]'));

    // The three facts, each on its own line, in the words the design gives them.
    expect(LANDING_FACTS).toEqual([
      'proof: photo + location',
      "paid after the poster approves — automatically when the task's window ends",
      'cloud-verified, operator-attested — onchain World ID verification is Orb-only today',
    ]);
    for (const fact of LANDING_FACTS) expect(screen.getByText(fact)).toBeTruthy();
  });

  it('oneVerifyChipOnTheUnverifiedScreen', () => {
    const { container } = renderHeaderAndLanding();

    const chips = screen.getAllByText('Verify to claim');
    expect(chips.length).toBe(1);

    const header = container.querySelector('header') as HTMLElement;
    expect(header.contains(chips[0] as Node)).toBe(true);

    // …and the card below it repeats nothing: the state lives in the header, once.
    const card = container.querySelector('[data-step="landing"]') as HTMLElement;
    expect(card.textContent).not.toContain('Verify to claim');
  });
});
