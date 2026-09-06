import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Hex } from 'viem';
import {
  MemoryIdempotencyStore,
  SqlIdempotencyStore,
  type IdempotencyStore,
  type SqlExecutor,
} from '../src/idempotency.js';

/**
 * Mirrors the frozen `idempotency` table in `apps/api/src/db/schema.ts`: `auth_nonce`
 * primary key, a nullable `task_id`, a nullable `settle_tx`.
 */
const CREATE_TABLE = `
  CREATE TABLE idempotency (
    auth_nonce text primary key,
    task_id bigint,
    settle_tx text,
    created_at timestamptz not null default now()
  )
`;

const db = new PGlite();
const exec: SqlExecutor = async (text, params) =>
  (await db.query(text, params)).rows as Record<string, unknown>[];

beforeAll(async () => {
  await db.exec(CREATE_TABLE);
});

afterAll(async () => {
  await db.close();
});

const stores: [string, () => IdempotencyStore][] = [
  ['MemoryIdempotencyStore', () => new MemoryIdempotencyStore()],
  ['SqlIdempotencyStore', () => new SqlIdempotencyStore(exec)],
];

let nonceCounter = 0;
function nextNonce(): Hex {
  nonceCounter++;
  return `0x${nonceCounter.toString(16).padStart(64, '0')}` as Hex;
}

describe('idempotency', () => {
  it('replayedNonceReturnsStoredTask', async () => {
    for (const [name, make] of stores) {
      const store = make();
      const n = nextNonce();
      const tx = `0x${'ab'.repeat(32)}` as Hex;

      expect(await store.reserve(n), name).toEqual({ state: 'reserved' });
      // The same authorization arriving again while the first request is still posting.
      expect(await store.reserve(n), name).toEqual({ state: 'in_progress' });

      await store.complete(n, { task_id: 7, settle_tx: null });
      await store.setSettleTx(n, tx);

      // The replay: the agent is handed back the task it already paid for, not a new one.
      expect(await store.reserve(n), name).toEqual({
        state: 'done',
        task_id: 7,
        settle_tx: tx,
      });

      // A reservation whose post never happened frees the nonce again.
      const m = nextNonce();
      expect(await store.reserve(m), name).toEqual({ state: 'reserved' });
      await store.release(m);
      expect(await store.reserve(m), name).toEqual({ state: 'reserved' });

      // Releasing a settled row is a no-op: it is the record of a charge.
      await store.release(n);
      expect(await store.reserve(n), name).toEqual({
        state: 'done',
        task_id: 7,
        settle_tx: tx,
      });
    }
  });

  it('the nonce is matched case-insensitively', async () => {
    for (const [name, make] of stores) {
      const store = make();
      const lower = nextNonce();
      const upper = lower.toUpperCase().replace('0X', '0x') as Hex;

      expect(await store.reserve(lower), name).toEqual({ state: 'reserved' });
      expect(await store.reserve(upper), name).toEqual({ state: 'in_progress' });
    }
  });
});
