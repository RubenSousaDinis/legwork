/**
 * Two sessions, one after the other.
 *
 * `lw_idkit` is the short-lived proof that a human just finished World ID; `lw_worker` is
 * the twelve-hour proof that a registered worker is holding this phone. Neither is ever the
 * *only* check — `POST /session` also asks the chain whether the address is a worker,
 * because a database row is a claim and the registry is the record.
 *
 * The nullifier travels as a decimal string end to end: it is a full uint256, the column is
 * `NUMERIC(78,0)`, and a JSON number would silently round it.
 */
import { randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { and, eq, lt } from 'drizzle-orm';
import { getConfig } from './config';
import { getDb } from './db/client';
import { idkitSessions, sessions } from './db/schema';
import { ApiError } from './errors';

export const IDKIT_COOKIE = 'lw_idkit';
export const WORKER_COOKIE = 'lw_worker';
export const IDKIT_TTL_S = 15 * 60;
export const WORKER_TTL_S = 12 * 60 * 60;
/** Long enough for a wallet round trip, short enough that a stolen one is stale. */
export const NONCE_TTL_S = 10 * 60;

/**
 * A nonce is a `sessions` row with no worker yet. The frozen table has no `kind` column, so
 * `mode` carries it and the two `NOT NULL` identity columns take sentinels; consuming the
 * nonce deletes the row. See the INTERFACE REQUEST on the T-08 PR and `README.md`.
 */
export const NONCE_MODE = 'nonce';
const NONCE_SENTINEL_WORKER = '';
const NONCE_SENTINEL_NULLIFIER = '0';

export type SessionMode = 'walletAuth' | 'idkit' | 'dev';

export interface IdkitSession {
  nullifier: string;
  level: string;
  action: string;
}

export interface WorkerSession {
  worker: string;
  nullifier: string;
  mode: SessionMode;
}

export interface IssuedSession<T> {
  claims: T;
  token: string;
  cookie: string;
}

function secret(): Uint8Array {
  return new TextEncoder().encode(getConfig().SESSION_SECRET);
}

/**
 * `SameSite=None` in production because the mini-app and the dashboard are different origins
 * from the API and the cookie has to survive the hop; `Lax` in dev and test, where there is
 * no HTTPS to attach `Secure` to and `None` without `Secure` is dropped by the browser.
 */
function cookieAttributes(maxAgeS: number): string {
  const parts = ['Path=/', 'HttpOnly', `Max-Age=${maxAgeS}`];
  parts.push(getConfig().isProduction ? 'SameSite=None' : 'SameSite=Lax');
  if (getConfig().isProduction) parts.push('Secure');
  return parts.join('; ');
}

function serialiseCookie(name: string, value: string, maxAgeS: number): string {
  return `${name}=${value}; ${cookieAttributes(maxAgeS)}`;
}

/** A cleared cookie is the same cookie with no value and no life left. */
export function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; Max-Age=0`;
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

async function sign(claims: JWTPayload, ttlS: number): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlS}s`)
    .sign(secret());
}

async function verify(token: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    return payload;
  } catch {
    throw ApiError.of('unauthorized');
  }
}

// --- nonces ---------------------------------------------------------------

/** 16 random bytes, hex, recorded so it can only ever be spent once. */
export async function issueNonce(): Promise<string> {
  const nonce = randomBytes(16).toString('hex');
  const now = new Date();
  await getDb()
    .insert(sessions)
    .values({
      id: nonce,
      worker: NONCE_SENTINEL_WORKER,
      nullifier: NONCE_SENTINEL_NULLIFIER,
      mode: NONCE_MODE,
      createdAt: now,
      expiresAt: new Date(now.getTime() + NONCE_TTL_S * 1000),
    });
  return nonce;
}

/**
 * Spends a nonce, or throws the single 401 that covers both "already spent" and "never
 * issued": telling those apart would tell an attacker which nonces this server has handed
 * out.
 */
export async function consumeNonce(nonce: string): Promise<void> {
  const deleted = await getDb()
    .delete(sessions)
    .where(and(eq(sessions.id, nonce), eq(sessions.mode, NONCE_MODE)))
    .returning({ id: sessions.id, expiresAt: sessions.expiresAt });

  const row = deleted[0];
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    throw ApiError.of('unauthorized', { reason: 'nonce_used' });
  }
}

/** Housekeeping for the nonce rows nobody came back for. */
export async function purgeExpiredNonces(): Promise<void> {
  await getDb()
    .delete(sessions)
    .where(and(eq(sessions.mode, NONCE_MODE), lt(sessions.expiresAt, new Date())));
}

// --- idkit session --------------------------------------------------------

/**
 * `action` rides in the claims rather than in a column: the frozen `idkit_sessions` table
 * has no `action`, and the token is signed, so the claim is as trustworthy as the row.
 */
export async function issueIdkitSession(claims: IdkitSession): Promise<IssuedSession<IdkitSession>> {
  const id = randomBytes(16).toString('hex');
  const now = new Date();
  await getDb().insert(idkitSessions).values({
    id,
    nullifier: claims.nullifier,
    level: claims.level,
    createdAt: now,
    expiresAt: new Date(now.getTime() + IDKIT_TTL_S * 1000),
  });
  const token = await sign({ ...claims, sid: id, kind: 'idkit' }, IDKIT_TTL_S);
  return { claims, token, cookie: serialiseCookie(IDKIT_COOKIE, token, IDKIT_TTL_S) };
}

export async function requireIdkitSession(req: Request): Promise<IdkitSession> {
  const token = readCookie(req, IDKIT_COOKIE) ?? bearer(req);
  if (!token) throw ApiError.of('unauthorized');
  const payload = await verify(token);
  if (payload.kind !== 'idkit') throw ApiError.of('unauthorized');
  const { nullifier, level, action } = payload as Record<string, unknown>;
  if (typeof nullifier !== 'string' || typeof level !== 'string' || typeof action !== 'string') {
    throw ApiError.of('unauthorized');
  }
  return { nullifier, level, action };
}

// --- worker session -------------------------------------------------------

export async function issueWorkerSession(
  claims: WorkerSession,
): Promise<IssuedSession<WorkerSession>> {
  const now = new Date();
  await getDb().insert(sessions).values({
    id: randomBytes(16).toString('hex'),
    worker: claims.worker,
    nullifier: claims.nullifier,
    mode: claims.mode,
    createdAt: now,
    expiresAt: new Date(now.getTime() + WORKER_TTL_S * 1000),
  });
  const token = await sign(
    { sub: claims.worker, nullifier: claims.nullifier, mode: claims.mode, kind: 'worker' },
    WORKER_TTL_S,
  );
  return { claims, token, cookie: serialiseCookie(WORKER_COOKIE, token, WORKER_TTL_S) };
}

/** `Authorization: Bearer <jwt>` is not a fallback for browsers — it is how the CLI worker,
 * which has no cookie jar, holds a session at all. */
function bearer(req: Request): string | undefined {
  const header = req.headers.get('authorization');
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
}

export async function requireWorkerSession(req: Request): Promise<WorkerSession> {
  const token = readCookie(req, WORKER_COOKIE) ?? bearer(req);
  if (!token) throw ApiError.of('unauthorized');
  const payload = await verify(token);
  if (payload.kind !== 'worker') throw ApiError.of('unauthorized');
  const { sub, nullifier, mode } = payload as Record<string, unknown>;
  if (typeof sub !== 'string' || typeof nullifier !== 'string' || typeof mode !== 'string') {
    throw ApiError.of('unauthorized');
  }
  return { worker: sub, nullifier, mode: mode as SessionMode };
}
