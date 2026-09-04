/**
 * The pglite twin of the Supabase database: the same migration folder, applied by the same
 * Drizzle migrator, in-process and in memory.
 *
 * A cloud agent has no `DATABASE_URL` and no network, so this is the only database the test
 * suite ever sees — and because it runs `drizzle/` rather than a hand-written fixture, a
 * column the migration forgot fails here too.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { sql, type SQL, type SQLChunk } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { setDbForTests, type Db } from '../src/db/client';
import { MIGRATIONS_FOLDER } from '../src/db/migrate';

export interface TestDb {
  db: Db;
  rawQuery: (text: string, params?: readonly unknown[]) => Promise<Record<string, unknown>[]>;
  close: () => Promise<void>;
}

/** Same `$1` binding as `src/db/client.ts`, over the pglite driver. */
function parameterise(text: string, params: readonly unknown[]): SQL {
  const parts = text.split(/\$(\d+)/);
  const chunks: SQLChunk[] = parts.map((part, i) =>
    i % 2 === 0 ? sql.raw(part) : sql`${params[Number(part) - 1]}`,
  );
  return sql.join(chunks, sql.raw(''));
}

/**
 * A fresh database per call, already installed as the one `getDb()` returns — so a route
 * under test needs no wiring beyond `await createTestDb()`.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const pg = drizzle(client, { schema });
  await migrate(pg, { migrationsFolder: MIGRATIONS_FOLDER });

  const db = pg as unknown as Db;
  setDbForTests(db);

  const rawQuery = async (text: string, params: readonly unknown[] = []) => {
    const result = await pg.execute(parameterise(text, params));
    const rows = (result as { rows?: unknown }).rows;
    return (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
  };

  return {
    db,
    rawQuery,
    close: async () => {
      setDbForTests(undefined);
      await client.close();
    },
  };
}
