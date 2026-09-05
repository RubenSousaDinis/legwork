# `@legwork/subgraph-client`

A typed read client for the Legwork subgraph, plus the recorded responses that let the
dashboard (T-26) and the MCP tool `preflight_workers` (T-27) be built and tested before
anything is deployed.

```ts
import { createSubgraphClient, activeWorkers, reducePreflight } from '@legwork/subgraph-client';
import { TASK_TYPE_BIT } from '@legwork/shared';

const client = createSubgraphClient({
  url: process.env.SUBGRAPH_QUERY_URL!,
  apiKey: process.env.GRAPH_API_KEY, // optional
});

const source = await activeWorkers(client, {
  taskTypeBit: TASK_TYPE_BIT['verify-open'],
  areaPrefix: 'ez1dp',
  sinceTs: Math.floor(Date.now() / 1000) - 604800,
});
const counts = reducePreflight(source); // { active, verified, seeded, median_minutes, … }
```

`client.query(document, variables)` is the generic escape hatch: it sends your document
and your variables unchanged, throws on a GraphQL `errors` body, and is what the dashboard
builds its own queries on.

## The five helpers

| Helper | Answers |
|---|---|
| `activeWorkers({ taskTypeBit, areaPrefix, sinceTs })` | the candidate workers near an area, and the released tasks behind them |
| `task(id)` | one task by its on-chain id, or `null` |
| `recentTasks(n)` | the `n` most recently posted tasks |
| `posterStats()` | `distinctExternalBuyers` and `externalTasks` — buyers that are **not** allowlisted |
| `marksByAgent(agentId)` | the marks against one agent, each with the abuse-class label its `classId` stands for |

`marksByAgent` is the only place a class id becomes words, and it takes them from
`ABUSE_CLASS_ID` in `@legwork/shared`. The subgraph stores the integer and nothing else.

## What "active" means

A worker is active when they completed a task in the last 7 days — `lastCompletedAt` at or
after `sinceTs`. A worker who registered inside that same window and has not completed
anything yet counts too, with `completed: 0`: that row is the demo phone before its first
errand, and leaving it out would make the one real human in the pool invisible.

Workers with `reset: true` are never returned. `reducePreflight` reports `verified` and
`seeded` as separate numbers, and takes the median completion time from real completions
when there are any — when there are none it uses the seeded ones and labels the result
`median_source: 'seeded'` rather than passing a demo number off as a market number.

## Testing against a fixture instead of a URL

`createSubgraphClient` takes its `fetch` as an argument, so a test hands it a function that
returns a recorded response and no socket is ever opened:

```ts
const client = createSubgraphClient({
  url: 'https://unused.example',
  fetch: async () => new Response(JSON.stringify(recorded), { status: 200 }),
});
```

`fixtures/` holds one recorded response per helper — `activeWorkers.json`,
`releasedTasksByWorkers.json`, `task.json`, `recentTasks.json`, `posterStats.json`,
`marksByAgent.json` — plus `preflight.json`, which is the reduction input rather than a
wire response: four workers in one area, one verified and three seeded, and the three
released tasks behind them at 7, 9 and 12 minutes. Reduced it gives
**4 active · 1 verified · 3 seeded**, `n_real: 0`, `median_minutes: 9`,
`median_source: 'seeded'`. Money in every fixture is `amount: "3000000"` and
`fee: "450000"` — the agent pays 3.45, the worker receives 3.00.

## Credentials

The query URL is publishable; `GRAPH_API_KEY` is not. The key is a constructor argument
the caller reads from `process.env` — this package never reads the environment itself, and
without a key no `Authorization` header is sent at all.
