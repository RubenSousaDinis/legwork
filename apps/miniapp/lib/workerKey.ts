import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

/**
 * The worker's payout key. It is generated on the phone, stored in `localStorage`, and never
 * sent anywhere: not to the API, not to a log, not into React state for longer than the
 * reveal box is open. Legwork only ever learns the address, which is what `POST /register`
 * writes onchain.
 */

const STORAGE_KEY = 'legwork.payoutKey.v1';

/** viem generates lowercase; an imported key has to match byte for byte. */
export const PRIVATE_KEY_RE = /^0x[0-9a-f]{64}$/;

export type PayoutKey = { address: `0x${string}` };

function store(): Storage {
  if (typeof window === 'undefined') {
    throw new Error('the payout key exists only in the browser');
  }
  return window.localStorage;
}

function readKey(): `0x${string}` | null {
  const raw = store().getItem(STORAGE_KEY);
  return raw !== null && PRIVATE_KEY_RE.test(raw) ? (raw as `0x${string}`) : null;
}

/** First call generates and stores; every later call returns the same address. */
export function loadOrCreatePayoutKey(): PayoutKey {
  let key = readKey();
  if (key === null) {
    key = generatePrivateKey();
    store().setItem(STORAGE_KEY, key);
  }
  return { address: privateKeyToAccount(key).address };
}

/** The address only — safe to render, to log and to send. `null` before the first key. */
export function getPayoutAddress(): `0x${string}` | null {
  const key = readKey();
  return key === null ? null : privateKeyToAccount(key).address;
}

/** Behind two taps in the UI: reveal, then copy. The caller never keeps the result. */
export function exportPrivateKey(): string | null {
  return readKey();
}

/** Restores an account on a new phone, or after site data was cleared. */
export function importPrivateKey(hex: string): PayoutKey {
  const candidate = hex.trim();
  if (!PRIVATE_KEY_RE.test(candidate)) {
    throw new Error('A payout key is 0x followed by 64 lowercase hex characters.');
  }
  store().setItem(STORAGE_KEY, candidate);
  return { address: privateKeyToAccount(candidate as `0x${string}`).address };
}
