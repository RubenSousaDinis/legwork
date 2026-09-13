import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Login takes either credential.
 *
 * `POST /idkit/verify` accepts Orb and Selfie Check alike, so a World ID that cannot present
 * a face credential must not be a dead end. The widget is replaced by two buttons — one that
 * fails the way World App does when the credential is missing, one that fails the way it does
 * when the app's Portal has Selfie Check switched off — and the flow's own state decides which
 * credential is asked for next.
 */
let failWith = 'credential_unavailable';

vi.mock('../lib/worldid', async () => {
  const actual = await vi.importActual<typeof import('../lib/worldid')>('../lib/worldid');
  return {
    ...actual,
    IdkitVerify: ({ onFailed }: { onFailed: (error: unknown) => void }) => (
      <button data-hit="44" onClick={() => onFailed(new Error(failWith))} type="button">
        fail-idkit
      </button>
    ),
  };
});

vi.mock('@worldcoin/minikit-js', () => ({
  MiniKit: { install: vi.fn(), isInstalled: vi.fn(() => false), walletAuth: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const { setScenario } = await import('../mocks/scenarios');
const { resetSessionForTests } = await import('../lib/session');
const { VERIFY_BUTTON } = await import('../app/(auth)/Landing');
const { RETRY_WITH_ORB } = await import('../app/(auth)/AuthFlow');
const AuthPage = (await import('../app/(auth)/verify/page')).default;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetSessionForTests();
  setScenario({ earnings: 'unauthorized' });
  failWith = 'credential_unavailable';
});

afterEach(cleanup);

/** The chip is the only place on screen that names the credential being asked for. */
function credentialChip(): string {
  return document.querySelector('[data-step="verifying"] .lw-chips')?.textContent ?? '';
}

describe('login accepts Orb and Selfie Check', () => {
  it('missingFaceCredentialFallsBackToOrb', async () => {
    render(<AuthPage />);
    fireEvent.click(await screen.findByText(VERIFY_BUTTON));

    // Selfie Check is what login asks for first.
    await waitFor(() => expect(credentialChip()).toContain('Selfie Check'));

    fireEvent.click(await screen.findByText('fail-idkit'));

    // No dead end and no error line: the flow asks for the other credential instead.
    await waitFor(() => expect(credentialChip()).toContain('Orb'));
    expect(document.querySelector('[data-error="idkit"]')).toBeNull();

    // The caption follows the credential — it must not still say Selfie Check.
    const caption = document.querySelector('[data-step="verifying"] .lw-body')?.textContent ?? '';
    expect(caption).toContain('Orb');
    expect(caption).not.toContain('Selfie Check');
  });

  it('selfieDisabledKeepsItsSentenceAndOffersOrb', async () => {
    // The app's own Portal configuration, not this person's credentials. The sentence is the
    // only thing that says so, so it stays on screen — with the switch beside it.
    failWith = 'verification_disabled';

    render(<AuthPage />);
    fireEvent.click(await screen.findByText(VERIFY_BUTTON));
    fireEvent.click(await screen.findByText('fail-idkit'));

    const line = await waitFor(() => {
      const node = document.querySelector('[data-error="idkit"]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(line.querySelector('[data-error-code]')?.textContent).toBe('verification_disabled');
    expect(credentialChip()).toContain('Selfie Check');

    fireEvent.click(screen.getByText(RETRY_WITH_ORB));

    await waitFor(() => expect(credentialChip()).toContain('Orb'));
    expect(document.querySelector('[data-error="idkit"]')).toBeNull();
  });
});
