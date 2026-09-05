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
  z.object({ error: z.literal('unauthorized') }),
  z.object({ error: z.literal('not_found') }),
  z.object({
    error: z.enum(['bad_state', 'not_eligible', 'dispute_window_closed', 'chain_revert', 'worker_already_bound',
      'nullifier_already_registered', 'InCooldown', 'AlreadyClaimed', 'SeededCannotClaimExternal']),
    detail: z.string().optional(),
  }),
  z.object({ error: z.literal('attestation_rejected') }),
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

const FeedRow = z.object({
  task_id: TaskId, status: Status, task_type: TaskTypeSchema, title: z.string().optional(),
  amount_usdc: z.number(), fee_usdc: z.number(), area: Geohash5, posted_at: Iso,
  claimed_at: Iso.optional(), submitted_at: Iso.optional(), released_at: Iso.optional(),
  seeded: z.boolean(), spec_hash: TxHash, buyer_agent_id: z.string().optional(), tx: TxSet,
});

const WorkerTaskRow = z.object({
  task_id: TaskId, task_type: TaskTypeSchema, title: z.string(), price_usdc: z.number(),
  distance_m: z.number().optional(), claim_expires_in_s: z.number().int().optional(),
  state: Status, seeded: z.boolean(),
});

export const Preflight = z.object({
  active: z.number().int(), verified: z.number().int(), seeded: z.number().int(),
  median_minutes: z.number().nullable(), median_source: z.enum(['real', 'seeded', 'n/a']),
  n_real: z.number().int(), score_floor: z.number(), dashboard_url: z.url(),
});

