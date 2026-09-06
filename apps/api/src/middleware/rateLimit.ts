/**
 * Sliding-window limits for the free routes an attacker can hammer.
 *
 * A brake on one hostile client, not a quota. The store is per instance and Vercel runs
 * several, so the effective ceiling is `limit x instances`; the durable limit on *money* is
 * `caps_ledger`, not this file. `SECURITY.md` says so in as many words.
 *
 * Every rule is a pure function of `(request, store, now)`: the window is injected, the clock
 * is injected, so a test can advance a minute without waiting one.
 */

/** One window, one verdict. `retry_after_s` is what the caller puts in `Retry-After`. */
export interface RateLimitDecision {
  allowed: boolean;
  retry_after_s: number;
}

export interface RateLimitStore {
  hit(key: string, windowMs: number, limit: number, now: number): RateLimitDecision;
}

/**
 * The timestamps of the hits still inside some window, keyed by rule + scope + subject.
 *
 * Module scope on purpose: an edge module is evaluated once per instance and then answers
 * many requests, so this is the only place the counts can survive between them.
 */
const windows = new Map<string, number[]>();

export class MemoryRateLimitStore implements RateLimitStore {
  hit(key: string, windowMs: number, limit: number, now: number): RateLimitDecision {
    const floor = now - windowMs;
    // Pruned on hit: the only sweep this store gets, and the only one it needs — a key
    // nobody touches again is a key nobody pays for beyond its last array.
    const recent = (windows.get(key) ?? []).filter((t) => t > floor);

    if (recent.length >= limit) {
      windows.set(key, recent);
      const oldest = recent[0] ?? now;
      return {
        allowed: false,
        retry_after_s: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      };
    }

    recent.push(now);
    windows.set(key, recent);
    return { allowed: true, retry_after_s: 0 };
  }

  /** Vitest only: a fresh window between cases. */
  reset(): void {
    windows.clear();
  }
}

// ------------------------------------------------------------------ policy

export type RateLimitScope = 'ip' | 'session';

export interface RateLimitRule {
  /** Stable, and part of the key: two rules never share a counter. */
  id: string;
  method: 'GET' | 'POST';
  /** The scoped ceilings this rule applies; a request has to clear all of them. */
  limits: { scope: RateLimitScope; limit: number }[];
  match(pathname: string): boolean;
}

export const RATE_LIMIT_WINDOW_MS = 60_000;

const exact = (p: string) => (pathname: string) => pathname === p;
const prefix = (p: string) => (pathname: string) => pathname === p || pathname.startsWith(`${p}/`);

/** `/tasks/<id>` and nothing deeper — `/tasks/:id/spec` is a worker route, not a browse one. */
const oneSegmentUnder = (p: string) => (pathname: string) => {
  if (!pathname.startsWith(`${p}/`)) return false;
  return !pathname.slice(p.length + 1).includes('/');
};

/** `/tasks/<id>/<action>` for one of the worker actions. */
const taskAction = (actions: string[]) => (pathname: string) => {
  const parts = pathname.split('/').filter(Boolean);
  return parts.length === 3 && parts[0] === 'tasks' && actions.includes(parts[2] as string);
};

/**
 * Per key, per minute. The paid route (`POST /tasks`) is absent on purpose: it is limited by
 * money and `caps_ledger`, which is a limit an attacker cannot outspend.
 */
export const RATE_LIMITS: RateLimitRule[] = [
  { id: 'check', method: 'POST', limits: [{ scope: 'ip', limit: 30 }], match: exact('/check') },
  {
    id: 'proofs',
    method: 'POST',
    limits: [
      { scope: 'session', limit: 10 },
      { scope: 'ip', limit: 20 },
    ],
    match: exact('/proofs'),
  },
  {
    id: 'session-nonce',
    method: 'GET',
    limits: [{ scope: 'ip', limit: 10 }],
    match: exact('/session/nonce'),
  },
  { id: 'session', method: 'POST', limits: [{ scope: 'ip', limit: 10 }], match: exact('/session') },
  { id: 'idkit', method: 'POST', limits: [{ scope: 'ip', limit: 10 }], match: prefix('/idkit') },
  { id: 'register', method: 'POST', limits: [{ scope: 'ip', limit: 5 }], match: exact('/register') },
  {
    id: 'browse',
    method: 'GET',
    limits: [{ scope: 'ip', limit: 120 }],
    match: (pathname) =>
      exact('/tasks')(pathname) ||
      oneSegmentUnder('/tasks')(pathname) ||
      prefix('/public')(pathname),
  },
  {
    id: 'task-action',
    method: 'POST',
    limits: [{ scope: 'session', limit: 30 }],
    match: taskAction(['claim', 'release-claim', 'submit', 'report']),
  },
];

export function ruleFor(method: string, pathname: string): RateLimitRule | undefined {
  return RATE_LIMITS.find((r) => r.method === method && r.match(pathname));
}

// ------------------------------------------------------------------ subjects

/**
 * The first hop of `x-forwarded-for`, else `x-real-ip`, else `'unknown'`.
 *
 * `'unknown'` is one shared bucket rather than an exemption: a caller a proxy cannot place
 * still has to queue behind everyone else it cannot place.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  return 'unknown';
}

/**
 * T-19's worker-session cookie. Typed out rather than imported: the session helper reaches
 * for Node built-ins, jose and the database on import, and none of those belong in an edge
 * bundle. If the name moves, this constant moves with it.
 */
export const WORKER_SESSION_COOKIE = 'lw_worker';

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return part.slice(eq + 1).trim();
  }
  return undefined;
}

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * The session subject: sha-256 of the cookie, first 16 hex characters.
 *
 * Never the cookie itself. A rate-limit key ends up in a metric, a log line and a memory
 * dump; a session token in any of those is a session someone else can hold.
 */
export async function sessionKey(req: Request): Promise<string | undefined> {
  const cookie = readCookie(req, WORKER_SESSION_COOKIE);
  if (!cookie) return undefined;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cookie));
  return hex(new Uint8Array(digest)).slice(0, 16);
}

export interface RateLimitVerdict {
  limited: boolean;
  retry_after_s: number;
}

const ALLOWED: RateLimitVerdict = { limited: false, retry_after_s: 0 };

/**
 * Applies whichever rule covers this request, or none. A scope with no subject — a
 * session-limited route called without the cookie — is skipped, not defaulted to a shared
 * bucket: one bucket for every anonymous caller would let any one of them lock out the rest.
 */
export async function checkRateLimit(
  req: Request,
  pathname: string,
  store: RateLimitStore,
  now: number,
): Promise<RateLimitVerdict> {
  const rule = ruleFor(req.method, pathname);
  if (!rule) return ALLOWED;

  let worst = ALLOWED;
  for (const { scope, limit } of rule.limits) {
    const subject = scope === 'ip' ? clientIp(req) : await sessionKey(req);
    if (!subject) continue;
    const decision = store.hit(
      `${rule.id}:${scope}:${subject}`,
      RATE_LIMIT_WINDOW_MS,
      limit,
      now,
    );
    if (!decision.allowed && decision.retry_after_s > worst.retry_after_s) {
      worst = { limited: true, retry_after_s: decision.retry_after_s };
    }
  }
  return worst;
}
