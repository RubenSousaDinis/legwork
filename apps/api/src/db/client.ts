/**
 * One Drizzle client for the whole instance.
 *
 * `prepare: false` because Supabase's transaction pooler hands a connection back after every
 * statement, so a prepared statement is never there the second time. `max: 5` because a
 * serverless instance that opens more than a handful exhausts the pooler long before it
 * exhausts itself.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql, type SQL, type SQLChunk } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { getConfig } from '../config';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let db: Db | undefined;
let sqlClient: ReturnType<typeof postgres> | undefined;

export function getDb(): Db {
  if (db) return db;
  const config = getConfig();
  sqlClient = postgres(config.DATABASE_URL, { max: 5, prepare: false });
  db = drizzle(sqlClient, { schema }) as unknown as Db;
  return db;
}

/**
 * Turns `'select * from t where a = $1'` into a Drizzle `SQL` with the parameter bound.
 *
 * The split keeps the placeholder's number, so `$1` twice in one statement binds the same
 * value twice and the caller never has to repeat it.
 */
function parameterise(text: string, params: readonly unknown[]): SQL {
  const parts = text.split(/\$(\d+)/);
  const chunks: SQLChunk[] = parts.map((part, i) =>
    i % 2 === 0 ? sql.raw(part) : sql`${params[Number(part) - 1]}`,
  );
  return sql.join(chunks, sql.raw(''));
}

/** postgres-js returns the rows; pglite returns `{rows}`. Callers see one shape. */
function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/**
 * The escape hatch for the statements Drizzle's builder cannot express — a `NUMERIC(78,0)`
 * comparison, an `ON CONFLICT … RETURNING` idempotency insert. Values are always bound,
 * never interpolated, so `text` is the only thing a caller ever writes by hand.
 */
export async function rawQuery(
  text: string,
  params: readonly unknown[] = [],
): Promise<Record<string, unknown>[]> {
  return rowsOf(await getDb().execute(parameterise(text, params)));
}

export type TxQuery = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/**
 * One transaction, with the same `$1` binding as `rawQuery`. Shaped to satisfy
 * `@legwork/chain`'s `SqlExecutor` structurally, so this file still imports nothing from it.
 */
export function transaction<T>(fn: (query: TxQuery) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) =>
    fn(async (text, params = []) => rowsOf(await tx.execute(parameterise(text, params)))),
  );
}

/** Vitest only: point `getDb()` and `rawQuery()` at the pglite twin from `test/db.ts`. */
export function setDbForTests(next: Db | undefined): void {
  db = next;
}

/** Closes the pool. Scripts call it; a serverless instance never does. */
export async function closeDb(): Promise<void> {
  await sqlClient?.end({ timeout: 5 });
  sqlClient = undefined;
  db = undefined;
}
