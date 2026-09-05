/**
 * Calls a route handler the way Next would, without booting Next.
 *
 * Route handlers are plain `(Request, ctx) => Response` functions, so the honest way to test
 * one is to hand it a real `Request` and read a real `Response` — no server, no port, no
 * fetch mock deciding what a header means.
 */
export interface CallOptions {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
  cookies?: Record<string, string>;
  /** Dynamic segments, as Next passes them: `{ id: '7' }` for `app/tasks/[id]`. */
  params?: Record<string, string | string[]>;
}

export type RouteHandler = (
  req: Request,
  ctx: { params: Promise<Record<string, string | string[]>> },
) => Promise<Response>;

export async function call(handler: RouteHandler, options: CallOptions = {}): Promise<Response> {
  const { method = 'GET', url = 'http://localhost/', headers = {}, body, cookies, params } = options;

  const init: RequestInit & { headers: Record<string, string> } = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['content-type'] ??= 'application/json';
  }
  if (cookies && Object.keys(cookies).length > 0) {
    init.headers.cookie = Object.entries(cookies)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('; ');
  }

  return handler(new Request(url, init), { params: Promise.resolve(params ?? {}) });
}

/** The cookies a response sets, by name. */
export function setCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of res.headers.getSetCookie()) {
    const first = raw.split(';')[0] ?? '';
    const eq = first.indexOf('=');
    if (eq < 0) continue;
    out[first.slice(0, eq).trim()] = decodeURIComponent(first.slice(eq + 1));
  }
  return out;
}
