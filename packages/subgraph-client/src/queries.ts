/**
 * The five documents. Field lists match the frozen `subgraph/schema.graphql` exactly;
 * none of them asks for a coordinate, because the index does not have one — `area` is a
 * geohash-5 and that is all a public reader ever learns about where a task happened.
 */

const WORKER_FIELDS = `
  id
  seeded
  reset
  area
  taskTypes
  completed
  lastCompletedAt
  score
  distinctRaters
  registeredAt
`;

const TASK_FIELDS = `
  id
  taskType
  specHash
  amount
  fee
  buyer { id allowlisted }
  buyerAgentId
  worker { id seeded }
  state
  area
  postedAt
  claimedAt
  submittedAt
  releasedAt
  proofHash
  seeded
  txPost
  txClaim
  txSubmit
  txRelease
`;

/**
 * Two lists in one round trip: workers who finished something inside the window, and
 * workers who registered inside it and have not finished anything yet. The second list
 * is the demo phone before its first task — dropping it would hide the one real human.
 *
 * The task-type bitmask is not in the `where` clause: GraphQL has no bitwise AND, so
 * `activeWorkers` filters `taskTypes` in TypeScript after the fetch.
 */
export const ACTIVE_WORKERS_QUERY = `
query ActiveWorkers($areaPrefix: String!, $sinceTs: BigInt!, $first: Int!) {
  completedRecently: workers(
    first: $first
    where: { reset: false, area_starts_with: $areaPrefix, lastCompletedAt_gte: $sinceTs }
    orderBy: lastCompletedAt
    orderDirection: desc
  ) {${WORKER_FIELDS}}
  newlyRegistered: workers(
    first: $first
    where: { reset: false, area_starts_with: $areaPrefix, completed: 0, registeredAt_gte: $sinceTs }
    orderBy: registeredAt
    orderDirection: desc
  ) {${WORKER_FIELDS}}
}
`;

/** The released tasks behind a set of workers — the only source of a completion time. */
export const RELEASED_TASKS_BY_WORKERS_QUERY = `
query ReleasedTasksByWorkers($workers: [Bytes!]!, $sinceTs: BigInt!, $first: Int!) {
  tasks(
    first: $first
    where: { worker_in: $workers, state: "Released", releasedAt_gte: $sinceTs }
    orderBy: releasedAt
    orderDirection: desc
  ) {${TASK_FIELDS}}
}
`;

export const TASK_QUERY = `
query Task($id: ID!) {
  task(id: $id) {${TASK_FIELDS}}
}
`;

export const RECENT_TASKS_QUERY = `
query RecentTasks($first: Int!) {
  tasks(first: $first, orderBy: postedAt, orderDirection: desc) {${TASK_FIELDS}}
}
`;

export const POSTER_STATS_QUERY = `
query PosterStats {
  posterStats(id: "global") {
    id
    distinctExternalBuyers
    externalTasks
  }
}
`;

export const MARKS_BY_AGENT_QUERY = `
query MarksByAgent($agentId: BigInt!, $first: Int!) {
  marks(first: $first, where: { agentId: $agentId }, orderBy: at, orderDirection: desc) {
    id
    agentId
    classId
    specHash
    at
    tx
  }
}
`;
