/**
 * `DATABASE_URL=pglite://memory` is the e2e harness's database: the same migrations, in process.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../config';
import { closeDb, dbReady, getDb, rawQuery } from './client';

afterEach(async () => {
  await closeDb();
  resetConfigForTests();
});

describe('pglite database url', () => {
  it('migrates an in-memory pglite and serves queries once dbReady resolves', async () => {
    resetConfigForTests({ DATABASE_URL: 'pglite://memory' });
    await closeDb();
    expect(() => getDb()).toThrow(/dbReady/);

    await dbReady();
    const rows = await rawQuery('select count(*)::int as n from nonces');
    expect(rows[0]?.n).toBe(0);
    const tables = await rawQuery("select count(*)::int as n from information_schema.tables where table_name = 'tasks'");
    expect(tables[0]?.n).toBe(1);
  });

  it('resolves immediately for a Postgres url and opens nothing', async () => {
    resetConfigForTests({ DATABASE_URL: 'postgres://never-dialed@db.invalid/legwork' });
    await closeDb();
    await expect(dbReady()).resolves.toBeUndefined();
  });
});
