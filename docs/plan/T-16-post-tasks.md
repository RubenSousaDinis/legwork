---
id: T-16
title: POST /tasks and POST /check — verify, screen, cap, post, settle
lane: B
day: 2
size: M
agent_class: C
must: true
depends_on: [T-15, T-06, T-07]
owned_paths:
  - apps/api/app/tasks/route.ts            # POST only — GET /tasks/list lives in apps/api/app/tasks/list (T-17)
  - apps/api/app/check/route.ts
  - apps/api/src/services/hire.ts
  - apps/api/src/services/caps.ts
  - apps/api/src/services/hire.test.ts
labels: [area:api, wave:2, size:M, agent:cloud]
branch: t-16/post-tasks
---

# T-16 — POST /tasks and POST /check — verify, screen, cap, post, settle

## 1. Context
This is the route the whole product is sold on: an agent pays 3.45 USDC through x402 and gets a task id back in one call, and a task that is refused moves no money. The handler order is frozen by T-01 and every step already exists as a seam — `PaymentGateway` (T-15), `screen()` (T-06), `TxQueue` (T-07), `resolveAgentId`/`markIfIdentified` (T-08 stubs, T-30 bodies), `getDb`/`route`/`ApiError` (T-08). This task composes them, owns the per-payer caps, mints and hashes the `buyer_token`, and ships `POST /check`, the free dry run that runs the same screening and never posts, never charges, never marks.

> **02-architecture.md — Task API:** x402 seller (exact-EVM scheme, USDC on Base Sepolia, reference facilitator). Order on `POST /tasks`: `/verify` the payment authorization (no money moves) → screen → if refused: AbuseMark (if the payer has an identity) and a 4xx that names the class and the reason → if accepted: `TaskEscrow.post(…, buyer = payer)` from the operator float → `/settle` with an idempotency key on the authorization nonce (a retried settle cannot double-charge). A failed `post` never takes the agent's money. If `settle` fails after `post`, the float absorbed the task and the log says so. "Our custody is the one block between settlement and escrow, and we say so." Per-agent rolling cap (5 open tasks, $25/day in v0), echoed in the 402 body so an honest agent can read its own remaining budget. Endpoints: `POST /tasks` (402-gated; price = amount × 1.15), … `POST /check` (dry run, rate-limited per identity/IP, logged).

