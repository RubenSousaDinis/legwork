/**
 * The relayer key has exactly one sender: `TxQueue`. On Vercel that queue lives in as many
 * concurrent function invocations as there are requests, so "one sender" has to be enforced
 * outside the process. That is what a `NonceLock` is — a mutual exclusion around
 * *read nonce → sign → send → write nonce*, plus the storage for the nonce itself.
 */

export interface NonceStore {
  /** The next nonce to use, or `null` when nothing has been stored for this role yet. */
  get(): Promise<bigint | null>;
  set(n: bigint): Promise<void>;
}

export interface NonceLock {
  withLock<T>(role: string, fn: (store: NonceStore) => Promise<T>): Promise<T>;
}

/**
 * A per-role promise chain. Enough for tests, `FakeChain` and any single-process caller;
 * useless across invocations, which is what `PgNonceLock` is for.
 */
export class MemoryNonceLock implements NonceLock {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly nonces = new Map<string, bigint>();

  withLock<T>(role: string, fn: (store: NonceStore) => Promise<T>): Promise<T> {
    const store: NonceStore = {
      get: async () => this.nonces.get(role) ?? null,
      set: async (n) => {
        this.nonces.set(role, n);
      },
    };
    // The stored tail always resolves, so a rejected turn never wedges the chain.
    const previous = this.tails.get(role) ?? Promise.resolve();
    const run = previous.then(() => fn(store));
    this.tails.set(
      role,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }
}

/**
 * The minimum a `PgNonceLock` needs from a database driver: run these statements inside one
 * transaction. `postgres` (postgres.js) in the API and pglite in tests both wrap to this in a
 * few lines, which is why the lock does not import either of them.
 */
export interface SqlExecutor {
  transaction<T>(
    fn: (query: (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>,
  ): Promise<T>;
}

/**
 * A Postgres advisory lock, held for one transaction.
 *
 * `pg_advisory_xact_lock` rather than `pg_advisory_lock` on purpose: a serverless invocation
 * that is frozen mid-flight never runs its own release, and a session-scoped lock would then
 * be held until the connection died. A transaction-scoped one is released by the commit, the
 * rollback, or the dropped connection — whichever happens first.
 */
export class PgNonceLock implements NonceLock {
  constructor(private readonly executor: SqlExecutor) {}

  withLock<T>(role: string, fn: (store: NonceStore) => Promise<T>): Promise<T> {
    return this.executor.transaction(async (query) => {
      // Rather wait ten seconds and fail loudly than pile invocations up behind a stuck one.
      await query("SET LOCAL lock_timeout = '10s'", []);
      await query("SELECT pg_advisory_xact_lock(hashtext('nonces:' || $1))", [role]);
      await query(
        `INSERT INTO nonces (key_role, next_nonce, locked_at)
         VALUES ($1, NULL, now())
         ON CONFLICT (key_role) DO UPDATE SET locked_at = now()`,
        [role],
      );

      const store: NonceStore = {
        get: async () => {
          const rows = await query('SELECT next_nonce FROM nonces WHERE key_role = $1', [role]);
          const value = rows[0]?.next_nonce;
          return value === null || value === undefined ? null : BigInt(value as string | number);
        },
        set: async (n) => {
          await query('UPDATE nonces SET next_nonce = $1 WHERE key_role = $2', [n.toString(), role]);
        },
      };

      return fn(store);
    });
  }
}
