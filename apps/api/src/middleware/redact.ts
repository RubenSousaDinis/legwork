/**
 * A logger that cannot print a token or a key.
 *
 * Two mechanisms, and the order matters. The request serializer is an **allowlist**: five
 * header names survive and every other header is dropped before pino ever sees it, so a
 * credential in a header nobody has thought of yet is gone without anybody having had to
 * think of it. The redact paths are the backstop for the bodies, where the shape is ours and
 * a denylist can be complete.
 *
 * Censoring a header would still print its name. Dropping it prints nothing.
 */
import pino, { type Logger, type LoggerOptions } from 'pino';

export const REDACTED = '[REDACTED]';

/**
 * Both the bare form and the `*.` form where a field can appear nested: pino matches a path
 * literally, and its `*` is a whole-segment wildcard, never a suffix.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-buyer-token"]',
  'req.headers["x-admin-key"]',
  'req.headers["payment-signature"]',
  'req.headers["x-buyer-signature"]',
  'res.headers["set-cookie"]',
  '*.buyer_token',
  '*.privateKey',
  '*.private_key',
  '*.secret',
  '*.token',
  '*.cookie',
] as const;

/**
 * The only headers worth a log line: enough to explain a request, not enough to replay one.
 */
export const LOGGED_HEADERS = [
  'content-type',
  'content-length',
  'user-agent',
  'origin',
  'x-request-id',
] as const;

interface HeaderBag {
  get?(name: string): string | null;
  [key: string]: unknown;
}

interface RequestLike {
  method?: string;
  url?: string;
  headers?: HeaderBag | Record<string, unknown>;
}

function headerValue(headers: RequestLike['headers'], name: string): string | undefined {
  if (!headers) return undefined;
  const bag = headers as HeaderBag;
  if (typeof bag.get === 'function') {
    return bag.get(name) ?? undefined;
  }
  const record = headers as Record<string, unknown>;
  const found = record[name] ?? record[name.toLowerCase()];
  return typeof found === 'string' ? found : undefined;
}

/**
 * `serializers.req`. Takes a `Request`, a `NextRequest` or a plain object with a headers
 * record, and returns method, url and the allowlisted headers only.
 */
export function headerSerializer(req: RequestLike): {
  method?: string;
  url?: string;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  for (const name of LOGGED_HEADERS) {
    const value = headerValue(req.headers, name);
    if (value !== undefined) headers[name] = value;
  }
  return { method: req.method, url: req.url, headers };
}

/**
 * pino with the redaction list and the header allowlist already on. `opts` can set the
 * level, the base bindings or a destination stream; it cannot turn the redaction off, because
 * `redact` and `serializers.req` are applied after it.
 */
export function createLogger(opts: LoggerOptions = {}, destination?: pino.DestinationStream): Logger {
  const options: LoggerOptions = {
    ...opts,
    redact: { paths: [...REDACT_PATHS], censor: REDACTED },
    serializers: { ...opts.serializers, req: headerSerializer },
  };
  return destination ? pino(options, destination) : pino(options);
}
