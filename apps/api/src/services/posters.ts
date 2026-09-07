// OWNER: T-30 — replace this file; do not edit from any other task
/**
 * Who has paid for a task, and whether they are one of ours.
 *
 * `posters` is the honesty ledger behind `/public/posters` (T-19) and the dashboard's
 * "distinct external buyers" figure: an allowlisted payer is the operator's own demo wallet,
 * and everybody else is a real outside agent. Counting the second group is the claim the
 * submission makes, so `allowlisted` is read from `ITaskEscrow.allowlistedBuyer` — the chain
 * decides who is seeded, never an environment variable and never a hard-coded list.
 *
 * `first_seen` is written once and never rewritten. `agent_id` is filled in later when a
 * payer that first hired anonymously comes back with an id that verifies.
 */
import { sql } from 'drizzle-orm';
import type { Address } from 'viem';
import { posters } from '../db/schema';
import { defaultDeps, type ChainReader, type ServiceDeps } from './identity';

export { defaultDeps, type ServiceDeps } from './identity';

/**
 * What the poster ledger reads: the escrow's allowlist, the database and a clock. Narrower
 * than `ServiceDeps` so `hire()` can hand over the deps it already holds — it never carries a
 * signer key or a registry reader, and this ledger has no use for either.
 */
export interface PosterDeps {
  chain: Pick<ChainReader, 'allowlistedBuyer'>;
  db: ServiceDeps['db'];
  now: ServiceDeps['now'];
}

export interface PosterRow {
  payer: string;
  agent_id: string | null;
  first_seen: Date;
  allowlisted: boolean;
}

export interface PosterList {
  posters: PosterRow[];
  /** "external" is `allowlisted === false`: a payer the operator never put on the list. */
  distinct_external_buyers: number;
}

/**
 * The allowlist barely changes and every accepted task reads it, so one minute of cache per
 * payer removes a round trip from the hot path without letting a stale answer outlive a
 * demo. Keyed by lowercase address; `resetPosterCacheForTests()` empties it.
 */
const ALLOWLIST_TTL_MS = 60_000;
const allowlistCache = new Map<string, { allowlisted: boolean; at: number }>();

export function resetPosterCacheForTests(): void {
  allowlistCache.clear();
}

async function allowlistedBuyer(payer: Address, deps: PosterDeps): Promise<boolean> {
  const key = payer.toLowerCase();
  const now = deps.now().getTime();
  const hit = allowlistCache.get(key);
  if (hit && now - hit.at < ALLOWLIST_TTL_MS) return hit.allowlisted;
  const allowlisted = await deps.chain.allowlistedBuyer(payer);
  allowlistCache.set(key, { allowlisted, at: now });
  return allowlisted;
}

/**
 * Called on every **accepted** task — a refused one moves no money and posts nobody.
 *
 * `agentId` is the verified id or `null`; an unverified claim never reaches this row, which
 * is why `/public/posters` can say "agent id" and mean it.
 */
export async function upsertPoster(
  { payer, agentId }: { payer: Address; agentId: bigint | null },
  deps?: PosterDeps,
): Promise<void> {
  const d = deps ?? defaultDeps();
  const allowlisted = await allowlistedBuyer(payer, d);
  const agentIdText = agentId === null ? null : agentId.toString();

  await d.db
    .insert(posters)
    .values({ payer, agentId: agentIdText, firstSeen: d.now(), allowlisted })
    .onConflictDoNothing({ target: posters.payer });

  // `first_seen` is never in this update: the second task a payer buys does not move the
  // first time we saw them. The id fills in only when there is one — a later anonymous task
  // must not erase an id an earlier one verified.
  await d.db
    .update(posters)
    .set({ ...(agentIdText === null ? {} : { agentId: agentIdText }), allowlisted })
    .where(sql`lower(${posters.payer}) = ${payer.toLowerCase()}`);
}

/** T-19's `/public/posters`, in one read. Oldest first, so the list reads as a history. */
export async function listPosters(deps?: Pick<PosterDeps, 'db'>): Promise<PosterList> {
  const d = deps ?? defaultDeps();
  const rows = await d.db.select().from(posters).orderBy(posters.firstSeen);
  const list: PosterRow[] = rows.map((r) => ({
    payer: r.payer,
    agent_id: r.agentId,
    first_seen: r.firstSeen,
    allowlisted: r.allowlisted,
  }));
  return {
    posters: list,
    distinct_external_buyers: list.filter((p) => p.allowlisted === false).length,
  };
}
