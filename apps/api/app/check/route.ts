/**
 * `POST /check` — the free dry run.
 *
 * The same screening pipeline `POST /tasks` runs, with the same verdict and the same refusal
 * payload, and none of the consequences: it never posts, never charges and **never marks**.
 * An agent can find out that a task would be refused without branding itself for asking, and
 * an evangelist can try the shape of an envelope before wiring up a wallet.
 *
 * Public and rate-limited per client, because it is the one endpoint here that does real work
 * for free. Nothing in this file imports the chain, the payment gateway, the identity
 * registry or the marker — the absence is the guarantee.
 */
import { quoteFor } from '@legwork/payments';
import { route } from '@/src/http/route';
import { ApiError } from '@/src/errors';
import { clientKey, rateLimit } from '@/src/http/rateLimit';
import { getDb } from '@/src/db/client';
import { logger } from '@/src/log';
import { refusalPayload, screener, writeScreeningLog } from '@/src/services/hire';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Per client, per minute. A brake on a runaway caller, not a quota. */
export const CHECK_RATE_LIMIT = { limit: 30, windowS: 60 } as const;

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function taskTypeOf(body: unknown): string {
  const type = asRecord(body)['task_type'];
  return typeof type === 'string' ? type : 'unknown';
}

export const POST = route(async (req) => {
  rateLimit(clientKey(req), CHECK_RATE_LIMIT);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw ApiError.of('invalid_request', { field: 'body', reason: 'expected a JSON object' });
  }

  const verdict = await screener()(body);
  const taskType = taskTypeOf(body);
  const db = getDb();
  const logDecision = (entry: object) =>
    logger.info({ route: '/check', task_type: taskType, spec_hash: verdict.spec_hash, ...entry });

  if (verdict.kind === 'invalid') {
    // A schema failure is a plain 4xx with the field named, here as on the paid route.
    await writeScreeningLog(
      { db },
      {
        taskType,
        class: null,
        reason: verdict.reason,
        ruleId: `schema.${verdict.field}`,
        specHash: verdict.spec_hash,
        marked: false,
        payer: null,
      },
    );
    logDecision({ decision: 'invalid_request', rule_id: `schema.${verdict.field}` });
    throw ApiError.of('invalid_request', {
      field: verdict.field,
      reason: verdict.reason,
      ...(verdict.allowed_task_types ? { allowed_task_types: verdict.allowed_task_types } : {}),
      ...(verdict.suggested_task_type ? { suggested_task_type: verdict.suggested_task_type } : {}),
    });
  }

  if (verdict.kind === 'refused') {
    // `marked: false`, always: this route has no payer, and a dry run brands nobody.
    await writeScreeningLog(
      { db },
      {
        taskType,
        class: verdict.class,
        reason: verdict.reason,
        ruleId: verdict.rule_id,
        specHash: verdict.spec_hash,
        marked: false,
        payer: null,
      },
    );
    logDecision({ decision: 'refused', class: verdict.class, rule_id: verdict.rule_id });
    return Response.json(refusalPayload(verdict, { marked: false }), { status: 422 });
  }

  const quote = quoteFor(verdict.envelope);
  await writeScreeningLog(
    { db },
    {
      taskType,
      class: null,
      reason: 'accepted',
      ruleId: 'accepted',
      specHash: verdict.spec_hash,
      marked: false,
      payer: null,
    },
  );
  logDecision({ decision: 'accepted', price_units: quote.price_units.toString() });

  return Response.json({
    accepted: true,
    spec_hash: verdict.spec_hash,
    price_usdc: quote.price_usdc,
  });
});
