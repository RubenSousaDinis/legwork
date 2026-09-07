import { z } from 'zod';
import { ABUSE_CLASSES, TASK_TYPES } from './enums';
import { LONGPOLL_MAX_S } from './constants';
import { Envelope } from './schemas/envelope';
import { InvalidRequest, RefusalPayload } from './schemas/refusal';
import { WorkerAnswer } from './schemas/worker-answer';
import { PublicObservation } from './schemas/observation';

/**
 * The frozen HTTP contract. Every route T-08 … T-19 implements is declared here with its auth
 * class and zod request/response shapes; `docs/api.md` is rendered from this file, so the
 * doc cannot drift from the code. Change = an `interface-change` PR.
 */

export const AUTH = ['public', 'x402', 'buyer-token', 'worker-session', 'idkit-session', 'admin-key', 'signed-header'] as const;
export type Auth = (typeof AUTH)[number];

// ---------------------------------------------------------------- primitives
export const TxHash = z.string().regex(/^0x[0-9a-f]{64}$/);
export const EvmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const TaskId = z.string().regex(/^\d+$/);
export const Iso = z.iso.datetime();
export const Geohash5 = z.string().regex(/^[0-9b-hjkmnp-z]{5}$/);
export const Status = z.enum(['open', 'claimed', 'submitted', 'released', 'refunded', 'disputed', 'resolved']);
export const TaskTypeSchema = z.enum(TASK_TYPES);

export const TxSet = z.object({ post: TxHash, claim: TxHash.optional(), submit: TxHash.optional(), release: TxHash.optional() });

/** Public surfaces round to 3 decimals (≈100 m). The exact coordinate never leaves the private record. */
export const CoordinateRounded = z.object({ lat: z.number(), lon: z.number() });

export const ProofView = z.object({
  hash: TxHash,
  hash_ok: z.boolean(),
  /** Only with a valid X-Buyer-Token; a signed URL to the private bucket. */
  url: z.url().optional(),
  captured_at: Iso,
  coordinate_rounded: CoordinateRounded.optional(),
  gps_unavailable: z.boolean(),
});

/** `GET /tasks/:id` — also the MCP `task_status` result. */
export const TaskView = z.object({
  task_id: TaskId,
  status: Status,
  task_type: TaskTypeSchema,
  amount_usdc: z.number(),
  fee_usdc: z.number(),
  area: Geohash5,
  posted_at: Iso,
  claimed_at: Iso.optional(),
  submitted_at: Iso.optional(),
  released_at: Iso.optional(),
  answer: WorkerAnswer.optional(),
  proof: ProofView.optional(),
  tx: TxSet,
  dashboard_url: z.url(),
  changed: z.boolean(),
  poll_after_seconds: z.number().int().min(0).max(LONGPOLL_MAX_S),
});
export type TaskView = z.infer<typeof TaskView>;

export const Posted = z.object({
  task_id: TaskId,
  buyer_token: z.string().min(32),
  status: z.literal('open'),
  spec_hash: TxHash,
  price_usdc: z.number(),
  eta_seconds: z.number().int().nonnegative(),
  poll_after_seconds: z.number().int().min(0).max(LONGPOLL_MAX_S),
  dashboard_url: z.url(),
});
export const PaymentRequired = z.object({
  error: z.literal('payment_required'),
  price_usdc: z.number(),
  accepts: z.array(z.record(z.string(), z.unknown())),
  remaining_budget: z.object({ open_tasks: z.number().int(), daily_usdc: z.number() }),
});
export const CapExceeded = z.object({ error: z.literal('cap_exceeded'), open_tasks: z.number().int(), daily_usdc: z.number() });
export const TxResult = z.object({ task_id: TaskId, status: Status, tx: TxHash });
export const Ok = z.object({ ok: z.literal(true), tx: TxHash.optional() });

