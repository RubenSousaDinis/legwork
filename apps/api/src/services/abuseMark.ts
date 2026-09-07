// OWNER: T-30 — replace this file; do not edit from any other task
/**
 * Marks a refusal against a verified agent id, and only against a verified one.
 *
 * The order below is the whole design, and it is the order of `02-architecture.md`:
 *
 * ```
 * 1. is this one of the six abuse classes?   no -> not_markable. No read. No write. No row.
 * 2. does the payer own the claimed id?      no -> marks_log row, no write
 * 3. marked(agentId, specHash) already?      yes -> marks_log row, no write
 * 4. lastMarkAt + markCooldown() > now?      yes -> marks_log row, no write
 * 5. AbuseMark.mark(...) on the signer key   MarkCooldown -> cooldown; else tx_failed
 * ```
 *
 * Step 1 is first because a schema error, a cap, a type gate and a region miss are all
 * refusals that must never touch the chain — `10-schemas.md §10` is explicit that only the
 * six classes mark, and the cheapest way to honour that is to leave before anything is read.
 *
 * Step 4 duplicates a check the contract also makes. It is not redundant: a pre-check that
 * passes and then loses a race still comes back as `MarkCooldown`, decoded from the
 * `IAbuseMark` ABI in step 5, so both roads end at the same outcome. The cooldown itself is
 * `markCooldown()` read from the contract — never a duration written here, because the
 * filmed run lowers it and a constant would quietly disagree.
 *
 * A mark never touches USDC. A refused task moves no money; this is a feedback entry on an
 * ERC-8004 identity, operator-attested in v0.
 */
import { randomUUID } from 'node:crypto';
import { ChainRevert, chainRevertFrom } from '@legwork/chain';
import { ABUSE_CLASS_ID, abuseClassById, type AbuseClass } from '@legwork/shared';
import type { Address, Hex } from 'viem';
import { marksLog } from '../db/schema';
import { defaultDeps, verifyAgentId, type ServiceDeps } from './identity';

export { defaultDeps, type ServiceDeps } from './identity';

// --------------------------------------------------------------------- shapes

/**
 * The `marked: false` outcomes, as `marks_log.outcome` stores them. Named rather than
 * written inline as §2's `MarkResult['outcome']`, which TypeScript cannot index out of a
 * union whose other arm has no such property.
 */
export type MarkOutcome =
  | 'not_markable'
  | 'no_identity'
  | 'not_owner'
  | 'already_marked'
  | 'cooldown'
  | 'tx_failed';

export type MarkResult =
  | { marked: true; mark_tx: Hex; agent_id: string }
  | { marked: false; outcome: MarkOutcome; agent_id: string | null };

/**
 * What a human reads. T-26's dashboard and T-19's `/public/refusals` render these strings
 * and never the raw codes — "logged, cooldown" is a fact about our rate limit, not an error
 * the agent did something about, and it should not read like one.
 */
export const MARK_OUTCOME_LABEL: Record<MarkOutcome | 'marked', string> = {
  marked: 'marked',
  cooldown: 'logged, cooldown',
  no_identity: 'no identity',
  not_owner: 'claimed id not owned by payer',
  already_marked: 'already marked',
  tx_failed: 'mark failed — logged',
  not_markable: 'not a marking class',
};

/** The six, and only the six. `ABUSE_CLASS_ID` is 1-based and `IAbuseMark` rejects anything else. */
export function isMarkableClass(x: unknown): x is AbuseClass {
  if (typeof x !== 'string') return false;
  const id = (ABUSE_CLASS_ID as Record<string, number | undefined>)[x];
  return id !== undefined && id >= 1 && id <= 6;
}

// ----------------------------------------------------------------------- core

interface MarkLogRow {
  payer: Address;
  claimed: string | null;
  agentId: bigint | null;
  cls: AbuseClass;
  specHash: Hex;
  outcome: MarkOutcome | 'marked';
  tx: Hex | null;
}

/** Every decision from step 2 onwards leaves one of these. Step 1 leaves nothing. */
async function writeMarkLog(row: MarkLogRow, deps: ServiceDeps): Promise<void> {
  await deps.db.insert(marksLog).values({
    id: randomUUID(),
    at: deps.now(),
    payer: row.payer,
    agentIdClaimed: row.claimed,
    agentId: row.agentId === null ? null : row.agentId.toString(),
    class: row.cls,
    specHash: row.specHash,
    outcome: row.outcome,
    tx: row.tx,
  });
}

/** `ChainRevert` from `FakeChain`, or a node's revert payload decoded against the ABIs. */
function revertName(err: unknown): string | undefined {
  if (err instanceof ChainRevert) return err.name;
  return chainRevertFrom(err)?.name;
}

/**
 * Steps 3–5, for an id that is already known to belong to the payer. Split out because the
 * legacy `hire.ts` entry point arrives with the verification already done and must not
 * repeat it.
 */
