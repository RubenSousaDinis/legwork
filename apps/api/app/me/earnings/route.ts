/**
 * `GET /me/earnings` — earned only.
 *
 * The number a worker sees is money the escrow has already paid them: the sum of the amounts
 * on tasks released to this address. Nothing posted, nothing locked and nothing merely
 * submitted is in it, because a figure that counts money still sitting in escrow is a promise
 * dressed up as a balance.
 */
import { getAddress, isAddress } from 'viem';
import { fromUsdcUnits } from '@legwork/shared';
import { and, eq, sql } from 'drizzle-orm';
import { route, preflight } from '@/src/http/route';
import { getChain } from '@/src/chain';
import { getDb } from '@/src/db/client';
import { tasks } from '@/src/db/schema';
import { requireWorkerSession } from '@/src/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const session = await requireWorkerSession(req);
  const caller = isAddress(session.worker) ? getAddress(session.worker) : session.worker;

  const rows = await getDb()
    .select({ total: sql<string>`coalesce(sum(${tasks.amountUnits}), 0)` })
    .from(tasks)
    .where(and(sql`lower(${tasks.worker}) = lower(${caller})`, eq(tasks.state, 'released')));

  const releasedUnits = BigInt(rows[0]?.total ?? '0');

  // The reputation registry is keyed by nullifier, not by address: one human, one record,
  // even after a wallet rotation.
  const chain = getChain();
  const nullifier = BigInt(session.nullifier);
  const [completed, score, distinctRaters] = await Promise.all([
    chain.completed(nullifier),
    chain.score(nullifier),
    chain.distinctRaters(nullifier),
  ]);

  return Response.json({
    released_usdc: fromUsdcUnits(releasedUnits),
    completed: Number(completed),
    score: Number(score),
    distinct_raters: Number(distinctRaters),
  });
});

export const OPTIONS = preflight;
