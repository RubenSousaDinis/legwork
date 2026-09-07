/**
 * ## POST /tasks
 *
 * The route the whole product is sold on: an agent pays 3.45 USDC through x402 and gets a
 * task id back in one call, and a task that is refused moves no money.
 *
 * | | |
 * |---|---|
 * | Auth | x402 — `PAYMENT-SIGNATURE`; price = `amount_usdc × 1.15` |
 * | Body | `Envelope` (`@legwork/shared`) |
 * | 201 | `{task_id, buyer_token, status:'open', spec_hash, price_usdc, eta_seconds, poll_after_seconds, dashboard_url}` |
 * | 402 | `{error:'payment_required', price_usdc, accepts, remaining_budget:{open_tasks, daily_usdc}}` |
 * | 422 | `RefusalPayload` — `retryable: false`, the no-retry sentence, `mark_tx` when the payer has a verified identity |
 * | 400 | `{error:'invalid_request', field, reason}` — a schema failure, which never marks |
 * | 429 | `{error:'cap_exceeded', open_tasks, daily_usdc}` |
 * | 409 | `{error:'conflict', reason:'in_progress', retry_after_s}` — the same authorization is mid-flight |
 * | 503 | `{error:'escrow_post_failed'}` — the escrow write failed, so nothing was charged |
 *
 * ### The order is the design
 *
 * ```
 * verify (no money moves) -> envelope + schema -> deterministic gate -> classifier
 *   -> caps -> agent id -> TaskEscrow.post(buyer = payer) -> settle -> 201
 * ```
 *
 * **`verify` comes first and moves nothing.** It is the facilitator confirming that a signed
 * authorization *would* settle. Everything that can refuse the task happens after it and
 * before any money moves, which is what makes "a refused task moves no money" true rather
 * than aspirational.
 *
 * **`settle` happens after `post`, and only there.** A failed `post` releases the nonce and
 * answers 503 without ever calling `settle`: the agent keeps its money and can retry the same
 * authorization. A `settle` that fails *after* `post` succeeded is the one case where the
 * operator float is short — the task is real, the agent has it, and the row and the log both
 * say `float_absorbed=true`. Our custody is the one block between settlement and escrow, and
 * we say so.
 *
 * **The reservation is written before `settle`, not after it.** The idempotency key is the
 * EIP-3009 authorization nonce, never the task id and never the payer. One signed
 * authorization buys one task however many times it is sent; a replay of a completed one
 * re-reads the row and answers 201 with `replay: true` and no new `buyer_token`.
 *
 * ### What never happens here
 *
 * - A schema error never marks, and neither does a cap. Only a `refused` verdict from the
 *   screening pipeline reaches `markIfIdentified`, and only for the six abuse classes.
 * - The id an agent claims in its body is a hint to look up and never a value to store: the
 *   subject of a mark is resolved from the **payer** against the ERC-8004 IdentityRegistry.
 * - No raw spec text is ever logged. The log line carries `spec_hash`; `screening_log` holds
 *   the class, the rule id and the hash, and never the words.
 * - `post` is the only chain write on this path, and it goes through the adapter's relayer
 *   queue like every other write in this service.
 *
 * `POST /check` (`app/check/route.ts`) is the free dry run over the same `screenEnvelope`
 * below: same verdict, same refusal payload, and it never posts, never charges and never
 * marks.
 */
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { isAddress, type Hex } from 'viem';
import { z } from 'zod';
import {
  ABUSE_CLASS_ID,
  Envelope,
  EnvelopeCommon,
  NO_RETRY_SENTENCE,
  TASK_TYPES,
  TASK_TYPE_BIT,
  fromUsdcUnits,
  specHash,
  type AbuseClass,
  type RefusalPayload,
  type TaskType,
} from '@legwork/shared';
import { HTTPFacilitatorClient } from '@x402/core/server';
import {
  SqlIdempotencyStore,
  selectGateway,
  type IdempotencyStore,
  type PaymentGateway,
} from '@legwork/payments';
import {
  KeywordFallbackClassifier,
  createLiveClassifier,
  getPlaceIndex,
  screen,
  type Classifier,
  type PlaceIndex,
} from '@legwork/screening';
import ngeohash from 'ngeohash';
import { getChain } from '../chain';
import { getConfig } from '../config';
import { getDb, rawQuery, type Db } from '../db/client';
import { posters, screeningLog, tasks } from '../db/schema';
import { ApiError, apiErrorFromZod } from '../errors';
import { logger } from '../log';
import { newBuyerToken } from './buyerToken';
import { caps as buildCaps, type Caps } from './caps';
import { dashboardUrl } from './statusBus';
import { markIfIdentified } from './abuseMark';
import { resolveAgentId } from './identity';