export const API_ROUTES = {
  postTasks: { method: 'POST', path: '/tasks', auth: 'x402', summary: 'Post a task; x402 PAYMENT-SIGNATURE header; price = amount × 1.15',
    request: Envelope, responses: { 201: Posted, 402: PaymentRequired, 422: RefusalPayload, 400: InvalidRequest, 429: CapExceeded } },
  getTask: { method: 'GET', path: '/tasks/:id', auth: 'public', summary: 'Task status; long-poll with ?wait ≤ 50; X-Buyer-Token reveals proof.url; ETag supported',
    query: z.object({ wait: z.coerce.number().int().min(0).max(LONGPOLL_MAX_S).default(0) }), responses: { 200: TaskView, 404: GenericError } },
  approve: { method: 'POST', path: '/tasks/:id/approve', auth: 'buyer-token', summary: 'Approve a submitted proof; relayer executes onchain', responses: { 200: TxResult, 409: GenericError } },
  dispute: { method: 'POST', path: '/tasks/:id/dispute', auth: 'buyer-token', summary: 'Dispute inside the window',
    request: z.object({ reason: z.string().max(300) }), responses: { 200: TxResult, 409: GenericError } },
  refund: { method: 'POST', path: '/tasks/:id/refund', auth: 'buyer-token', summary: 'Expire and refund if eligible', responses: { 200: TxResult, 409: GenericError } },
  check: { method: 'POST', path: '/check', auth: 'public', summary: 'Dry-run screening; never posts, never marks',
    request: Envelope, responses: { 200: z.object({ accepted: z.literal(true), spec_hash: TxHash, price_usdc: z.number() }), 422: RefusalPayload, 400: InvalidRequest } },
  idkitRequest: { method: 'POST', path: '/idkit/request', auth: 'public', summary: 'RP-signed rp_context for IDKit v4',
    request: z.object({ action: z.string() }),
    responses: { 200: z.object({ rp_context: z.object({ rp_id: z.string(), nonce: z.string(), created_at: z.number(), expires_at: z.number(), signature: z.string() }) }) } },
  idkitVerify: { method: 'POST', path: '/idkit/verify', auth: 'public', summary: 'Forward the IDKit result to World v4 verify; sets idkit-session cookie',
    request: z.record(z.string(), z.unknown()),
    responses: { 200: z.object({ verified: z.literal(true), nullifier: z.string(), level: z.string() }), 409: GenericError } },
  sessionNonce: { method: 'GET', path: '/session/nonce', auth: 'public', summary: 'SIWE nonce', responses: { 200: z.object({ nonce: z.string() }) } },
  session: { method: 'POST', path: '/session', auth: 'idkit-session', summary: 'walletAuth (verifySiweMessage) or idkit mode → worker-session cookie; dev path for seeded workers only',
    request: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('walletAuth'), payload: z.record(z.string(), z.unknown()), nonce: z.string() }),
      z.object({ mode: z.literal('idkit'), worker_address: EvmAddress }),
    ]),
    responses: { 200: z.object({ worker: EvmAddress, nullifier: z.string(), mode: z.enum(['walletAuth', 'idkit', 'dev']) }), 401: GenericError } },
  register: { method: 'POST', path: '/register', auth: 'idkit-session', summary: 'EIP-712 attestation (deadline now+600) then relayed registerFor',
    request: z.object({ worker_address: EvmAddress, area: Geohash5, task_types: z.array(TaskTypeSchema).min(1) }),
    responses: { 200: z.object({ tx: TxHash, worker: EvmAddress }), 409: GenericError, 500: GenericError } },
  listTasks: { method: 'GET', path: '/tasks', auth: 'worker-session', summary: 'Open + lazily-expirable tasks near the worker',
    query: z.object({ area: Geohash5, lat: z.coerce.number().optional(), lon: z.coerce.number().optional() }),
    responses: { 200: z.object({ tasks: z.array(WorkerTaskRow) }) } },
  claim: { method: 'POST', path: '/tasks/:id/claim', auth: 'worker-session', summary: 'Relayed claimFor',
    responses: { 200: z.object({ tx: TxHash, claim_expires_at: Iso, submit_deadline: Iso }), 409: GenericError } },
  releaseClaim: { method: 'POST', path: '/tasks/:id/release-claim', auth: 'worker-session', summary: 'Relayed releaseClaimFor', responses: { 200: z.object({ tx: TxHash }), 409: GenericError } },
  proofs: { method: 'POST', path: '/proofs', auth: 'worker-session', summary: 'multipart ≤ 8 MB; keccak of raw bytes; EXIF stripped; private bucket',
    responses: { 200: z.object({ proofHash: TxHash, url: z.url(), captured_at: Iso }), 413: GenericError } },
  submit: { method: 'POST', path: '/tasks/:id/submit', auth: 'worker-session', summary: 'Submit-time checks (reuse, geofence, GPS downgrade) then relayed submitFor',
    request: z.object({ proofHash: TxHash.optional(), answer: z.string().max(40), note: z.string().max(120).optional() }).passthrough(),
    responses: { 200: z.object({ tx: TxHash, status: z.enum(['submitted', 'disputed']), auto_dispute_reason: z.string().optional() }), 409: GenericError } },
  report: { method: 'POST', path: '/tasks/:id/report', auth: 'worker-session', summary: 'Worker reports a task (optional feature)',
    request: z.object({ class: z.enum(ABUSE_CLASSES) }), responses: { 200: z.object({ recorded: z.literal(true) }) } },
  earnings: { method: 'GET', path: '/me/earnings', auth: 'worker-session', summary: 'Earned-only: sums TaskReleased to this worker',
    responses: { 200: z.object({ released_usdc: z.number(), completed: z.number().int(), score: z.number(), distinct_raters: z.number().int() }) } },
  taskSpec: { method: 'GET', path: '/tasks/:id/spec', auth: 'worker-session', summary: 'Spec fields, claimant only — the one route that shows spec to a human',
    responses: { 200: z.object({ task_type: TaskTypeSchema, spec: z.record(z.string(), z.unknown()) }), 403: GenericError } },
  publicFeed: { method: 'GET', path: '/public/feed', auth: 'public', summary: 'Last 20; never spec text, coordinate, buyer token or payer', responses: { 200: z.object({ tasks: z.array(FeedRow) }) } },
  publicTask: { method: 'GET', path: '/public/task/:id', auth: 'public', summary: 'TaskView minus proof.url, plus seeded + coordinate_rounded',
    responses: { 200: TaskView.omit({ proof: true }).extend({ seeded: z.boolean(), proof: ProofView.omit({ url: true }).optional(), coordinate_rounded: CoordinateRounded.optional() }) } },
  publicRefusals: { method: 'GET', path: '/public/refusals', auth: 'public', summary: 'Counts by class + recent; never payer or agent_id',
    responses: { 200: z.object({
      counts: z.record(z.enum(ABUSE_CLASSES), z.number().int()), total: z.number().int(),
      recent: z.array(z.object({ at: Iso, task_type: TaskTypeSchema, class: z.enum(ABUSE_CLASSES), reason: z.string(), rule_id: z.string(), spec_hash: TxHash, marked: z.boolean(), mark_tx: TxHash.optional(), mark_status: z.string().optional() })),
    }) } },
  publicPosters: { method: 'GET', path: '/public/posters', auth: 'public', summary: 'External demand', responses: { 200: z.object({ distinct_external_buyers: z.number().int(), external_tasks: z.number().int() }) } },
  publicPreflight: { method: 'GET', path: '/public/preflight', auth: 'public', summary: 'The MCP preflight_workers shape',
    query: z.object({ task_type: TaskTypeSchema, area: Geohash5 }), responses: { 200: Preflight } },
  publicProofVerify: { method: 'GET', path: '/public/proofs/:hash/verify', auth: 'public', summary: 'Re-hash check', responses: { 200: z.object({ hash: TxHash, hash_ok: z.boolean(), captured_at: Iso }) } },
  publicObservations: { method: 'GET', path: '/public/observations', auth: 'public', summary: 'Optional (T-40)',
    query: z.object({ place_id: z.string() }),
    responses: { 200: z.object({ observations: z.array(PublicObservation), delta: z.object({ checked: z.number().int(), listing_wrong: z.number().int() }).optional() }) } },
  adminPause: { method: 'POST', path: '/admin/pause', auth: 'admin-key', summary: 'Pause post/claim', responses: { 200: Ok } },
  adminUnpause: { method: 'POST', path: '/admin/unpause', auth: 'admin-key', summary: 'Unpause', responses: { 200: Ok } },
  adminResolve: { method: 'POST', path: '/admin/resolve', auth: 'admin-key', summary: 'Resolve a dispute', request: z.object({ task_id: TaskId, to_buyer: z.boolean() }), responses: { 200: Ok } },
  adminResetDemo: { method: 'POST', path: '/admin/reset-demo', auth: 'admin-key', summary: 'Reset demo state; body must confirm', request: z.object({ confirm: z.literal('reset-demo') }), responses: { 200: Ok } },
  adminResetWorker: { method: 'POST', path: '/admin/reset-worker', auth: 'admin-key', summary: 'resetWorker(nullifier)', request: z.object({ nullifier: z.string() }), responses: { 200: Ok } },
  adminSweep: { method: 'POST', path: '/admin/sweep', auth: 'admin-key', summary: 'Expire + autoRelease pass (GitHub Actions cron every 5 min)', responses: { 200: Ok } },
  adminSeedDemo: { method: 'POST', path: '/admin/seed-demo', auth: 'admin-key', summary: 'Seed demo rows', responses: { 200: Ok } },
  openapi: { method: 'GET', path: '/openapi.json', auth: 'public', summary: 'OpenAPI 3.1 rendered from this contract (T-35)', responses: { 200: z.record(z.string(), z.unknown()) } },
  healthz: { method: 'GET', path: '/healthz', auth: 'public', summary: 'Liveness', responses: { 200: z.object({ ok: z.literal(true), service: z.string() }) } },
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
} as const;
