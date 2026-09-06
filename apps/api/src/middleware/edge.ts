/**
 * The four guards, composed, in the one order that makes each of them mean something.
 *
 *   CORS  →  admin gate  →  body cap  →  rate limit  →  pass through
 *
 * CORS first because a preflight has to be answered before anything else looks at the
 * request, and because the answer is the same for every path — a hostile origin learns
 * nothing about which routes exist. The admin gate next, so `/admin/*` is decided before a
 * limiter or a cap can distinguish it from an unrouted path. The body cap before the rate
 * limit, so an oversized request is refused on its header rather than counted. The limiter
 * last, because it is the only guard that keeps state and should not be spending it on
 * requests three earlier guards would have refused anyway.
 *
 * Everything below is a pure function of `(req, env, store, now)`. `createMiddleware` takes
 * all three as dependencies, which is what lets the tests drive a full minute of traffic
 * against a fresh store with no server, no environment and no clock.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { checkAdminKey, isAdminPath } from './adminGate';
import { checkBodyLimit } from './bodyLimit';
import { evaluateCors, preflightHeaders, type CorsVerdict } from './cors';
import type { MiddlewareEnv } from './env';
import { checkRateLimit, MemoryRateLimitStore, type RateLimitStore } from './rateLimit';

export type { MiddlewareEnv } from './env';

/**
 * The only read of `process.env` in this directory, and it happens once. Every guard takes
 * the result as an argument instead of reaching for the process itself.
 */
export function readEnv(env: Record<string, string | undefined> = {}): MiddlewareEnv {
  return {
    MINIAPP_URL: env.MINIAPP_URL,
    DASHBOARD_URL: env.DASHBOARD_URL,
    ADMIN_API_KEY: env.ADMIN_API_KEY,
  };
}

export interface MiddlewareDeps {
  env: MiddlewareEnv;
  store?: RateLimitStore;
  now?: () => number;
}

export type EdgeMiddleware = (req: NextRequest) => NextResponse | Promise<NextResponse>;

function withHeaders(res: NextResponse, headers: Record<string, string>): NextResponse {
  for (const [name, value] of Object.entries(headers)) res.headers.set(name, value);
  return res;
}

/**
 * CORS headers ride on every answer this middleware gives — a 429 the browser cannot read is
 * a 429 the mini-app renders as a network error. `/admin/*` is the exception and gets none of
 * them, in any state: the operator console is not called from a page on another origin.
 */
function corsHeadersFor(verdict: CorsVerdict, admin: boolean): Record<string, string> {
  if (admin || verdict.kind !== 'allowed') return {};
  return verdict.headers;
}

export function createMiddleware(deps: MiddlewareDeps): EdgeMiddleware {
  const { env, store = new MemoryRateLimitStore(), now = () => Date.now() } = deps;

  return async (req: NextRequest): Promise<NextResponse> => {
    const pathname = req.nextUrl.pathname;
    const admin = isAdminPath(pathname);

    const cors = evaluateCors(req, env);
    if (cors.kind === 'refused') {
      // No CORS headers on this one: the browser has to fail it, and saying which origins
      // would have worked is an answer nobody asked for.
      return NextResponse.json({ error: 'origin_not_allowed' }, { status: 403 });
    }

    const headers = corsHeadersFor(cors, admin);

    if (!admin && req.method === 'OPTIONS' && cors.kind === 'allowed') {
      return withHeaders(new NextResponse(null, { status: 204 }), preflightHeaders(cors));
    }

    if (admin) {
      const verdict = await checkAdminKey(req, env);
      if (!verdict.ok) return NextResponse.json(verdict.body, { status: verdict.status });
    }

    const body = checkBodyLimit(req, pathname);
    if (!body.ok) {
      return withHeaders(NextResponse.json(body.body, { status: body.status }), headers);
    }

    const limit = await checkRateLimit(req, pathname, store, now());
    if (limit.limited) {
      return withHeaders(
        NextResponse.json(
          { error: 'rate_limited', retry_after_s: limit.retry_after_s },
          { status: 429, headers: { 'Retry-After': String(limit.retry_after_s) } },
        ),
        headers,
      );
    }

    return withHeaders(NextResponse.next(), headers);
  };
}

export const middleware = createMiddleware({ env: readEnv(process.env) });

/**
 * Everything except Next's own asset routes. The guards decide per path from there; a path
 * no rule names passes through with nothing but its CORS headers.
 */
export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
