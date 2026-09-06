/**
 * The lazy sweeper: no keeper process, no cron that has to be up.
 *
 * Two deadlines expire a task and one releases it, and none of them fires by itself — the
 * contract has no timer. Something has to send `expire` or `autoRelease`, and in this system
 * that something is whoever happens to load the worker list, plus `POST /admin/sweep` for the
 * operator and for a cron that is a convenience rather than a dependency. A worker's money
 * arrives because somebody looked at a page.
 *
 * `reconcileOpen()` runs first, every time. A sweep that trusted the mirror would send `expire`
 * for a task somebody claimed thirty seconds ago and find out as a revert; the reverts are
 * logged and skipped here for the races that remain, not relied on as the check.
 *
 * The writes are `chain.expire` and `chain.autoRelease` — the relayer methods `LiveChain`
 * sends through `TxQueue`, which is the only thing in this system that touches a key.
 */
import { getChain } from '../chain';
import { logger } from '../log';
import { eligibleAction, mirrorFromChain, revertName, type EligibleAction, type TaskRow } from './lifecycle';
import { reconcileOpen } from './reconcile';

/** At most one pass per this many seconds per instance. */
export const SWEEP_INTERVAL_S = 30;

export interface SweepResult {
  expired: number[];
  auto_released: number[];
}

export interface SweepOptions {
  /** Seconds since the epoch. Defaults to the chain's own clock, which is the one the contract compares. */
  clock?: () => Promise<bigint>;
}

/**
 * One pass: reconcile, then push every non-final row that has outrun a deadline.
 *
 * Each result is mirrored back onto its row, so a caller that sweeps and then reads sees the
 * settled state rather than the one it just replaced.
 */
export async function sweep(options: SweepOptions = {}): Promise<SweepResult> {
  const chain = getChain();
  const now = await (options.clock ?? (() => chain.now()))();
  const rows = await reconcileOpen();

  const expired: number[] = [];
  const auto_released: number[] = [];

  for (const row of rows) {
    const action = eligibleAction(row, now);
    if (!action) continue;
    if (await settle(row, action)) {
      (action === 'expire' ? expired : auto_released).push(Number(row.taskId));
    }
  }

  return { expired, auto_released };
}

/** One settlement. A revert is somebody else winning the same race: logged, skipped, not thrown. */
async function settle(row: TaskRow, action: EligibleAction): Promise<boolean> {
  const chain = getChain();
  try {
    const tx =
      action === 'autoRelease' ? await chain.autoRelease(row.taskId) : await chain.expire(row.taskId);
    await mirrorFromChain(row, await chain.getTask(row.taskId), { release: tx.hash });
    return true;
  } catch (err) {
    logger.warn(
      { task_id: row.taskId.toString(), action, revert: revertName(err) },
      'sweep_skipped',
    );
    return false;
  }
}

let lastSweepAtMs = 0;
let inFlight: Promise<void> | undefined;

/**
 * Called by `GET /tasks/list` before it reads, and rate-limited to one pass per
 * `SWEEP_INTERVAL_S` per instance — a busy board would otherwise send the same `expire` from
 * every concurrent request and pay gas to lose the race.
 *
 * Per instance, like the rate limiter: Vercel runs several and they share nothing, so the real
 * ceiling is one pass per interval per instance. That is a brake on this instance's own
 * enthusiasm, not a lock; the contract is what actually decides, and a duplicate reverts.
 *
 * Never throws. A sweep that failed must not turn somebody's list into a 500.
 */
export async function sweepIfDue(): Promise<void> {
  if (inFlight) return inFlight;

  const now = Date.now();
  if (now - lastSweepAtMs < SWEEP_INTERVAL_S * 1000) return;
  lastSweepAtMs = now;

  inFlight = sweep()
    .then(() => undefined)
    .catch((err: unknown) => {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'sweep_failed');
    })
    .finally(() => {
      inFlight = undefined;
    });
  return inFlight;
}

/** Vitest only: forget when the last pass ran, so a case starts due. */
export function resetSweepClockForTests(): void {
  lastSweepAtMs = 0;
  inFlight = undefined;
}
