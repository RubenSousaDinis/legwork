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
  MiniKit: {
    install: vi.fn(),
    isInstalled: vi.fn(() => false),
    walletAuth: vi.fn(),
    user: { walletAddress: undefined as string | undefined },
  },
}));

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: replace }) }));

const { MiniKit } = await import('@worldcoin/minikit-js');
const { NONCE, registerRequests, sessionRequests } = await import('../mocks/handlers');
const { setScenario } = await import('../mocks/scenarios');
const { resetSessionForTests } = await import('../lib/session');
const { getPayoutAddress } = await import('../lib/workerKey');
const AuthPage = (await import('../app/(auth)/verify/page')).default;

const CTA = 'Verify with World ID';

const WALLET_AUTH_DATA = {
  address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  message: 'localhost wants you to sign in with your Ethereum account:',
  signature: `0x${'ab'.repeat(64)}1b`,
};

/**
 * The mock signs as a wallet address that is **not** the generated payout key. Production
 * never satisfies that equality: World App's wallet is a smart-contract account, and
 * `loadOrCreatePayoutKey()` is `generatePrivateKey()` in localStorage. Signing as the payout
 * key is how this bug survived T-52.
 */
function mockWalletAuth() {
  MiniKit.user = { walletAddress: WALLET_AUTH_DATA.address };
  vi.mocked(MiniKit.walletAuth).mockImplementation(async () => ({
    executedWith: 'minikit',
    data: { ...WALLET_AUTH_DATA },
  } as never));
}

