import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TrustModel } from '../app/TrustModel';
import { TRUST_MODEL, trustModelSentence } from '../app/copy';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the landing trust model', () => {
  it('landingTrustModelFollowsTheCredential', () => {
    // The landing renders `<TrustModel />` with no props, so the component is the only thing
    // that decides which sentence `/` shows. Pinned to a constant it kept claiming uniqueness
    // after the credential moved.
    vi.stubEnv('WORLD_CREDENTIAL_LEVEL', 'selfie');
    const selfie = render(<TrustModel />).container;
    expect(selfie.textContent).toContain(trustModelSentence('selfie'));
    expect(selfie.textContent).not.toMatch(/\bunique\b/);

    vi.stubEnv('WORLD_CREDENTIAL_LEVEL', 'orb');
    const orb = render(<TrustModel />).container;
    expect(orb.textContent).toContain(TRUST_MODEL);
    expect(orb.textContent).toContain('a live, unique person');
  });

  it('trustModelKeepsTheWholeSentenceWhenTheBoldPhraseIsAbsent', () => {
    // A naive split drops everything after the needle when the needle is gone. Both halves of
    // the sentence must survive whatever the wording becomes.
    const { container } = render(<TrustModel level="orb" />);
    expect(container.querySelector('strong')?.textContent).toBe('bounded, attributable work');
    expect(container.textContent).toContain('every task leaves a record both sides can read');
  });
});
