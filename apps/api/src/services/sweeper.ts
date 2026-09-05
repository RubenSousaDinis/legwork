/**
 * The lazy sweeper: no keeper process, no cron that has to be up. Whoever loads the worker
 * list pushes the board forward on the way past, and `POST /admin/sweep` does the same pass
 * on demand.
 *
 * The pass itself — `sweep()`, `reconcileOpen` first, then `expire` and `autoRelease` — is
 * T-17 PR2. PR1 ships the seam the list route already calls so that wiring the pass in later
 * is one file and not seven.
 */

/** At most one pass per this many seconds per instance. */
export const SWEEP_INTERVAL_S = 30;

/**
 * Called by `GET /tasks/list` before it reads. A no-op until PR2 lands `sweep()`; it is
 * declared `async` because the caller will keep awaiting it when it stops being one.
 */
export async function sweepIfDue(): Promise<void> {
  // PR2: rate-limited to one `sweep({db, chain, txq, clock})` per SWEEP_INTERVAL_S per instance.
}
