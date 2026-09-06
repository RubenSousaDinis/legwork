/**
 * The chain is the truth; the `tasks` table is a copy of it kept so the list, the dashboard
 * and the long-poll can answer without an RPC call.
 *
 * Everything that writes re-reads `getTask` and mirrors the answer, so drift should not
 * happen. It does anyway: a relayer transaction that lands after the request timed out, a row
 * restored from a backup, a `resolve` sent by an operator's own script. This module is the
 * pass that notices — and the `state_drift` line it logs is the evidence that it did, because
 * a mirror silently corrected is a mirror nobody knows to distrust.
 */
import { eq, notInArray } from 'drizzle-orm';
import { getChain } from '../chain';
import { getDb } from '../db/client';
import { tasks } from '../db/schema';
import { logger } from '../log';
import { dbState, mirrorFromChain, type TaskRow } from './lifecycle';

/** Settled for good: the escrow has paid out and nothing moves these again. */
export const FINAL_STATES = ['released', 'refunded', 'resolved'] as const;

/** Reads the chain for one task and mirrors it. Returns the row as it now stands. */
export async function reconcileTask(taskId: bigint): Promise<TaskRow | undefined> {
  const rows = await getDb().select().from(tasks).where(eq(tasks.taskId, taskId)).limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return mirrorOne(row);
}

/**
 * Every non-final row, mirrored from the chain.
 *
 * `sweep()` runs this before it does any deadline arithmetic: a sweep that trusts the mirror
 * would expire a task somebody already claimed, and learn about it as a revert.
 */
export async function reconcileOpen(): Promise<TaskRow[]> {
  const rows = await getDb()
    .select()
    .from(tasks)
    .where(notInArray(tasks.state, [...FINAL_STATES]));

  const out: TaskRow[] = [];
  for (const row of rows) out.push(await mirrorOne(row));
  return out;
}

/**
 * The mirror itself, with the disagreement written down.
 *
 * Only the five columns the chain owns are compared: `state`, `worker`, `claimed_at`,
 * `submitted_at` and `proof_hash`. `spec_hash` or `payer` differing would be a different bug
 * and not one this pass may paper over.
 */
async function mirrorOne(row: TaskRow): Promise<TaskRow> {
  const chainTask = await getChain().getTask(row.taskId);
  const drift = driftOf(row, chainTask);

  if (drift.length > 0) {
    // Column names and values the chain already publishes — never spec text, never a payer.
    logger.warn(
      { task_id: row.taskId.toString(), spec_hash: row.specHash, drift },
      'state_drift',
    );
  }

  return mirrorFromChain(row, chainTask);
}

interface Drift {
  column: string;
  row: string | null;
  chain: string | null;
}

function driftOf(
  row: TaskRow,
  chainTask: { state: number; worker: string; claimedAt: bigint; submittedAt: bigint; proofHash: string },
): Drift[] {
  const zeroAddress = /^0x0{40}$/.test(chainTask.worker);
  const zeroHash = /^0x0{64}$/.test(chainTask.proofHash);

  const pairs: Drift[] = [
    { column: 'state', row: row.state, chain: dbState(chainTask.state) },
    {
      column: 'worker',
      row: row.worker?.toLowerCase() ?? null,
      chain: zeroAddress ? null : chainTask.worker.toLowerCase(),
    },
    { column: 'claimed_at', row: epoch(row.claimedAt), chain: seconds(chainTask.claimedAt) },
    { column: 'submitted_at', row: epoch(row.submittedAt), chain: seconds(chainTask.submittedAt) },
    {
      column: 'proof_hash',
      row: row.proofHash?.toLowerCase() ?? null,
      chain: zeroHash ? null : chainTask.proofHash.toLowerCase(),
    },
  ];
  return pairs.filter((p) => p.row !== p.chain);
}

const epoch = (date: Date | null): string | null =>
  date === null ? null : String(Math.floor(date.getTime() / 1000));
const seconds = (value: bigint): string | null => (value === 0n ? null : value.toString());
