/**
 * A buyer token on disk is a bearer credential: `0600` in a `0700` directory, replaced by an
 * atomic rename. The concurrency case is the one that bites — two hires finishing at once would
 * each read the same file and rename over the other, and the lost token only shows up later,
 * when the buyer tries to approve a task they paid for.
 */
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FileTokenStore, MemoryTokenStore } from '../src/keychain';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'legwork-tokens-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('fileTokenStoreIs0600', () => {
  it('writes 0600 inside a 0700 directory and round-trips a token', async () => {
    const path = join(dir, 'nested', 'tokens.json');
    const store = new FileTokenStore(path);

    await store.set('7', 'buyer-token-7');

    expect(await store.get('7')).toBe('buyer-token-7');
    expect(await store.get('8')).toBeUndefined();
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(dir, 'nested'))).mode & 0o777).toBe(0o700);
  });

  it('keeps every token when two writes land at once', async () => {
    const path = join(dir, 'concurrent', 'tokens.json');
    const store = new FileTokenStore(path);

    await Promise.all(
      Array.from({ length: 8 }, (_, i) => store.set(String(i), `token-${i}`)),
    );

    for (let i = 0; i < 8; i += 1) {
      expect(await store.get(String(i))).toBe(`token-${i}`);
    }
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('reads an empty map rather than throwing when there is no file yet', async () => {
    expect(await new FileTokenStore(join(dir, 'absent', 'tokens.json')).get('7')).toBeUndefined();
  });

  it('MemoryTokenStore is the same contract, for tests and the hosted mount', async () => {
    const store = new MemoryTokenStore({ '1': 'a' });
    expect(await store.get('1')).toBe('a');
    await store.set('2', 'b');
    expect(await store.get('2')).toBe('b');
  });
});