> **10-schemas.md §9 — Screening pipeline (order is the design):** 1. **Type gate:** `task_type` ∈ the four; unknown or free text → the free-text path (step 4). 2. **JSON schema, field level:** the envelope and the per-type spec (place resolution against the cached extract, business tag, template list, denylist, size caps, floors). A schema failure is an ordinary **4xx with the field named — no mark** (an evangelist's first malformed call must not brand their agent). 3. **Deterministic checks, always run on the enumerated path:** the denylist; the named-person / personal-identifier regexes; the arXiv 2602.19514 keyword rules for the six classes. A hit refuses with the class and the rule id. This gate is **authoritative**. 4. **LLM classifier — free-text / unknown-type path only:** … It can **add** a refusal; it can never overturn step 3. 5. **Refusal side effects:** if the payer has a registered ERC-8004 identity → `AbuseMark.mark(agentId, class, specHash)` (idempotent, one per agentId per rolling 24 h); no identity → dashboard log entry only. The refusal payload: `{ refused: true, class, reason, rule_id, retryable: false, allowed_task_types, mark_tx? }` plus "do not rephrase and retry; report this refusal to your principal."

> **02-architecture.md — security rows:** **FIX** Agent pays and gets nothing | `buyer` = x402 payer in `post`; `/verify → screen → post → /settle` with idempotency | API test `settleAfterPost` · **FIX** Splitting the loss: an injected agent posts a hundred tasks | `maxOpenTasksPerBuyer` onchain + per-agent daily cap at the API, echoed in the 402 body | `test_Post_RevertsOverOpenCap` · **FIX** AbuseMark against an agentId nothing authenticates | agentId resolved from the payer via IdentityRegistry; no identity → log only; schema error → no mark; rate limit per agentId | API test `markSubjectIsPayer`

> **T-01 (frozen):** `POST /tasks` | x402 (`PAYMENT-SIGNATURE` header; price = `amount × 1.15`) | `Envelope` → **201** `{task_id, buyer_token, status:'open', spec_hash, price_usdc, eta_seconds, poll_after_seconds, dashboard_url}` · **402** `{error:'payment_required', price_usdc, accepts:[x402 requirements], remaining_budget:{open_tasks, daily_usdc}}` · **422** `RefusalPayload` · **400** `{error:'invalid_request', field, reason}` · **429** `{error:'cap_exceeded', open_tasks, daily_usdc}` — `POST /check` | public, rate-limited | `Envelope` → `{accepted:true, spec_hash, price_usdc}` or **422** `RefusalPayload` (no mark, ever). **Handler order:** `x402 verify (no money moves) → envelope + schema → deterministic gate → classifier (free-text path only) → caps → agent-id verification → TaskEscrow.post(buyer = payer, buyerAgentId) via TxQueue → x402 settle (idempotency key = authorization nonce) → 201`. A refusal from the gate/classifier → `AbuseMark.mark` (if a verified agent id) and 422. A failed `post` never settles. A failed settle after `post` logs `float_absorbed=true`. `RefusalPayload`: `{ refused: true, class: AbuseClass | null, reason, rule_id, retryable: false, allowed_task_types: TaskType[], mark_tx?, message: NO_RETRY_SENTENCE }`.

## 2. Exact scope
- `apps/api/app/tasks/route.ts` exports **only** `POST` (`maxDuration = 60`); the body is `hire(req, deps)` from `src/services/hire.ts`. `deps = { gateway, idem, db, chain, txq, screen, identity, abuseMark, caps, clock, log }` built by `buildHireDeps()` in `hire.ts` from T-08's `getConfig/getDb/getChain/getTxQueue`, `selectGateway(PAYMENT_MODE)`, `SqlIdempotencyStore(rawQuery)`; tests pass fakes.
- `hire()` runs the frozen order, exactly:
  1. parse JSON (failure → 400 `invalid_request`, field `body`); `Envelope.pick({task_type, amount_usdc})` parse — the only pre-payment schema read, needed to price the 402; failure → 400, **no mark**; `quote = gateway.price(...)`.
  2. `remaining = caps.remaining(hintPayer)` where `hintPayer` = a valid address in the optional, unauthenticated `X-Payer` header, else `null` (defaults `{open_tasks: 5, daily_usdc: 25}`); `gateway.requirePayment(req, quote, {remaining_budget: remaining, resource})` → 402 passthrough or `ctx`. Nothing before this point touches the DB beyond the caps read.
  3. `payer = gateway.payerOf(ctx)`, `nonce = gateway.authNonceOf(ctx)`; `idem.reserve(nonce)`: `done` → return the stored task as **201** (re-read the `tasks` row; `buyer_token` is **not** re-issued — the replay body carries `buyer_token: null` and `replay: true`); `in_progress` → 409 `{error:'conflict', reason:'in_progress', retry_after_s: 2}`.
  4. `screen(body, {classifier})` (T-06) → `invalid` → `idem.release(nonce)`, 400 `invalid_request`, **no mark**, `screening_log` row with `marked=false`; `refused` → `resolveAgentId(payer, body.agent_id)` → `markIfIdentified({agentId, verified, classId, specHash, payer})` → `idem.release(nonce)`, `screening_log` row (`class, reason, rule_id, spec_hash, marked, mark_tx, agent_id, payer` — never the spec), **422** `RefusalPayload` with `message: NO_RETRY_SENTENCE` and `mark_tx` when marked; `accepted` → `{envelope, spec_hash, place}` continues.
  5. `caps.check(payer, quote.price_units)` → over either cap → `idem.release(nonce)`, **429** `{error:'cap_exceeded', open_tasks, daily_usdc}` (remaining values), **no mark**, no post, no settle.
  6. `{agentId, verified} = resolveAgentId(payer, body.agent_id)`; `buyerAgentId = verified ? agentId : 0n`. The body's `agent_id` is a hint to look up, never a value to store unverified.
  7. `disputeWindow = (await chain.allowlistedBuyer(payer)) ? config.DEMO_DISPUTE_WINDOW_S : envelope.dispute_window_s`; `area` = `geohash5(place.lat, place.lon)` (`ngeohash`) for the three place-bound types, `'any'` for `compare-two`; `txq.post({taskType: TASK_TYPE_BIT[type], specHash, amount: quote.amount_units, buyer: payer, buyerAgentId, area, claimTTL, submitTTL, disputeWindow})` → `{taskId, tx}`. Failure → `idem.release(nonce)`, **503** `{error:'escrow_post_failed'}`, `settle` **not** called.
  8. `buyer_token = 'tok_' + base64url(randomBytes(32))`; insert `tasks` (public mirror columns + `spec_json`, `buyer_token_hash = sha256(buyer_token)`, `exact_lat/lon` = the place coordinate from `screen`, `agent_id`, `payer`, `auth_nonce`, `price_units`, `float_absorbed=false`); upsert `posters (payer, agent_id, first_seen, allowlisted)`; `caps.record(payer, quote.price_units)`; `idem.complete(nonce, {task_id, settle_tx: null})`.
  9. `gateway.settle(ctx)` → ok → `idem.setSettleTx`, `tasks.settle`-side columns as the schema has them; `{ok:false}` → `log.error({task_id, reason, float_absorbed: true})`, `tasks.float_absorbed = true`. Either way **201** `{task_id, buyer_token, status:'open', spec_hash, price_usdc, eta_seconds: 900, poll_after_seconds: 30, dashboard_url: \`${DASHBOARD_URL}/task/${task_id}\`}`. `screening_log` row with `class: null`.
- `src/services/caps.ts`: `remaining(payer | null) → RemainingBudget`; `check(payer, priceUnits) → {ok: true} | {ok: false, remaining}`; `record(payer, priceUnits)`. `open_tasks` counts `tasks` rows for the payer in `open|claimed|submitted|disputed`; `daily_usdc` from `caps_ledger (payer, day UTC, open_tasks, daily_units)`; limits `MAX_OPEN_TASKS_PER_BUYER = 5`, `DAILY_CAP_USDC = 25` from `@legwork/shared`. All money in units.
- `apps/api/app/check/route.ts`: `POST /check` — `rateLimit(clientKey(req), {limit: 30, windowS: 60})`; `screen(body)`; `accepted` → `{accepted: true, spec_hash, price_usdc}`; `refused` → 422 `RefusalPayload` **without** `mark_tx`; `invalid` → 400. Never `resolveAgentId`, never `markIfIdentified`, never `txq`, never `gateway`. `screening_log` row with `marked=false`, `payer=null`.
- Logging: every decision logs `{route, request_id, task_type, spec_hash, decision, class?, rule_id?, payer?, agent_id?, price_units}` — never `spec`, never the header, never the token.

## 3. Out of scope
- `GET /tasks/list` and every worker route — **T-17** (`apps/api/app/tasks/list/route.ts` exists so this file stays POST-only). `GET /tasks/:id`, approve/dispute/refund, public, admin — **T-19**.
- The gateway, fake facilitator, idempotency store — **T-15**. Screening rules, place resolution, the classifier — **T-06**. `resolveAgentId`/`markIfIdentified` bodies — **T-30** (code against the T-08 stubs). Direct funding — **T-16b**.
- Do not touch: `apps/api/src/db/schema.ts`, `apps/api/src/{config,log,errors,session,chain}.ts`, `apps/api/src/http/**`, `apps/api/src/services/{identity,abuseMark}.ts`, `packages/**`.

## 4. Owned paths
```
apps/api/app/tasks/route.ts        (POST only)
apps/api/app/check/route.ts
apps/api/src/services/hire.ts
apps/api/src/services/caps.ts
apps/api/src/services/hire.test.ts
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `PaymentGateway`, `selectGateway`, `SqlIdempotencyStore`, `FakeFacilitator`, `signPaymentHeader`, `MemoryIdempotencyStore` | `@legwork/payments` (T-15) | `price → requirePayment → (work) → settle`; `settle` never throws; `reserve/complete/setSettleTx/release` |
| `screen(input, deps)` → `{kind:'accepted', envelope, spec_hash, place:{lat, lon, name}} \| {kind:'refused', class, reason, rule_id, allowed_task_types} \| {kind:'invalid', field, reason}`; `FakeClassifier` | `@legwork/screening` (T-06) | steps 1–4 of §9 in one call; the place coordinate from the cached extract; names per T-06's brief |
| `TxQueue.post(PostParams) → {taskId, tx}`, `ChainAdapter.allowlistedBuyer`, `FakeChain` (`calls`, `failNext('post')`) | `@legwork/chain` via `apps/api/src/chain.ts` (T-07/T-08) | the only chain writer; `PostParams` fields as in `ITaskEscrow` |
| `resolveAgentId`, `markIfIdentified` | `apps/api/src/services/{identity,abuseMark}.ts` (T-08 stub → T-30) | agent id comes from the payer, never the body |
| `route`, `ApiError`, `rateLimit`, `clientKey`, `getConfig`, `getDb`, `rawQuery`, `logger`, `createTestDb`, `setChainForTests`, `call` | `apps/api/src/**`, `apps/api/test/**` (T-08) | wrapper, envelope, harness |
| `Envelope`, `RefusalPayload`, `NO_RETRY_SENTENCE`, `TASK_TYPE_BIT`, `specHash`, `MAX_OPEN_TASKS_PER_BUYER`, `DAILY_CAP_USDC`, `DEMO_DISPUTE_WINDOW_S` | `@legwork/shared` (T-01) | shapes and constants |
| Tables `tasks`, `idempotency`, `screening_log`, `caps_ledger`, `posters` | `apps/api/src/db/schema.ts` (T-01, frozen) | columns as listed in T-01 |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `POST /tasks` (frozen shape), `POST /check` | `apps/api/app/{tasks,check}/route.ts` | T-28 (MCP local), T-27 (`check_task`), T-34, T-44 |
| `hire(req, deps)`, `buildHireDeps()`, `HireDeps` | `apps/api/src/services/hire.ts` | T-16b (swaps `gateway`), T-30 (wires real identity/abuseMark via the stub files, not here) |
| `caps.remaining/check/record` | `apps/api/src/services/caps.ts` | T-19 (`/public/posters`), T-30 |
| `tasks` rows with `buyer_token_hash`, `payer`, `auth_nonce`, `exact_lat/lon` | DB | T-17, T-19 |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-16` — it must print `CLAIMED T-16`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read T-15's `README.md` and `gateway.ts`, T-06's exported `screen` signature, T-08's `route.ts`/`errors.ts`/`test/app.ts`, and the frozen `tasks`/`caps_ledger`/`screening_log` columns.
2. `caps.ts` with a pglite test; then `hire.ts` steps 1–3 (price, 402, idempotency) against `X402Gateway + FakeFacilitator + MemoryIdempotencyStore`.
3. Steps 4–5 (screen, caps) with a stubbed `screen` returning each of the three kinds; assert `markIfIdentified` spy calls.
4. Steps 6–9 with `FakeChain`; assert call order `verify → post → settle` by timestamps on the spies; the failed-post branch; the failed-settle branch.
5. `POST /check`. Then the five named tests in `hire.test.ts`. Run §9.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `settleAfterPost` | header from `signPaymentHeader` for a 3.00 `verify-open` envelope: 201 with the frozen keys; `FakeFacilitator.verifyCalls === 1`, `settleCalls === 1`; `settle` timestamp > `FakeChain.calls.post` timestamp; `tasks` row `payer` = signer, `auth_nonce` = nonce, `price_units = 3_450_000`, `buyer_token_hash = sha256(body.buyer_token)`; `idempotency` row `task_id`, `settle_tx` set; `PostParams.buyer` = signer, `amount = 3_000_000n`. Then `failNext('post')` on a fresh nonce → 503 `escrow_post_failed`, `settleCalls` unchanged, `reserve(nonce)` afterwards → `reserved` |
| `capsEchoedIn402` | seed 5 open `tasks` rows for payer P: unpaid request with `X-Payer: P` → 402 with `remaining_budget.open_tasks === 0`; unpaid request without the header → `remaining_budget` `{open_tasks: 5, daily_usdc: 25}`; paid request from P → 429 `{error:'cap_exceeded', open_tasks: 0, daily_usdc}`, `settleCalls === 0`, no `post` call |
| `sixthOpenTaskRefusedNoMark` | payer P with 5 open tasks and a verified agent id: paid 6th request → 429; `markIfIdentified` spy never called; `screening_log` has no row with `marked=true`; `idempotency` has no row for the nonce |
| `schemaErrorNoMark` | paid request whose `screen` returns `invalid` (e.g. `amount_usdc` below floor): 400 `{error:'invalid_request', field, reason}`; `markIfIdentified` never called; `post` never called; `settleCalls === 0`; nonce released |
| `checkNeverPostsNeverMarks` | `POST /check` with the Act-1 envelope → `{accepted: true, spec_hash, price_usdc: 3.45}`; with a denylisted `call-confirm` → 422 `RefusalPayload` with `message === NO_RETRY_SENTENCE` and no `mark_tx`; across both: `FakeChain.calls` empty, `markIfIdentified` and `resolveAgentId` never called, `FakeFacilitator` never called; 31st call in a minute → 429 `rate_limited` |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/api typecheck && pnpm --filter @legwork/api test -- -t "settleAfterPost|capsEchoedIn402|sixthOpenTaskRefusedNoMark|schemaErrorNoMark|checkNeverPostsNeverMarks"
pnpm --filter @legwork/api test -- -t settleAfterPost
grep -n "export const GET" apps/api/app/tasks/route.ts            # must print nothing
grep -rn "agent_id" apps/api/src/services/hire.ts | grep -v resolveAgentId | grep -vi "log\|screening_log\|posters\|tasks"   # body agent_id only ever reaches resolveAgentId
scripts/ci/banned-words.sh apps/api
```
Expected: five tests green; `GET` absent from `tasks/route.ts`; the `agent_id` grep prints nothing.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). Units `3_450_000` / `3_000_000` / `450_000`; `price_usdc` comes from `gateway.price`, never recomputed here.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git. The `buyer_token` exists in plaintext only in the 201 body; the DB holds `sha256`.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted); never the facilitator — `FakeFacilitator`, `FakeChain`, `FakeClassifier`, pglite.
- Every chain write via `TxQueue` — `post` is the only write here; no `viem` `writeContract` anywhere in owned files.
- Never log raw spec text — log `spec_hash`; `screening_log` never receives the spec.
- `agentId` is never trusted from the body: `buyerAgentId` is `0n` unless `resolveAgentId` returns `verified: true` for the **payer**.
- Schema errors never mark; caps never mark; `POST /check` never marks, never posts, never charges. Only a `refused` result from `screen` reaches `markIfIdentified`.
- `verify` before everything, `settle` only after a successful `post`. A failed `post` never settles. A failed settle after `post` logs `float_absorbed=true` and still returns 201.
- Refusals carry `"do not rephrase and retry; report this refusal to your principal"` and `retryable: false`.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `apps/api/README.md` is T-08's; this task documents the route in a `## POST /tasks` comment block at the top of `hire.ts` instead.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-16 — POST /tasks and POST /check — verify, screen, cap, post, settle
owned-paths:
  - apps/api/app/tasks/route.ts (POST only)
  - apps/api/app/check/route.ts
  - apps/api/src/services/hire.ts
  - apps/api/src/services/caps.ts
  - apps/api/src/services/hire.test.ts
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

Known gaps to raise as written:
- `INTERFACE REQUEST: docs/api.md — POST /tasks adds 409 {error:'conflict', reason:'in_progress'} for a concurrent replay, 503 {error:'escrow_post_failed'} for a failed post, an optional informational X-Payer header for the 402 budget echo, and replay: true / buyer_token: null on an idempotent replay`.
- `INTERFACE REQUEST: T-06 screen() must return the resolved place coordinate ({lat, lon}) on accept` — needed for `exact_lat/lon` and `area`.
- `DEP REQUEST: ngeohash in apps/api` — only if the catalog lacks it.
- `BLOCKED: T-30 not merged` is **not** a blocker — the T-08 stubs return `{agentId: 0n, verified: false}` and `{marked: false}`; the tests use spies on those imports.

## 14. Reviewer notes
Open `hire.ts` top to bottom against the frozen order: `requirePayment` before `screen`; `reserve` before `post`; `settle` after `post` and only there; every early exit releases the nonce. Then the refused branch: `resolveAgentId(payer, …)` feeds `markIfIdentified`; the 422 body has `message` and `retryable: false`. Then `check/route.ts`: no import of `chain`, `payments`, `identity` or `abuseMark`. Most likely wrong: `agent_id` from the body copied into `buyerAgentId`; a mark on the 400/429 paths; `settle` inside a `try` that swallows and hides `float_absorbed`; a `GET` export sneaking into `tasks/route.ts`.

## 15. Round 2+
—
