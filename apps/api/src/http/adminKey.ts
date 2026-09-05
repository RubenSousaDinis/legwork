/**
 * The admin surface is off unless `ADMIN_API_KEY` is set, and "off" means 404: an operator
 * console that answers 401 has told an anonymous caller it exists.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { getConfig } from '../config';
import { ApiError } from '../errors';

/**
 * Digests first, then `timingSafeEqual`. Comparing the raw strings would throw on a length
 * mismatch, and "threw immediately" is itself a timing signal that leaks the key's length.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function requireAdminKey(req: Request): void {
  const configured = getConfig().ADMIN_API_KEY;
  if (!configured) throw ApiError.of('not_found');
  const presented = req.headers.get('x-admin-key') ?? '';
  if (!constantTimeEqual(presented, configured)) throw ApiError.of('unauthorized');
}
