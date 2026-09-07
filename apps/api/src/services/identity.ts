// OWNER: T-30 — replace this file; do not edit from any other task
/**
 * The only source of an agent id. A request body never is one: anyone can type
 * `agent_id: 42`, and a mark is a permanent public record against whoever it names.
 *
 * So the id in the body is a **lookup hint**, and the payer is the fact. An id is accepted
 * iff `IdentityRegistry.ownerOf(id) == payer` or `getAgentWallet(id) == payer` — the two
 * ways ERC-8004 lets a registration point at a wallet. Neither matching, or a registry that
 * cannot be read, means no identity, which is the safe answer everywhere downstream:
 * nothing marks and `PostParams.buyerAgentId` stays `0n`.
 *
 * `IERC8004Identity` has no reverse lookup — there is no `idOf(address)` — so a payer that
 * claims nothing has no identity here even if it holds one on chain.
 *
 * This file also owns `defaultDeps()`, the one composition root the four T-30 services
 * share: the API's chain singleton (`../chain`) and the Drizzle client (`../db/client`),
 * the same two `hire.ts` uses. None of the four ever reads the environment — the signer key
 * lives inside the chain package's `TxQueue` and is never seen from here.
 */
import { isAddressEqual, type Address, type Hex } from 'viem';
import { ChainRevert, type ChainAdapter } from '@legwork/chain';
import { getChain } from '../chain';
import { getDb, type Db } from '../db/client';

// ----------------------------------------------------------------------- deps

/**
 * The reads these services make. A `Pick` of the adapter rather than a new interface, so a
 * test hands over a whole `FakeChain` and a drift in the adapter is a compile error here.
 */
export type ChainReader = Pick<
  ChainAdapter,
  'ownerOf' | 'getAgentWallet' | 'marked' | 'lastMarkAt' | 'markCooldown' | 'allowlistedBuyer' | 'now'
>;

/**
 * The one write T-30 makes. `ChainAdapter.mark` is the signer-role method — `LiveChain`
 * sends it on `queues.signer`, the separate `TxQueue` that holds the AbuseMark key, and
 * `FakeChain` records it as `{fn:'mark', role:'signer', args}`.
 */
export type MarkWriter = Pick<ChainAdapter, 'mark'>;

export interface ServiceDeps {
  chain: ChainReader;
  txQueue: MarkWriter;
  db: Db;
  now: () => Date;
}

/**
 * Production wiring, resolved lazily by every caller: `getChain()` and `getDb()` both boot
 * from config, and a path that decides not to touch the chain at all — a class that cannot
 * mark, a payer that claimed no id — must not open either.
 */
export function defaultDeps(): ServiceDeps {
  const chain = getChain();
  return { chain, txQueue: chain, db: getDb(), now: () => new Date() };
}

// -------------------------------------------------------------------- verify

export type UnverifiedReason = 'none_claimed' | 'not_owner' | 'lookup_failed';

export type VerifiedIdentity =
  | { verified: true; agentId: bigint }
  | { verified: false; agentId: null; reason: UnverifiedReason };

const unverified = (reason: UnverifiedReason): VerifiedIdentity => ({
  verified: false,
  agentId: null,
  reason,
});

/** A claim is text off the wire: anything that is not a plain non-negative integer is not an id. */
function parseClaim(claimed: string): bigint | null {
  if (!/^\d+$/.test(claimed.trim())) return null;
  try {
    return BigInt(claimed.trim());
  } catch {
    /* c8 ignore next -- the regexp already guarantees BigInt() parses */
    return null;
  }
}

/**
 * A revert is the registry answering "no such id"; anything else is the RPC failing to
 * answer at all. The difference decides `not_owner` against `lookup_failed`, and those are
 * not the same claim to make about a caller.
 */
function isRevert(err: unknown): boolean {
  return err instanceof ChainRevert;
}

/**
 * Resolves the claimed id against the ERC-8004 IdentityRegistry. Never throws: every failure
 * is a `verified: false` with the reason, because a caller that cannot be identified is an
 * ordinary caller, not an error.
 *
 * Deliberately uncached across requests — ownership can change, and a stale "yes" here is a
 * mark against the wrong agent.
 */
export async function verifyAgentId(
  claimed: string | undefined,
  payer: Address,
  deps?: ServiceDeps,
): Promise<VerifiedIdentity> {
  if (claimed === undefined || claimed.trim() === '') return unverified('none_claimed');

  const agentId = parseClaim(claimed);
  // Nothing to look up: an id that is not a number cannot be owned by anybody.
  if (agentId === null) return unverified('not_owner');

  const chain = (deps ?? defaultDeps()).chain;

  let owner: Address;
  try {
    owner = await chain.ownerOf(agentId);
  } catch (err) {
    return unverified(isRevert(err) ? 'not_owner' : 'lookup_failed');
  }
  if (isAddressEqual(owner, payer)) return { verified: true, agentId };

  let wallet: Address;
  try {
    wallet = await chain.getAgentWallet(agentId);
  } catch (err) {
    // An id with an owner but no bound wallet reverts here; that is a complete answer.
    return unverified(isRevert(err) ? 'not_owner' : 'lookup_failed');
  }
  return isAddressEqual(wallet, payer) ? { verified: true, agentId } : unverified('not_owner');
}

/**
 * T-16's call shape, kept so `hire.ts` compiles unchanged: it asks payer-first and reads
 * `{agentId, verified}`. `0n` is "no identity" there, which is exactly what
 * `PostParams.buyerAgentId` wants — the escrow's own sentinel for an unidentified buyer.
 */
export async function resolveAgentId(
  payer: Hex,
  claimed?: string,
  deps?: ServiceDeps,
): Promise<{ agentId: bigint; verified: boolean }> {
  const identity = await verifyAgentId(claimed, payer as Address, deps);
  return identity.verified ? { agentId: identity.agentId, verified: true } : { agentId: 0n, verified: false };
}
