import {
  ABUSE_CLASSES,
  fromUsdcUnits,
  toUsdcUnits,
  type AbuseClass,
  type TaskType,
} from '@legwork/shared';
import { createSubgraphClient, type SubgraphClient } from '@legwork/subgraph-client';
import type {
  AgentData,
  DashboardData,
  DashboardTotals,
  FeaturedState,
  FeaturedTask,
  PoolData,
  PoolRow,
  PreflightData,
  PosterStatsData,
  ScreeningLine,
  TaskRowData,
} from './types';

/**
 * `DATA_MODE=live`: the same `DashboardData` T-10 froze, built from the API's
 * `/public/*` routes and the subgraph. Nothing demo-shaped is ever substituted — a
 * source that fails contributes its zero or empty value and says so in `sourceNotes`.
 *
 * Nothing here can carry a leak: `DashboardData` has no spec-text, payer or
 * exact-coordinate field, so the mapping below copies fields one at a time out of the
 * wire rows and never spreads one in.
 */

// ------------------------------------------------------------------ transport

/**
 * Isomorphic. On the server the API's own origin; in the browser the same-origin
 * `/api` prefix `next.config.ts` rewrites, so no CORS pre-flight and no origin baked
 * into the client bundle.
 */
export function apiBase(): string {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
  }
  return '/api';
}

export interface FetchedJson<T> {
  body: T;
  headers: Headers;
}

/** Every read is `no-store`: a dashboard that caches is a dashboard that lies. */
export async function fetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<FetchedJson<T> | null> {
  try {
    const response = await fetch(`${apiBase()}${path}`, { ...init, cache: 'no-store' });
    if (!response.ok) return null;
    return { body: (await response.json()) as T, headers: response.headers };
  } catch {
    return null;
  }
}

/**
 * The query URL is publishable and is the only subgraph credential the dashboard
 * knows. No key is passed here and none is read from the environment: without one the
 * client sends no `Authorization` header at all, so nothing secret can reach a bundle.
 */
export function subgraphClient(): SubgraphClient | null {
  const url = process.env.NEXT_PUBLIC_SUBGRAPH_QUERY_URL;
  if (!url) return null;
  return createSubgraphClient({ url });
}

// ------------------------------------------------------------------- wire rows

/**
 * What `/public/feed` sends. `api-contract.ts` is the authority and spells the row
 * `state` / `price_usdc`; §5's expected shape spells the same two fields `status` /
 * `amount_usdc`. Both are read, so the mapper is right either way. `title`,
 * `spec_hash` and `buyer_agent_id` are the fields the INTERFACE REQUEST asks for;
 * each has a fallback below and none is invented when absent.
 */
export interface WireFeedRow {
  task_id: string;
  status?: string;
  state?: string;
  task_type: TaskType;
  title?: string;
  amount_usdc?: number;
  price_usdc?: number;
  fee_usdc: number;
  area?: string;
  seeded?: boolean;
  posted_at: string;
  released_at?: string;
  spec_hash?: string;
  buyer_agent_id?: string | number;
  proof?: { hash?: string; captured_at?: string };
  tx?: { post?: string; claim?: string; submit?: string; release?: string };
}

export interface WireFeed {
  tasks?: WireFeedRow[];
}

/** One entry of `/public/refusals.recent`. Optional fields are read, never required. */
export interface WireRefusalRecent {
  at: string;
  task_type?: TaskType;
  class?: AbuseClass;
  reason?: string;
  rule_id?: string;
  spec_hash?: string;
  marked?: boolean;
  mark_tx?: string;
  agent_id?: string | number;
}

export interface WireRefusals {
  /** The post-interface-change record form. */
  counts?: Partial<Record<AbuseClass, number>>;
  /** The frozen contract's array form. Either is accepted. */
  classes?: { class: AbuseClass; count: number }[];
  total?: number;
  recent?: WireRefusalRecent[];
}

export interface WirePosters {
  distinct_external_buyers?: number;
  external_tasks?: number;
}

export interface WirePreflight {
  active?: number;
  verified?: number;
  seeded?: number;
  score_floor?: number;
  median_minutes?: number | null;
  median_source?: 'real' | 'seeded' | 'n/a';
  n_real?: number;
}