async function markVerified(
  cls: AbuseClass,
  specHash: Hex,
  payer: Address,
  agentId: bigint,
  claimed: string | null,
  deps: ServiceDeps,
): Promise<MarkResult> {
  const agent_id = agentId.toString();
  const log = (outcome: MarkOutcome | 'marked', tx: Hex | null) =>
    writeMarkLog({ payer, claimed, agentId, cls, specHash, outcome, tx }, deps);

  // 3. Idempotent per (agentId, specHash). The same refusal twice is one mark.
  if (await deps.chain.marked(agentId, specHash)) {
    await log('already_marked', null);
    return { marked: false, outcome: 'already_marked', agent_id };
  }

  // 4. One mark per agent per rolling `markCooldown()`, read from the contract.
  const [lastMarkAt, cooldown, now] = await Promise.all([
    deps.chain.lastMarkAt(agentId),
    deps.chain.markCooldown(),
    deps.chain.now(),
  ]);
  if (lastMarkAt !== 0n && now < lastMarkAt + cooldown) {
    await log('cooldown', null);
    return { marked: false, outcome: 'cooldown', agent_id };
  }

  // 5. The only chain write this file makes, on the signer key.
  try {
    const tx = await deps.txQueue.mark(agentId, ABUSE_CLASS_ID[cls], specHash);
    await log('marked', tx.hash);
    return { marked: true, mark_tx: tx.hash, agent_id };
  } catch (err) {
    // The pre-check can lose a race; the contract is the authority on its own rate limit.
    const outcome: MarkOutcome = revertName(err) === 'MarkCooldown' ? 'cooldown' : 'tx_failed';
    await log(outcome, null);
    return { marked: false, outcome, agent_id };
  }
}

// ------------------------------------------------------------------ the entry

/** T-16's `hire.ts` call shape, kept so the merged route compiles unchanged. */
export interface LegacyMarkParams {
  agentId: bigint;
  verified: boolean;
  classId: number;
  specHash: Hex;
  payer: Hex;
  /** The id the request body claimed, verified or not — `marks_log.agent_id_claimed`. */
  claimed?: string;
}

export type LegacyMarkResult = { marked: false } | { marked: true; tx: Hex };

export function markIfIdentified(p: LegacyMarkParams, deps?: ServiceDeps): Promise<LegacyMarkResult>;
export function markIfIdentified(
  cls: AbuseClass,
  specHash: Hex,
  payer: Address,
  agentId?: string,
  deps?: ServiceDeps,
): Promise<MarkResult>;
/**
 * `markIfIdentified(class, specHash, payer, claimedId?)` — the §2 entry point.
 *
 * `agentId` is the id the request body claimed. It is a hint: `verifyAgentId` resolves it
 * against the payer, and an id that does not resolve marks nobody.
 */
export function markIfIdentified(
  clsOrLegacy: AbuseClass | LegacyMarkParams,
  specHashOrDeps?: Hex | ServiceDeps,
  payer?: Address,
  agentId?: string,
  deps?: ServiceDeps,
): Promise<MarkResult | LegacyMarkResult> {
  // `typeof null === 'object'`, and `class: null` is exactly what a refusal outside the six
  // arrives as — so the null check is the one that keeps it on the `not_markable` road.
  if (clsOrLegacy !== null && typeof clsOrLegacy === 'object') {
    // In the object form the second positional argument is the deps, when there is one.
    return legacyMark(clsOrLegacy, typeof specHashOrDeps === 'object' ? specHashOrDeps : deps);
  }
  return markByClass(clsOrLegacy, specHashOrDeps as Hex, payer as Address, agentId, deps);
}

async function markByClass(
  cls: AbuseClass,
  specHash: Hex,
  payer: Address,
  agentId: string | undefined,
  deps?: ServiceDeps,
): Promise<MarkResult> {
  // 1. Before any read, any write and any row: is this even a marking class?
  if (!isMarkableClass(cls)) return { marked: false, outcome: 'not_markable', agent_id: null };

  const d = deps ?? defaultDeps();
  const claimed = agentId ?? null;

  // 2. The subject of a mark is the payer's verified identity, never the body's claim.
  const identity = await verifyAgentId(agentId, payer, d);
  if (!identity.verified) {
    // A registry we could not read is not a payer we may mark, so `lookup_failed` lands on
    // `no_identity` too: the only claim we can honestly make is that we have no identity.
    const outcome: MarkOutcome = identity.reason === 'not_owner' ? 'not_owner' : 'no_identity';
    await writeMarkLog({ payer, claimed, agentId: null, cls, specHash, outcome, tx: null }, d);
    return { marked: false, outcome, agent_id: null };
  }

  return markVerified(cls, specHash, payer, identity.agentId, claimed, d);
}

/**
 * The T-16 shape, mapped onto the same core. It arrives post-verification, so an unverified
 * caller is `no_identity` here without a second registry read.
 */
async function legacyMark(p: LegacyMarkParams, deps?: ServiceDeps): Promise<LegacyMarkResult> {
  const cls = p.classId >= 1 && p.classId <= 6 ? abuseClassById(p.classId) : null;
  if (cls === null) return { marked: false };

  const d = deps ?? defaultDeps();
  const payer = p.payer as Address;
  const claimed = p.claimed ?? null;
  if (!p.verified) {
    await writeMarkLog(
      { payer, claimed, agentId: null, cls, specHash: p.specHash, outcome: 'no_identity', tx: null },
      d,
    );
    return { marked: false };
  }

  const result = await markVerified(cls, p.specHash, payer, p.agentId, claimed, d);
  return result.marked ? { marked: true, tx: result.mark_tx } : { marked: false };
}
