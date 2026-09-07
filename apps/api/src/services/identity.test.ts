/**
 * T-30 §7-2: `verifyAgentId` over `FakeChain` — owner match, wallet match, neither, an
 * `ownerOf` revert, an RPC failure and no claim at all.
 *
 * The distinction the tests exist for is the last two: a registry that says "no such id" and
 * a registry that could not be reached are both `verified: false`, and they must stay
 * *different* reasons. `not_owner` is a statement about the caller; `lookup_failed` is a
 * statement about us, and marking on it would be marking on our own outage.
 */
import { ChainRevert, FakeChain } from '@legwork/chain';
import type { Address } from 'viem';
import { describe, expect, it } from 'vitest';
import { resolveAgentId, verifyAgentId, type ChainReader, type ServiceDeps } from './identity';

const PAYER = `0x${'a1'.repeat(20)}` as Address;
const OWNER = `0x${'b2'.repeat(20)}` as Address;
const WALLET = `0x${'c3'.repeat(20)}` as Address;
const AGENT_ID = 1207n;

/** Reads only: `verifyAgentId` never writes, so the rest of `ServiceDeps` is unreachable. */
function deps(chain: ChainReader): ServiceDeps {
  return { chain, txQueue: {} as ServiceDeps['txQueue'], db: {} as ServiceDeps['db'], now: () => new Date(0) };
}

/**
 * A reader bound to the fake, method by method. Spreading the instance would not do it:
 * `FakeChain`'s methods live on the prototype, so `{...fake}` is an object with no reads on
 * it at all — and one that still typechecks.
 */
function readerOf(fake: FakeChain, overrides: Partial<ChainReader> = {}): ChainReader {
  return {
    ownerOf: (id) => fake.ownerOf(id),
    getAgentWallet: (id) => fake.getAgentWallet(id),
    marked: (id, hash) => fake.marked(id, hash),
    lastMarkAt: (id) => fake.lastMarkAt(id),
    markCooldown: () => fake.markCooldown(),
    allowlistedBuyer: (buyer) => fake.allowlistedBuyer(buyer),
    now: () => fake.now(),
    ...overrides,
  };
}

function chainWith(identity: { owner: Address; wallet: Address }): FakeChain {
  const fake = new FakeChain();
  fake.setAgentIdentity(AGENT_ID, identity.owner, identity.wallet);
  return fake;
}

describe('verifyAgentId', () => {
  it('verifies when ownerOf is the payer', async () => {
    const fake = chainWith({ owner: PAYER, wallet: WALLET });
    await expect(verifyAgentId('1207', PAYER, deps(fake))).resolves.toEqual({
      verified: true,
      agentId: AGENT_ID,
    });
  });

  it('verifies when getAgentWallet is the payer and ownerOf is not', async () => {
    const fake = chainWith({ owner: OWNER, wallet: PAYER });
    await expect(verifyAgentId('1207', PAYER, deps(fake))).resolves.toEqual({
      verified: true,
      agentId: AGENT_ID,
    });
  });

  it('compares case-insensitively, the way isAddressEqual does', async () => {
    const fake = chainWith({ owner: PAYER.toUpperCase().replace('0X', '0x') as Address, wallet: WALLET });
    await expect(verifyAgentId('1207', PAYER, deps(fake))).resolves.toEqual({
      verified: true,
      agentId: AGENT_ID,
    });
  });

  it('is not_owner when neither view is the payer', async () => {
    const fake = chainWith({ owner: OWNER, wallet: WALLET });
    await expect(verifyAgentId('1207', PAYER, deps(fake))).resolves.toEqual({
      verified: false,
      agentId: null,
      reason: 'not_owner',
    });
  });

  it('is not_owner when ownerOf reverts — there is no such id', async () => {
    const fake = chainWith({ owner: OWNER, wallet: WALLET });
    const chain = readerOf(fake, {
      ownerOf: async () => {
        throw new ChainRevert('ERC721NonexistentToken');
      },
    });
    await expect(verifyAgentId('9999', PAYER, deps(chain))).resolves.toEqual({
      verified: false,
      agentId: null,
      reason: 'not_owner',
    });
  });

  it('is not_owner for a claim that is not an id at all, without a read', async () => {
    const fake = chainWith({ owner: PAYER, wallet: PAYER });
    let reads = 0;
    const chain = readerOf(fake, {
      ownerOf: async (id: bigint) => {
        reads += 1;
        return fake.ownerOf(id);
      },
    });
    await expect(verifyAgentId('not-an-id', PAYER, deps(chain))).resolves.toEqual({
      verified: false,
      agentId: null,
      reason: 'not_owner',
    });
    expect(reads).toBe(0);
  });

  it('is lookup_failed when the RPC fails rather than reverts', async () => {
    const fake = new FakeChain();
    const chain = readerOf(fake, {
      ownerOf: async () => {
        throw new Error('fetch failed');
      },
    });
    await expect(verifyAgentId('1207', PAYER, deps(chain))).resolves.toEqual({
      verified: false,
      agentId: null,
      reason: 'lookup_failed',
    });
  });

  it('is lookup_failed when the second view is the one that fails', async () => {
    const fake = chainWith({ owner: OWNER, wallet: WALLET });
    const chain = readerOf(fake, {
      getAgentWallet: async () => {
        throw new Error('fetch failed');
      },
    });
    await expect(verifyAgentId('1207', PAYER, deps(chain))).resolves.toEqual({
      verified: false,
      agentId: null,
      reason: 'lookup_failed',
    });
  });

  it('is none_claimed with no claim, and reads nothing', async () => {
    const fake = new FakeChain();
    let reads = 0;
    const chain = readerOf(fake, {
      ownerOf: async (id: bigint) => {
        reads += 1;
        return fake.ownerOf(id);
      },
      getAgentWallet: async (id: bigint) => {
        reads += 1;
        return fake.getAgentWallet(id);
      },
    });
    for (const claim of [undefined, '', '   ']) {
      await expect(verifyAgentId(claim, PAYER, deps(chain))).resolves.toEqual({
        verified: false,
        agentId: null,
        reason: 'none_claimed',
      });
    }
    expect(reads).toBe(0);
  });

  it('is not_owner for an unregistered id — FakeChain answers the zero address', async () => {
    const fake = new FakeChain();
    await expect(verifyAgentId('4242', PAYER, deps(fake))).resolves.toEqual({
      verified: false,
      agentId: null,
      reason: 'not_owner',
    });
  });
});

describe('resolveAgentId (T-16 call shape)', () => {
  it('answers 0n for anything unverified, which is PostParams.buyerAgentId sentinel', async () => {
    const fake = chainWith({ owner: OWNER, wallet: WALLET });
    await expect(resolveAgentId(PAYER, '1207', deps(fake))).resolves.toEqual({
      agentId: 0n,
      verified: false,
    });
    await expect(resolveAgentId(PAYER, undefined, deps(fake))).resolves.toEqual({
      agentId: 0n,
      verified: false,
    });
  });

  it('answers the verified id', async () => {
    const fake = chainWith({ owner: PAYER, wallet: WALLET });
    await expect(resolveAgentId(PAYER, '1207', deps(fake))).resolves.toEqual({
      agentId: AGENT_ID,
      verified: true,
    });
  });
});
