import type { AbuseClass, TaskStateName, TaskType } from '@legwork/shared';

/**
 * The shape every dashboard surface renders. `lib/data/demo.ts` builds it from
 * `demo-data.json`; T-26 builds the same shape from `/public/*` and the subgraph.
 * Nothing below carries a coordinate, a raw spec text or a requester identity.
 */

export type DataMode = 'demo' | 'live';

/** The four states the escrow meter can be in. A refused task is not one of them. */
export type FeaturedState = 'locked' | 'submitted' | 'released' | 'refunded';

/**
 * Derived from the frozen `TASK_STATE` enum rather than retyped, plus `refused` —
 * which is a screening outcome and never an on-chain state.
 */
export type TaskRowState = Exclude<Lowercase<TaskStateName>, 'none'> | 'refused';

export interface FeaturedTask {
  taskId: string;
  state: FeaturedState;
  agentPays: number;
  escrowLocked: number;
  workerReceives: number;
  fee: number;
  postedAt: string;
  releaseTx?: string;
  proofPresent: boolean;
  /**
   * Additive to the §6 table: the meter may not say RELEASED without a proof
   * reference beside it, and `proofPresent` alone carries no timestamp to show.
   * Optional — the meter falls back to `proof ✓ on file`.
   */
  proofCapturedAt?: string;
}

export interface TaskRowData {
  taskId: string;
  type: TaskType | 'free-text';
  title: string;
  priceUsdc: number;
  agentPaysUsdc: number;
  state: TaskRowState;
  meta: string;
  seeded: boolean;
  refusal?: { class: AbuseClass | null; reason: string };
  tx?: string;
}

export interface AgentData {
  /** Bare id, no leading `#`: `8004-1207`. The card renders the `#`. */
  id: string;
  label?: string;
  score: number | null;
  paidOnProof: number;
  marks: number;
  lastMarkClass?: AbuseClass;
}

export interface PoolRow {
  id: string;
  seeded: boolean;
  area: string;
  completed: number;
}

export interface PoolData {
  real: number;
  seeded: number;
  highlighted?: {
    id: string;
    minutesReal?: number;
    /** `orb` renders `sandbox World ID`, `selfie` renders `sandbox Selfie Check`. */
    level: 'selfie' | 'orb';
  };
  rows: PoolRow[];
}

/** Never a spec text field: the log renders the hash, never what was asked for. */
export interface ScreeningLine {
  at: string;
  outcome: 'refused' | 'passed';
  taskType: TaskType | 'free-text';
  class?: AbuseClass | null;
  reason: string;
  ruleId?: string;
  specHash: string;
  marked: boolean;
  markTx?: string;
  agentId?: string;
}

export interface PreflightData {
  active: number;
  verified: number;
  seeded: number;
  scoreFloor: number;
  medianMinutes: number | null;
  medianSource: 'real' | 'seeded' | 'n/a';
  nReal: number;
}

export interface PosterStatsData {
  distinctExternalBuyers: number;
  externalTasks: number;
}

export interface DashboardTotals {
  lockedUsdc: number;
  releasedTodayUsdc: number;
  refundedUsdc: number;
}

export interface DashboardData {
  dataMode: DataMode;
  featured: FeaturedTask | null;
  totals: DashboardTotals;
  feed: TaskRowData[];
  agent: AgentData;
  pool: PoolData;
  screening: ScreeningLine[];
  preflight: PreflightData;
  posterStats: PosterStatsData;
  generatedAt: string;
  /**
   * Additive to the §6 table, optional so every T-10 consumer is untouched: in live
   * mode a source that failed contributes its zero or empty value, and this is where
   * it says which one — `<source> unavailable`. Never a `ScreeningLine`; the log is
   * the classifier's record, not a transport report. Empty and absent in demo mode.
   */
  sourceNotes?: string[];
}

export interface GetDashboardDataOptions {
  state?: FeaturedState;
  /** Injected by tests so the elapsed timer and `postedAt` anchor are deterministic. */
  nowMs?: number;
}

const FEATURED_STATES: readonly FeaturedState[] = ['locked', 'submitted', 'released', 'refunded'];

/** Narrows a raw `?state=` query value; anything else is ignored. */
export function parseFeaturedState(value: unknown): FeaturedState | undefined {
  return typeof value === 'string' && (FEATURED_STATES as readonly string[]).includes(value)
    ? (value as FeaturedState)
    : undefined;
}