// ------------------------------------------------------------------ constants

/** What the 201 promises a caller about timing. Both are advice, never a guarantee. */
export const ETA_SECONDS = 900;
export const POLL_AFTER_SECONDS = 30;

/** A `compare-two` happens nowhere in particular, so it is offered to every area. */
export const NO_AREA = 'any';

const GEOHASH_PRECISION = 5;

/** Informational, unauthenticated, and only ever used to fill in the 402's budget echo. */
export const PAYER_HINT_HEADER = 'x-payer';

/** The verified id, as it appears in a decision log line. An unverified caller contributes none. */
const logAgentId = (i: { agentId: bigint; verified: boolean }): { agent_id?: string } => (i.verified ? { agent_id: i.agentId.toString() } : {});

/** A second request carrying an authorization that is still mid-post. */
const IN_PROGRESS_RETRY_S = 2;

// ---------------------------------------------------------------------- seams

/**
 * The screening verdict as this route consumes it.
 *
 * `@legwork/screening` answers `{ok}` / `invalid_request` / `refusal` and, on the enumerated
 * path, resolves the place against the cached extract without handing the coordinate back.
 * `screenEnvelope` below re-reads that one coordinate from the same index and shapes both
 * into this union, so `hire()` reads one verdict and the pipeline stays T-06's.
 */
export type ScreenOutcome =
  | { kind: 'accepted'; envelope: Envelope; spec_hash: Hex; place: ResolvedPlace | null }
  | {
      kind: 'refused';
      spec_hash: Hex;
      class: AbuseClass | null;
      reason: string;
      rule_id: string;
      allowed_task_types: TaskType[];
    }
  | {
      kind: 'invalid';
      spec_hash: Hex;
      field: string;
      reason: string;
      allowed_task_types?: TaskType[];
      suggested_task_type?: TaskType;
    };

/** Private. It reaches `tasks.exact_lat/lon` and the area, and no public surface. */
export interface ResolvedPlace {
  lat: number;
  lon: number;
  name: string;
}

/** `TaskEscrow.post`, as this route calls it: the relayer queue behind `getChain()`. */
export interface PostParams {
  taskType: number;
  specHash: Hex;
  amount: bigint;
  buyer: string;
  buyerAgentId: bigint;
  area: string;
  claimTTL: number;
  submitTTL: number;
  disputeWindow: number;
}

/**
 * Everything `hire()` touches that is not its own logic. Declared structurally so a test
 * hands it fakes and T-16b swaps the gateway alone; `buildHireDeps()` is the production
 * wiring and the only place that reads config.
 */
export interface HireDeps {
  gateway: PaymentGateway;
  idem: IdempotencyStore;
  db: Db;
  chain: { allowlistedBuyer(buyer: string): Promise<boolean> };
  txq: { post(p: PostParams): Promise<{ taskId: bigint; hash: string }> };
  screen: (body: unknown) => Promise<ScreenOutcome>;
  identity: { resolveAgentId: typeof resolveAgentId };
  abuseMark: { markIfIdentified: typeof markIfIdentified };
  caps: Caps;
  clock: () => Date;
  log: { info(o: object): void; error(o: object): void; warn(o: object): void };
}

// ------------------------------------------------------------- the pre-read

/**
 * The only schema read that happens before payment, and it exists for one reason: the 402
 * has to name a price, and the price is a function of the type and the amount.
 *
 * Everything else — the place, the denylist, the floors, the 300-character cap — is the
 * screening pipeline's, and runs after `verify`. A caller who fails *this* is answered 400
 * without ever being asked for money.
 */
const PriceRead = z.object({
  task_type: z.enum(TASK_TYPES),
  amount_usdc: EnvelopeCommon.amount_usdc,
});

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * The claimed ERC-8004 id in the body. It is a lookup hint and nothing else: anyone can type
 * one, and a mark is a permanent public record against whoever it names.
 */
function claimedId(body: unknown): string | undefined {
  const claimed = asRecord(body)['agent_id']; // read once, handed only to resolveAgentId
  return typeof claimed === 'string' ? claimed : undefined;
}

