---
id: T-09
title: Subgraph mappings + packages/subgraph-client
lane: C
day: 1→2
size: M
agent_class: C
must: true
depends_on: [T-01b]                    # T-01b freezes subgraph/schema.graphql; T-01a's ABIs are enough to codegen
owned_paths:
  - subgraph/**                       # EXCEPT subgraph/schema.graphql, subgraph/README.md, and the address/startBlock VALUES in subgraph.yaml
  - "!subgraph/schema.graphql"
  - "!subgraph/README.md"
  - packages/subgraph-client/**
labels: [area:subgraph, wave:1, size:M, agent:cloud]
branch: t-09/subgraph-mappings
---

# T-09 — Subgraph mappings + `packages/subgraph-client`

## 1. Context
The subgraph is the read side of Legwork: nothing else can answer "who is working right now, how many of them are real, and how fast do they finish". Two consumers depend on it — the MCP tool `preflight_workers` (T-27), which is the AI-track qualification because the agent *acts* on the answer, and the public dashboard (T-26). You write the manifest, the AssemblyScript handlers for all four contracts, and a typed TypeScript client with recorded fixtures so both consumers can be built and tested before anything is deployed. T-23 deploys what you write; until then this package is pure codegen + fixtures.

> **02-architecture.md — Subgraph** "schema and five handlers written on Saturday and deployed to Studio that evening so it indexes while the rest is built. Entities: `Worker` (`seeded`, `area`, `taskTypes`, `completed`, `lastCompletedAt`), `Task` (state, type, `buyer`, amount, `geohash5` only — never a per-task coordinate keyed to a nullifier), `Feedback`, `Mark`, `PosterStats` (distinct buyers not on the operator allowlist — the external-poster counter the W3 gate is judged on). Serves `preflight_workers` (the AI-track qualification: the agent acts on it) and the dashboard."

> **02-architecture.md — MCP server** "Tools: `preflight_workers(taskType, area)` (subgraph: active = completed a task in the last 7 days, returned as a real/seeded split, median from real completions only or labelled `seeded`)"

The frozen schema you index into (**T-01 §2, `subgraph/schema.graphql` — do not edit it, do not re-declare it**):
> `Worker { id: Bytes! (address), nullifier: BigInt!, seeded: Boolean!, reset: Boolean!, area: String!, taskTypes: Int!, completed: Int!, lastCompletedAt: BigInt, score: BigInt!, distinctRaters: Int!, registeredAt: BigInt! }` · `Task { id: ID! (taskId), taskType: Int!, specHash: Bytes!, amount: BigInt!, fee: BigInt!, buyer: Buyer!, buyerAgentId: BigInt!, worker: Worker, state: String!, area: String!, postedAt: BigInt!, claimedAt: BigInt, submittedAt: BigInt, releasedAt: BigInt, proofHash: Bytes, seeded: Boolean!, txPost: Bytes!, txClaim: Bytes, txSubmit: Bytes, txRelease: Bytes }` · `Buyer { id: Bytes!, allowlisted: Boolean!, tasks: [Task!]! @derivedFrom(field: "buyer") }` · `Feedback { id: ID!, worker: Worker!, raterKey: Bytes!, outcome: Int!, task: Task!, newRater: Boolean!, at: BigInt! }` · `Mark { id: ID!, agentId: BigInt!, classId: Int!, specHash: Bytes!, at: BigInt!, tx: Bytes! }` · `Outcome { id: ID!, agentId: BigInt!, task: Task!, outcome: Int!, at: BigInt! }` · `PosterStats { id: ID! ("global"), distinctExternalBuyers: Int!, externalTasks: Int! }`. **No coordinate anywhere; `area` (geohash5) only.**

The MCP result shape you feed (**T-01 §2, `packages/shared/src/mcp-contract.ts`**):
> `preflight_workers({task_type, area})` → `{active, verified, seeded, median_minutes: number|null, median_source: 'real'|'seeded'|'n/a', n_real, score_floor, dashboard_url}` (active = completed a task in the last 7 days).

## 2. Exact scope
- `subgraph/subgraph.yaml` — `specVersion` current, `schema: file: ./schema.graphql`, network **`base-sepolia`**, and **four** data sources: `WorkerRegistry`, `TaskEscrow`, `Reputation`, `AbuseMark`. Each carries `address: "0x0000000000000000000000000000000000000000" # T-23` and `startBlock: 0 # T-23`, an `abi` pointing at `./abis/<Name>.json`, and one `eventHandlers` entry per event below. **You write the placeholders and never a real address; T-23 fills the values and only the values.**
- `src/mappings/worker-registry.ts` — `WorkerRegistered(uint256 indexed nullifierHash, address indexed worker, string area, uint8 taskTypes)` creates `Worker` with `seeded = false`, `reset = false`, `completed = 0`, `score = 0`, `distinctRaters = 0`, `lastCompletedAt = null`, `registeredAt = block.timestamp`. `WorkerSeeded(uint256 indexed syntheticNullifier, address indexed worker, string area, uint8 taskTypes)` creates-or-updates the same row and sets **`seeded = true`** — this is the only writer of that field. `WorkerReset(uint256 indexed nullifierHash, address indexed worker)` sets `reset = true` and keeps the row (it is history, not a delete).
- `src/mappings/task-escrow.ts` — `TaskPosted` creates `Task` (`id = taskId.toString()`, `state = "Open"`, `seeded = false`, `txPost`) and upserts `Buyer`; `TaskClaimed` sets `task.worker`, `task.claimedAt`, `task.txClaim`, `state = "Claimed"` and **`task.seeded = worker.seeded`**; `ClaimReleased` clears `worker`/`claimedAt`, sets `seeded = false`, `state = "Open"`; `ClaimExpired` does the same for the stale claimant (it is logged *before* the new `TaskClaimed` in the same tx, so plain log order is correct); `TaskSubmitted` sets `submittedAt`, `proofHash`, `txSubmit`, `state = "Submitted"`; `TaskReleased` sets `releasedAt`, `txRelease`, `state = "Released"` and on the worker `completed = completed + 1` and `lastCompletedAt = block.timestamp`; `TaskDisputed` → `"Disputed"`; `TaskResolved(taskId, toBuyer)` → `"Resolved"`, and when `toBuyer == false` the worker was paid, so `completed`/`lastCompletedAt` advance exactly as on `TaskReleased` (this keeps `Worker.completed` equal to the onchain `completed(nullifier)`); `TaskRefunded` → `"Refunded"`; `BuyerAllowlisted(buyer, allowed)` sets `buyer.allowlisted` and recomputes `PosterStats` (§ below). The eight state strings are the `TaskState` names from T-01, spelled `None Open Claimed Submitted Released Refunded Disputed Resolved`.
- `PosterStats` singleton, `id = "global"`, created on first use with both counters at `0`. `distinctExternalBuyers` and `externalTasks` count **only buyers whose `allowlisted` is `false`**. This is the number the post-hackathon W3 gate is judged on, so it must never count the operator's own buyer: the operator allowlists its buyer at deploy time (T-14) *before* posting, so the honest reading of a green demo is `distinctExternalBuyers: 0`.
- `src/mappings/reputation.ts` — `Feedback(uint256 indexed nullifierHash, bytes32 indexed raterKey, uint8 outcome, uint256 taskId, bool newRater)`. Resolve the worker through the task, not through the nullifier: `Task.load(taskId.toString()).worker` (the escrow only ever emits `Feedback` for a task whose worker is already set). The `Feedback` entity **is the rater slot**: `id = worker.id.toHexString() + "-" + raterKey.toHexString()`, updated in place. `worker.score` = `score − value(previous outcome) + value(new outcome)` when the slot already existed, else `score + value(new outcome)`, where `value(1) = +1`, `value(2) = +1`, `value(3) = −1`. **`worker.distinctRaters` increments only when the event's `newRater` is `true`.**
- `src/mappings/abuse-mark.ts` — `Marked(uint256 indexed agentId, uint8 classId, bytes32 specHash)` → a `Mark` (`id = txHash-logIndex`, `at`, `tx`); `Outcome(uint256 indexed agentId, uint256 indexed taskId, uint8 outcome)` → an `Outcome` linked to the `Task`. `classId` is stored as the integer. **No mapping ever spells an abuse-class label.**
- `packages/subgraph-client/**` — `createSubgraphClient({ url, apiKey?, fetch? })` exporting the generic **`query(document, variables)`** (T-26 depends on this exact form) plus typed helpers `activeWorkers({taskTypeBit, areaPrefix, sinceTs})`, `task(id)`, `recentTasks(n)`, `posterStats()`, `marksByAgent(agentId)`. "Active" = completed a task in the last 7 days (`lastCompletedAt >= sinceTs`); a worker whose `registeredAt >= sinceTs` and who has not completed yet is returned too, with `completed: 0`, so the caller can count it as available — that row is the demo phone before its first task and is what makes "1 verified" visible. `reset == true` workers are always excluded. `marksByAgent` is the only place an abuse-class id becomes a label, and it does so by importing `ABUSE_CLASS_ID` / `AbuseClass` from `@legwork/shared`.
- `packages/subgraph-client/fixtures/` — recorded JSON responses, one file per helper, plus `preflight.json`: **4** worker rows matching the demo task type and area — one `seeded: false, completed: 0, lastCompletedAt: null`, three `seeded: true` with completions inside the window — and the released tasks behind them with `releasedAt − claimedAt` of 7, 9 and 12 minutes. Reduced, it yields **"4 active · 1 verified · 3 seeded"**, `n_real = 0`, `median_minutes = 9`, `median_source = "seeded"`. T-27 and T-26 both consume this file.
- `packages/subgraph-client/README.md` — the five helpers, the "active" definition in two sentences, how to point tests at a fixture instead of a URL, and the sentence "the query URL is publishable; `GRAPH_API_KEY` is not".

## 3. Out of scope
- `subgraph/schema.graphql` — frozen by T-01. `subgraph/README.md` and the **values** of `address`/`startBlock` — T-23.
- `subgraph/abis/*.json` are generated by `abi:gen` (T-01's `contracts/script/abi-gen.sh`, wired as the `abi:gen` package script by T-14). Run it; never hand-edit an ABI.
- `score_floor` and `dashboard_url` in the tool result — T-27 assembles those; you only ship the numbers the subgraph can answer for.
- Deploying, `graph auth`, any Studio credential (T-23). Dashboard rendering (T-26). The MCP tool itself (T-27).
- OZ `Paused`/`Unpaused` are not indexed — the frozen schema has no entity for them.
- Do not touch: `contracts/**`, `apps/**`, `packages/shared/**`, `packages/chain/**`, root configs, the lockfile.

## 4. Owned paths
```
subgraph/**                # NOT schema.graphql, NOT README.md, NOT the address/startBlock values in subgraph.yaml
packages/subgraph-client/**
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `subgraph/schema.graphql` | frozen, T-01 | entity and field names exactly as quoted in §1 |
| ABIs `WorkerRegistry.json`, `TaskEscrow.json`, `Reputation.json`, `AbuseMark.json` | `subgraph/abis/` via `abi:gen` | the 16 event signatures in §2, spelled as in T-01 §2 |
| `TASK_TYPE_BIT`, `TaskState`, `AbuseClass`, `ABUSE_CLASS_ID` | `packages/shared/src/enums.ts` | `verify-open = 1`, `photo-of = 2`, `call-confirm = 4`, `compare-two = 8`; the eight state names; the six class labels |
| `SUBGRAPH_QUERY_URL`, `GRAPH_API_KEY` | `.env.example` (T-01) | names only — the client takes them as constructor arguments, never from `process.env` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `subgraph.yaml` with four data sources + placeholders | `subgraph/subgraph.yaml` | T-23 (fills address/`startBlock`) |
| `createSubgraphClient`, `query(document, variables)` | `packages/subgraph-client/src/client.ts` | T-26, T-27 |
| `activeWorkers`, `task`, `recentTasks`, `posterStats`, `marksByAgent` | `packages/subgraph-client/src/helpers.ts` | T-26, T-27, T-46 |
| `fixtures/preflight.json` + the other recorded responses | `packages/subgraph-client/fixtures/` | T-26, T-27 |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-09` — it must print `CLAIMED T-09`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, then `subgraph/schema.graphql` and T-01 §2's event lists end to end. Run `pnpm abi:gen` so `subgraph/abis/*.json` exist.
2. Write `subgraph.yaml` with the four data sources and every handler wired; `pnpm graph codegen`. Fix names until it generates.
3. `src/lib/entities.ts` (`getOrCreateWorker`, `getOrCreateBuyer`, `getPosterStats`) and `src/lib/state.ts` (the eight state-name constants). Then the four mapping files, in the order registry → escrow → reputation → abuse-mark.
4. Matchstick tests for `seededComesFromEventOnly` and `posterStatsExcludesAllowlisted`; `pnpm graph test`.
5. `packages/subgraph-client`: `client.ts` (generic `query` first), `queries.ts`, `helpers.ts`, `types.ts`. Tests use an injected `fetch` stub that returns the fixture files — never a real socket.
6. Hand-write `fixtures/preflight.json` so the reduction lands on 4 / 1 / 3 and median 9 `seeded`; write the two client tests; README; run §9.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `cd subgraph && pnpm graph codegen && pnpm graph build` | green against the interface ABIs; every handler named in `subgraph.yaml` exists and typechecks |
| `preflightFixtureSplits` (`packages/subgraph-client/test/preflight.test.ts`) | reducing `fixtures/preflight.json` gives `active: 4`, `verified: 1`, `seeded: 3`; `n_real === 0`; `median_minutes === 9` with `median_source === 'seeded'`; adding one real completion of 5 minutes flips it to `median_minutes: 5`, `median_source: 'real'`, `n_real: 1` |
| `queriesTyped` (`packages/subgraph-client/test/queries.test.ts`) | every helper returns its declared type against its fixture; `query(document, variables)` passes the document and variables through unchanged and rejects a GraphQL `errors` body; a missing `apiKey` sends no `Authorization` header |
| `seededComesFromEventOnly` (`subgraph/tests/worker.test.ts`, matchstick) | a `Worker` created by `WorkerRegistered` has `seeded == false`; only `WorkerSeeded` sets it `true`; `WorkerSeeded` on an unknown address creates the row already `seeded == true`; no code path other than the `WorkerSeeded` handler writes the field |
| `posterStatsExcludesAllowlisted` (`subgraph/tests/poster-stats.test.ts`, matchstick) | `BuyerAllowlisted(op, true)` then two `TaskPosted` from `op` → `distinctExternalBuyers: 0`, `externalTasks: 0`; two `TaskPosted` from an unknown buyer → `1` / `2`; a third from a second unknown buyer → `2` / `3` |

## 9. Verification commands
```bash
pnpm abi:gen                                       # populates subgraph/abis/*.json — never hand-edit them
cd subgraph && pnpm graph codegen && pnpm graph build
cd subgraph && pnpm graph test                     # seededComesFromEventOnly, posterStatsExcludesAllowlisted
pnpm --filter @legwork/subgraph-client typecheck
pnpm --filter @legwork/subgraph-client test        # preflightFixtureSplits, queriesTyped
grep -rniE '\b(lat|lon|latitude|longitude|coord|geopoint)\b' subgraph/src && echo FAIL || echo OK
```
Expected: `graph build` writes `subgraph/build/` with no errors; all four named tests listed and green; the grep prints `OK`.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). In fixtures: `amount: "3000000"`, `fee: "450000"`.
- **No coordinate field anywhere in a mapping** — `area` (geohash5) only, and never a nullifier-keyed movement history. The grep in §9 is the gate.
- **`seeded` is derived from the `WorkerSeeded` event only** — never a hardcoded address list, never inferred from an area or an id range.
- **`PosterStats` excludes allowlisted buyers.** Never present it as a count of real external demand when the only poster is the operator's own buyer.
- Mappings are pure AssemblyScript: no `fetch`, no `ipfs.cat`, no `ethereum.call` — no network of any kind inside a handler.
- The six abuse-class ids map to their labels **only in the client**, by importing `ABUSE_CLASS_ID` from `@legwork/shared`; never re-spelled in a mapping and never re-typed as a local string literal.
- No secrets in code or client bundles; `GRAPH_API_KEY` is a constructor argument the caller reads from `process.env`; `.env.example` is the only env file in git; the key never lands in a fixture, a URL, or a log.
- Tests never call a live model, a live chain or a live subgraph (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted). C-class: the client's `fetch` is always stubbed with a fixture. Fetching the matchstick binary for `graph test` is a toolchain download, not a live call.
- Frozen interfaces are quoted, never redefined: no local copy of the schema, the enums or the task-type bits.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed — `git diff --name-only` shows no `subgraph/schema.graphql`, no `subgraph/README.md`.
- [ ] `subgraph.yaml` still carries the two `# T-23` placeholder comments untouched.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `packages/subgraph-client/README.md` written.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-09 — Subgraph mappings + packages/subgraph-client
owned-paths:
  - subgraph/**            (not schema.graphql, not README.md, not the address/startBlock values)
  - packages/subgraph-client/**
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- `INTERFACE REQUEST` (**pre-filed by this brief; implement the interim rule below until the lead lands it**): `Buyer` needs `taskCount: Int!` and `countedExternal: Boolean!` in `subgraph/schema.graphql`. Without them a `BuyerAllowlisted` flip that arrives *after* that buyer has posted cannot be un-counted from `PosterStats`, because `@derivedFrom` fields are not readable inside a mapping. **Interim rule:** count on `TaskPosted` only (increment `externalTasks` when `buyer.allowlisted == false`; increment `distinctExternalBuyers` when that same handler created the `Buyer` row); on a `BuyerAllowlisted` flip, set the flag, leave both counters alone and emit `log.warning("PosterStats not recomputed: Buyer.taskCount pending INTERFACE REQUEST", [])`. The demo ordering (allowlist at deploy, post afterwards) is exact under this rule, which is what `posterStatsExcludesAllowlisted` asserts.
- If `pnpm graph test` cannot fetch the matchstick binary in the sandbox, comment `BLOCKED: graph test cannot fetch the matchstick binary` — do not silently drop the two mapping tests.

## 14. Reviewer notes
Open `src/mappings/reputation.ts` first: the slot id must be `worker-raterKey` (not `task-raterKey`), the score must *replace* the previous slot value rather than add to it, and `distinctRaters` must move only on `newRater == true`. Then `task-escrow.ts`: check that `task.seeded` is copied from the worker at `TaskClaimed` and cleared on `ClaimReleased`/`ClaimExpired`, and that the `TaskResolved(toBuyer == false)` completion bump is present (strike the clause if the lead wants release-only — say so on the PR). Then the `PosterStats` interim rule against §13. Finally run the §9 grep yourself: one stray `lat` in a mapping is a privacy failure, not a nit.

## 15. Round 2+
—
