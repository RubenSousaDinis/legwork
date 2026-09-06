import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDKIT_RESULT_FIXTURE } from './fixtures';

/**
 * The widget stands in for World App: it renders one button, and pressing it runs exactly the
 * two callbacks the real `IDKitRequestWidget` runs — `handleVerify` (which is what forwards
 * the result to `POST /idkit/verify`) and then `onSuccess`.
 */
vi.mock('@worldcoin/idkit', () => ({
  IDKitRequestWidget: (props: {
    open: boolean;
    handleVerify?: (result: unknown) => Promise<void> | void;
    onSuccess: (result: unknown) => Promise<void> | void;
  }) =>
    props.open ? (
      <button
        data-hit="44"
        onClick={async () => {
          try {
            await props.handleVerify?.(IDKIT_RESULT_FIXTURE);
          } catch {
            return; // the widget reports the failure; it never calls onSuccess after one
          }
          await props.onSuccess(IDKIT_RESULT_FIXTURE);
        }}
        type="button"
      >
        complete-idkit
      </button>
    ) : null,
}));

vi.mock('@worldcoin/minikit-js', () => ({
  MiniKit: { install: vi.fn(), isInstalled: vi.fn(() => false), walletAuth: vi.fn() },
}));

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: replace }) }));

const { MiniKit } = await import('@worldcoin/minikit-js');
const { NONCE, registerRequests, sessionRequests } = await import('../mocks/handlers');
const { setScenario } = await import('../mocks/scenarios');
const { resetSessionForTests } = await import('../lib/session');
const { getPayoutAddress } = await import('../lib/workerKey');
const AuthPage = (await import('../app/(auth)/page')).default;

const CTA = 'Verify with World ID — about 30 seconds, one account per person';

const WALLET_AUTH_DATA = {
  address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  message: 'localhost wants you to sign in with your Ethereum account:',
  signature: `0x${'ab'.repeat(64)}1b`,
};

type FetchCall = { url: string; init: RequestInit | undefined };
let calls: FetchCall[] = [];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  resetSessionForTests();
  replace.mockClear();
  vi.mocked(MiniKit.isInstalled).mockReturnValue(false);
  vi.mocked(MiniKit.walletAuth).mockReset();
  // A visitor with no cookie: the session probe 401s, so the landing renders.
  setScenario({ earnings: 'unauthorized' });

  calls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return originalFetch(input, init);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

/** Landing → IDKit → sign-in, stopping on the payout-key screen. */
async function verifyAndSignIn() {
  render(<AuthPage />);
  fireEvent.click(await screen.findByText(CTA));
  fireEvent.click(await screen.findByText('complete-idkit'));
}

describe('auth flow', () => {
  it('bothSessionModes', async () => {
    // --- inside World App: nonce, then walletAuth, then the session with that same nonce.
    vi.mocked(MiniKit.isInstalled).mockReturnValue(true);
    vi.mocked(MiniKit.walletAuth).mockResolvedValue({
      executedWith: 'minikit',
      data: WALLET_AUTH_DATA,
    } as never);

    await verifyAndSignIn();
    await screen.findByText('Your payout address');

    const nonceCall = calls.findIndex((call) => call.url.endsWith('/api/session/nonce'));
    const sessionCall = calls.findIndex((call) => call.url.endsWith('/api/session'));
    expect(nonceCall).toBeGreaterThanOrEqual(0);
    expect(sessionCall).toBeGreaterThan(nonceCall);

    expect(vi.mocked(MiniKit.walletAuth).mock.calls[0]?.[0]).toMatchObject({
      nonce: NONCE,
      statement: 'Sign in to Legwork',
    });
    // `payload` is the walletAuth result's `data` object, and the nonce goes back beside it.
    expect(sessionRequests()).toEqual([
      { mode: 'walletAuth', payload: WALLET_AUTH_DATA, nonce: NONCE },
    ]);
    expect(screen.queryByText('web sign-in — outside World App')).toBeNull();

    // --- plain mobile web: no wallet, so the payout address is the identity, and it says so.
    cleanup();
    localStorage.clear();
    resetSessionForTests();
    calls = [];
    vi.mocked(MiniKit.walletAuth).mockClear();
    vi.mocked(MiniKit.isInstalled).mockReturnValue(false);

    await verifyAndSignIn();
    await screen.findByText('Your payout address');

    const address = getPayoutAddress();
    expect(address).not.toBeNull();
    expect(sessionRequests().at(-1)).toEqual({ mode: 'idkit', worker_address: address });
    expect(screen.getByText('web sign-in — outside World App')).toBeTruthy();
    expect(vi.mocked(MiniKit.walletAuth)).not.toHaveBeenCalled();
  });

  it('registerBodyExact', async () => {
    // jsdom exposes no `navigator.geolocation`, which is the "unavailable" case exactly.
    expect(navigator.geolocation).toBeUndefined();

    await verifyAndSignIn();
    fireEvent.click(await screen.findByText('Register as a worker'));

    await waitFor(() => expect(registerRequests()).toHaveLength(1));
    expect(registerRequests()[0]).toEqual({
      worker_address: getPayoutAddress(),
      area: 'ez1dp',
      task_types: ['verify-open', 'photo-of', 'call-confirm', 'compare-two'],
    });

    // Nothing secret rode along: not in a URL, not in a header, not in a body.
    const secret = localStorage.getItem('legwork.payoutKey.v1');
    expect(secret).toMatch(/^0x[0-9a-f]{64}$/);
    for (const { url, init } of calls) {
      expect(url).not.toContain(secret);
      expect(JSON.stringify(init?.headers ?? {})).not.toContain(secret);
      expect(String(init?.body ?? '')).not.toContain(secret);
    }
  });

  it('nullifierConflictOffersRestore', async () => {
    setScenario({ idkitVerify: 'nullifier_already_registered' });

    await verifyAndSignIn();

    expect(
      await screen.findByText(
        'This World ID already has a worker account. Restore it with your payout key below.',
      ),
    ).toBeTruthy();

    // The import field is already open — the way back in is the key, not a second World ID.
    const field = await screen.findByLabelText('Import an existing payout key');
    expect(field.tagName).toBe('TEXTAREA');
    expect(screen.getByText('Restore')).toBeTruthy();
  });
});