/** The `X-Payer` hint, when it is an address. Unauthenticated: it buys nothing but a budget echo. */
export function payerHint(req: Request): string | null {
  const raw = req.headers.get(PAYER_HINT_HEADER);
  return raw && isAddress(raw) ? raw : null;
}

export function geohash5(lat: number, lon: number): string {
  return ngeohash.encode(lat, lon, GEOHASH_PRECISION) as string;
}

// -------------------------------------------------------------- the pipeline

export interface ScreenEnvelopeDeps {
  places: PlaceIndex;
  classifier: Classifier;
  now?: () => Date;
}

/**
 * T-06's `screen`, plus the two things a task record needs and a verdict does not carry: the
 * parsed envelope (defaults applied) and the coordinate of the place the gate just resolved.
 *
 * The coordinate is read from the same `PlaceIndex` the gate checked against, so it is the
 * same POI by construction. It is private from here on — `tasks.exact_lat/lon` and the
 * geohash-5 `area`, never a response body.
 */
export async function screenEnvelope(
  body: unknown,
  deps: ScreenEnvelopeDeps,
): Promise<ScreenOutcome> {
  const hash = specHash(body);
  const verdict = await screen(body, { places: deps.places, classifier: deps.classifier, ...(deps.now ? { now: deps.now } : {}) });

  if (!verdict.ok && verdict.kind === 'refusal') {
    const payload = verdict.payload;
    return {
      kind: 'refused',
      spec_hash: hash,
      class: payload.class,
      reason: payload.reason,
      rule_id: payload.rule_id,
      allowed_task_types: payload.allowed_task_types,
    };
  }
  if (!verdict.ok) {
    return {
      kind: 'invalid',
      spec_hash: hash,
      field: verdict.field,
      reason: verdict.reason,
      ...(verdict.allowed_task_types ? { allowed_task_types: verdict.allowed_task_types } : {}),
      ...(verdict.suggested_task_type ? { suggested_task_type: verdict.suggested_task_type } : {}),
    };
  }

  // The gate passed, so the envelope parses; this call applies the defaults the gate read
  // past (`claim_ttl_s`, `submit_ttl_s`, `dispute_window_s`).
  const parsed = Envelope.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      kind: 'invalid',
      spec_hash: hash,
      field: issue ? issue.path.map(String).join('.') || '(root)' : '(root)',
      reason: issue?.message ?? 'invalid envelope',
    };
  }

  return { kind: 'accepted', envelope: parsed.data, spec_hash: hash, place: placeOf(parsed.data, deps.places) };
}

/** `compare-two` has no place; the other three resolved one a moment ago in the gate. */
function placeOf(envelope: Envelope, places: PlaceIndex): ResolvedPlace | null {
  if (envelope.task_type === 'compare-two') return null;
  const place = envelope.spec.place;
  const coordinate = places.coordinateOf(place.place_id);
  return coordinate ? { ...coordinate, name: place.name } : null;
}

// ---------------------------------------------------------------- the handler

/**
 * `POST /tasks`, in the frozen order. Every early exit releases the reservation, and the two
 * that happen after `screen` write the decision to `screening_log`.
 */
