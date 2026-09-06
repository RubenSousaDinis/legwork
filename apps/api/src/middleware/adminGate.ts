/**
 * The admin surface does not exist unless it is configured.
 *
 * "Does not exist" means 404, not 401. An operator console that answers 401 to an anonymous
 * caller has confirmed there is a console to attack; a 404 tells them the same thing every
 * other unrouted path does. So there is exactly one state in which `/admin/*` can answer
 * 401, and it is the state where a key is set and the caller got it wrong.
 */
import type { MiddlewareEnv } from './env';

/** A key shorter than this is a typo or a placeholder, and is treated as no key at all. */
export const ADMIN_KEY_MIN_LENGTH = 32;

export const ADMIN_PREFIX = '/admin';

export function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

export function adminKeyConfigured(env: MiddlewareEnv): boolean {
  const key = env.ADMIN_API_KEY;
  return typeof key === 'string' && key.length >= ADMIN_KEY_MIN_LENGTH;
}

const encoder = new TextEncoder();

/**
 * Digest both sides, then XOR the two fixed-width results and fold the difference into one
 * byte. Comparing the raw strings would return early on the first byte that differs, and
 * comparing their lengths first would leak the key's length before that.
 *
 * Web Crypto only: the edge runtime has no Node built-in module to reach for, and importing
 * one would break the bundle rather than the test.
 */
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= (x[i] as number) ^ (y[i] as number);
  return diff === 0;
}

export type AdminVerdict =
  | { ok: true }
  | { ok: false; status: 404; body: { error: 'not_found' } }
  | { ok: false; status: 401; body: { error: 'unauthorized' } };

const OK: AdminVerdict = { ok: true };

/**
 * Only call this for an `/admin/*` path. The presented header is compared even when it is
 * absent — `''` against the configured key — so the missing-header and wrong-key paths cost
 * the same.
 */
export async function checkAdminKey(req: Request, env: MiddlewareEnv): Promise<AdminVerdict> {
  const configured = env.ADMIN_API_KEY;
  if (!adminKeyConfigured(env) || !configured) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }
  const presented = req.headers.get('x-admin-key') ?? '';
  if (!(await constantTimeEqual(presented, configured))) {
    return { ok: false, status: 401, body: { error: 'unauthorized' } };
  }
  return OK;
}
