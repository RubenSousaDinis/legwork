/**
 * `POST /me/withdraw` — the worker moves their earnings, and Legwork pays the gas.
 *
 * The route is four lines because the whole design is in `src/services/withdraw.ts`, which is
 * where the ordering rule lives: recover the signatures before anything reaches a node, then
 * the payout leg, then the fee leg, and a fee leg that fails after the payout landed is a 200
 * that says `fee_pending` rather than a 500 that tells a worker their money is gone when it
 * is in their wallet.
 */
import { route, preflight } from '@/src/http/route';
import { getDb } from '@/src/db/client';
import { requireWorkerSession } from '@/src/session';
import { buildWithdrawDeps, withdraw } from '@/src/services/withdraw';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  const session = await requireWorkerSession(req);
  return withdraw(req, session, buildWithdrawDeps(getDb()));
});

export const OPTIONS = preflight;