export async function hire(req: Request, deps: HireDeps): Promise<Response> {
  const requestId = req.headers.get('x-request-id') ?? randomUUID();
  const logDecision = (entry: object) =>
    deps.log.info({ route: '/tasks', request_id: requestId, ...entry });

  // 1. The body, and the only schema read that happens before payment.
  const body = await readJson(req);
  const priced = PriceRead.safeParse(asRecord(body));
  if (!priced.success) {
    logDecision({ decision: 'invalid_request', spec_hash: specHash(body) });
    throw apiErrorFromZod(priced.error);
  }
  const quote = deps.gateway.price(priced.data);
  const taskType = priced.data.task_type;

  // 2. The budget echo, then verify. Nothing before this point writes anything.
  const remaining = await deps.caps.remaining(payerHint(req));
  const gate = await deps.gateway.requirePayment(req, quote, {
    remaining_budget: remaining,
    resource: req.url,
  });
  if (gate.kind === 'payment_required') {
    logDecision({ decision: 'payment_required', task_type: taskType, price_units: quote.price_units.toString() });
    return Response.json(gate.body, { status: gate.status, headers: gate.headers });
  }

  // 3. One authorization, one task.
  const ctx = gate.ctx;
  const payer = deps.gateway.payerOf(ctx);
  const nonce = deps.gateway.authNonceOf(ctx);
  const reservation = await deps.idem.reserve(nonce);
  if (reservation.state === 'in_progress') {
    logDecision({ decision: 'conflict', task_type: taskType, payer });
    throw ApiError.of('conflict', { reason: 'in_progress', retry_after_s: IN_PROGRESS_RETRY_S });
  }
  if (reservation.state === 'done') {
    logDecision({ decision: 'replay', task_type: taskType, payer, task_id: reservation.task_id });
    return replay(deps, reservation.task_id);
  }

  // 4. Screening. A refusal marks; a schema error never does.
  const verdict = await deps.screen(body);
  const common = { task_type: taskType, spec_hash: verdict.spec_hash, payer, price_units: quote.price_units.toString() };

  if (verdict.kind === 'invalid') {
    await deps.idem.release(nonce);
    await writeScreeningLog(deps, {
      taskType,
      class: null,
      reason: verdict.reason,
      ruleId: `schema.${verdict.field}`,
      specHash: verdict.spec_hash,
      marked: false,
      payer,
    });
    logDecision({ ...common, decision: 'invalid_request', rule_id: `schema.${verdict.field}` });
    throw ApiError.of('invalid_request', { field: verdict.field, reason: verdict.reason });
  }

  if (verdict.kind === 'refused') {
    const identity = await deps.identity.resolveAgentId(payer, claimedId(body));
    // `class: null` is a refusal that is not one of the six — it never marks.
    const mark =
      verdict.class === null
        ? ({ marked: false } as const)
        : await deps.abuseMark.markIfIdentified({
            agentId: identity.agentId,
            verified: identity.verified,
            classId: ABUSE_CLASS_ID[verdict.class],
            specHash: verdict.spec_hash,
            payer,
          });
    await deps.idem.release(nonce);
    await writeScreeningLog(deps, {
      taskType,
      class: verdict.class,
      reason: verdict.reason,
      ruleId: verdict.rule_id,
      specHash: verdict.spec_hash,
      marked: mark.marked,
      ...(mark.marked ? { markTx: mark.tx } : {}),
      ...(identity.verified ? { agentId: identity.agentId.toString() } : {}),
      payer,
    });
    logDecision({
      ...common,
      decision: 'refused',
      class: verdict.class,
      rule_id: verdict.rule_id,
      ...logAgentId(identity),
    });
    return Response.json(refusalPayload(verdict, mark), { status: 422 });
  }

  const { envelope, place } = verdict;

  // 5. The caps. Over either one is a 429 that never marks, never posts and never settles.
  const capped = await deps.caps.check(payer, quote.price_units);
  if (!capped.ok) {
    await deps.idem.release(nonce);
    logDecision({ ...common, decision: 'cap_exceeded' });
    return Response.json(
      { error: 'cap_exceeded', open_tasks: capped.remaining.open_tasks, daily_usdc: capped.remaining.daily_usdc },
      { status: 429 },
    );
  }

  // 6. The subject of anything onchain is the payer, never the body's claim.
  const identity = await deps.identity.resolveAgentId(payer, claimedId(body));
  const buyerAgentId = identity.verified ? identity.agentId : 0n;

  // 7. The escrow. A failure here releases the nonce and never settles.
  const allowlisted = await deps.chain.allowlistedBuyer(payer);
  const disputeWindow = allowlisted ? getConfig().DEMO_DISPUTE_WINDOW_S : envelope.dispute_window_s;
  const area = place ? geohash5(place.lat, place.lon) : NO_AREA;

  let posted: { taskId: bigint; hash: string };
  try {
    posted = await deps.txq.post({
      taskType: TASK_TYPE_BIT[envelope.task_type],
      specHash: verdict.spec_hash,
      amount: quote.amount_units,
      buyer: payer,
      buyerAgentId,
      area,
      claimTTL: envelope.claim_ttl_s,
      submitTTL: envelope.submit_ttl_s,
      disputeWindow,
    });
  } catch (err) {
    await deps.idem.release(nonce);
    deps.log.error({
      route: '/tasks',
      request_id: requestId,
      ...common,
      decision: 'escrow_post_failed',
      err: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: 'escrow_post_failed' }, { status: 503 });
  }

  // 8. The row, then the reservation. Both before `settle`, so a failed settle is retryable.
  const taskId = posted.taskId;
  const now = deps.clock();
  const buyerToken = newBuyerToken();
  const agentIdText = identity.verified ? identity.agentId.toString() : null;

  await deps.db.insert(tasks).values({
    taskId,
    taskType: TASK_TYPE_BIT[envelope.task_type],
    specHash: verdict.spec_hash,
    amountUnits: quote.amount_units,
    feeUnits: quote.fee_units,
    buyer: payer,
    buyerAgentId: agentIdText,
    area,
    state: 'open',
    postedAt: now,
    claimTtlS: envelope.claim_ttl_s,
    submitTtlS: envelope.submit_ttl_s,
    disputeWindowS: disputeWindow,
    txPost: posted.hash,
    specJson: envelope.spec,
    buyerTokenHash: buyerToken.hash,
    exactLat: place ? String(place.lat) : null,
    exactLon: place ? String(place.lon) : null,
    agentId: agentIdText,
    payer,
    authNonce: nonce,
    priceUnits: quote.price_units,
    floatAbsorbed: false,
    updatedAt: now,
  });

  await upsertPoster(deps, { payer, agentId: agentIdText, allowlisted, now });
  await deps.caps.record(payer, quote.price_units);
  await deps.idem.complete(nonce, { task_id: Number(taskId), settle_tx: null });

  // 9. Settle. It never throws; a failure after `post` is the float's, and it is logged.
  const settled = await deps.gateway.settle(ctx);
  if (settled.ok) {
    await deps.idem.setSettleTx(nonce, settled.tx);
  } else {
    await deps.db.update(tasks).set({ floatAbsorbed: true, updatedAt: deps.clock() }).where(eq(tasks.taskId, taskId));
    deps.log.error({
      route: '/tasks',
      request_id: requestId,
      task_id: taskId.toString(),
      reason: settled.reason,
      float_absorbed: true,
    });
  }

  await writeScreeningLog(deps, {
    taskType,
    class: null,
    reason: 'accepted',
    ruleId: 'accepted',
    specHash: verdict.spec_hash,
    marked: false,
    ...(agentIdText ? { agentId: agentIdText } : {}),
    payer,
  });
  logDecision({
    ...common,
    decision: 'accepted',
    task_id: taskId.toString(),
    ...logAgentId(identity),
  });

  return Response.json(
    {
      task_id: taskId.toString(),
      buyer_token: buyerToken.token,
      status: 'open',
      spec_hash: verdict.spec_hash,
      price_usdc: quote.price_usdc,
      eta_seconds: ETA_SECONDS,
      poll_after_seconds: POLL_AFTER_SECONDS,
      dashboard_url: dashboardUrl(taskId),
    },
    { status: 201 },
  );
}

