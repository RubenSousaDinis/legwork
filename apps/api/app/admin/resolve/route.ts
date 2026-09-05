// OWNER: T-19
/**
 * The operator settles a dispute. Single-signer and disclosed: this is the one power that
 * decides where locked money goes, and the audit row is the whole of its accountability.
 *
 * To the buyer: 3.45 back. To the worker: 3.00 to the worker and the 0.45 fee back to the
 * buyer — the treasury takes nothing from a task that went wrong.
 */
import { z } from 'zod';
import { getChain } from '@/src/chain';
import { getDb } from '@/src/db/client';
import { applyTransition, fail, readTask, statusOf } from '@/src/services/statusBus';
import { audited, ownerWrite, parseBody, preflight, type AdminResult } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The frozen contract types `task_id` as a decimal string; the brief's §8 sends a number.
 * Both are accepted and both mean the same `uint256`.
 */
const Body = z.object({
  task_id: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]),
  to_buyer: z.boolean(),
});

export const POST = audited('/admin/resolve', async (body): Promise<AdminResult> => {
  const parsed = parseBody(Body, body);
  if ('response' in parsed) return parsed.response;

  const taskId = BigInt(parsed.data.task_id);
  const db = getDb();
  const row = await readTask(db, taskId);
  if (!row) return fail(404, { error: 'not_found' });

  const status = statusOf(row);
  if (status !== 'disputed') return fail(409, { error: 'bad_state', status });

  const result = await ownerWrite(() => getChain().resolve(taskId, parsed.data.to_buyer));
  if (result instanceof Response) return result;

  await applyTransition(db, taskId, {
    state: 'resolved',
    at: new Date(),
    txColumn: 'tx_release',
    tx: result.tx,
  });
  return result;
});

export const OPTIONS = preflight;
