import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trustModelSentence } from '@legwork/shared';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const SHARED = [
  "Escrow bounds the agent's loss to one task",
  'a per-agent daily cap bounds it to one day',
  'Screening is a cost floor, not a cure',
  'bounded, attributable work',
] as const;

async function renderAbout(level: 'orb' | 'selfie') {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_WORLD_CREDENTIAL_LEVEL', level);
  const Page = (await import('../app/about/page')).default;
  return render(<Page />);
}

async function renderSupport(level: 'orb' | 'selfie') {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_WORLD_CREDENTIAL_LEVEL', level);
  const Page = (await import('../app/support/page')).default;
  return render(<Page />);
}

describe('about and support trust model', () => {
  it('aboutAndSupportTrustModelFollowTheCredential', async () => {
    for (const renderPage of [renderAbout, renderSupport]) {
      const orb = await renderPage('orb');
      const orbText = orb.container.textContent ?? '';
      expect(orbText).toContain('a live, unique person');
      for (const clause of SHARED) expect(orbText).toContain(clause);
      expect(orbText).toContain(trustModelSentence('orb'));
      cleanup();

      const selfie = await renderPage('selfie');
      const selfieText = selfie.container.textContent ?? '';
      expect(selfieText).toContain(trustModelSentence('selfie'));
      expect(selfieText).toContain('a live person');
      expect(selfieText).not.toContain('a live, unique person');
      for (const clause of SHARED) expect(selfieText).toContain(clause);
      cleanup();
    }
  });

  it('aboutPageNamesTheWiderClaim', async () => {
    const about = await renderAbout('orb');
    const text = about.container.textContent ?? '';
    expect(text).toContain('anywhere OpenStreetMap knows it');
    expect(text).toContain('Rua de Alcobaça');
  });
});
