import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EARNINGS_ZERO } from '../mocks/handlers';
import { server } from '../mocks/server';

vi.mock('@worldcoin/minikit-js', () => ({
  MiniKit: { install: vi.fn(), isInstalled: vi.fn(() => false), walletAuth: vi.fn(), user: {} },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const { resetSessionForTests, restoreSession, setSessionState, signOut } =
  await import('../lib/session');

const MIRROR_KEY = 'legwork.session.v1';

const MIRROR = {
  nullifier: '1001',
  level: 'orb',
  mode: 'walletAuth' as const,
  worker: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  registered: true,
};

beforeEach(() => {
  localStorage.clear();
  resetSessionForTests();
});

afterEach(() => {
  localStorage.clear();
  resetSessionForTests();
});

describe('session', () => {
  it('logoutSurvivesAReload', async () => {
    let loggedOut = false;
    server.use(
      http.post('*/api/session/logout', () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get('*/api/me/earnings', () => {
        if (loggedOut) {
          return HttpResponse.json({ error: 'unauthorized' }, { status: 401 });
        }
        return HttpResponse.json(EARNINGS_ZERO);
      }),
    );

    localStorage.setItem(MIRROR_KEY, JSON.stringify(MIRROR));
    setSessionState({ status: 'verified', ...MIRROR });

    await signOut();
    resetSessionForTests();
    const restored = await restoreSession();

    expect(loggedOut).toBe(true);
    expect(restored.status).toBe('unverified');
    expect(localStorage.getItem(MIRROR_KEY)).toBeNull();
  });
});
