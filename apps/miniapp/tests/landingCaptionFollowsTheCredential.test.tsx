import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Landing, verifyCaption } from '../app/(auth)/Landing';

afterEach(cleanup);

describe('landing caption', () => {
  it('landingCaptionFollowsTheCredential', () => {
    expect(verifyCaption('orb')).toBe('about 30 seconds · one account per person');
    expect(verifyCaption('selfie')).toBe('about 30 seconds · a live person, camera-checked');
    expect(verifyCaption('selfie')).not.toContain('one account per person');

    for (const level of ['orb', 'selfie'] as const) {
      const { container } = render(<Landing busy={false} onVerify={() => undefined} level={level} />);
      const caption = container.querySelector('[data-cta-caption]') as HTMLElement;
      expect(caption).not.toBeNull();
      expect(caption.textContent).toBe(verifyCaption(level));
      expect(caption.textContent).not.toContain('\n');
      cleanup();
    }
  });
});
