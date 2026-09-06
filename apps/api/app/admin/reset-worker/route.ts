// OWNER: T-19
/**
 * Un-bind one human from one wallet, so a lost phone is not a lost registration.
 *
 * The registry is the record, so the chain call happens first; the row is only this API's
 * mirror of it.
 */
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getChain } from '@/src/chain';
import { getDb } from '@/src/db/client';
import { nullifiers } from '@/src/db/schema';
import { audited, ownerWrite, parseBody, preflight, type AdminResult } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A nullifier is a `uint256`: decimal from the database, `0x`-hex from a World payload. */
const Body = z.object({ nullifier: z.string().regex(/^(0x[0-9a-fA-F]+|\d+)$/) });

export const POST = audited('/admin/reset-worker', async (body): Promise<AdminResult> => {
  const parsed = parseBody(Body, body);
  if ('response' in parsed) return parsed.response;

  const nullifierHash = BigInt(parsed.data.nullifier);

  const result = await ownerWrite(() => getChain().resetWorker(nullifierHash));
  if (result instanceof Response) return result;

  // The column, not the row: `registered_at` and `action` are the registration's audit
  // trail and survive the reset. The human is now where `/idkit/verify` leaves them —
  // verified, with no address bound — and `nullifiers_worker_uq` still permits exactly one
  // address per human, because Postgres treats NULLs as distinct in a unique btree.
  await getDb()
    .update(nullifiers)
    .set({ worker: null })
    .where(eq(nullifiers.nullifier, nullifierHash.toString()));

  return result;
});

export const OPTIONS = preflight;
