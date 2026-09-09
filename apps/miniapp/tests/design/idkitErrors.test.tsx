import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The widget's failure path, driven directly.
 *
 * `IdkitVerify` is replaced with one button that hands the page `onFailed(new Error(code))`
 * — the shape `lib/worldid.ts` produces when World App answers with a code and no debug
 * report. Everything else in `lib/worldid.ts` is the real module: the page still asks for an
 * RP context over msw before the widget appears.
 */
vi.mock('../../lib/worldid', async () => {
  const actual = await vi.importActual<typeof import('../../lib/worldid')>('../../lib/worldid');
  return {
    ...actual,
    IdkitVerify: ({ onFailed }: { onFailed: (error: unknown) => void }) => (
      <button data-hit="44" onClick={() => onFailed(new Error('verification_disabled'))} type="button">
        fail-idkit
      </button>
    ),
  };
});

vi.mock('@worldcoin/minikit-js', () => ({
  MiniKit: { install: vi.fn(), isInstalled: vi.fn(() => false), walletAuth: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const { setScenario } = await import('../../mocks/scenarios');
const { resetSessionForTests } = await import('../../lib/session');
const { describeIdkitError, IDKIT_FALLBACK_SENTENCE } = await import('../../app/(auth)/idkitErrors');
const { VERIFY_BUTTON } = await import('../../app/(auth)/Landing');
const AuthPage = (await import('../../app/(auth)/verify/page')).default;

beforeEach(() => {
  localStorage.clear();
  resetSessionForTests();
  setScenario({ earnings: 'unauthorized' });
});

afterEach(cleanup);

describe('a failed World ID check', () => {
  it('idkitErrorIsASentencePlusCode', async () => {
    expect(describeIdkitError('user_rejected').sentence).toBe(
      'You closed World ID before finishing. Try again.',
    );

    // The code the lead is chasing is not one IDKit documents, so it keeps its code and
    // takes the fallback sentence rather than being explained as something it is not.
    const unknown = describeIdkitError('verification_disabled');
    expect(unknown.sentence).toBe(IDKIT_FALLBACK_SENTENCE);
    expect(unknown.code).toBe('verification_disabled');

    render(<AuthPage />);
    fireEvent.click(await screen.findByText(VERIFY_BUTTON));
    fireEvent.click(await screen.findByText('fail-idkit'));

    const line = await waitFor(() => {
      const node = document.querySelector('[data-error="idkit"]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });

    // The raw code is still on screen — the phone log T-41 keeps is written from it.
    expect(line.querySelector('[data-error-code]')?.textContent).toBe('verification_disabled');
    expect(line.textContent).toContain(IDKIT_FALLBACK_SENTENCE);

    // Amber is the refusal colour. A World ID that did not answer accused nobody of anything.
    expect(document.querySelector('.lw-error')).toBeNull();
  });
});
