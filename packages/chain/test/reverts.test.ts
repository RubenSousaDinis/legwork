import { describe, expect, it } from 'vitest';
import { toFunctionSelector } from 'viem';
import { ChainRevert } from '../src/adapter.js';
import { chainRevertFrom } from '../src/reverts.js';

/**
 * A route reads one thing off a failed write: the error name. It has to be the same name
 * whether the write went to `FakeChain` in a test or to Base Sepolia in production.
 */
describe('chainRevertFrom', () => {
  it('names a revert from its four-byte selector', () => {
    const err = { cause: { data: toFunctionSelector('InCooldown()') } };
    const revert = chainRevertFrom(err);

    expect(revert).toBeInstanceOf(ChainRevert);
    expect(revert?.name).toBe('InCooldown');
    expect(revert?.message).toBe('InCooldown');
  });

  it('names the OpenZeppelin reverts the frozen ABIs do not declare', () => {
    const err = { data: { data: toFunctionSelector('EnforcedPause()') } };
    expect(chainRevertFrom(err)?.name).toBe('EnforcedPause');
  });

  it('leaves anything that is not a known revert alone', () => {
    expect(chainRevertFrom(new Error('fetch failed'))).toBeUndefined();
    expect(chainRevertFrom({ data: '0xdeadbeef' })).toBeUndefined();
  });
});
