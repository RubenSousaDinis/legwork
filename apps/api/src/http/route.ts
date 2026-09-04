/**
 * The one wrapper every route handler goes through.
 *
 * "Middleware" in this service means these composable wrappers and not a Next.js
 * `middleware.ts`: that file runs on the edge runtime, where neither the Postgres driver nor
 * pino can be opened. There is deliberately no `middleware.ts` in this app.
 */
import { randomUUID } from 'node:crypto';
import { ApiError, toApiError } from '../errors';
import { childLogger } from '../log';
import { getConfig } from '../config';

/**
 * Next passes the dynamic segments as a promise from 15 onward, and passes the property on
 * every route — an empty object where there are no segments — so it is not optional.
 */
export interface RouteContext {
  params: Promise<Record<string, string | string[]>>;
}

export type Handler = (req: Request, ctx: RouteContext) => Promise<Response> | Response;

const ALLOWED_METHODS = 'GET,POST,PATCH,DELETE,OPTIONS';
const ALLOWED_HEADERS = 'content-type,authorization,x-admin-key,x-buyer-token,payment-signature';

/** The mini-app and the dashboard are separate origins and send the session cookie. */
function allowedOrigins(): string[] {
  try {
    const c = getConfig();
    return [c.MINIAPP_URL, c.DASHBOARD_URL].filter((u): u is string => Boolean(u));
  } catch {
    // A config that will not parse is a 500 further down; CORS must not be the error the
    // caller sees first.
    return [];
  }
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin || !allowedOrigins().includes(origin)) return { vary: 'Origin' };
  return {
    vary: 'Origin',
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': ALLOWED_METHODS,
    'access-control-allow-headers': ALLOWED_HEADERS,
    'access-control-max-age': '600',
  };
}

function withHeaders(res: Response, extra: Record<string, string>): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function json(status: number, body: unknown, extra: Record<string, string>): Response {
  return Response.json(body, { status, headers: extra });
}

/**
 * Adds a request id, logs one line per request, and maps every throw onto the error
 * envelope. An unknown throw is a 500 carrying the `request_id` and nothing else — the stack
 * goes to the log, never to the caller.
 */
export function route(handler: Handler): (req: Request, ctx: RouteContext) => Promise<Response> {
  return async (req: Request, ctx: RouteContext): Promise<Response> => {
    const requestId = randomUUID();
    const path = new URL(req.url).pathname;
    const cors = { ...corsHeaders(req), 'x-request-id': requestId };
    const log = childLogger({ route: path, request_id: requestId });
    const startedAt = Date.now();

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const done = (status: number) =>
      log.info({ method: req.method, path, status, duration_ms: Date.now() - startedAt }, 'request');

    try {
      const res = await handler(req, ctx);
      done(res.status);
      return withHeaders(res, cors);
    } catch (err) {
      const api = toApiError(err);
      if (api) {
        done(api.status);
        return json(api.status, api.body(), cors);
      }
      log.error(
        { method: req.method, path, err: err instanceof Error ? err.stack : String(err) },
        'unhandled',
      );
      done(500);
      return json(500, { error: 'internal', request_id: requestId }, cors);
    }
  };
}

/** `export const OPTIONS = preflight` — the browser's preflight, with the same CORS rules. */
export const preflight = route(async () => new Response(null, { status: 204 }));

/** Small helper so a handler reads `await params(ctx, 'id')` instead of unwrapping a promise. */
export async function pathParam(ctx: RouteContext, name: string): Promise<string> {
  const resolved = await ctx.params;
  const value = resolved[name];
  const one = Array.isArray(value) ? value[0] : value;
  if (!one) throw ApiError.of('not_found');
  return one;
}
