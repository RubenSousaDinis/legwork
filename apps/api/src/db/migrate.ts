/**
 * Applies `drizzle/` to whatever `DATABASE_URL` points at. Run by `pnpm drizzle:migrate`;
 * the pglite twin in `test/db.ts` applies the same folder through its own driver, which is
 * the only way the tests can be evidence about production.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { getConfig } from '../config';

/** Absolute, because a migration must not depend on the caller's working directory. */
export const MIGRATIONS_FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'drizzle',
);

export async function runMigrations(): Promise<void> {
  const client = postgres(getConfig().DATABASE_URL, { max: 1, prepare: false });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end({ timeout: 5 });
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  runMigrations().then(
    () => process.exit(0),
    (err: unknown) => {
      process.exitCode = 1;
      throw err;
    },
  );
}
