---
id: T-35
title: OpenAPI document from api-contract + Bazantic import
lane: B
day: 4
size: S
agent_class: C
must: false
depends_on: [T-19]
owned_paths:
  - apps/api/app/openapi.json/**
  - apps/api/src/openapi.ts
  - apps/api/src/openapi.test.ts
labels: [area:api, wave:4, size:S, agent:cloud]
branch: t-35/openapi
---

# T-35 — OpenAPI document from api-contract + Bazantic import

## 1. Context
`GET /openapi.json` is in the frozen route table. It exists for one consumer we do not control: the Bazantic gateway, which imports an OpenAPI document to expose Legwork's REST API to agents that do not speak MCP. The document is **generated** from `packages/shared/src/api-contract.ts` — the same zod the routes validate with — so it cannot drift from the API. This task ships the generator, the route, a determinism/validation test, and the operator's Day-9 dry-run instructions for the import. It is optional: if behind, drop it — `docs/api.md` (T-01) remains the human-readable contract.

> **T-01 — `api-contract.ts` + `docs/api.md`:** every route with `auth ∈ public | x402 | buyer-token | worker-session | idkit-session | admin-key`, zod request/response, error codes. `GET /openapi.json` · `GET /healthz` — public.

> **T-01 — `POST /tasks`:** x402 (`PAYMENT-SIGNATURE` header; price = `amount × 1.15`) · `Envelope` → **201** `{task_id, buyer_token, status:'open', spec_hash, price_usdc, eta_seconds, poll_after_seconds, dashboard_url}` · **402** `{error:'payment_required', price_usdc, accepts:[x402 requirements], remaining_budget:{open_tasks, daily_usdc}}` · **422** `RefusalPayload` · **400** `{error:'invalid_request', field, reason}` · **429** `{error:'cap_exceeded', open_tasks, daily_usdc}`.

## 2. Exact scope
- `apps/api/src/openapi.ts` exports `buildOpenApi(opts: { serverUrl: string; includeAdmin?: boolean }): OpenApiDocument` producing OpenAPI **3.1.0** from `api-contract.ts`: one path item per route, `:id`/`:hash` converted to `{id}`/`{hash}`, request body / query / path parameters from the contract's zod, one response per status code the contract lists, and `operationId` in camelCase from method + path (`postTasks`, `getTasksById`, `postTasksByIdApprove`, `postCheck`, `getPublicFeed`, `getOpenapiJson`, `getHealthz`).
- Schema conversion: `z.toJSONSchema() (zod 4 built-in)` if T-00 pre-declared it in `apps/api/package.json`; otherwise zod v4's built-in `z.toJSONSchema()` with `$ref`s hoisted under `components.schemas` — decision here: the built-in path is acceptable and needs no `DEP REQUEST`. Named shared schemas appear once by name: `Envelope`, `RefusalPayload`, `WorkerAnswer`, `Place`, the four `*Spec`, the four `*Proof`.
- Security schemes under `components.securitySchemes`, applied per route from `auth`: `x402` → `apiKey` in header `PAYMENT-SIGNATURE` (description: "x402 exact-EVM payment authorization; an unpaid call returns 402 with `accepts`"); `buyerToken` → header `X-Buyer-Token`; `adminKey` → header `X-Admin-Key`; `workerSession` / `idkitSession` → `apiKey` in `cookie` with the cookie names T-19's session helper uses (read it; if absent use `legwork_worker` / `legwork_idkit` and say so in the PR). `public` → no `security`.
- `info.description` carries, verbatim: "agent pays 3.45 USDC for a 3.00 task; escrow locks 3.45; the worker receives 3.00; the fee is 0.45 on top", "a refused task moves no money.", "testnet USDC — not spendable", and "refusals return `do not rephrase and retry; report this refusal to your principal`". `POST /tasks` carries `x-legwork: { price_rule: 'amount_usdc × 1.15', money_example: { agent_pays: 3.45, escrow_locked: 3.45, worker_receives: 3.00, fee: 0.45 } }`.
- `includeAdmin` defaults to `false`: `/admin/*` routes are omitted from the served document (they are operator-only; the gateway must not list them). `/mcp` is not a REST route and is not listed.
- Deterministic output: object keys sorted, no timestamps, no random ids — two builds are byte-equal; `servers = [{ url: opts.serverUrl }]`.
- `apps/api/app/openapi.json/route.ts`: `GET` → `buildOpenApi({ serverUrl: process.env.API_BASE_URL! })` as `application/json; charset=utf-8` with `Cache-Control: public, max-age=300`; `export const dynamic = 'force-static'`; no other method.
- `apps/api/app/openapi.json/README.md` — "Bazantic gateway import — Day 9 dry run" (§7 step 5): the operator's checklist, no secrets, no real-looking tokens.

## 3. Out of scope
- `api-contract.ts`, `docs/api.md`, any schema — **T-01** (frozen). Route behaviour — **T-16/T-19**. The MCP server's `tools/list` — **T-27**. `SKILL.md` — **T-31**.
- Registering with, paying for, or configuring the Bazantic gateway itself — operator, Day 9, following this task's README.
- Do not touch: `packages/shared/**`, `apps/api/app/**` other than `apps/api/app/openapi.json/**`, `apps/api/src/middleware/**` (T-38).

## 4. Owned paths
```
apps/api/app/openapi.json/**
apps/api/src/openapi.ts
apps/api/src/openapi.test.ts
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| Route table + zod | `packages/shared/src/api-contract.ts` | per route: method, path, `auth`, request schema, response schemas by status, error codes; the exact route list in T-01 §2 |
| Shared schemas | `packages/shared/src/schemas/*.ts` | `Envelope`, `RefusalPayload` (`message` const = `NO_RETRY_SENTENCE`), `WorkerAnswer`, `Place`, specs, proofs |
| `NO_RETRY_SENTENCE`, `PRICE_FLOOR_USDC`, `MAX_TASK_AMOUNT_USDC` | `packages/shared/src/constants.ts` | quoted in descriptions; never retyped |
| zod v4 `z.toJSONSchema` or `z.toJSONSchema() (zod 4 built-in)` | catalog | schema → JSON Schema 2020-12 (OpenAPI 3.1 native) |
| Env | `.env.example` | `API_BASE_URL` (route only) |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `buildOpenApi(opts) → OpenApiDocument` | `apps/api/src/openapi.ts` | the route, T-31 (may link `/openapi.json`), tests |
| `GET /openapi.json` | `apps/api/app/openapi.json/route.ts` | Bazantic gateway import (operator), judges, T-48 |
| Day-9 import checklist | `apps/api/app/openapi.json/README.md` | operator |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-35` — it must print `CLAIMED T-35`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `packages/shared/src/api-contract.ts` end to end and `docs/api.md`; note how routes are declared (array vs object, how `auth` and per-status responses are attached). Check `apps/api/package.json` for `z.toJSONSchema() (zod 4 built-in)`; pick the conversion path (§2).
2. `openapi.ts`: a pure function; sort keys with a small recursive helper; build `components.securitySchemes` and the `x-legwork` extension; `includeAdmin` filter.
3. `openapi.test.ts` (§8). Validation: if `@seriousme/openapi-schema-validator` (3.1-capable, no network) is in the catalog use it; otherwise assert structurally — `openapi === '3.1.0'`, every `$ref` resolves inside the document, every contract route is present with every listed status, no `/admin` path by default. Do not add a validator dependency without `DEP REQUEST:`.
4. `route.ts` + a route test that calls the handler and parses the body.
5. `README.md` — the Day-9 dry run, in this order: (a) `curl -s "$API_BASE_URL/openapi.json" | jq '.openapi, (.paths | keys)'` — expect `"3.1.0"` and the public/agent routes, no `/admin`; (b) `npx @redocly/cli@latest lint "$API_BASE_URL/openapi.json"` on the operator machine — expect no errors (warnings allowed; paste the summary into the tracker); (c) in the Bazantic gateway's import flow, import by URL (`$API_BASE_URL/openapi.json`) or upload the same JSON; (d) confirm the gateway lists `postCheck`, `postTasks`, `getTasksById`, `postTasksByIdApprove`, `postTasksByIdDispute`, `getPublicPreflight` and shows the `x402` scheme on `postTasks` (header `PAYMENT-SIGNATURE`); (e) call `postCheck` through the gateway with the Act-1 `verify-open` spec at `amount_usdc: 3.00` — expect `{accepted: true, spec_hash, price_usdc: 3.45}`; (f) call `postTasks` unpaid through the gateway — expect the **402** body with `price_usdc: 3.45` and `accepts`; do **not** fund from the gateway during the dry run; (g) record the outcome (worked / what failed) in `tracker.md`. State plainly: "the gateway lists the API; paying is still the agent's own x402 call".
6. Run §9; fill the draft PR and run `gh pr ready` with §12.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `openapiValidates` | `buildOpenApi({serverUrl:'https://api.example.test'})` passes the validator (or the §7-3 structural checks); `openapi === '3.1.0'`; `servers[0].url` equals the input; `components.securitySchemes` has `x402`, `buyerToken`, `adminKey`, `workerSession`, `idkitSession` with the header/cookie names of §2 |
| `everyContractRouteDocumented` | for every route in `api-contract.ts` with `auth !== 'admin-key'`: the converted path exists with the method, each listed status code has a response, and the route's `security` matches its `auth`; `POST /tasks` documents 201, 402, 422, 400, 429, requires `x402`, and its `x-legwork.money_example` deep-equals `{agent_pays: 3.45, escrow_locked: 3.45, worker_receives: 3.00, fee: 0.45}`; no path starts with `/admin`; with `includeAdmin: true` the seven admin routes appear with `adminKey` |
| `openapiDeterministic` | two consecutive builds are byte-equal after `JSON.stringify`; the document contains none of the banned words and no `0x[0-9a-fA-F]{64}` string |
| `openapiRouteServesJson` | the route handler answers `GET` with status 200, `content-type` starting `application/json`, `cache-control` containing `max-age=300`, and a body whose `paths['/openapi.json'].get` and `paths['/healthz'].get` exist |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/api typecheck && pnpm --filter @legwork/api test -- openapi
grep -rn "process.env" apps/api/src/openapi.ts   # must print nothing (the route passes serverUrl in)
scripts/ci/banned-words.sh apps/api/src/openapi.ts apps/api/app/openapi.json
```
Expected: four §8 tests green; the `grep` prints nothing; banned-words clean.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). The document's examples use exactly these; `price_rule` is `amount_usdc × 1.15`.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git. The README shows `X-Admin-Key`, `X-Buyer-Token` and `PAYMENT-SIGNATURE` as header **names** only, never an example value beyond `tok_…`.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted); never a live gateway or the deployed API — the document is built in-process.
- The document is derived from `api-contract.ts`; no route, field or status is hand-typed into `openapi.ts` except `operationId`, descriptions and `x-legwork`.
- Admin routes are absent from the served document. Public routes keep T-01's promise in their descriptions: "never raw spec text, never an exact coordinate, never a buyer token, never a requester identity".
- `agentId` wording: `Envelope.agent_id` is described as "a claim; the API verifies it against the ERC-8004 IdentityRegistry and never trusts it from the body".
- Refusal wording: `RefusalPayload.message` is documented as the constant `do not rephrase and retry; report this refusal to your principal`.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `apps/api/app/openapi.json/README.md` written per §7 step 5.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-35 — OpenAPI document from api-contract + Bazantic import
owned-paths:
  - apps/api/app/openapi.json/**
  - apps/api/src/openapi.ts
  - apps/api/src/openapi.test.ts
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

Known gaps to raise as written (do not resolve them yourself):
- `DEP REQUEST: apps/api needs @seriousme/openapi-schema-validator (devDependency) to validate the 3.1 document offline` — only if no validator is in the catalog; ship the structural checks meanwhile.
- `INTERFACE REQUEST: api-contract.ts routes carry no summary/description text; this task keeps an OPERATION_SUMMARIES map in openapi.ts. Propose a description field per route.`
- `INTERFACE REQUEST: api-contract.ts does not name the worker-session / idkit-session cookies; this task uses the names found in T-19's session helper.`

## 14. Reviewer notes
Open `openapi.test.ts` first: `everyContractRouteDocumented` must iterate the contract, not a hand-written list. Then `openapi.ts`: admin filtered by default, key sorting applied after conversion, `x-legwork` money example exact. Most likely wrong: `/admin` routes leaking into the served document; `wait`, `area`, `lat`, `lon` query parameters missing on the GET routes; the `x402` scheme modelled as `http bearer` instead of an `apiKey` header named `PAYMENT-SIGNATURE`; a hand-typed `Envelope` copy.

## 15. Round 2+
Merged (Sept 6, #88): the two contract routes on `POST /tasks` (x402 and direct-mode signed header) are one operation with `security: [{x402}, {buyerSignature}]` and statuses 201/202/400/402/422/429; cookie scheme names come from `src/session.ts`.
