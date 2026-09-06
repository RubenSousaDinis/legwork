// OWNER: T-19
/**
 * The disclosed operator powers, and the ledger that makes them disclosable.
 *
 * Two rules hold this surface up. First, the group does not exist unless `ADMIN_API_KEY` is
 * set: every route answers 404, because a console that answers 401 has just told an anonymous
 * caller there is a console. Second, every authorized call writes an `admin_audit` row
 * *before* it runs and updates it after — a power that only logs its successes is a power
 * with no record of the time it went wrong.
 *
 * The presented key is never stored, never echoed and never logged. `requireAdminKey` in
 * `src/http/adminKey.ts` (T-08) does the constant-time comparison over sha256 digests.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { route, preflight, type RouteContext } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { requireAdminKey as compareAdminKey } from '@/src/http/adminKey';
import { ApiError } from '@/src/errors';
import { getDb } from '@/src/db/client';
import { adminAudit } from '@/src/db/schema';
import { logger } from '@/src/log';
import { chainFailure, fail } from '@/src/services/statusBus';

export const ADMIN_RATE_LIMIT = { limit: 30, windowS: 60 } as const;

/**
 * `admin_audit` is frozen with `action`, `payload` and `tx` (T-01b). The brief's `route`,
 * `body`, `outcome` and `error` therefore live inside `payload`, with the route name also in
 * `action` so a `select action from admin_audit` still reads like a list of what was done.
 */
export interface AuditPayload {
  route: string;
  body: Record<string, unknown>;
  outcome: 'started' | 'ok' | 'error';
  error?: string;
}

/** 404 when the key is unset, 401 when it is wrong. Only the client is logged, never the key. */
export function requireAdminKey(req: Request): void {
  try {
    compareAdminKey(req);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'unauthorized') {
      logger.warn({ client: clientKey(req) }, 'admin_unauthorized');
    }
    throw err;
  }
}

export type AdminResult = { ok: true; tx?: string } | Response;

/**
 * Wraps one admin handler: rate limit, key, audit row, handler, audit update.
 *
 * The row is inserted before the handler so a call that crashes, reverts or times out still
 * leaves a trace with `outcome: 'started'`. An unauthorized call writes nothing — there is
 * no authorized action to record, and letting a stranger append rows is a free log flood.
 */
export function audited(
  routeName: string,
  handler: (body: Record<string, unknown>, req: Request) => Promise<AdminResult>,
) {
  return route(async (req: Request, _ctx: RouteContext) => {
    rateLimit(`admin:${clientKey(req)}`, ADMIN_RATE_LIMIT);
    requireAdminKey(req);

    const raw = await req.json().catch(() => ({}));
    const body: Record<string, unknown> =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

    const db = getDb();
    const id = randomUUID();
    const started: AuditPayload = { route: routeName, body, outcome: 'started' };
    await db.insert(adminAudit).values({ id, action: routeName, payload: started });

    const finish = async (payload: AuditPayload, tx?: string) => {
      await db
        .update(adminAudit)
        .set({ payload, ...(tx ? { tx } : {}) })
        .where(eq(adminAudit.id, id));
    };

    let result: AdminResult;
    try {
      result = await handler(body, req);
    } catch (err) {
      await finish({ ...started, outcome: 'error', error: describe(err) });
      throw err;
    }

    if (result instanceof Response) {
      const outcome = result.status < 400 ? 'ok' : 'error';
      await finish({ ...started, outcome, ...(outcome === 'error' ? { error: `http_${result.status}` } : {}) });
      return result;
    }

    await finish({ ...started, outcome: 'ok' }, result.tx);
    return Response.json({ ok: true, ...(result.tx ? { tx: result.tx } : {}) });
  });
}

/** An error name for the audit row. Never a stack, never a message that quotes a header. */
function describe(err: unknown): string {
  if (err instanceof ApiError) return err.code;
  if (err instanceof Error) return err.name;
  return 'unknown';
}

/**
 * The disclosed powers are the deployer's — the contract owner. `@legwork/chain` binds the
 * role to the method (`pause`, `unpause`, `resolve` and `resetWorker` go out on the owner
 * queue), so a route can neither pick nor mistake it.
 */
export async function ownerWrite(send: () => Promise<{ hash: string }>): Promise<AdminResult> {
  try {
    const { hash } = await send();
    return { ok: true, tx: hash };
  } catch (err) {
    return chainFailure(err);
  }
}

/** A zod failure on an admin body is a plain 400; nothing about it is worth a chain call. */
export function parseBody<T extends z.ZodType>(
  schema: T,
  body: Record<string, unknown>,
): { data: z.infer<T> } | { response: Response } {
  const parsed = schema.safeParse(body);
  if (parsed.success) return { data: parsed.data };
  const issue = parsed.error.issues[0];
  return {
    response: fail(400, {
      error: 'invalid_request',
      field: issue ? issue.path.map(String).join('.') || '(root)' : '(root)',
      reason: issue?.message ?? 'invalid request',
    }),
  };
}

export { preflight };
