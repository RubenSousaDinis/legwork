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

  // The frozen schema declares `nullifiers.worker` NOT NULL, so the binding is dropped by
  // deleting the row rather than nulling the column. Same effect — the human can register a
  // new wallet — and the frozen file stays untouched. See the PR's INTERFACE REQUEST.
  await getDb().delete(nullifiers).where(eq(nullifiers.nullifier, nullifierHash.toString()));

  return result;
});

export const OPTIONS = preflight;
