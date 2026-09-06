// OWNER: T-19
/**
 * `GET /tasks/:id` — the shape the MCP `task_status` tool returns, and the only surface on
 * which a buyer token means anything on a read.
 *
 * A wrong token here is not an error. The task's public facts are public; the token buys one
 * extra field, the signed proof URL, so presenting a bad one simply gets the same body
 * without it. Answering 401 would turn a read into an oracle for which tokens exist.
 */
import { route, preflight, pathParam } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { getDb } from '@/src/db/client';
import { verifyBuyerToken, BUYER_TOKEN_HEADER } from '@/src/services/buyerToken';
import {
  buildTaskView,
  eligibleAction,
  parseWait,
  pollAfterSeconds,
  readProof,
  readTask,
  versionOf,
  waitForChange,
} from '@/src/services/statusBus';
import { settleIfEligible } from '@/src/services/lifecycle';

export const runtime = 'nodejs';
/** Vercel Hobby's ceiling. The poll waits at most 50 s, so the platform never hangs up first. */
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const notFound = () => Response.json({ error: 'not_found' }, { status: 404 });

/** An `If-None-Match` comes back quoted, exactly as the `ETag` went out. */
const unquote = (value: string): string => value.trim().replace(/^W\//, '').replace(/^"|"$/g, '');

export const GET = route(async (req, ctx) => {
  rateLimit(`task-status:${clientKey(req)}`, { limit: 120, windowS: 60 });

  const raw = await pathParam(ctx, 'id');
  if (!/^\d+$/.test(raw)) return notFound();
  const taskId = BigInt(raw);

  const db = getDb();
  let row = await readTask(db, taskId);
  if (!row) return notFound();

  // The lazy settlement path: a status read is what makes an auto-release or an expiry
  // happen without a cron, and it is never gated by the paused flag.
  if (eligibleAction(row, Math.floor(Date.now() / 1000)) !== null) {
    await settleIfEligible(taskId);
    row = (await readTask(db, taskId)) ?? row;
  }

  const conditional = req.headers.get('if-none-match');
  const baseline = conditional ? unquote(conditional) : versionOf(row);

  const wait = parseWait(new URL(req.url).searchParams.get('wait'));
  let changed = versionOf(row) !== baseline;
  let waited = false;

  if (!changed && wait > 0) {
    waited = true;
    const result = await waitForChange(db, taskId, baseline, wait);
    row = result.row ?? row;
    changed = result.changed;
  }

  const reveal = verifyBuyerToken(req.headers.get(BUYER_TOKEN_HEADER), row.buyerTokenHash);
  const proofRow = row.proofHash ? ((await readProof(db, row.proofHash)) ?? null) : null;
  const view = await buildTaskView(row, proofRow, { reveal });

  return Response.json(
    { ...view, changed, poll_after_seconds: pollAfterSeconds(row, changed, waited) },
    { headers: { etag: `"${versionOf(row)}"`, 'cache-control': 'no-store' } },
  );
});

export const OPTIONS = preflight;
