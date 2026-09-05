/**
 * The whole error vocabulary of this API. A route throws one of these; `route()` turns it
 * into the envelope `{ error: <code>, ...extra }` and nothing else ever reaches a client.
 */
import { ZodError } from 'zod';

export const ERROR_CODES = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  not_implemented: 501,
  internal: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Extra fields are merged into the envelope beside `error`, so `{error, field, reason}`. */
export type ErrorExtra = Record<string, unknown>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly extra?: ErrorExtra;

  constructor(status: number, code: ErrorCode, extra?: ErrorExtra) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (extra) this.extra = extra;
  }

  /** `ApiError.of('conflict', {reason: 'already_claimed'})` — the status comes from the code. */
  static of(code: ErrorCode, extra?: ErrorExtra): ApiError {
    return new ApiError(ERROR_CODES[code], code, extra);
  }

  body(): ErrorExtra & { error: ErrorCode } {
    return { error: this.code, ...(this.extra ?? {}) };
  }
}

/**
 * A schema error is a plain 400 and never anything else — in particular it never marks.
 * `field` is the first issue's dotted path so a caller can fix one thing at a time.
 */
export function apiErrorFromZod(err: ZodError): ApiError {
  const issue = err.issues[0];
  return ApiError.of('invalid_request', {
    field: issue ? issue.path.map(String).join('.') || '(root)' : '(root)',
    reason: issue?.message ?? 'invalid request',
  });
}

export function toApiError(err: unknown): ApiError | undefined {
  if (err instanceof ApiError) return err;
  if (err instanceof ZodError) return apiErrorFromZod(err);
  return undefined;
}
