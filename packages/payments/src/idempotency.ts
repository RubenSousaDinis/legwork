import type { Hex } from 'viem';

/**
 * One signed authorization, one task, one charge.
 *
 * The key is the EIP-3009 authorization nonce — never the task id, never the payer address,
 * never the spec hash. The S3 spike showed why the row has to be written *before* settle:
 * a facilitator that failed one settle left no row, and the agent's retry of the same
 * authorization ran the work a second time. Reserving first means a retry resumes the same
 * task instead of posting another escrow the float has to absorb.
 *
 * Task ids start at 1 on chain, so `task_id = 0` is the reservation sentinel: a row that
 * exists but whose `post` has not happened yet.
 */

export type Reservation =
  | { state: 'reserved' }
  | { state: 'in_progress' }
  | { state: 'done'; task_id: number; settle_tx: Hex | null };

export interface IdempotencyStore {
  /** insert-if-absent; a row with task_id = 0 means reserved, not yet posted */
  reserve(authNonce: Hex): Promise<Reservation>;
  complete(authNonce: Hex, r: { task_id: number; settle_tx: Hex | null }): Promise<void>;
  setSettleTx(authNonce: Hex, tx: Hex): Promise<void>;
  /** delete a reservation whose post never happened */
  release(authNonce: Hex): Promise<void>;
}

/** `(text, params) → rows`. T-16 passes the API's `rawQuery`; this package never imports it. */
export type SqlExecutor = (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

const RESERVED_TASK_ID = 0;

/** The nonce arrives in mixed case often enough that every store lowercases it first. */
function key(authNonce: Hex): string {
  return authNonce.toLowerCase();
}

/** Process-local. Good for a single-process test; the SQL store is what production uses. */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly rows = new Map<string, { task_id: number; settle_tx: Hex | null }>();

  reserve(authNonce: Hex): Promise<Reservation> {
    const k = key(authNonce);
    const row = this.rows.get(k);
    if (!row) {
      this.rows.set(k, { task_id: RESERVED_TASK_ID, settle_tx: null });
      return Promise.resolve({ state: 'reserved' });
    }
    if (row.task_id === RESERVED_TASK_ID) return Promise.resolve({ state: 'in_progress' });
    return Promise.resolve({ state: 'done', task_id: row.task_id, settle_tx: row.settle_tx });
  }

  complete(authNonce: Hex, r: { task_id: number; settle_tx: Hex | null }): Promise<void> {
    this.rows.set(key(authNonce), { task_id: r.task_id, settle_tx: r.settle_tx });
    return Promise.resolve();
  }

  setSettleTx(authNonce: Hex, tx: Hex): Promise<void> {
    const row = this.rows.get(key(authNonce));
    if (row) row.settle_tx = tx;
    return Promise.resolve();
  }

  release(authNonce: Hex): Promise<void> {
    const k = key(authNonce);
    const row = this.rows.get(k);
    // Only a reservation is releasable. A settled row is the record of a charge.
    if (row && row.task_id === RESERVED_TASK_ID) this.rows.delete(k);
    return Promise.resolve();
  }
}

/**
 * Table `idempotency` (`auth_nonce` primary key, `task_id`, `settle_tx`), as frozen in
 * `apps/api/src/db/schema.ts`. The executor is injected, so this file never imports Drizzle
 * or the API.
 */
export class SqlIdempotencyStore implements IdempotencyStore {
  constructor(private readonly exec: SqlExecutor) {}

  async reserve(authNonce: Hex): Promise<Reservation> {
    // The insert is the lock: two concurrent requests carrying the same authorization race
    // here, and exactly one of them gets a row back.
    const inserted = await this.exec(
      'INSERT INTO idempotency (auth_nonce, task_id) VALUES ($1, $2) ON CONFLICT (auth_nonce) DO NOTHING RETURNING auth_nonce',
      [key(authNonce), RESERVED_TASK_ID],
    );
    if (inserted.length > 0) return { state: 'reserved' };

    const rows = await this.exec(
      'SELECT task_id, settle_tx FROM idempotency WHERE auth_nonce = $1',
      [key(authNonce)],
    );
    const row = rows[0];
    // The row was released between the insert and the read: the reservation is free again.
    if (!row) return { state: 'reserved' };

    const taskId = Number(row.task_id ?? RESERVED_TASK_ID);
    if (taskId === RESERVED_TASK_ID) return { state: 'in_progress' };
    return { state: 'done', task_id: taskId, settle_tx: (row.settle_tx as Hex | null) ?? null };
  }

  async complete(authNonce: Hex, r: { task_id: number; settle_tx: Hex | null }): Promise<void> {
    await this.exec(
      'INSERT INTO idempotency (auth_nonce, task_id, settle_tx) VALUES ($1, $2, $3) ON CONFLICT (auth_nonce) DO UPDATE SET task_id = EXCLUDED.task_id, settle_tx = EXCLUDED.settle_tx',
      [key(authNonce), r.task_id, r.settle_tx],
    );
  }

  async setSettleTx(authNonce: Hex, tx: Hex): Promise<void> {
    await this.exec('UPDATE idempotency SET settle_tx = $2 WHERE auth_nonce = $1', [
      key(authNonce),
      tx,
    ]);
  }

  async release(authNonce: Hex): Promise<void> {
    await this.exec('DELETE FROM idempotency WHERE auth_nonce = $1 AND task_id = $2', [
      key(authNonce),
      RESERVED_TASK_ID,
    ]);
  }
}