interface WireWorker {
  id: string;
  seeded: boolean;
  reset: boolean;
  area: string;
  completed: number;
  lastCompletedAt: string | null;
}

interface WireReleasedTask {
  id: string;
  worker: { id: string } | null;
  postedAt: string;
  releasedAt: string | null;
}

interface WirePool {
  workers?: WireWorker[];
  released?: WireReleasedTask[];
  recent?: { id: string; specHash: string }[];
}

interface WireOutcomes {
  outcomes?: { id: string }[];
}

// -------------------------------------------------------------------- queries

/**
 * Built on `client.query`, the escape hatch `@legwork/subgraph-client` documents for
 * exactly this. There is no second GraphQL fetcher in this app, and no field below is
 * one the frozen `subgraph/schema.graphql` cannot answer for — no coordinate, ever.
 */
export const POOL_QUERY = `
query DashboardPool($first: Int!, $recent: Int!) {
  workers(first: $first, orderBy: registeredAt, orderDirection: desc) {
    id
    seeded
    reset
    area
    completed
    lastCompletedAt
  }
  released: tasks(
    first: $first
    where: { state: "Released" }
    orderBy: releasedAt
    orderDirection: desc
  ) {
    id
    worker { id }
    postedAt
    releasedAt
  }
  recent: tasks(first: $recent, orderBy: postedAt, orderDirection: desc) {
    id
    specHash
  }
}
`;

/** `outcome: 1` is `OUTCOME.Paid` — the count the agent card reads as paid on proof. */
export const AGENT_OUTCOMES_QUERY = `
query AgentOutcomes($agentId: BigInt!, $first: Int!) {
  outcomes(first: $first, where: { agentId: $agentId, outcome: 1 }) {
    id
  }
}
`;

// -------------------------------------------------------------------- mapping

/** Bounded descriptions of an errand. Never the spec text — there is none to render. */
const TYPE_LABEL: Record<TaskType, string> = {
  'verify-open': 'open now?',
  'photo-of': 'photo of',
  'call-confirm': 'call to confirm',
  'compare-two': 'compare two',
};

const PASSED_REASON = 'schema ok · placeId resolved';
const MAX_FEED_ROWS = 20;
const MAX_SCREENING_LINES = 12;
const PAGE = 500;

