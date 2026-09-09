import { cleanup, render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../mocks/server';

vi.mock('@worldcoin/minikit-js', () => ({
  MiniKit: { install: vi.fn(), isInstalled: vi.fn(() => false), walletAuth: vi.fn(), user: {} },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const { resetSessionForTests, restoreSession, setSessionState, signOut, useSession, useSessionReady } =
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
  cleanup();
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
      // The probe is `GET /session`: a session route answering whether the session is alive,
      // re-issuing the cookie while it does. A revoked session must 401 here.
      http.get('*/api/session', () => {
        if (loggedOut) {
          return HttpResponse.json({ error: 'unauthorized' }, { status: 401 });
        }
        return HttpResponse.json({ worker: MIRROR.worker, nullifier: MIRROR.nullifier, mode: MIRROR.mode });
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

  it('verifiedWorkerSeesNoFlashOnFirstPaint', async () => {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(MIRROR));
    resetSessionForTests();

    function Probe() {
      const state = useSession();
      const ready = useSessionReady();
      return <div data-ready={String(ready)} data-status={state.status} />;
    }

    const { container } = render(<Probe />);
    const node = container.firstChild as HTMLElement;
    expect(node.getAttribute('data-status')).toBe('verified');
    expect(node.getAttribute('data-ready')).toBe('false');

    await vi.waitFor(() => {
      expect((container.firstChild as HTMLElement).getAttribute('data-ready')).toBe('true');
    });
    expect((container.firstChild as HTMLElement).getAttribute('data-status')).toBe('verified');
  });
});
