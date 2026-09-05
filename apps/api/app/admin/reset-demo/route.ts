// OWNER: T-19
/**
 * Back to an empty stage between takes.
 *
 * `nullifiers`, `posters`, `nonces` and `admin_audit` survive on purpose: one human's
 * registration is not demo state, a poster is a fact about who showed up, the relayer's nonce
 * belongs to the chain, and an audit log that a reset can erase is not an audit log.
 *
 * No chain call — this clears what this API remembers, not what the escrow holds.
 */
import { z } from 'zod';
import { getDb } from '@/src/db/client';
import {
  capsLedger, directQuotes, idempotency, idkitSessions, marksLog, observations, proofs,
  screeningLog, sessions, tasks,
} from '@/src/db/schema';
import { audited, parseBody, preflight, type AdminResult } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Typing the words is the confirmation; there is no undo behind this route. */
const Body = z.object({ confirm: z.literal('reset-demo') });

const CLEARED = [
  tasks, proofs, screeningLog, marksLog, capsLedger, idempotency, directQuotes, observations,
  sessions, idkitSessions,
] as const;

export const POST = audited('/admin/reset-demo', async (body): Promise<AdminResult> => {
  const parsed = parseBody(Body, body);
  if ('response' in parsed) return parsed.response;

  const db = getDb();
  for (const table of CLEARED) await db.delete(table);

  return { ok: true };
});

export const OPTIONS = preflight;
