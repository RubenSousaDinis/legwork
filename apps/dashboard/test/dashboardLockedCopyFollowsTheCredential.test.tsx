import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AboutPage from '../app/about/page';
import DeckPage from '../app/deck/page';
import OverviewPage from '../app/overview/page';
import { CLAIM, TRUST_MODEL, claimSentence, trustModelSentence } from '../app/copy';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('dashboard locked copy', () => {
  it('dashboardLockedCopyFollowsTheCredential', () => {
    vi.stubEnv('WORLD_CREDENTIAL_LEVEL', 'orb');
    const aboutOrb = render(<AboutPage />).container;
    expect(aboutOrb.textContent).toContain(claimSentence('orb'));
    expect(aboutOrb.textContent).toContain(trustModelSentence('orb'));
    expect(claimSentence('orb')).toBe(CLAIM);
    expect(trustModelSentence('orb')).toBe(TRUST_MODEL);
    cleanup();

    const overviewOrb = render(<OverviewPage />).container;
    expect(overviewOrb.textContent).toContain(claimSentence('orb'));
    expect(overviewOrb.textContent).toContain(trustModelSentence('orb'));
    cleanup();

    const deckOrb = render(<DeckPage />).container;
    const board4Orb = deckOrb.querySelector('#board-4')!;
    expect(board4Orb.textContent).toContain(claimSentence('orb'));
    expect(board4Orb.textContent).toContain(trustModelSentence('orb'));
    expect(board4Orb.textContent).toContain(CLAIM);
    expect(board4Orb.textContent).toContain(TRUST_MODEL);
    cleanup();

    vi.stubEnv('WORLD_CREDENTIAL_LEVEL', 'selfie');
    const aboutSelfie = render(<AboutPage />).container;
    expect(aboutSelfie.textContent).toContain(claimSentence('selfie'));
    expect(aboutSelfie.textContent).toContain(trustModelSentence('selfie'));
    expect(aboutSelfie.textContent).not.toContain('one verified human');
    expect(aboutSelfie.textContent).not.toContain('a live, unique person');
    cleanup();

    const overviewSelfie = render(<OverviewPage />).container;
    expect(overviewSelfie.textContent).toContain(claimSentence('selfie'));
    expect(overviewSelfie.textContent).toContain(trustModelSentence('selfie'));
    expect(overviewSelfie.textContent).not.toContain('one verified human');
    expect(overviewSelfie.textContent).not.toContain('a live, unique person');
    cleanup();

    const deckSelfie = render(<DeckPage />).container;
    const board4Selfie = deckSelfie.querySelector('#board-4')!;
    expect(board4Selfie.textContent).toContain(claimSentence('selfie'));
    expect(board4Selfie.textContent).toContain(trustModelSentence('selfie'));
    expect(board4Selfie.textContent).not.toContain('one verified human');
    expect(board4Selfie.textContent).not.toContain('a live, unique person');
  });
});
