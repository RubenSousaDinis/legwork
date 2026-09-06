/**
 * One pino logger, JSON on stdout, with a redaction list that treats a leak as a bug it has
 * to survive rather than one it can assume away.
 *
 * The list is a backstop, not the rule: no code path in this API passes raw spec text to a
 * log call. A route that wants to say *which* task it is looking at logs `spec_hash`.
 */
import pino, { type Logger } from 'pino';
import { REDACT_PATHS as GUARD_REDACT_PATHS, headerSerializer } from './middleware/redact';

/**
 * Every key in `.env.example` whose name ends in `_PRIVATE_KEY`.
 *
 * The brief's list carries `*_PRIVATE_KEY`, but pino's `*` is a whole-segment wildcard: it
 * matches *any* key at one level, never a suffix, so `*_PRIVATE_KEY` is read as a property
 * literally called that and censors nothing. The intent is not negotiable, so the pattern is
 * kept for the record and expanded into the six names it means.
 */
const PRIVATE_KEY_NAMES = [
  'RELAYER_PRIVATE_KEY',
  'DEPLOYER_PRIVATE_KEY',
  'ATTESTATION_VERIFIER_PRIVATE_KEY',
  'ABUSEMARK_SIGNER_PRIVATE_KEY',
  'BUYER_PRIVATE_KEY',
  'CLI_WORKER_PRIVATE_KEY',
] as const;

/**
 * Both the bare name and the `*.` form: pino matches a redaction path literally, so `spec`
 * alone does not cover `{ task: { spec } }` and `*.spec` alone does not cover a top-level
 * `spec`.
 */
const OWN_REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["payment-signature"]',
  'req.headers["x-buyer-token"]',
  'req.headers["x-admin-key"]',
  'spec',
  '*.spec',
  'spec_json',
  '*.spec_json',
  'buyer_token',
  '*.buyer_token',
  'payload',
  '*.payload',
  'signature',
  '*.signature',
  '*_PRIVATE_KEY',
  ...PRIVATE_KEY_NAMES,
  ...PRIVATE_KEY_NAMES.map((name) => `*.${name}`),
  '*.privateKey',
] as const;

/**
 * This file's list plus T-38's (`middleware/redact.ts`): the header paths, `*.token`,
 * `*.secret`, `*.cookie`, `*.privateKey` and friends. One list, deduplicated, so a path
 * added on either side is censored on both.
 */
export const REDACT_PATHS: readonly string[] = [...new Set([...OWN_REDACT_PATHS, ...GUARD_REDACT_PATHS])];

export const REDACTED = '[redacted]';

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: { paths: [...REDACT_PATHS], censor: REDACTED },
  // T-38's allowlist: five header names survive a `req` and every other header is dropped
  // before pino sees it — censoring would still print the header's name.
  serializers: { req: headerSerializer },
  base: { service: 'legwork-api' },
});

export type LogBindings = Record<string, unknown>;

/** `childLogger({ route, request_id })` — every line a request emits carries both. */
export function childLogger(bindings: LogBindings): Logger {
  return logger.child(bindings);
}
