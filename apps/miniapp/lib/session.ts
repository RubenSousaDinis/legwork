'use client';

import { MiniKit } from '@worldcoin/minikit-js';
import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { apiFetch } from './api';
import { CREDENTIAL_LEVEL } from './env';
import { getPayoutAddress } from './workerKey';

/**
 * The worker session. Two ways in — `walletAuth` inside World App, plain IDKit outside it —
 * and one way back: `GET /me/earnings`, which only a worker-session cookie can reach.
 *
 * The cookie is the session. What lives in `localStorage` is a non-secret mirror of what the
 * API already told us (address, nullifier, level, mode) so the header can render the right
 * chip on the first paint instead of flashing "Verify to claim" at a verified worker.
 */
export type SessionState =
  | { status: 'unverified' }
  | { status: 'verifying' }
  | {
      status: 'verified';
      nullifier: string;
      level: string;
      mode: 'walletAuth' | 'idkit';
      worker: string;
      registered: boolean;
    };

const MIRROR_KEY = 'legwork.session.v1';
const SIGN_IN_STATEMENT = 'Sign in to Legwork';
const WALLET_AUTH_TTL_MS = 10 * 60 * 1000;

/** `POST /session` — `dev` is the API's seeded-worker path; the phone only ever sees the two. */
export type SessionResponse = {
  worker: string;
  nullifier: string;
  mode: 'walletAuth' | 'idkit' | 'dev';
  token: string;
};

type Snapshot = { state: SessionState; ready: boolean };

const UNVERIFIED: SessionState = { status: 'unverified' };
const SERVER_SNAPSHOT: Snapshot = { state: UNVERIFIED, ready: false };

let snapshot: Snapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: Snapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function getSnapshot(): Snapshot {
  return snapshot;
}

function getServerSnapshot(): Snapshot {
  return SERVER_SNAPSHOT;
}

export function setSessionState(state: SessionState): void {
  if (state.status === 'verified') writeMirror(state);
  publish({ state, ready: true });
}

// ------------------------------------------------------------------- mirror

type Mirror = {
  nullifier: string;
  level: string;
  mode: 'walletAuth' | 'idkit';
  worker: string;
  registered: boolean;
};

function writeMirror(state: Extract<SessionState, { status: 'verified' }>): void {
  if (typeof window === 'undefined') return;
  const mirror: Mirror = {
    nullifier: state.nullifier,
    level: state.level,
    mode: state.mode,
    worker: state.worker,
    registered: state.registered,
  };
  window.localStorage.setItem(MIRROR_KEY, JSON.stringify(mirror));
}

function readMirror(): Mirror | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(MIRROR_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Mirror>;
    if (typeof parsed.worker !== 'string') return null;
    return {
      nullifier: typeof parsed.nullifier === 'string' ? parsed.nullifier : '',
      level: typeof parsed.level === 'string' ? parsed.level : CREDENTIAL_LEVEL,
      mode: parsed.mode === 'walletAuth' ? 'walletAuth' : 'idkit',
      worker: parsed.worker,
      registered: parsed.registered === true,
    };
  } catch {
    return null;
  }
}

function clearMirror(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(MIRROR_KEY);
}

// ------------------------------------------------------------------ the API

/** `GET /session/nonce` → `MiniKit.walletAuth` → `POST /session`. Inside World App only. */
export async function createWalletAuthSession(): Promise<SessionResponse> {
  const { nonce } = await apiFetch<{ nonce: string }>('/session/nonce');

  const result = await MiniKit.walletAuth({
    nonce,
    statement: SIGN_IN_STATEMENT,
    expirationTime: new Date(Date.now() + WALLET_AUTH_TTL_MS),
  });

  // `payload` is the walletAuth result's `data` object — {address, message, signature} — and
  // the nonce goes back beside it so the API can check the SIWE message against the one it
  // issued. See the PR body: if the contract wants the whole result, `payload` becomes `result`.
  return apiFetch<SessionResponse>('/session', {
    method: 'POST',
    body: JSON.stringify({ mode: 'walletAuth', payload: result.data, nonce }),
  });
}

/** The plain mobile-web route: no wallet, so the payout address identifies the worker. */
export function createIdkitSession(worker_address: string): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/session', {
    method: 'POST',
    body: JSON.stringify({ mode: 'idkit', worker_address }),
  });
}

/**
 * The session probe. `GET /me/earnings` needs a worker-session cookie and nothing else, so a
 * 200 means the cookie survived and the worker is registered; a 401 means start over.
 */
export async function restoreSession(): Promise<SessionState> {
  const mirror = readMirror();
  try {
    await apiFetch<unknown>('/me/earnings');
  } catch {
    clearMirror();
    publish({ state: UNVERIFIED, ready: true });
    return UNVERIFIED;
  }

  const state: SessionState = {
    status: 'verified',
    nullifier: mirror?.nullifier ?? '',
    level: mirror?.level ?? CREDENTIAL_LEVEL,
    mode: mirror?.mode ?? 'idkit',
    worker: mirror?.worker ?? getPayoutAddress() ?? '',
    registered: true,
  };
  setSessionState(state);
  return state;
}

/** Drops the mirror and the in-memory state. The cookie expires on its own. */
export function signOut(): void {
  clearMirror();
  publish({ state: UNVERIFIED, ready: true });
}

// ----------------------------------------------------------------- the hooks

let restoring: Promise<SessionState> | null = null;

function restoreOnce(): void {
  if (restoring !== null || snapshot.ready) return;
  restoring = restoreSession().finally(() => {
    restoring = null;
  });
}

export function useSession(): SessionState {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(restoreOnce, []);
  return current.state;
}

/** False until the first `restoreSession()` settles, so nothing redirects on a cold load. */
export function useSessionReady(): boolean {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(restoreOnce, []);
  return current.ready;
}

/** Every route behind verification calls this; an unverified worker lands back on `/`. */
export function requireVerified(): SessionState {
  const state = useSession();
  const ready = useSessionReady();
  const router = useRouter();

  useEffect(() => {
    if (ready && state.status !== 'verified') router.replace('/');
  }, [ready, state.status, router]);

  return state;
}

/** Tests reset the module store between renders; nothing in the app calls this. */
export function resetSessionForTests(): void {
  snapshot = SERVER_SNAPSHOT;
  restoring = null;
}
