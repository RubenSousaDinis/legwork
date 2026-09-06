/**
 * Signed, expiring URLs for one proof image.
 *
 * The bucket is private, so the only way a byte of a proof reaches a browser is through
 * `GET /proofs/:hash?exp=&sig=`, and the only way that route answers is with an HMAC over
 * `hash.exp` that this process minted. Nothing about the signature identifies the viewer:
 * it is a capability with a deadline on it, handed to the worker who uploaded the photo
 * (1 hour) or to a buyer for as long as the buyer could still dispute (T-19).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getConfig } from '../config';

/** The worker gets its own photo back for one hour — long enough to submit, not to share. */
export const WORKER_URL_TTL_S = 3600;

function hmacSha256Hex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

/**
 * `API_BASE_URL` is optional in this environment; without it the URL is same-origin and
 * relative, which is what the mini-app fetches anyway.
 */
function baseUrl(): string {
  return getConfig().API_BASE_URL ?? '';
}

export function signProofUrl(hash: string, expiresAtS: number): string {
  const sig = hmacSha256Hex(getConfig().PROOF_URL_SECRET, `${hash}.${expiresAtS}`);
  return `${baseUrl()}/proofs/${hash}?exp=${expiresAtS}&sig=${sig}`;
}

/**
 * Constant-time over the signature, and the expiry checked separately so a stale-but-valid
 * signature is still refused. Anything malformed — a missing parameter, an `exp` that is
 * not a number, a `sig` of the wrong length — is `false`, never a throw.
 */
export function verifyProofUrl(
  hash: string,
  exp: string | number | null | undefined,
  sig: string | null | undefined,
  nowS: number,
): boolean {
  if (exp === null || exp === undefined || sig === null || sig === undefined) return false;

  const expiresAtS = typeof exp === 'number' ? exp : Number(exp);
  if (!Number.isFinite(expiresAtS)) return false;
  if (!(nowS < expiresAtS)) return false;

  const expected = Buffer.from(hmacSha256Hex(getConfig().PROOF_URL_SECRET, `${hash}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
