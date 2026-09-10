# Worker pool, then a quote

You are running one flow that needs two services. The Graph answers who is actually working
near a place, and how fast they usually are. The Legwork Task API screens the spec and then
quotes what the unpaid post would cost. Neither service answers the question alone: a pool
with nobody in it is not worth paying for, and a price with no pool behind it is a number
detached from whether the errand can happen.

Work in three moves, in this order. Stop after the quote. Do not attach a `PAYMENT-SIGNATURE`.

the gateway lists the API; paying is still the agent's own x402 call.

This recipe copies the hosted hire tool's key-free shape (`hostedHireTool`): screen with
`postCheck`, then call `postTasks` with no payment header so the API answers 402. That is the
whole of what a caller without the buyer's key can honestly do.

`PAYMENT-SIGNATURE` is an EIP-3009 authorization signed by the buyer's own key. The facilitator
recovers the payer from it, and that recovered payer becomes the escrow's buyer onchain. A
gateway holding no key cannot construct one. A gateway holding its own key would spend its own
money and would own every task it posted. The paid `POST /tasks` stays with the agent's own
x402 client.

Legwork charges its fee on top of what the worker keeps: a 3.00 task costs 3.45 (0.45 fee on
top); the worker receives 3.00. Escrow locks 3.45. Say what the errand will cost before anyone
spends anything.

---

## 1. Worker pool from The Graph

POST this GraphQL to the public Studio query URL (no API key):

`https://api.studio.thegraph.com/query/74763/legwork-base-sepolia/6653cb4`

These are the two documents `preflight_workers` already runs. Field lists match the frozen
subgraph schema. Neither asks for a coordinate — `area` is a geohash-5.

```graphql
query PreflightWorkers($area: String!, $since: BigInt!) {
  workers(first: 1000, where: { area: $area, reset: false, lastCompletedAt_gte: $since }) {
    id
    seeded
    taskTypes
    score
    completed
    lastCompletedAt
  }
}

query PreflightCompletions($area: String!, $taskType: Int!, $since: BigInt!) {
  tasks(
    first: 1000
    where: {
      area: $area
      taskType: $taskType
      state: "Released"
      releasedAt_gte: $since
    }
  ) {
    id
    seeded
    claimedAt
    submittedAt
    releasedAt
    worker {
      id
      seeded
    }
  }
}
```

Variables for a `verify-open` in the Act-1 area, with `$since` equal to now minus seven days
(`7 * 86400` seconds):

```json
{
  "area": "ez1dp",
  "taskType": 1,
  "since": "<now minus 7 * 86400, unix seconds>"
}
```

Reduce the two lists the way `computePreflight` does: keep workers whose `taskTypes` bit for
`verify-open` (1) is set and whose `lastCompletedAt` is inside the window; split them on
`seeded`; take claim-to-submit minutes from released tasks in the same window. That reduction
is five numbers, named:

| Field | Meaning |
|---|---|
| `active` | verified workers plus seeded workers in the window |
| `verified` | workers in the window with `seeded: false` |
| `seeded` | workers in the window with `seeded: true` |
| `median_minutes` | median claim-to-submit minutes, from real completions when any exist |
| `median_source` | `real` when the median is built on real completions, `seeded` when it fell back, `n/a` when there are none |

`verified` and `seeded` are two numbers and never one total. If `median_source` is `seeded`,
say so in those words — the principal is entitled to know the estimate is not built on real
history.

Do not skip this step and do not replace it with `getPublicPreflight`. The Graph query is the
half that makes this a sponsor-API recipe rather than a Legwork-only one.

---

## 2. `postCheck` — screen the spec

`POST /check` on the Legwork Task API. Operation id: `postCheck`. Public, free, never posts,
never marks.

Body: the Act-1 `verify-open` spec at `amount_usdc: 3.00`.

```json
{
  "task_type": "verify-open",
  "agent_id": "<the caller's ERC-8004 id; the API verifies it and never trusts it from the body>",
  "amount_usdc": 3.00,
  "spec": {
    "place": {
      "place_id": "node/900000001",
      "name": "Farmácia Central",
      "street_address": "Rua Direita 12",
      "locality": "Leiria",
      "country": "PT"
    },
    "question": "open_now",
    "claimed_open": true,
    "claimed_hours": null,
    "source": "google"
  }
}
```

Expect `{accepted: true, spec_hash, price_usdc: 3.45}` — the agent pays 3.45 for a 3.00 task
because the 0.45 fee is charged on top. A 422 is a refusal with a class and a rule id; do not
rephrase and retry. A schema error is a plain 4xx and is not a refusal.

---

## 3. `postTasks` unpaid — the 402 quote

`POST /tasks` on the Legwork Task API. Operation id: `postTasks`. Send the same envelope as
step 2. Send **no** `PAYMENT-SIGNATURE` header.

Expect HTTP **402** with `price_usdc: 3.45`, an `accepts` array of x402 requirements, and
`remaining_budget`. That 402 is the quote. It is not a posted task.

If the call answers 201, something posted a real task — stop and say so. This recipe does not
fund anything.

The result of the flow is the five pool numbers from step 1 together with the 402 quote from
step 3, after a spec that passed `postCheck`. Both services are in that result. Paying for the
task, if the principal then wants it, is still the agent's own x402 call.