type FetchCall = { url: string; init: RequestInit | undefined };
let calls: FetchCall[] = [];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  resetSessionForTests();
  replace.mockClear();
  vi.mocked(MiniKit.isInstalled).mockReturnValue(false);
  vi.mocked(MiniKit.walletAuth).mockReset();
  MiniKit.user = {};
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
    // The order is the API's, not a preference. `POST /session` refuses a worker the registry
    // does not know — `403 forbidden {reason: 'not_registered'}` in both modes — so a human who
    // has just verified cannot have a session yet. `POST /register` is what makes them a worker,
    // and it authenticates with the idkit-session cookie `POST /idkit/verify` set. The session
    // is created after registration returns, and this test pins that order: the first live run
    // on a phone, Sept 8, ended at the landing screen with `403 forbidden` because the flow
    // asked for the session first, and this test asserted the wrong sequence.

    // --- inside World App: register, then nonce, then walletAuth, then the session.
    vi.mocked(MiniKit.isInstalled).mockReturnValue(true);
    mockWalletAuth();

    await verifyAndSignIn();
    await screen.findByText('Your World App wallet is your payout address');

    // Nothing has been asked of `/session` yet, and nothing signed.
    expect(calls.some((call) => call.url.endsWith('/api/session'))).toBe(false);
    expect(vi.mocked(MiniKit.walletAuth)).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByText('Register as a worker'));
    await waitFor(() => expect(sessionRequests()).toHaveLength(1));

    const registerCall = calls.findIndex((call) => call.url.endsWith('/api/register'));
    const nonceCall = calls.findIndex((call) => call.url.endsWith('/api/session/nonce'));
    const sessionCall = calls.findIndex((call) => call.url.endsWith('/api/session'));
    expect(registerCall).toBeGreaterThanOrEqual(0);
    expect(nonceCall).toBeGreaterThan(registerCall);
    expect(sessionCall).toBeGreaterThan(nonceCall);

    expect(vi.mocked(MiniKit.walletAuth).mock.calls[0]?.[0]).toMatchObject({
      nonce: NONCE,
      statement: 'Sign in to Legwork',
    });
    // `payload` is the walletAuth result's `data` object, and the nonce goes back beside it.
    expect(sessionRequests()).toEqual([
      {
        mode: 'walletAuth',
        payload: { ...WALLET_AUTH_DATA },
        nonce: NONCE,
      },
    ]);
    expect(screen.queryByText('web sign-in — outside World App')).toBeNull();

    // --- plain mobile web: no wallet, so the payout address is the identity, and it says so.
    cleanup();
    localStorage.clear();
    resetSessionForTests();
    calls = [];
    vi.mocked(MiniKit.walletAuth).mockClear();
    vi.mocked(MiniKit.isInstalled).mockReturnValue(false);
    MiniKit.user = {};

    await verifyAndSignIn();
    await screen.findByText('Your payout address');
    expect(calls.some((call) => call.url.endsWith('/api/session'))).toBe(false);

    fireEvent.click(await screen.findByText('Register as a worker'));

    const address = getPayoutAddress();
    expect(address).not.toBeNull();
    await waitFor(() =>
      expect(sessionRequests().at(-1)).toEqual({ mode: 'idkit', worker_address: address }),
    );
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
        'Open this in World App to sign in with the key this phone holds, or paste the key you exported.',
      ),
    ).toBeTruthy();

    // The import field is already open — the way back in is the key, not a second World ID.
    const field = await screen.findByLabelText('Import an existing payout key');
    expect(field.tagName).toBe('TEXTAREA');
    expect(screen.getByText('Restore')).toBeTruthy();
  });

  it('conflictScreenNeverOffersRegister', async () => {
    setScenario({ idkitVerify: 'nullifier_already_registered' });
    await verifyAndSignIn();
    await screen.findByText(
      'Open this in World App to sign in with the key this phone holds, or paste the key you exported.',
    );
    expect(screen.queryByText('Register as a worker')).toBeNull();
    expect(screen.queryByText('Sign in with this key')).toBeNull();
    expect(screen.queryByText('Sign in with your World App wallet')).toBeNull();
  });

  it('nullifierConflictSignsInWithTheHeldKey', async () => {
    const { bindRegisteredWorker, NULLIFIER } = await import('../mocks/handlers');
    const { loadOrCreatePayoutKey } = await import('../lib/workerKey');

    // --- outside World App: a 409 never issued the idkit cookie, so there is no sign-in.
    const held = loadOrCreatePayoutKey();
    bindRegisteredWorker({ worker: held.address, nullifier: NULLIFIER });
    setScenario({ idkitVerify: 'nullifier_already_registered' });

    await verifyAndSignIn();
    expect(
      await screen.findByText(
        'Open this in World App to sign in with the key this phone holds, or paste the key you exported.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Sign in with this key')).toBeNull();
    expect(screen.queryByText('Sign in with your World App wallet')).toBeNull();
    expect(sessionRequests()).toHaveLength(0);
    expect(registerRequests()).toHaveLength(0);
    expect(replace).not.toHaveBeenCalledWith('/tasks');

    // --- inside World App: walletAuth, still never /register.
    cleanup();
    localStorage.clear();
    resetSessionForTests();
    replace.mockClear();
    calls = [];
    vi.mocked(MiniKit.isInstalled).mockReturnValue(true);
    mockWalletAuth();

    bindRegisteredWorker({ worker: WALLET_AUTH_DATA.address, nullifier: NULLIFIER });
    setScenario({ idkitVerify: 'nullifier_already_registered' });

    await verifyAndSignIn();
    expect(
      await screen.findByText(
        'This World ID already has a worker account. Sign in with your World App wallet to continue.',
      ),
    ).toBeTruthy();
    fireEvent.click(await screen.findByText('Sign in with your World App wallet'));

    await waitFor(() => expect(sessionRequests().at(-1)).toMatchObject({ mode: 'walletAuth' }));
    expect(registerRequests()).toHaveLength(0);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/tasks'));
  });

  it('nullifierConflictExplainsAMismatchedKey', async () => {
    const { bindRegisteredWorker, NULLIFIER, WORKER_ADDRESS } = await import('../mocks/handlers');
    vi.mocked(MiniKit.isInstalled).mockReturnValue(true);
    mockWalletAuth();
    bindRegisteredWorker({ worker: WORKER_ADDRESS, nullifier: NULLIFIER });
    setScenario({ idkitVerify: 'nullifier_already_registered' });

    await verifyAndSignIn();
    fireEvent.click(await screen.findByText('Sign in with your World App wallet'));

    expect(await screen.findByText('That account is bound to a different payout address.')).toBeTruthy();
    expect(screen.queryByLabelText('Import an existing payout key')).toBeNull();
    expect(replace).not.toHaveBeenCalledWith('/tasks');
    expect(registerRequests()).toHaveLength(0);
  });

  it('registerStepShowsTheAreaAndItsSource', async () => {
    expect(navigator.geolocation).toBeUndefined();

    await verifyAndSignIn();
    expect(await screen.findByText('You will be registered in ez1dp')).toBeTruthy();
    expect(screen.getByText('default — this phone gave no location fix')).toBeTruthy();
    expect(screen.getByText('Use my location')).toBeTruthy();

    const { stubGeolocation, geolocationAt } = await import('./proof/harness');
    stubGeolocation(geolocationAt(39.744, -8.807, 10));
    fireEvent.click(screen.getByText('Use my location'));

    expect(await screen.findByText("from this phone's location")).toBeTruthy();
    expect(screen.queryByText('Use my location')).toBeNull();
  });

  it('payoutKeyNeverLeavesTheDevice', async () => {
    await verifyAndSignIn();
    fireEvent.click(await screen.findByText('Register as a worker'));
    await waitFor(() => expect(registerRequests()).toHaveLength(1));

    const secret = localStorage.getItem('legwork.payoutKey.v1');
    expect(secret).toMatch(/^0x[0-9a-f]{64}$/);
    for (const { url, init } of calls) {
      expect(url).not.toContain(secret);
      expect(JSON.stringify(init?.headers ?? {})).not.toContain(secret);
      expect(String(init?.body ?? '')).not.toContain(secret);
    }
  });

  it('walletAuthAddressIsTheRegisteredAddress', async () => {
    const { loadOrCreatePayoutKey } = await import('../lib/workerKey');
    vi.mocked(MiniKit.isInstalled).mockReturnValue(true);
    mockWalletAuth();

    await verifyAndSignIn();
    fireEvent.click(await screen.findByText('Register as a worker'));
    await waitFor(() => expect(registerRequests()).toHaveLength(1));

    const generated = loadOrCreatePayoutKey().address;
    expect(generated).not.toBe(WALLET_AUTH_DATA.address);
    expect(registerRequests()[0]).toMatchObject({ worker_address: WALLET_AUTH_DATA.address });
    expect((registerRequests()[0] as { worker_address: string }).worker_address).not.toBe(
      generated,
    );
  });

  it('webPathStillUsesTheGeneratedKey', async () => {
    await verifyAndSignIn();
    await screen.findByText('Your payout address');
    expect(screen.getByText('Reveal and copy private key')).toBeTruthy();
    expect(screen.getByText('Import an existing payout key')).toBeTruthy();

    fireEvent.click(await screen.findByText('Register as a worker'));
    await waitFor(() => expect(registerRequests()).toHaveLength(1));
    expect(registerRequests()[0]).toMatchObject({ worker_address: getPayoutAddress() });
  });

  it('worldAppShowsNoPayoutKeyToLose', async () => {
    vi.mocked(MiniKit.isInstalled).mockReturnValue(true);
    mockWalletAuth();

    await verifyAndSignIn();
    expect(await screen.findByText('Your World App wallet is your payout address')).toBeTruthy();
    expect(screen.getByText(WALLET_AUTH_DATA.address)).toBeTruthy();
    expect(screen.queryByText('Reveal and copy private key')).toBeNull();
    expect(screen.queryByText('Import an existing payout key')).toBeNull();
    expect(screen.queryByText(/If you clear site data you lose access/)).toBeNull();
    expect(document.querySelector('[data-warning="payout-key"]')).toBeNull();
  });
});
