import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Registration survives the chain read lagging its own receipt.
 *
 * `POST /register` returns once the registry write is mined, and `POST /session` then asks
 * `isWorker` through an RPC node that has not caught up — so it answers `403 forbidden
 * {reason:'not_registered'}` about a worker it wrote seconds ago. A live run on 2026-09-13
 * ended exactly there: registered on chain (`workerOf` and `areaOf` both set) and in the
 * database, and still refused a session, stranded on the payout screen.
 */
vi.mock('../lib/worldid', async () => {
  const actual = await vi.importActual<typeof import('../lib/worldid')>('../lib/worldid');
  return {
    ...actual,
    IdkitVerify: ({ onVerified }: { onVerified: (r: unknown) => void }) => (
      <button
        data-hit="44"
        onClick={() => onVerified({ verified: true, nullifier: '0x1', level: 'face' })}
        type="button"
      >
        complete-idkit
      </button>
    ),
  };
});

vi.mock('@worldcoin/minikit-js', () => ({
  MiniKit: { install: vi.fn(), isInstalled: vi.fn(() => false), walletAuth: vi.fn(), user: {} },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const { resetSessionForTests } = await import('../lib/session');
const { VERIFY_BUTTON } = await import('../app/(auth)/Landing');
const AuthPage = (await import('../app/(auth)/verify/page')).default;

const originalFetch = globalThis.fetch;
let sessionAttempts = 0;
/** How many `POST /session` calls answer `not_registered` before the read catches up. */
let lagged = 0;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetSessionForTests();
  sessionAttempts = 0;
  lagged = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (url.endsWith('/api/idkit/request')) {
      return json({
        rp_context: {
          rp_id: 'rp_test',
          nonce: '0x00',
          created_at: 1,
          expires_at: 2,
          signature: '0x00',
        },
      });
    }
    if (url.endsWith('/api/register')) return json({ tx: '0xabc', worker: '0xworker' });
    if (url.endsWith('/api/session') && method === 'POST') {
      sessionAttempts += 1;
      if (sessionAttempts <= lagged) {
        return json({ error: 'forbidden', reason: 'not_registered' }, 403);
      }
      return json({ worker: '0xworker', nullifier: '0x1' });
    }
    if (url.endsWith('/api/session')) return json({ error: 'unauthorized' }, 401);
    return json({}, 404);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  cleanup();
});

async function verify() {
  render(<AuthPage />);
  fireEvent.click(await screen.findByText(VERIFY_BUTTON));
  fireEvent.click(await screen.findByText('complete-idkit'));
}

describe('registration survives the chain read lag', () => {
  it('retriesTheSessionMintUntilTheRegistryCatchesUp', async () => {
    lagged = 3;

    await verify();

    // The flow does not stop at the first 403: it keeps asking until the read catches up.
    await waitFor(() => expect(sessionAttempts).toBeGreaterThan(3), { timeout: 15000 });
    await waitFor(() => expect(document.querySelector('[data-error="idkit"]')).toBeNull());
    expect(document.querySelector('[data-step="register"]')).not.toBeNull();
  }, 20000);

  it('aRefusalThatIsNotTheLagIsShownAtOnce', async () => {
    // A 401 is a real refusal — retrying it would only delay telling the worker.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      if (url.endsWith('/api/idkit/request')) {
        return json({
          rp_context: { rp_id: 'rp_test', nonce: '0x00', created_at: 1, expires_at: 2, signature: '0x00' },
        });
      }
      if (url.endsWith('/api/register')) return json({ tx: '0xabc', worker: '0xworker' });
      if (url.endsWith('/api/session') && (init?.method ?? 'GET') === 'POST') {
        sessionAttempts += 1;
        return json({ error: 'unauthorized' }, 401);
      }
      return json({ error: 'unauthorized' }, 401);
    }) as typeof fetch;

    await verify();

    await waitFor(() => expect(document.querySelector('[data-error="idkit"]')).not.toBeNull());
    expect(sessionAttempts).toBe(1);
  }, 20000);
});