// --------------------------------------------------------------------- pieces

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw ApiError.of('invalid_request', { field: 'body', reason: 'expected a JSON object' });
  }
}

/**
 * The 422. `retryable: false` and the no-retry sentence are always there — a refusal that
 * reads like a transient error is a refusal an agent rephrases and sends again.
 */
export function refusalPayload(
  verdict: Extract<ScreenOutcome, { kind: 'refused' }>,
  mark: { marked: false } | { marked: true; tx: Hex },
): RefusalPayload {
  return {
    refused: true,
    class: verdict.class,
    reason: verdict.reason,
    rule_id: verdict.rule_id,
    retryable: false,
    allowed_task_types: verdict.allowed_task_types,
    ...(mark.marked ? { mark_tx: mark.tx } : {}),
    message: NO_RETRY_SENTENCE,
  };
}

/**
 * A replayed authorization. The task is re-read rather than re-posted, and the `buyer_token`
 * is **not** re-issued: it was handed over once, on the 201 that created the row, and only
 * its digest survives here.
 */
async function replay(deps: HireDeps, taskId: number): Promise<Response> {
  const rows = await deps.db.select().from(tasks).where(eq(tasks.taskId, BigInt(taskId))).limit(1);
  const row = rows[0];
  if (!row) throw ApiError.of('not_found');
  return Response.json(
    {
      task_id: row.taskId.toString(),
      buyer_token: null,
      replay: true,
      status: row.state,
      spec_hash: row.specHash,
      price_usdc: fromUsdcUnits(row.priceUnits),
      eta_seconds: ETA_SECONDS,
      poll_after_seconds: POLL_AFTER_SECONDS,
      dashboard_url: dashboardUrl(row.taskId),
    },
    { status: 201 },
  );
}

export interface ScreeningLogRow {
  taskType: string;
  class: AbuseClass | null;
  reason: string;
  ruleId: string;
  specHash: string;
  marked: boolean;
  markTx?: string;
  agentId?: string;
  payer?: string | null;
}

