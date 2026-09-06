import { describe, expect, it } from 'vitest';
import { FakeChain } from '../src/fake.js';

/**
 * The call log and the armed revert that three wave-2 agents each rebuilt in their own test
 * files. Recorded on the fake itself so a route test asserts `chain.calls` and arms
 * `failNextWith('InCooldown')` without a Proxy in every package.
 */
describe('FakeChain call log', () => {
  it('records every write in order with its role and decoded args', async () => {
    const chain = new FakeChain();
    await chain.pause();
    await chain.unpause();
    await chain.seedWorker('0x00000000000000000000000000000000000000a1', 7n, 'ez1dp', 3);

    expect(chain.calls).toEqual([
      { fn: 'pause', role: 'owner', args: [] },
      { fn: 'unpause', role: 'owner', args: [] },
      {
        fn: 'seedWorker',
        role: 'owner',
        args: ['0x00000000000000000000000000000000000000a1', 7n, 'ez1dp', 3],
      },
    ]);
  });

  it('failNextWith arms exactly one revert, by the contract name, before any state moves', async () => {
    const chain = new FakeChain();
    chain.failNextWith('DuplicateNullifier');

    await expect(chain.pause()).rejects.toMatchObject({ name: 'DuplicateNullifier' });
    expect(await chain.paused()).toBe(false);

    await expect(chain.pause()).resolves.toMatchObject({ hash: expect.stringMatching(/^0x/) });
    expect(await chain.paused()).toBe(true);
    expect(chain.calls.map((c) => c.fn)).toEqual(['pause', 'pause']);
  });
});
