---
id: T-58
title: Bazantic gateway for the Task API, and a recipe that needs The Graph too
lane: E
day: 7                               # added Sept 10, when the operator chose to go for the Bazantic tracks
size: M
agent_class: L                       # runs the T-35 checklist against the deployed API; needs API_BASE_URL
must: false                          # an optional prize; the demo does not depend on it
depends_on: []
owned_paths:
  - docs/bazantic.md
  - examples/recipes/**
  - apps/api/app/openapi.json/README.md
  - apps/api/src/openapi.test.ts
labels: [area:docs, area:api, wave:7, size:M, agent:local]
branch: t-58/bazantic-gateway-recipe
---

# T-58 — Bazantic gateway for the Task API, and a recipe that needs The Graph too

## 1. Context

Legwork is submitting to two partners, World and The Graph, because those are the only two whose
stack it genuinely uses. Bazantic was meant to be the third and nobody built it: both its rows in
`README.md` and `docs/submission.md` read `not selected — no gateway by freeze`. The operator has
now decided to go for it.

This task is the **"Best Recipe that uses EthGlobal Hackathon Sponsor APIs"** prize ($1,000, split
500/300/200). Read off the live prize page on 2026-09-10, its qualification requirements are:

> - Create an account on bazantic.com
> - Create an x402/MPP Gateway in Bazantic for your project
> - Use at least one other service already available through Bazantic OR is available from a
>   sponsor of the EthGlobal Online Hackathon
> - Create a recipe that uses both services in one working flow.
> - Make the final result depend meaningfully on both services.
> - Demonstrate the completed task from start to finish in a screen recording that is part of
>   your submission.
> - Provide the bazantic account username in your submission — email or GitHub handle depending on
>   what you use to register so we can attribute your recipe to you.

Bazantic describes itself as the thing that turns an API into "services agents can understand,
use, and pay for": it deploys an x402/MPP Gateway for an API, deploys an MCP server for an API,
and creates **Recipes** — custom tool calls that explain when, why and how to use a service.

**The plumbing already exists.** T-35 built the gateway-facing surface for Bazantic by name:
`buildOpenApi()` in `apps/api/src/openapi.ts` generates a deterministic OpenAPI 3.1 document
served at `GET /openapi.json`, and `apps/api/app/openapi.json/README.md` is a written seven-step
operator checklist for importing it. **That checklist has never been run.** This task runs it.

The second service is **The Graph**, a sponsor of this hackathon and already load-bearing here:
`preflight_workers` reads a Subgraph Studio subgraph through `packages/subgraph-client` to answer
who is actually working near a place before an agent spends anything.

## 2. Exact scope

- **Run the T-35 checklist end to end** (`apps/api/app/openapi.json/README.md`, steps (a)–(g))
  against the deployed API and record the outcome — including the `redocly lint` summary line and
  the six operation ids the gateway lists.
- **Fix the checklist's dangling reference.** Step (g) says "Write the outcome in `tracker.md`";
  no `tracker.md` exists in this repository. Point step (g) at `docs/bazantic.md` instead.
- **`docs/bazantic.md`** (new): the gateway record. The gateway URL, the recipe name, the bazantic
  account username, the screen-recording link, the `redocly lint` result, and the outcome of the
  two dry runs. Fields the operator has not supplied yet are written `TODO(operator)` and the
  prize rows stay `not selected` until they are filled.
- **`examples/recipes/worker-pool-then-quote.md`** (new): the recipe committed as text, modelled
  on `examples/prompt.md`. It is the source of truth for what was built in Bazantic's UI, so the
  repo carries it even though the UI holds the live copy. It must name, in order:
  1. the Graph subgraph query for the worker pool in an area — `active`, `verified`, `seeded`,
     `median_minutes` and `median_source`;
  2. `postCheck` on the Legwork Task API, screening the spec;
  3. `postTasks` **unpaid**, and the 402 quote it returns.
- **State the payment boundary, verbatim, in both files**: `the gateway lists the API; paying is
  still the agent's own x402 call.` Neither file may claim the gateway funds, signs or pays for a
  task. See §10.
- **Do not flip the prize rows** in `README.md` or `docs/submission.md` in this PR. They are
  outside §4 on purpose: the rows move only when the evidence exists, and that is a lead edit once
  the operator supplies the username and recording.

## 3. Out of scope

- `README.md` and `docs/submission.md` — the prize rows are the lead's to flip, and only against
  real evidence. Do not touch them.
- The Overpass gateway and its recipe — that is T-59.
- The "Help an Agent Use Your Hackathon Project" prize — Continuity Track only, and this operator
  is not a participant.
- Any change to `packages/shared/src/api-contract.ts` or `apps/api/src/openapi.ts`. The document
  is generated and correct; if the gateway rejects it, see §13.
- Do not touch: `packages/shared/**`, `apps/miniapp/**`, `apps/dashboard/**`, `contracts/**`.

## 4. Owned paths

```
docs/bazantic.md
examples/recipes/**
apps/api/app/openapi.json/README.md
apps/api/src/openapi.test.ts
```

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| `GET /openapi.json` | `apps/api/app/openapi.json/route.ts` | OpenAPI 3.1, deterministic, `/admin` absent, `max-age=300` |
| The import checklist | `apps/api/app/openapi.json/README.md` | steps (a)–(g), the six operation ids, the headers-by-name table |
| `POST /check` | `apps/api/app/check/route.ts` | free screening dry run; never posts, never marks; `{accepted, spec_hash, price_usdc}` |
| `POST /tasks` unpaid | `apps/api/src/services/hire.ts` | answers 402 with `price_usdc`, `accepts[]`, `remaining_budget` |
| Subgraph Studio query URL | `README.md` — Addresses and endpoints | public, no API key; the same URL `preflight_workers` reads |
| `hostedHireTool` | `packages/mcp/src/tools/hire-hosted.ts` | the blessed key-free shape this recipe copies |

## 6. Interfaces produced

| Interface | Where | Consumers |
|---|---|---|
| `docs/bazantic.md` — the gateway record | `docs/bazantic.md` | T-59, and the lead flipping the prize rows |
| `examples/recipes/worker-pool-then-quote.md` | `examples/recipes/` | T-59, the submission |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-58` — must print `CLAIMED`. Exit 1 means another agent
holds it or a dependency is open: stop.

1. Read `apps/api/app/openapi.json/README.md` in full before anything else. It is the procedure;
   this task executes it and then records what happened.
2. Run steps (a) and (b) yourself — the document fetch and `redocly lint`. Keep the exact output.
3. Steps (c), (d), (e), (f) need the bazantic.com account and are **operator-only** (see §14). Ask
   the operator to run them and hand you: the gateway URL, the six operation ids as the gateway
   listed them, the `postCheck` response, and the unpaid `postTasks` status and body.
4. Write `docs/bazantic.md` from what came back. Anything the operator has not supplied is
   `TODO(operator)` — never a guess, never a placeholder that reads like a fact.
5. Write `examples/recipes/worker-pool-then-quote.md`. Copy the shape of `examples/prompt.md`.
6. Amend step (g) of the checklist to name `docs/bazantic.md` rather than `tracker.md`.
7. Add the §8 tests to `apps/api/src/openapi.test.ts`.

## 8. Acceptance tests

| Test / command | Asserts |
|---|---|
| `openapiListsTheSixGatewayOperations` | the built document carries operation ids `postCheck`, `postTasks`, `getTasksById`, `postTasksByIdApprove`, `postTasksByIdDispute`, `getPublicPreflight` — the six the checklist tells the operator to confirm |
| `recipeCallsBothServices` | `examples/recipes/worker-pool-then-quote.md` names a Graph subgraph query **and** a Legwork operation id; fails if either is absent |
| `recipeNeverClaimsTheGatewayPays` | neither `docs/bazantic.md` nor the recipe contains `gateway pays`, `gateway funds`, `gateway signs` or `pay on your behalf` (case-insensitive), and both contain the sentence `the gateway lists the API; paying is still the agent's own x402 call` |
| `bazanticRecordNamesItsGaps` | every unsupplied field in `docs/bazantic.md` is marked `TODO(operator)`; the file contains no empty table cell |

## 9. Verification commands

```bash
# run before opening the PR; paste the output into the PR body
curl -s "$API_BASE_URL/openapi.json" | jq '.openapi, ([.paths | keys[] | select(startswith("/admin"))] | length)'
npx @redocly/cli@latest lint "$API_BASE_URL/openapi.json"
pnpm --filter @legwork/api test -- openapi
bash scripts/ci/banned-words.sh
```

Expected: `"3.1.0"` then `0` (no `/admin` path); redocly reports **no errors** (warnings are
fine — paste the summary line); the api suite green; `banned-words: clean`.

## 10. Hard rules

- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`,
  `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives
  **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate).
- **The gateway does not pay for anything, and nothing you write may imply it does.** The
  `PAYMENT-SIGNATURE` header is an EIP-3009 authorization signed by the buyer's own key; the
  facilitator recovers the payer from it and that recovered payer becomes the escrow's buyer
  onchain. A gateway holding no key cannot construct one, and a gateway holding its own key would
  be spending its own money and would own every task it posted. Write the boundary in the words
  the repo already uses: *the gateway lists the API; paying is still the agent's own x402 call.*
- No secret in any file, screenshot or recording. The checklist's headers table is **names only** —
  `PAYMENT-SIGNATURE`, `X-Buyer-Token`, `X-Admin-Key` — and no value belongs in this repo.
- **Do not fund anything from the gateway.** Step (f) is an unpaid call that must answer 402. If
  something posts a real task, stop and say so.
- Tests never call a live model or a live chain.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`,
      `commit-trailers`, `secrets`, `no-live-llm`, `docs-generated`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] Every operator-supplied field is either filled or marked `TODO(operator)`.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-58 — Bazantic gateway for the Task API, and a recipe that needs The Graph too
owned-paths:
  - docs/bazantic.md
  - examples/recipes/**
  - apps/api/app/openapi.json/README.md
  - apps/api/src/openapi.test.ts
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it. In
particular:

- **The operator has not supplied the gateway URL, username or recording.** That is expected for a
  while. Write everything else, mark those `TODO(operator)`, and say so in the PR — do not wait,
  and do not invent them.
- **The gateway rejects the document.** Do not hand-edit it in Bazantic's UI and do not patch
  `apps/api/src/openapi.ts` — both are out of §4. Record exactly what was rejected and raise
  `INTERFACE REQUEST:` for a lead-owned fix in `api-contract.ts`.

Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and
`apps/api/src/db/schema.ts` are frozen. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

## 14. Reviewer notes

Open in this order:

1. **Does anything claim the gateway pays?** `recipeNeverClaimsTheGatewayPays` is the test, but
   read the prose too — an implication is as bad as a sentence, and this is the one thing a judge
   can check against the code in a minute.
2. **The operator/agent split.** Steps (c)–(f) happen in a third-party web UI that no owned path
   covers. The PR must be clear about which outputs came from the operator and which the agent
   produced; an agent that writes a gateway URL it never saw has fabricated evidence.
3. **`TODO(operator)` honesty.** A field that is unknown must say so. The failure mode is a
   plausible-looking placeholder that later gets read as fact — the same failure T-48 hit when a
   prize row said `yes` over two unfilled placeholders.
4. The recipe's step 1 must be a real subgraph query, not a description of one. It is the half
   that makes this a *sponsor API* recipe rather than a Legwork-only one.

## 15. Round 2+

Empty on first dispatch.
