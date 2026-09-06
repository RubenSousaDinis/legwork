/**
 * A sliding window in this instance's memory.
 *
 * Per instance, deliberately: Vercel runs several and they share nothing, so the effective
 * limit is `limit x instances`. It is a brake on a runaway client, not a quota — the caps
 * that money depends on live on chain. The README says so too.
 */
import { ApiError } from '../errors';

const hits = new Map<string, number[]>();

export interface RateLimitOptions {
  limit: number;
  windowS: number;
}

/** Throws `rate_limited` with `retry_after_s` (the contract's name) once `limit` is reached in the window. */
export function rateLimit(key: string, { limit, windowS }: RateLimitOptions): void {
  const now = Date.now();
  const floor = now - windowS * 1000;
  const recent = (hits.get(key) ?? []).filter((t) => t > floor);

  if (recent.length >= limit) {
    const oldest = recent[0] ?? now;
    const retryAfter = Math.max(1, Math.ceil((oldest + windowS * 1000 - now) / 1000));
    hits.set(key, recent);
    throw ApiError.of('rate_limited', { retry_after_s: retryAfter });
  }

  recent.push(now);
  hits.set(key, recent);
}

/** The first hop of `x-forwarded-for`; `'local'` when there is no proxy in front. */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : 'local';
}

/** Vitest only: a fresh window between cases. */
export function resetRateLimitForTests(): void {
  hits.clear();
}