function hhmm(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function label(type: TaskType | 'free-text'): string {
  return type === 'free-text' ? 'free text' : TYPE_LABEL[type];
}

/** `<type label> · area <geohash5>` — only when the API sent no title of its own. */
function composeTitle(type: TaskType | 'free-text', area?: string): string {
  return area ? `${label(type)} · area ${area}` : label(type);
}

function rowStatus(row: WireFeedRow): string {
  return row.status ?? row.state ?? 'open';
}

/** The posted rate the worker keeps. `price_usdc` and `amount_usdc` name the same field. */
function rowAmount(row: WireFeedRow): number {
  return row.amount_usdc ?? row.price_usdc ?? 0;
}

/**
 * Fee on top, summed in 6-decimal integer units so no float can shave a cent. The
 * agent pays 3.45 and the escrow locks 3.45 for a 3.00 errand; nothing here subtracts.
 */
function agentPaysFor(amount: number, fee: number): number {
  return fromUsdcUnits(toUsdcUnits(amount) + toUsdcUnits(fee));
}

const FEATURED_STATE: Record<string, FeaturedState> = {
  open: 'locked',
  claimed: 'locked',
  submitted: 'submitted',
  disputed: 'submitted',
  released: 'released',
  refunded: 'refunded',
};

/** `resolved` is whichever way the money actually went, read off the tx set. */
export function featuredStateOf(status: string, releaseTx?: string): FeaturedState {
  if (status === 'resolved') return releaseTx ? 'released' : 'refunded';
  return FEATURED_STATE[status] ?? 'locked';
}

function toFeatured(row: WireFeedRow): FeaturedTask {
  const amount = rowAmount(row);
  const fee = row.fee_usdc ?? 0;
  const total = agentPaysFor(amount, fee);
  const releaseTx = row.tx?.release;
  const featured: FeaturedTask = {
    taskId: row.task_id,
    state: featuredStateOf(rowStatus(row), releaseTx),
    agentPays: total,
    escrowLocked: total,
    workerReceives: amount,
    fee,
    postedAt: row.posted_at,
    proofPresent: Boolean(row.proof?.hash),
  };
  if (releaseTx) featured.releaseTx = releaseTx;
  if (row.proof?.captured_at) featured.proofCapturedAt = row.proof.captured_at;
  return featured;
}

function toFeedRow(row: WireFeedRow): TaskRowData {
  const amount = rowAmount(row);
  const fee = row.fee_usdc ?? 0;
  const status = rowStatus(row);
  const out: TaskRowData = {
    taskId: row.task_id,
    type: row.task_type,
    title: row.title ?? composeTitle(row.task_type, row.area),
    priceUsdc: amount,
    agentPaysUsdc: agentPaysFor(amount, fee),
    state: status as TaskRowData['state'],
    meta: row.area ? `posted ${hhmm(row.posted_at)} · ${row.area}` : `posted ${hhmm(row.posted_at)}`,
    seeded: row.seeded === true,
  };
  const tx = row.tx?.release ?? row.tx?.submit;
  if (tx) out.tx = tx;
  return out;
}

/**
 * A refused task moves no money, so the row it becomes carries none — `TaskRow`
 * renders `no money moved` instead of a price. It is a feed row and never a
 * `FeaturedTask`: rule (2), the meter cannot be moved by a refusal.
 */
function refusalToFeedRow(entry: WireRefusalRecent, index: number): TaskRowData {
  const type: TaskType | 'free-text' = entry.task_type ?? 'free-text';
  return {
    taskId: `refused-${entry.at}-${index}`,
    type,
    title: composeTitle(type),
    priceUsdc: 0,
    agentPaysUsdc: 0,
    state: 'refused',
    meta: `posted ${hhmm(entry.at)} · no money moved`,
    seeded: false,
    refusal: { class: entry.class ?? null, reason: entry.reason ?? entry.class ?? 'refused' },
  };
}

/** Newest first. `at` / `posted_at` are ISO instants, so a string compare would lie. */
function byTimeDesc(a: string, b: string): number {
  return Date.parse(b) - Date.parse(a);
}

export function refusalCounts(refusals: WireRefusals | null): Record<AbuseClass, number> {
  const counts = Object.fromEntries(ABUSE_CLASSES.map((c) => [c, 0])) as Record<AbuseClass, number>;
  if (!refusals) return counts;
  for (const c of ABUSE_CLASSES) {
    const fromRecord = refusals.counts?.[c];
    const fromArray = refusals.classes?.find((entry) => entry.class === c)?.count;
    counts[c] = fromRecord ?? fromArray ?? 0;
  }
  return counts;
}

/**
 * Totals are additive to §2, which does not name them: `DashboardData.totals` is
 * required and the meter renders it, so it is read off the funded rows exactly the way
 * T-10's demo adapter reads it. Refused rows are skipped — they never funded anything.
 */
function totalsOf(rows: WireFeedRow[]): DashboardTotals {
  const totals: DashboardTotals = { lockedUsdc: 0, releasedTodayUsdc: 0, refundedUsdc: 0 };
  for (const row of rows) {
    const amount = rowAmount(row);
    const escrow = agentPaysFor(amount, row.fee_usdc ?? 0);
    const state = featuredStateOf(rowStatus(row), row.tx?.release);
    if (state === 'released') totals.releasedTodayUsdc += amount;
    else if (state === 'refunded') totals.refundedUsdc += escrow;
    else totals.lockedUsdc += escrow;
  }
  return totals;
}

/**
 * The ERC-8004 id the registry knows is the number; `8004-1207` is the handle the
 * dashboard shows. The subgraph stores a `BigInt`, so the digits after the last dash
 * are what a subgraph variable can be. An id that is already digits passes through.
 */
export function subgraphAgentId(id: string): string | null {
  const digits = id.split('-').pop() ?? '';
  return /^\d+$/.test(digits) ? digits : null;
}

const EMPTY_PREFLIGHT: PreflightData = {
  active: 0,
  verified: 0,
  seeded: 0,
  scoreFloor: 0,
  medianMinutes: null,
  medianSource: 'n/a',
  nReal: 0,
};

export interface LiveDashboardOptions {
  /** `?task=<id>` pins the filmed task as the featured row. */
  taskId?: string;
}

/**
 * Every source read once, mapped into the frozen shape. The order is one round of
 * parallel reads, then `/public/preflight` — its `area` argument is the featured row's.
 */
export async function getLiveDashboardData(
  opts: LiveDashboardOptions = {},
): Promise<DashboardData> {
  const notes: string[] = [];
  const client = subgraphClient();

  const [feedResponse, refusalsResponse, postersResponse, pool] = await Promise.all([
    fetchJson<WireFeed>('/public/feed'),
    fetchJson<WireRefusals>('/public/refusals'),
    fetchJson<WirePosters>('/public/posters'),
    client
      ? client.query<WirePool>(POOL_QUERY, { first: PAGE, recent: MAX_FEED_ROWS }).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (!feedResponse) notes.push('feed unavailable');
  if (!refusalsResponse) notes.push('refusals unavailable');
  if (!postersResponse) notes.push('posters unavailable');
  if (!pool) notes.push('worker pool unavailable');

  const wireRows = (feedResponse?.body.tasks ?? []).slice();
  wireRows.sort((a, b) => byTimeDesc(a.posted_at, b.posted_at));

  // Rule (2): only a funded row can be featured, so a refusal has no path to the meter.
  const pinned = opts.taskId ? wireRows.find((r) => r.task_id === opts.taskId) : undefined;
  const newest = wireRows.find((r) => featuredStateOf(rowStatus(r), r.tx?.release) !== 'refunded');
  const featuredRow = pinned ?? newest;
  const featured = featuredRow ? toFeatured(featuredRow) : null;

  const preflightArea = featuredRow?.area ?? 'ez5ku';
  const preflightResponse = await fetchJson<WirePreflight>(
    `/public/preflight?task_type=verify-open&area=${encodeURIComponent(preflightArea)}`,
  );
  if (!preflightResponse) notes.push('preflight unavailable');

  // ---- feed: funded rows merged with refused ones, newest first, first 20.
  const recent = refusalsResponse?.body.recent ?? [];
  const merged: { at: string; row: TaskRowData }[] = [
    ...wireRows.map((row) => ({ at: row.posted_at, row: toFeedRow(row) })),
    ...recent.map((entry, i) => ({ at: entry.at, row: refusalToFeedRow(entry, i) })),
  ];
  merged.sort((a, b) => byTimeDesc(a.at, b.at));
  const feed = merged.slice(0, MAX_FEED_ROWS).map((m) => m.row);

  // ---- screening: every refusal, plus one PASSED line per funded row.
  const specById = new Map((pool?.recent ?? []).map((t) => [t.id, t.specHash]));
  const screening: ScreeningLine[] = [
    ...recent.map((entry): ScreeningLine => {
      const line: ScreeningLine = {
        at: entry.at,
        outcome: 'refused',
        taskType: entry.task_type ?? 'free-text',
        class: entry.class ?? null,
        reason: entry.reason ?? entry.class ?? 'refused',
        specHash: entry.spec_hash ?? '',
        marked: entry.marked === true,
      };
      if (entry.rule_id) line.ruleId = entry.rule_id;
      if (entry.mark_tx) line.markTx = entry.mark_tx;
      if (entry.agent_id !== undefined) line.agentId = String(entry.agent_id);
      return line;
    }),
    ...wireRows.map(
      (row): ScreeningLine => ({
        at: row.posted_at,
        outcome: 'passed',
        taskType: row.task_type,
        reason: PASSED_REASON,
        // The contract has no `spec_hash` on a feed row; the subgraph `Task` does.
        specHash: row.spec_hash ?? specById.get(row.task_id) ?? '',
        marked: false,
      }),
    ),
  ]
    .sort((a, b) => byTimeDesc(a.at, b.at))
    .slice(0, MAX_SCREENING_LINES);

  // ---- agent
  const marked = recent
    .filter((entry) => entry.marked === true)
    .sort((a, b) => byTimeDesc(a.at, b.at));
  const newestMarked = marked[0];
  const agentId =
    (featuredRow?.buyer_agent_id !== undefined ? String(featuredRow.buyer_agent_id) : undefined) ??
    (newestMarked?.agent_id !== undefined ? String(newestMarked.agent_id) : undefined) ??
    '—';
  const marks = marked.filter(
    (entry) => entry.agent_id !== undefined && String(entry.agent_id) === agentId,
  ).length;

  let paidOnProof = 0;
  const numericAgentId = subgraphAgentId(agentId);
  if (client && numericAgentId) {
    const outcomes = await client
      .query<WireOutcomes>(AGENT_OUTCOMES_QUERY, { agentId: numericAgentId, first: PAGE })
      .catch(() => null);
    if (outcomes) paidOnProof = outcomes.outcomes?.length ?? 0;
    else notes.push('outcomes unavailable');
  }

  const agent: AgentData = { id: agentId, score: null, paidOnProof, marks };
  if (marks > 0 && newestMarked?.class) agent.lastMarkClass = newestMarked.class;

  // ---- pool
  const workers = (pool?.workers ?? []).filter((w) => !w.reset);
  const realWorkers = workers.filter((w) => !w.seeded);
  const highlightedWorker = realWorkers
    .slice()
    .sort((a, b) => Number(b.lastCompletedAt ?? 0) - Number(a.lastCompletedAt ?? 0))[0];
  const rows: PoolRow[] = workers.map((w) => ({
    id: poolWorkerId(w.id),
    seeded: w.seeded,
    area: w.area,
    completed: w.completed,
  }));
  const poolData: PoolData = {
    real: realWorkers.length,
    seeded: (pool?.workers ?? []).filter((w) => w.seeded).length,
    rows,
  };
  if (highlightedWorker) {
    const newestReleased = (pool?.released ?? [])
      .filter((t) => t.worker?.id.toLowerCase() === highlightedWorker.id.toLowerCase())
      .sort((a, b) => Number(b.releasedAt ?? 0) - Number(a.releasedAt ?? 0))[0];
    poolData.highlighted = {
      id: poolWorkerId(highlightedWorker.id),
      level: process.env.WORLD_CREDENTIAL_LEVEL === 'orb' ? 'orb' : 'selfie',
    };
    if (newestReleased?.releasedAt) {
      poolData.highlighted.minutesReal = Math.round(
        (Number(newestReleased.releasedAt) - Number(newestReleased.postedAt)) / 60,
      );
    }
  }

  const p = preflightResponse?.body;
  const preflight: PreflightData = p
    ? {
        active: p.active ?? 0,
        verified: p.verified ?? 0,
        seeded: p.seeded ?? 0,
        scoreFloor: p.score_floor ?? 0,
        medianMinutes: p.median_minutes ?? null,
        medianSource: p.median_source ?? 'n/a',
        nReal: p.n_real ?? 0,
      }
    : EMPTY_PREFLIGHT;

  const posterStats: PosterStatsData = {
    distinctExternalBuyers: postersResponse?.body.distinct_external_buyers ?? 0,
    externalTasks: postersResponse?.body.external_tasks ?? 0,
  };

  const data: DashboardData = {
    dataMode: 'live',
    featured,
    totals: totalsOf(wireRows),
    feed,
    agent,
    pool: poolData,
    screening,
    preflight,
    posterStats,
    generatedAt: feedResponse?.headers.get('date')
      ? new Date(feedResponse.headers.get('date') as string).toISOString()
      : new Date().toISOString(),
  };
  if (notes.length > 0) data.sourceNotes = notes;
  return data;
}

/** `w-` plus the last four hex of the address. The address itself is never a handle. */
export function poolWorkerId(address: string): string {
  return `w-${address.slice(-4)}`;
}

export interface LiveRefusals {
  counts: Record<AbuseClass, number>;
  total: number;
  /** `counts unavailable` when `/public/refusals` did not answer. Never a demo number. */
  note?: string;
}

/**
 * The `/refusals` page reads counts only. `recent` is deliberately not returned: the
 * page renders class counts and hand-picked examples, never a raw live feed.
 */
export async function getLiveRefusals(): Promise<LiveRefusals> {
  const response = await fetchJson<WireRefusals>('/public/refusals');
  const counts = refusalCounts(response?.body ?? null);
  const total =
    response?.body.total ?? Object.values(counts).reduce((sum, n) => sum + n, 0);
  return response ? { counts, total } : { counts, total, note: 'refusals unavailable' };
}
