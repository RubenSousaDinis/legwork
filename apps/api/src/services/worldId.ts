/**
 * World ID v4, from the API's side of the wire.
 *
 * This service is the relying party. `WORLD_RP_SIGNING_KEY` is read here and nowhere else,
 * never returned, never logged, never put in a cookie and never in `/config/world`.
 *
 * Registration runs against **production World ID**: the endpoint below is the only verify
 * endpoint there is, and `WORLD_APP_ID` is a production app, so the chip on the worker's card
 * names the credential that was presented — `World ID · Orb` — rather than an environment.
 * `WORLD_ENV` is a label `GET /config/world` echoes and nothing in this file reads. Binding the
 * human to an address is **operator-attested**: see `attestation.ts`.
 *
 * ## The routes this service backs
 *
 * - `POST /idkit/request` — public, 30/min. `{action}` in, `{rp_context: {rp_id, nonce,
 *   created_at, expires_at, signature}}` out. `action` must equal `WORLD_ACTION`; anything
 *   else is `400 {error:'invalid_request', field:'action', reason:'unknown_action'}`. The
 *   mini-app hands `rp_context` straight to IDKit.
 * - `POST /idkit/verify` — public, 30/min. The IDKit result payload is forwarded **byte for
 *   byte** (the body is read once as text and sent as text). A round trip through
 *   parse-then-re-serialise would reorder keys and break a signature World computed over the
 *   bytes it sent. The parsed copy exists only to read `action` and to pick the verify host:
 *   `environment: staging` → `staging-developer.worldcoin.org`; sandbox and production →
 *   `developer.world.org` (World's sandbox-access doc). Two successes, one action:
 *     - no worker-session: login. Selfie Check (`face`) or Orb. The nullifier is recorded
 *       and an idkit-session is issued; a nullifier already bound to a worker is `409
 *       {error:'nullifier_already_registered'}` and gets no cookie.
 *     - worker-session present: Selfie Check at claim. No uniqueness row; a short-lived
 *       `lw_selfie` cookie is issued so `POST /tasks/:id/claim` can demand a live person.
 *       An Orb proof here is `400` — the camera check is the abuse-prevention signal.
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
import { childLogger } from '../log';

export const WORLD_VERIFY_BASE = 'https://developer.world.org/api/v4/verify';
export const WORLD_VERIFY_STAGING_BASE = 'https://staging-developer.worldcoin.org/api/v4/verify';

/** World's `detail` is a sentence for the operator; never a proof. */
const WORLD_DETAIL_MAX = 400;

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
  | {
      ok: true;
      nullifier: string;
      level: string;
      action: string;
      protocol_version: string;
      /** Where `level` came from — a config fallback must not fail a live Selfie Check. */
      level_source: 'world' | 'payload' | 'config';
    }
  | { ok: false; status: number; code: string; detail?: string };

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

function firstFailedWorldResult(body: unknown): Record<string, unknown> | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) return undefined;
  const rows = results.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  );
  return rows.find((row) => row.success === false) ?? rows[0];
}

/** First `results[]` row World marked successful, else the first row. Never the proof bytes. */
function firstWorldResult(body: unknown): Record<string, unknown> | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) return undefined;
  const rows = results.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  );
  return rows.find((row) => row.success !== false) ?? rows[0];
}

function readIdentifier(source: unknown): string | undefined {
  const direct =
    readString(source, 'verification_level') ??
    readString(source, 'credential_type') ??
    readString(source, 'identifier');
  if (direct) return direct;
  if (typeof source !== 'object' || source === null) return undefined;
  const responses = (source as { responses?: unknown }).responses;
  if (!Array.isArray(responses) || typeof responses[0] !== 'object' || responses[0] === null) {
    return undefined;
  }
  return readString(responses[0], 'identifier');
}

function worldErrorCode(body: unknown, status: number): string {
  return readString(body, 'code') ?? readString(body, 'error') ?? `http_${status}`;
}

function worldDetail(source: unknown): string | undefined {
  const detail = readString(source, 'detail');
  if (!detail || detail.length > WORLD_DETAIL_MAX) return undefined;
  if (/^0x[0-9a-fA-F]{32,}$/.test(detail.trim())) return undefined;
  return detail;
}

/**
 * World's 400 is often `{ code: 'all_verifications_failed', results: [{ code, detail }] }`.
 * The row's code is what the mini-app should show; the envelope name is not.
 */
