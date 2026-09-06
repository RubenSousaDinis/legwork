/**
 * The two documents behind `preflight_workers`.
 *
 * Field lists match the frozen `subgraph/schema.graphql`. Neither asks for a coordinate,
 * because the index does not hold one — `area` is a geohash-5 and that is the whole of what a
 * public reader learns about where an errand happened.
 *
 * The task-type bitmask is absent from both `where` clauses on purpose: The Graph has no
 * bitwise filter, so `computePreflight` matches `taskTypes` in TypeScript after the fetch.
 */

export const PREFLIGHT_WORKERS_QUERY = `
query PreflightWorkers($area: String!, $since: BigInt!) {
  workers(first: 1000, where: { area: $area, reset: false, lastCompletedAt_gte: $since }) { id seeded taskTypes score completed lastCompletedAt }
}
`;

export const PREFLIGHT_COMPLETIONS_QUERY = `
query PreflightCompletions($area: String!, $taskType: Int!, $since: BigInt!) {
  tasks(first: 1000, where: { area: $area, taskType: $taskType, state: "Released", releasedAt_gte: $since }) { id seeded claimedAt submittedAt releasedAt worker { id seeded } }
}
`;

/** Exactly the fields `PreflightWorkers` selects — nothing here reads a field it did not ask for. */
export interface PreflightWorkerRow {
  id: string;
  seeded: boolean;
  taskTypes: number;
  score: string;
  completed: number;
  lastCompletedAt: string | null;
}

/** Exactly the fields `PreflightCompletions` selects. */
export interface PreflightCompletionRow {
  id: string;
  seeded: boolean;
  claimedAt: string | null;
  submittedAt: string | null;
  releasedAt: string | null;
  worker: { id: string; seeded: boolean } | null;
}

export interface PreflightQueryData {
  workers: PreflightWorkerRow[];
}

export interface PreflightCompletionsData {
  tasks: PreflightCompletionRow[];
}
