import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PgNonceLock, type SqlExecutor } from '../src/nonce-lock.js';

/**
 * pglite is Postgres compiled to WebAssembly, in this process — so `pg_advisory_xact_lock`,
 * `hashtext` and `SET LOCAL lock_timeout` are the real implementations, not stand-ins, and
 * no socket is opened.
 */
async function pgliteExecutor(): Promise<{ db: PGlite; executor: SqlExecutor }> {
  const db = new PGlite();
  // The `nonces` table as T-01 froze it. Declared here as raw SQL on purpose: this package
  // never imports from `apps/api`.
  await db.query(`CREATE TABLE nonces (
    key_role   text PRIMARY KEY,
    next_nonce bigint,
    locked_at  timestamptz NOT NULL DEFAULT now()
  )`);

  const executor: SqlExecutor = {
    transaction: (fn) =>
      db.transaction(async (tx) => {
        const rows = await fn(async (sql, params) => {
          const result = await tx.query(sql, params);
          return result.rows as Record<string, unknown>[];
        });
        return rows;
      }) as never,
  };
  return { db, executor };
}

describe('PgNonceLock', () => {
  it('upserts the nonces row and round-trips next_nonce on pglite', async () => {
    const { db, executor } = await pgliteExecutor();
    const lock = new PgNonceLock(executor);

    const first = await lock.withLock('relayer', async (store) => {
      const before = await store.get();
      await store.set(5n);
      return before;
    });
    expect(first).toBeNull();

    const row = await db.query<{ next_nonce: string | number; locked_at: unknown }>(
      'SELECT next_nonce, locked_at FROM nonces WHERE key_role = $1',
      ['relayer'],
    );
    expect(Number(row.rows[0]?.next_nonce)).toBe(5);
    expect(row.rows[0]?.locked_at).not.toBeNull();

    const second = await lock.withLock('relayer', (store) => store.get());
    expect(second).toBe(5n);

    await db.close();
  });
});
