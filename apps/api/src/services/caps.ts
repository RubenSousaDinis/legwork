/**
 * The per-payer brake on `POST /tasks`: five open tasks, twenty-five dollars a day.
 *
 * It exists for one failure — an injected agent that posts a hundred small tasks and splits
 * the loss across all of them. `TaskEscrow` counts open tasks per buyer on chain and reverts
 * over the limit; this is the same limit read a block earlier, so an agent gets a 429 it can
 * act on instead of a revert it has paid gas to discover. The chain is still the authority.
 *
 * Two different questions, two different sources:
 *
 * - **open tasks** are counted from `tasks` — the live rows for this payer whose money is
 *   still locked. A released or refunded task frees a slot the moment it settles, with no
 *   ledger to keep in step.
 * - **the daily spend** is accumulated in `caps_ledger`, keyed by `(payer, day)` in UTC,
 *   because a refunded task still spent that day's budget and a count of live rows would
 *   quietly hand it back.
 *
 * Everything here is 6-decimal integer units; `daily_usdc` is converted once, at the edge,
 * for the 402 and 429 bodies an agent reads.
 */
import { and, inArray, sql } from 'drizzle-orm';
import {
  DAILY_CAP_USDC,
  MAX_OPEN_TASKS_PER_BUYER,
  fromUsdcUnits,
  toUsdcUnits,
} from '@legwork/shared';
import { getDb } from '../db/client';
import { capsLedger, tasks } from '../db/schema';

/** Echoed in the 402 body so an honest agent can read its own remaining budget. */
export interface RemainingBudget {
  open_tasks: number;
  daily_usdc: number;
}

export type CapCheck = { ok: true } | { ok: false; remaining: RemainingBudget };

/** A task whose money is still locked: it holds one of the payer's five slots. */
export const OPEN_STATES = ['open', 'claimed', 'submitted', 'disputed'] as const;

export const DAILY_CAP_UNITS = toUsdcUnits(DAILY_CAP_USDC);

/** What an unknown payer is told: the whole budget, because nothing is known against them. */
export const FULL_BUDGET: RemainingBudget = {
  open_tasks: MAX_OPEN_TASKS_PER_BUYER,
  daily_usdc: DAILY_CAP_USDC,
};

/**
 * Addresses arrive checksummed, lower case and anything between, and this is a map key in
 * two tables. Every read and every write goes through here.
 */
const key = (payer: string): string => payer.toLowerCase();

/** `caps_ledger.day`, UTC. A budget that rolled over at the operator's midnight would be a lie in Lisbon. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

interface Usage {
  openTasks: number;
  dailyUnits: bigint;
}

async function usageOf(payer: string, now: Date): Promise<Usage> {
  const db = getDb();

  const open = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(sql`lower(${tasks.payer}) = ${key(payer)}`, inArray(tasks.state, [...OPEN_STATES])));

  const spent = await db
    .select({ units: capsLedger.dailyUnits })
    .from(capsLedger)
    .where(and(sql`${capsLedger.payer} = ${key(payer)}`, sql`${capsLedger.day} = ${utcDay(now)}`));

  return {
    openTasks: Number(open[0]?.n ?? 0),
    dailyUnits: BigInt(spent[0]?.units ?? 0n),
  };
}

function budgetLeft(usage: Usage): RemainingBudget {
  const units = DAILY_CAP_UNITS - usage.dailyUnits;
  return {
    open_tasks: Math.max(0, MAX_OPEN_TASKS_PER_BUYER - usage.openTasks),
    daily_usdc: fromUsdcUnits(units > 0n ? units : 0n),
  };
}

/**
 * What is left, for the 402 body. `null` — no `X-Payer` header, or one that is not an
 * address — answers the full budget: the header is unauthenticated and informational, so a
 * caller can neither read someone else's budget from it nor be charged for guessing.
 */
export async function remaining(
  payer: string | null,
  now: Date = new Date(),
): Promise<RemainingBudget> {
  if (!payer) return { ...FULL_BUDGET };
  return budgetLeft(await usageOf(payer, now));
}

/**
 * The gate, run after screening and before any money or any chain write. `priceUnits` is the
 * full 3.45 the agent pays, not the 3.00 the worker keeps — the budget is the agent's spend.
 */
export async function check(
  payer: string,
  priceUnits: bigint,
  now: Date = new Date(),
): Promise<CapCheck> {
  const usage = await usageOf(payer, now);
  const overOpen = usage.openTasks >= MAX_OPEN_TASKS_PER_BUYER;
  const overDaily = usage.dailyUnits + priceUnits > DAILY_CAP_UNITS;
  if (overOpen || overDaily) return { ok: false, remaining: budgetLeft(usage) };
  return { ok: true };
}

/**
 * Called once the escrow is posted. The ledger's `open_tasks` is a running total of what was
 * posted today and never decremented — the live count comes from `tasks`; this column is how
 * many the payer opened, which is what a dashboard row means by it.
 */
export async function record(
  payer: string,
  priceUnits: bigint,
  now: Date = new Date(),
): Promise<void> {
  await getDb()
    .insert(capsLedger)
    .values({ payer: key(payer), day: utcDay(now), openTasks: 1, dailyUnits: priceUnits })
    .onConflictDoUpdate({
      target: [capsLedger.payer, capsLedger.day],
      set: {
        openTasks: sql`${capsLedger.openTasks} + 1`,
        dailyUnits: sql`${capsLedger.dailyUnits} + ${priceUnits}`,
      },
    });
}

/** The whole surface `hire()` takes as a dependency, so a test can hand it a stub. */
export interface Caps {
  remaining(payer: string | null): Promise<RemainingBudget>;
  check(payer: string, priceUnits: bigint): Promise<CapCheck>;
  record(payer: string, priceUnits: bigint): Promise<void>;
}

/** The real one, bound to a clock. `buildHireDeps()` passes the request's. */
export function caps(clock: () => Date = () => new Date()): Caps {
  return {
    remaining: (payer) => remaining(payer, clock()),
    check: (payer, priceUnits) => check(payer, priceUnits, clock()),
    record: (payer, priceUnits) => record(payer, priceUnits, clock()),
  };
}
