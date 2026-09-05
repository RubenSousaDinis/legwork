/**
 * World ID v4, from the API's side of the wire.
 *
 * This service is the relying party. `WORLD_RP_SIGNING_KEY` is read here and nowhere else,
 * never returned, never logged, never put in a cookie and never in `/config/world`.
 *
 * Registration runs against **sandbox World ID** — World's staging environment,
 * `WORLD_ENV=staging` — and the chip that says so on the worker's card is describing this
 * file. Binding the human to an address is **operator-attested**: see `attestation.ts`.
 *
 * ## The routes this service backs
 *
 * - `POST /idkit/request` — public, 30/min. `{action}` in, `{rp_context: {rp_id, nonce,
 *   created_at, expires_at, signature}}` out. `action` must equal `WORLD_ACTION`; anything
 *   else is `400 {error:'invalid_request', field:'action', reason:'unknown_action'}`. The
 *   mini-app hands `rp_context` straight to IDKit.
 * - `POST /idkit/verify` — public, 30/min. The IDKit result payload goes to
 *   `POST https://developer.world.org/api/v4/verify/{rp_id}` **byte for byte**: the body is
 *   read once as text and forwarded as text, so nothing is added, dropped or reordered on
 *   the way. A round trip through parse-then-re-serialise would reorder keys and break a
 *   signature World computed over the bytes it sent. The parsed copy exists only to read
 *   `action`, which is checked in the request body, in the forwarded payload and in
 *   World's response. On success the nullifier is recorded and a short-lived idkit-session
 *   is issued; a nullifier already bound to a worker is `409
 *   {error:'nullifier_already_registered'}` and gets no cookie.
 * - `POST /register` — idkit-session, 10/min. `{worker_address, area, task_types}` in,
 *   `{tx, worker}` out. The EIP-712 attestation is signed here and `registerFor` is relayed
 *   through the chain adapter's relayer queue; the database row is bound only once the
 *   chain has returned a hash, so a revert leaves no phantom binding.
 * - `GET /config/world` — public, `max-age=60`. Five keys: which app, which action, which
 *   RP, which credential level, which environment. Nothing else, ever.
 *
 * The nullifier travels as a decimal string: it is a full `uint256`, the column is
 * `NUMERIC(78,0)`, and a JSON number would silently round it.
 */
import { signRequest } from '@worldcoin/idkit-core/signing';
import { getConfig } from '../config';
import { ApiError, ERROR_CODES, type ErrorCode } from '../errors';

export const WORLD_VERIFY_BASE = 'https://developer.world.org/api/v4/verify';

/**
 * T-01 names four bodies this flow returns whose `error` value is not one of `errors.ts`'s
 * generic codes — `nullifier_already_registered`, `worker_already_bound`,
 * `attestation_rejected`, `chain_unavailable`. `ApiError.body()` spreads `extra` over
 * `error`, so passing `error` in `extra` is how a specific name reaches the envelope while
 * the status still comes from a code `route()` already knows how to log.
 */
export function namedError(
  code: ErrorCode,
  name: string,
  extra: Record<string, unknown> = {},
  status: number = ERROR_CODES[code],
): ApiError {
  return new ApiError(status, code, { error: name, ...extra });
}

/** One nullifier = one worker, whether the database says so or the registry does. */
export function nullifierAlreadyRegistered(): ApiError {
  return namedError('conflict', 'nullifier_already_registered');
}

/** What `POST /idkit/request` hands the client, and what IDKit expects to be given. */
export interface RpContext {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
}

export type WorldVerification =
  | { ok: true; nullifier: string; level: string; action: string; protocol_version: string }
  | { ok: false; status: number; code: string };

/**
 * `signRequest` takes one options object — `{signingKeyHex, action?, ttl?}` — and returns
 * `{sig, nonce, createdAt, expiresAt}`. The names differ from the wire's on both sides, so
 * the mapping is written out rather than spread.
 */
export function signRpRequest(action: string): RpContext {
  const config = getConfig();
  const signingKeyHex = config.WORLD_RP_SIGNING_KEY;
  if (!signingKeyHex) throw new Error('WORLD_RP_SIGNING_KEY is not set');
  const rpId = config.WORLD_RP_ID;
  if (!rpId) throw new Error('WORLD_RP_ID is not set');

  const signed = signRequest({ signingKeyHex, action });

  return {
    rp_id: rpId,
    nonce: signed.nonce,
    created_at: signed.createdAt,
    expires_at: signed.expiresAt,
    signature: signed.sig,
  };
}

/** A `NUMERIC(78,0)` holds a full `uint256`; the World `nullifier` arrives as 0x-hex. */
export function nullifierToNumeric(hex: string): string {
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(hex)) {
    throw new Error('nullifierToNumeric: expected 0x-prefixed hex of at most 32 bytes');
  }
  return BigInt(hex).toString(10);
}

function readString(source: unknown, key: string): string | undefined {
  if (typeof source !== 'object' || source === null) return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Forwards the IDKit result to World exactly as it arrived.
 *
 * `rawBody` is the string `await req.text()` returned. It is never parsed and re-serialised
 * on the way out: the proof is signed over those bytes.
 */
export async function verifyWithWorld(rawBody: string): Promise<WorldVerification> {
  const config = getConfig();
  const rpId = config.WORLD_RP_ID;
  if (!rpId) throw new Error('WORLD_RP_ID is not set');

  const response = await globalThis.fetch(`${WORLD_VERIFY_BASE}/${rpId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody,
  });

  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    // World's own code when it sent one, otherwise the status — the caller turns either
    // into `reason` and the proof payload itself never reaches a client or a log.
    const code = readString(body, 'code') ?? readString(body, 'error') ?? `http_${response.status}`;
    return { ok: false, status: response.status, code };
  }

  const nullifier = readString(body, 'nullifier');
  if (!nullifier) return { ok: false, status: response.status, code: 'missing_nullifier' };

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = undefined;
  }

  // The credential World reports wins; the payload's claim is the fallback; the configured
  // level is the last resort, so `level` is never empty on a verified human.
  const level =
    readString(body, 'verification_level') ??
    readString(body, 'credential_type') ??
    readString(payload, 'verification_level') ??
    config.WORLD_CREDENTIAL_LEVEL;

  return {
    ok: true,
    nullifier,
    level,
    action: readString(body, 'action') ?? '',
    protocol_version: readString(body, 'protocol_version') ?? '',
  };
}