function worldFailure(body: unknown, status: number): {
  ok: false;
  status: number;
  code: string;
  detail?: string;
} {
  const top = worldErrorCode(body, status);
  const hit = firstFailedWorldResult(body);
  const nested = hit ? readString(hit, 'code') ?? readString(hit, 'error') : undefined;
  const code = top === 'all_verifications_failed' && nested ? nested : top;
  const detail = worldDetail(hit) ?? worldDetail(body);
  return { ok: false, status, code, ...(detail ? { detail } : {}) };
}

function payloadEnvironment(rawBody: string): string | undefined {
  try {
    return readString(JSON.parse(rawBody) as unknown, 'environment')?.toLowerCase();
  } catch {
    return undefined;
  }
}

function payloadProtocol(rawBody: string): string | undefined {
  try {
    return readString(JSON.parse(rawBody) as unknown, 'protocol_version');
  } catch {
    return undefined;
  }
}

/**
 * Sandbox proofs use the production verify host — World documents that in sandbox-access.
 * Staging proofs (simulator) use the staging Developer Portal host.
 */
export function worldVerifyUrl(rpId: string, rawBody: string): string {
  const environment = payloadEnvironment(rawBody);
  const base = environment === 'staging' ? WORLD_VERIFY_STAGING_BASE : WORLD_VERIFY_BASE;
  return `${base}/${rpId}`;
}

/**
 * Forwards the IDKit result to World exactly as it arrived.
 *
 * `rawBody` is the string `await req.text()` returned. It is never parsed and re-serialised
 * on the way out: the proof is signed over those bytes.
 *
 * World's 200 body is `{ success, results[] }` — `nullifier` and the credential identifier
 * live on the result row. A top-level `nullifier` is still accepted (legacy Orb replies).
 */
export async function verifyWithWorld(rawBody: string): Promise<WorldVerification> {
  const config = getConfig();
  const rpId = config.WORLD_RP_ID;
  if (!rpId) throw new Error('WORLD_RP_ID is not set');

  const response = await globalThis.fetch(worldVerifyUrl(rpId, rawBody), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody,
  });

  const body: unknown = await response.json().catch(() => undefined);
  const hit = firstWorldResult(body);
  const log = childLogger({ route: 'world-verify' });

  if (!response.ok) {
    // World's own code when it sent one, otherwise the status — the caller turns either
    // into `reason`. The proof payload itself never reaches a client or a log.
    const failure = worldFailure(body, response.status);
    log.info(
      {
        world_status: failure.status,
        world_code: failure.code,
        world_detail: failure.detail,
        payload_environment: payloadEnvironment(rawBody),
        protocol_version: payloadProtocol(rawBody),
      },
      'world verify refused',
    );
    return failure;
  }

  if (typeof body === 'object' && body !== null && (body as { success?: unknown }).success === false) {
    return worldFailure(body, response.status);
  }

  const nullifier = readString(body, 'nullifier') ?? readString(hit, 'nullifier');
  if (!nullifier) return { ok: false, status: response.status, code: 'missing_nullifier' };

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = undefined;
  }

  // The credential World reports wins; the payload's claim is the fallback; the configured
  // level is the last resort, so `level` is never empty on a verified human.
  const worldLevel = readIdentifier(body) ?? readIdentifier(hit);
  const payloadLevel = readIdentifier(payload);
  const level = worldLevel ?? payloadLevel ?? config.WORLD_CREDENTIAL_LEVEL;
  const level_source: 'world' | 'payload' | 'config' = worldLevel
    ? 'world'
    : payloadLevel
      ? 'payload'
      : 'config';

  return {
    ok: true,
    nullifier,
    level,
    action: readString(body, 'action') ?? readString(payload, 'action') ?? '',
    protocol_version: readString(body, 'protocol_version') ?? '',
    level_source,
  };
}

function normalisedLevel(level: string): string {
  return level.toLowerCase().replace(/[\s-]/g, '_');
}

/**
 * World's Selfie Check proof reports `face` (see `FEEDBACK-WORLD.md` E8). The product name
 * is Selfie Check; both strings, and obvious variants, count.
 */
export function isSelfieCredential(level: string): boolean {
  const n = normalisedLevel(level);
  return n === 'face' || n === 'selfie' || n === 'selfie_check' || n.includes('face') || n.includes('selfie');
}

/** Orb uniqueness. A claim-time Selfie Check must not present this credential instead. */
export function isOrbCredential(level: string): boolean {
  const n = normalisedLevel(level);
  return n === 'orb' || n === 'unique_human' || n === 'proof_of_human' || n.includes('orb');
}