export const GenericError = z.discriminatedUnion('error', [
  z.object({ error: z.literal('rate_limited'), retry_after_s: z.number().int() }),
  z.object({ error: z.literal('payload_too_large'), max_bytes: z.number().int() }),
  z.object({ error: z.literal('origin_not_allowed') }),
  z.object({ error: z.literal('unauthorized'), reason: z.enum(['nonce_used']).optional() }),
  z.object({ error: z.literal('forbidden'), reason: z.enum(['not_registered', 'not_worker']).optional() }),
  z.object({ error: z.literal('not_found') }),
  /** A precondition the row already refutes; `reason` is a contract revert name or a route's own word. */
  z.object({ error: z.literal('conflict'), reason: z.string().optional(), retry_after_s: z.number().int().optional() }),
  /** `POST /tasks`: `TaskEscrow.post` failed after verify, so nothing was charged and the same authorization can be sent again. */
  z.object({ error: z.literal('escrow_post_failed') }),
  z.object({ error: z.literal('bad_state'), status: Status }),
  z.object({ error: z.literal('not_eligible'), status: Status, eligible_at: Iso.nullable() }),
  z.object({ error: z.literal('dispute_window_closed') }),
  /** The contract answered; `name` is its custom error. */
  z.object({ error: z.literal('chain_revert'), name: z.string() }),
  z.object({ error: z.literal('worker_already_bound') }),
  z.object({ error: z.literal('nullifier_already_registered') }),
  z.object({ error: z.literal('InCooldown'), cooldown_until: Iso }),
  z.object({ error: z.literal('AlreadyClaimed'), active_task_id: TaskId.optional() }),
  z.object({ error: z.literal('SeededCannotClaimExternal') }),
  /** A server-side bug — the API signed it seconds ago; `name` is the registry's revert. */
  z.object({ error: z.literal('attestation_rejected'), name: z.string() }),
  /** Nothing came back from the node; the request is worth retrying. */
  z.object({ error: z.literal('chain_unavailable') }),
]);

// --------------------------------------------------------------- route table
export interface Route {
  method: 'GET' | 'POST';
  path: string;
  auth: Auth;
  summary: string;
  request?: z.ZodType;
  query?: z.ZodType;
  responses: Record<number, z.ZodType>;
}

const PublicProofView = ProofView.omit({ url: true });
const LinkSet = z.object({ post: z.url(), claim: z.url().optional(), submit: z.url().optional(), release: z.url().optional() });

/** `/public/feed` and `/public/task/:id` (T-19): built from an allowlist, never a spread row. `answer` is the enum only. */
export const PublicTaskView = z.object({
  task_id: TaskId, state: Status, task_type: TaskTypeSchema,
  /** The posted rate the worker keeps (3.00); `fee_usdc` (0.45) alongside. The dashboard renders 3.00 + 0.45 = 3.45. */
  price_usdc: z.number(), fee_usdc: z.number(), area: Geohash5, seeded: z.boolean(), posted_at: Iso,
  claimed_at: Iso.optional(), submitted_at: Iso.optional(), released_at: Iso.optional(),
  answer: z.string().optional(), proof: PublicProofView.optional(),
  tx: TxSet, links: LinkSet, dashboard_url: z.url(),
});

const BriefPlace = z.object({ name: z.string(), street_address: z.string(), locality: z.string() });
/** Place and question fields only — never `claimed_*` or `source` (T-17 `workerBrief`). */
export const WorkerBrief = z.object({
  place: BriefPlace.optional(), question: z.string().optional(), subject: z.string().optional(),
  subject_detail: z.string().optional(), phone: z.string().optional(), template_question: z.string().optional(),
  slots: z.record(z.string(), z.string()).optional(), a: z.unknown().optional(), b: z.unknown().optional(),
  criterion_id: z.string().optional(),
});

const WorkerTaskRow = z.object({
  task_id: TaskId, task_type: TaskTypeSchema, title: z.string(), price_usdc: z.number(),
  distance_m: z.number().optional(), claim_expires_in_s: z.number().int().optional(),
  /** `claimed` only for the caller's own live claim; an expired claim shows as `open` with `claim_expires_in_s: 0`. */
  state: z.enum(['open', 'claimed']), seeded: z.boolean(), brief: WorkerBrief,
});