/** One row per decision. The class, the rule and the hash — never the words of the spec. */
export async function writeScreeningLog(
  deps: Pick<HireDeps, 'db'>,
  row: ScreeningLogRow,
): Promise<void> {
  await deps.db.insert(screeningLog).values({
    id: randomUUID(),
    taskType: row.taskType,
    class: row.class,
    reason: row.reason,
    ruleId: row.ruleId,
    specHash: row.specHash,
    marked: row.marked,
    markTx: row.markTx ?? null,
    agentId: row.agentId ?? null,
    payer: row.payer ?? null,
  });
}

/**
 * The payer's row on `/public/posters`. `first_seen` is the first time they paid for
 * anything and is never rewritten; the verified id and the allowlist flag are refreshed,
 * because both can become true after the first task.
 */
async function upsertPoster(
  deps: Pick<HireDeps, 'db'>,
  p: { payer: string; agentId: string | null; allowlisted: boolean; now: Date },
): Promise<void> {
  await deps.db
    .insert(posters)
    .values({ payer: p.payer, agentId: p.agentId, firstSeen: p.now, allowlisted: p.allowlisted })
    .onConflictDoNothing({ target: posters.payer });
  if (p.agentId || p.allowlisted) {
    await deps.db
      .update(posters)
      .set({ ...(p.agentId ? { agentId: p.agentId } : {}), allowlisted: p.allowlisted })
      .where(sql`lower(${posters.payer}) = ${p.payer.toLowerCase()}`);
  }
}

// --------------------------------------------------------------- the wiring

let cachedClassifier: Classifier | undefined;

/**
 * The live classifier when there is a key, the deterministic keyword fallback when there is
 * not. CI and every cloud agent run the fallback, which is also the only classifier the
 * corpus ever sees — and it is unreachable from the enumerated path in any case.
 */
export function classifier(): Classifier {
  if (!cachedClassifier) {
    try {
      cachedClassifier = createLiveClassifier();
    } catch {
      cachedClassifier = new KeywordFallbackClassifier();
    }
  }
  return cachedClassifier;
}

/** The screening seam both routes share, bound to the packaged OSM extract. */
export function screener(): (body: unknown) => Promise<ScreenOutcome> {
  return (body) => screenEnvelope(body, { places: getPlaceIndex(), classifier: classifier() });
}

/** The one network this seller accepts, and the one the frozen `PaymentContext` names. */
const X402_NETWORK = 'eip155:84532' as const;

/**
 * The seller half, from config. A missing facilitator or asset is a boot-time
 * misconfiguration and says so — not a 500 on the first agent that tries to pay.
 */
export function buildGateway(): PaymentGateway {
  const config = getConfig();
  if (config.PAYMENT_MODE === 'direct') return selectGateway('direct');

  const url = config.X402_FACILITATOR_URL;
  if (!url) throw new Error('PAYMENT_MODE=x402 needs X402_FACILITATOR_URL');
  const asset = config.USDC_ADDRESS;
  if (!asset) throw new Error('PAYMENT_MODE=x402 needs USDC_ADDRESS');
  if (config.X402_NETWORK && config.X402_NETWORK !== X402_NETWORK) {
    throw new Error(`X402_NETWORK must be ${X402_NETWORK}`);
  }

  return selectGateway('x402', {
    x402: {
      // The handler calls the resource server, never this client directly, so the server's
      // payment-flow rules apply to both verify and settle.
      facilitator: new HTTPFacilitatorClient({ url }),
      payTo: config.relayerAddress,
      asset: asset as Hex,
      network: X402_NETWORK,
    },
  });
}

/**
 * Production wiring. The one place that reads config, opens the database and picks a
 * gateway; `hire()` itself reads none of them. T-16b swaps `gateway` alone.
 */
export function buildHireDeps(): HireDeps {
  const chain = getChain();

  return {
    gateway: buildGateway(),
    idem: new SqlIdempotencyStore((text, params) => rawQuery(text, params)),
    db: getDb(),
    chain: { allowlistedBuyer: (buyer: string) => chain.allowlistedBuyer(buyer as Hex) },
    txq: {
      post: async (p) => {
        const result = await chain.post({ ...p, buyer: p.buyer as Hex });
        return { taskId: result.taskId, hash: result.hash };
      },
    },
    screen: screener(),
    identity: { resolveAgentId },
    abuseMark: { markIfIdentified },
    caps: buildCaps(),
    clock: () => new Date(),
    log: logger,
  };
}
