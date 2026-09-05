/**
 * The buyer's capability for one task.
 *
 * The token is issued once by `POST /tasks` (T-16) and never stored: the row keeps only
 * `sha256(token)`, so a database dump cannot approve anybody's task. No token and no digest
 * in this file is ever compared with JavaScript's strict equality operator — a comparison
 * that returns on the first differing byte is a timing oracle, and the whole point of
 * hashing both sides first is that `timingSafeEqual` then always sees two 32-byte buffers.
 *
 * A missing header and a wrong header are the same answer: 401 `{error:'unauthorized'}`,
 * the same log line, and never the value that was presented.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../errors';
import { logger } from '../log';

/** The digest stored in `tasks.buyer_token_hash`. Hex, lower case, 64 characters. */
export function hashBuyerToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * 32 bytes of randomness, base64url so it survives a header, a shell and a JSON string
 * without escaping. T-16 hands `token` to the agent once and keeps only `hash`.
 */
export function newBuyerToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashBuyerToken(token) };
}

/**
 * Both sides hashed, then compared over the raw digests.
 *
 * The length guard is not a shortcut around the constant-time compare: `timingSafeEqual`
 * throws on a length mismatch, and a throw is louder than any timing difference it could
 * have leaked. It only fires on a malformed stored hash, never on a wrong token.
 */
export function verifyBuyerToken(token: string | null, storedHash: string | null): boolean {
  if (!token || !storedHash) return false;
  const presented = Buffer.from(hashBuyerToken(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  if (presented.length !== stored.length) return false;
  return timingSafeEqual(presented, stored);
}

/** The header name, spelled once. `HEADERS.buyerToken` in `@legwork/shared` is the same string. */
export const BUYER_TOKEN_HEADER = 'x-buyer-token';

/**
 * The guard the three buyer verbs share. `row` is only ever read for its id and its stored
 * digest, so a caller cannot accidentally hand this function a whole task and have it logged.
 */
export function requireBuyerToken(
  req: Request,
  row: { taskId: bigint; buyerTokenHash: string | null },
): void {
  const presented = req.headers.get(BUYER_TOKEN_HEADER);
  if (verifyBuyerToken(presented, row.buyerTokenHash)) return;
  logger.warn({ task_id: row.taskId.toString() }, 'buyer_token_rejected');
  throw ApiError.of('unauthorized');
}