export const Preflight = z.object({
  active: z.number().int(), verified: z.number().int(), seeded: z.number().int(),
  median_minutes: z.number().nullable(), median_source: z.enum(['real', 'seeded', 'n/a']),
  n_real: z.number().int(),
  /** `min(score)` over verified active workers; falls back to the seeded workers, then 0 (T-27). */
  score_floor: z.number(), dashboard_url: z.url(),
});

export const API_ROUTES = {
  postTasks: { method: 'POST', path: '/tasks', auth: 'x402', summary: 'Post a task; x402 PAYMENT-SIGNATURE header; price = amount × 1.15; an unpaid call may carry the informational X-Payer header so the 402 echoes that payer\'s remaining budget; 409 conflict/in_progress while the same authorization is mid-post; 503 escrow_post_failed never charges',
    request: Envelope, responses: { 201: Posted, 402: PaymentRequired, 422: RefusalPayload, 400: InvalidRequest, 429: CapExceeded, 409: GenericError, 503: GenericError } },
  getTask: { method: 'GET', path: '/tasks/:id', auth: 'public', summary: 'Task status; long-poll with ?wait ≤ 50; X-Buyer-Token reveals proof.url (a wrong token is the same body without it); ETag/If-None-Match; poll_after_seconds is 0 when terminal, 1 when the wait elapsed unchanged, 3 otherwise; hash_ok re-hashed per request',
    query: z.object({ wait: z.coerce.number().int().min(0).max(LONGPOLL_MAX_S).default(0) }), responses: { 200: TaskView, 404: GenericError } },
  approve: { method: 'POST', path: '/tasks/:id/approve', auth: 'buyer-token', summary: 'Approve a submitted proof; relayer executes onchain; the row moves only after the hash returns', responses: { 200: TxResult, 401: GenericError, 409: GenericError, 503: GenericError } },
  dispute: { method: 'POST', path: '/tasks/:id/dispute', auth: 'buyer-token', summary: 'Dispute inside the window',
    request: z.object({ reason: z.string().min(1).max(300) }), responses: { 200: TxResult, 400: InvalidRequest, 401: GenericError, 409: GenericError, 503: GenericError } },
  refund: { method: 'POST', path: '/tasks/:id/refund', auth: 'buyer-token', summary: 'Expire and refund if eligible (409 not_eligible carries eligible_at); never gated by pause', responses: { 200: TxResult, 401: GenericError, 409: GenericError, 503: GenericError } },
  check: { method: 'POST', path: '/check', auth: 'public', summary: 'Dry-run screening; never posts, never marks',
    request: Envelope, responses: { 200: z.object({ accepted: z.literal(true), spec_hash: TxHash, price_usdc: z.number() }), 422: RefusalPayload, 400: InvalidRequest } },
  idkitRequest: { method: 'POST', path: '/idkit/request', auth: 'public', summary: 'RP-signed rp_context for IDKit v4',
    request: z.object({ action: z.string() }),
    responses: { 200: z.object({ rp_context: z.object({ rp_id: z.string(), nonce: z.string(), created_at: z.number(), expires_at: z.number(), signature: z.string() }) }) } },
  idkitVerify: { method: 'POST', path: '/idkit/verify', auth: 'public', summary: 'Forward the IDKit result to World v4 verify; sets idkit-session cookie',
    request: z.record(z.string(), z.unknown()),
    responses: { 200: z.object({ verified: z.literal(true), nullifier: z.string(), level: z.string() }), 409: GenericError } },
  configWorld: { method: 'GET', path: '/config/world', auth: 'public', summary: 'Which World app, action, RP id, credential level and environment the client asks for — five keys and nothing else; max-age=60',
    responses: { 200: z.object({ app_id: z.string(), action: z.string(), rp_id: z.string(), credential_level: z.enum(['selfie', 'orb']), env: z.string() }) } },
  sessionNonce: { method: 'GET', path: '/session/nonce', auth: 'public', summary: 'SIWE nonce', responses: { 200: z.object({ nonce: z.string() }) } },
  session: { method: 'POST', path: '/session', auth: 'public', summary: 'walletAuth (verifySiweMessage over a single-use nonce + the stored nullifier binding; no cookie needed) or idkit mode (requires the idkit-session cookie) → worker-session cookie + the same JWT as `token`; isWorker checked onchain in both modes; dev path for seeded workers only',
    request: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('walletAuth'), payload: z.record(z.string(), z.unknown()), nonce: z.string() }),
      z.object({ mode: z.literal('idkit'), worker_address: EvmAddress }),
    ]),
    responses: { 200: z.object({ worker: EvmAddress, nullifier: z.string(), mode: z.enum(['walletAuth', 'idkit', 'dev']), token: z.string() }), 401: GenericError, 403: GenericError } },
  register: { method: 'POST', path: '/register', auth: 'idkit-session', summary: 'EIP-712 attestation (deadline now+600) then relayed registerFor',
    request: z.object({ worker_address: EvmAddress, area: Geohash5, task_types: z.array(TaskTypeSchema).min(1) }),
    responses: { 200: z.object({ tx: TxHash, worker: EvmAddress }), 400: InvalidRequest, 401: GenericError, 409: GenericError, 500: GenericError, 503: GenericError } },
  listTasks: { method: 'GET', path: '/tasks/list', auth: 'worker-session', summary: 'Open + lazily-expirable tasks (as open) plus the caller\'s own live claim; a seeded worker sees allowlisted payers only; nearest first when lat/lon are given',
    query: z.object({ area: Geohash5.optional(), lat: z.coerce.number().optional(), lon: z.coerce.number().optional() }),
    responses: { 200: z.object({ tasks: z.array(WorkerTaskRow) }) } },
  claim: { method: 'POST', path: '/tasks/:id/claim', auth: 'worker-session', summary: 'Relayed claimFor',
    responses: { 200: z.object({ tx: TxHash, claim_expires_at: Iso, submit_deadline: Iso }), 403: GenericError, 409: GenericError } },
  releaseClaim: { method: 'POST', path: '/tasks/:id/release-claim', auth: 'worker-session', summary: 'Relayed releaseClaimFor', responses: { 200: z.object({ tx: TxHash }), 409: GenericError } },
  proofs: { method: 'POST', path: '/proofs', auth: 'worker-session', summary: 'multipart ≤ 8 MB; keccak of raw bytes; EXIF stripped; private bucket',
    responses: { 200: z.object({ proofHash: TxHash, url: z.url(), captured_at: Iso }), 400: InvalidRequest, 409: GenericError, 413: GenericError } },
  proofImage: { method: 'GET', path: '/proofs/:hash', auth: 'public', summary: 'The stripped image (image/jpeg, private, no-store) behind a signed, expiring URL — exp + sig come from POST /proofs (1 h) or from GET /tasks/:id with a buyer token (dispute window + 1 h); 403 on expiry or tamper, 404 on an unknown hash; the retained original is never served',
    query: z.object({ exp: z.coerce.number().int(), sig: z.string().regex(/^[0-9a-f]{64}$/) }), responses: { 200: z.any(), 403: GenericError, 404: GenericError } },
  submit: { method: 'POST', path: '/tasks/:id/submit', auth: 'worker-session', summary: 'Submit-time checks (reuse, geofence, GPS downgrade) then relayed submitFor',
    request: z.object({ proofHash: TxHash.optional(), answer: z.string().max(40), note: z.string().max(120).optional() }).passthrough(),
    responses: { 200: z.object({ tx: TxHash, status: z.enum(['submitted', 'disputed']), auto_dispute_reason: z.enum(['proof_reuse', 'geofence']).optional(), dispute_tx: TxHash.optional() }), 400: InvalidRequest, 409: GenericError } },
  report: { method: 'POST', path: '/tasks/:id/report', auth: 'worker-session', summary: 'Worker reports a task (optional feature)',
    request: z.object({ class: z.enum(ABUSE_CLASSES) }), responses: { 200: z.object({ recorded: z.literal(true) }) } },
  earnings: { method: 'GET', path: '/me/earnings', auth: 'worker-session', summary: 'Earned-only: sums TaskReleased to this worker',
    responses: { 200: z.object({ released_usdc: z.number(), completed: z.number().int(), score: z.number(), distinct_raters: z.number().int() }) } },
  taskSpec: { method: 'GET', path: '/tasks/:id/spec', auth: 'worker-session', summary: 'Spec fields, claimant only — the one route that shows spec to a human',
    responses: { 200: z.object({ task_type: TaskTypeSchema, spec: z.record(z.string(), z.unknown()) }), 403: GenericError } },
  publicFeed: { method: 'GET', path: '/public/feed', auth: 'public', summary: 'Last 20 by posted_at; never spec text, an exact coordinate, a buyer token, a payer or a note', responses: { 200: z.object({ tasks: z.array(PublicTaskView) }) } },
  publicTask: { method: 'GET', path: '/public/task/:id', auth: 'public', summary: 'One task as a stranger sees it: PublicTaskView, coordinate_rounded inside proof, never a url',
    responses: { 200: PublicTaskView, 404: GenericError } },
  publicRefusals: { method: 'GET', path: '/public/refusals', auth: 'public', summary: 'The six classes zero-filled, the last 20 refusals, and the demo examples; recent never carries reason, spec_hash, agent_id or payer',
    responses: { 200: z.object({
      classes: z.array(z.object({ class: z.enum(ABUSE_CLASSES), count: z.number().int() })).length(6),
      recent: z.array(z.object({ at: Iso, task_type: TaskTypeSchema, class: z.enum(ABUSE_CLASSES), rule_id: z.string(), marked: z.boolean() })),
      examples: z.array(z.object({ task_type: TaskTypeSchema, class: z.enum(ABUSE_CLASSES), reason: z.string(), rule_id: z.string(), example: z.literal(true) })),
    }) } },
  publicPosters: { method: 'GET', path: '/public/posters', auth: 'public', summary: 'External demand as counts only; source says which zero a zero is', responses: { 200: z.object({ distinct_external_buyers: z.number().int(), external_tasks: z.number().int(), source: z.string().optional() }) } },
  publicPreflight: { method: 'GET', path: '/public/preflight', auth: 'public', summary: 'The MCP preflight_workers shape',
    query: z.object({ task_type: TaskTypeSchema, area: Geohash5 }), responses: { 200: Preflight } },
  publicProofVerify: { method: 'GET', path: '/public/proofs/:hash/verify', auth: 'public', summary: 'Re-hash check at request time: hash_ok is keccak256 of the retained original, served_hash of the stripped copy; coordinate only rounded; 60/min',
    responses: { 200: z.object({ hash: TxHash, exists: z.boolean(), hash_ok: z.boolean(), captured_at: Iso.nullable(), coordinate_rounded: CoordinateRounded.optional(), gps_unavailable: z.boolean(), size_bytes: z.number().int(), served_hash: TxHash.nullable() }) } },
  publicObservations: { method: 'GET', path: '/public/observations', auth: 'public', summary: 'Completed tasks only (T-40): the verify-open delta sentence over real rows plus the rows behind it; never a nullifier, a coordinate, a note, a spec, a payer or an agent id',
    query: z.object({ place_id: z.string().optional(), include_seeded: z.enum(['0', '1']).optional() }),
    responses: { 200: z.object({
      place_id: z.string().optional(),
      delta: z.object({ checked_places: z.number().int(), wrong_listings: z.number().int(), by_source: z.record(z.string(), z.object({ checked_places: z.number().int(), wrong_listings: z.number().int() })), sentence: z.string() }),
      observations: z.array(PublicObservation.extend({ worker_verified: z.boolean() })),
      /** Rendered beside the sentence, never as fine print: `real observations only; seeded rows excluded`. */
      disclosure: z.string(),
    }), 400: InvalidRequest } },
  adminPause: { method: 'POST', path: '/admin/pause', auth: 'admin-key', summary: 'Pause post/claim', responses: { 200: Ok } },
  adminUnpause: { method: 'POST', path: '/admin/unpause', auth: 'admin-key', summary: 'Unpause', responses: { 200: Ok } },
  adminResolve: { method: 'POST', path: '/admin/resolve', auth: 'admin-key', summary: 'Resolve a dispute (owner key); to the buyer 3.45 back, to the worker 3.00 and the 0.45 fee back', request: z.object({ task_id: z.union([TaskId, z.number().int().nonnegative()]), to_buyer: z.boolean() }), responses: { 200: Ok, 404: GenericError, 409: GenericError } },
  adminResetDemo: { method: 'POST', path: '/admin/reset-demo', auth: 'admin-key', summary: 'Reset demo state (tasks, proofs, logs, sessions); keeps nullifiers, posters, nonces, admin_audit; body must confirm', request: z.object({ confirm: z.literal('reset-demo') }), responses: { 200: Ok } },
  adminResetWorker: { method: 'POST', path: '/admin/reset-worker', auth: 'admin-key', summary: 'resetWorker(nullifier)', request: z.object({ nullifier: z.string() }), responses: { 200: Ok } },
  adminSweep: { method: 'POST', path: '/admin/sweep', auth: 'admin-key', summary: 'Expire + autoRelease pass after reconciling every non-final row; admin key, or X-Sweep-Secret for a cron; audit-logged', responses: { 200: Ok.extend({ expired: z.array(z.number().int()), auto_released: z.array(z.number().int()) }) } },
  adminSeedDemo: { method: 'POST', path: '/admin/seed-demo', auth: 'admin-key', summary: 'Seed the demo feed rows with seeded=true and the tx placeholder; idempotent', responses: { 200: Ok.extend({ inserted: z.number().int() }) } },
  openapi: { method: 'GET', path: '/openapi.json', auth: 'public', summary: 'OpenAPI 3.1 rendered from this contract (T-35)', responses: { 200: z.record(z.string(), z.unknown()) } },
  healthz: { method: 'GET', path: '/healthz', auth: 'public', summary: 'Liveness plus the four facts an operator asks first; never an address derived from a key',
    responses: { 200: z.object({ ok: z.literal(true), db: z.enum(['ok', 'error']), chain_id: z.literal(84532), payment_mode: z.enum(['x402', 'direct']), data_mode: z.enum(['live', 'demo']), version: z.string() }) } },
  // PAYMENT_MODE=direct only (T-16b): the x402 rows above do not apply in this mode.
  directQuote: { method: 'POST', path: '/tasks', auth: 'signed-header', summary: 'Direct mode: X-Buyer-Signature (EIP-191 over `${spec_hash}:${timestamp}`) + X-Buyer-Timestamp (±300 s) → quote',
    request: Envelope, responses: { 202: z.object({ quote: z.object({ spec_hash: TxHash, post_params: z.record(z.string(), z.unknown()), total_units: z.string(), escrow: EvmAddress, deadline: Iso }) }) } },
  directConfirm: { method: 'POST', path: '/tasks/:id/confirm', auth: 'signed-header', summary: 'Direct mode: after TaskPosted with that spec_hash is observed', responses: { 200: z.object({ task_id: TaskId, buyer_token: z.string() }) } },
} as const satisfies Record<string, Route>;

export type RouteName = keyof typeof API_ROUTES;

/** Headers, so every consumer spells them the same way. */
export const HEADERS = {
  buyerToken: 'X-Buyer-Token',
  adminKey: 'X-Admin-Key',
  paymentSignature: 'PAYMENT-SIGNATURE',
  buyerSignature: 'X-Buyer-Signature',
  buyerTimestamp: 'X-Buyer-Timestamp',
  /** Informational and unauthenticated: only fills the 402's `remaining_budget` for that payer. */
  payerHint: 'X-Payer',
} as const;
