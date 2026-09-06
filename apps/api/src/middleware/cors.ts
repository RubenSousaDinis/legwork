/**
 * Two browser frontends are allowed to call this API with credentials. Everything else with
 * an `Origin` header is refused, and everything *without* one is waved through untouched.
 *
 * That last rule is the one to keep: an agent, the local MCP server and curl send no
 * `Origin`, and CORS was never a control over them — it is a control the browser applies on
 * their behalf to a page. Blocking a request for lacking the header would break every
 * non-browser caller while stopping nothing.
 */
import type { MiddlewareEnv } from './env';

export const CORS_ALLOWED_METHODS = 'GET,POST,OPTIONS';
export const CORS_ALLOWED_HEADERS = 'Content-Type, X-Buyer-Token, PAYMENT-SIGNATURE';
export const CORS_MAX_AGE_S = 600;

/**
 * Scheme + host + port, trailing slash stripped. `MINIAPP_URL` may be configured with a path
 * or a trailing slash; an `Origin` header never has either, so both sides are reduced to the
 * one form they can be compared in.
 */
function toOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function allowedOrigins(env: MiddlewareEnv): string[] {
  return [toOrigin(env.MINIAPP_URL), toOrigin(env.DASHBOARD_URL)].filter(
    (o): o is string => o !== undefined,
  );
}

export type CorsVerdict =
  /** No `Origin` header: not a browser's cross-origin request, so no CORS applies. */
  | { kind: 'absent' }
  /** An allowlisted origin; `headers` go on whatever this request ends up answering. */
  | { kind: 'allowed'; origin: string; headers: Record<string, string> }
  /** An origin we do not know, including the literal `null` a sandboxed frame sends. */
  | { kind: 'refused' };

export function evaluateCors(req: Request, env: MiddlewareEnv): CorsVerdict {
  const origin = req.headers.get('origin');
  if (origin === null) return { kind: 'absent' };
  // `null` is what a sandboxed iframe, a `file://` page and a redirected form send. It is not
  // an origin anyone can be allowlisted as, so it is refused with the rest.
  if (!allowedOrigins(env).includes(origin)) return { kind: 'refused' };

  return {
    kind: 'allowed',
    origin,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      // Without this a shared cache could hand one origin the headers minted for another.
      Vary: 'Origin',
    },
  };
}

/** The preflight answer for an allowlisted origin: 204 and the four things it asked about. */
export function preflightHeaders(verdict: Extract<CorsVerdict, { kind: 'allowed' }>): Record<
  string,
  string
> {
  return {
    ...verdict.headers,
    'Access-Control-Allow-Methods': CORS_ALLOWED_METHODS,
    'Access-Control-Allow-Headers': CORS_ALLOWED_HEADERS,
    'Access-Control-Max-Age': String(CORS_MAX_AGE_S),
  };
}
