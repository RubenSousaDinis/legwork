---
id: T-19
title: Buyer, public and admin routes — long-poll status, approve/dispute/refund, /public/*, /admin/*
lane: B
day: 2                               # opens Day 2 evening once T-08 is merged; lands Day 3
size: M
agent_class: C
must: true
depends_on: [T-08]
owned_paths:
  - apps/api/app/tasks/[id]/route.ts
  - apps/api/app/tasks/[id]/{approve,dispute,refund}/**
  - apps/api/app/public/**             # EXCEPT public/proofs/** (T-18) and public/observations/** (T-40)
  - "!apps/api/app/public/proofs/**"
  - "!apps/api/app/public/observations/**"
  - apps/api/app/admin/**              # EXCEPT admin/sweep/** (T-17)
  - "!apps/api/app/admin/sweep/**"
  - apps/api/src/services/statusBus.ts
  - apps/api/src/services/buyerToken.ts
  - apps/api/test/routes/{buyer,public,admin}*.test.ts
labels: [area:api, wave:2, size:M, agent:cloud]
branch: t-19/buyer-public-admin-routes
---

# T-19 — Buyer, public and admin routes — long-poll status, approve/dispute/refund, /public/*, /admin/*

## 1. Context
After `POST /tasks` (T-16) the agent needs three things from the API: a status it can wait on (`GET /tasks/:id?wait=`, the shape the MCP `task_status` tool returns), the buyer verbs (`approve`, `dispute`, `refund`), and a public dashboard surface (`/public/*`) that shows receipts and refusal counts without leaking what only the buyer paid for. The operator needs `/admin/*` for the disclosed powers (`pause`, `resolve`, `reset-worker`, demo seed/reset), each call audit-logged. This task is the read side of the product: it never posts a task, never screens, never touches a proof file; it composes rows written by T-16/T-17/T-18 into the frozen shapes and is the one place that turns a worker's text into `WorkerAnswer`. Vercel Hobby caps a function at 60 s, so the long-poll waits at most 50 s and says when it gave up instead of pretending.

> **02-architecture.md — Task API:** x402 seller (exact-EVM scheme, USDC on Base Sepolia, reference facilitator). Order on `POST /tasks`: `/verify` the payment authorization (no money moves) → screen → if refused: AbuseMark (if the payer has an identity) and a 4xx that names the class and the reason → if accepted: `TaskEscrow.post(…, buyer = payer)` from the operator float → `/settle` with an idempotency key on the authorization nonce (a retried settle cannot double-charge). A failed `post` never takes the agent's money. If `settle` fails after `post`, the float absorbed the task and the log says so. "Our custody is the one block between settlement and escrow, and we say so." Per-agent rolling cap (5 open tasks, $25/day in v0), echoed in the 402 body so an honest agent can read its own remaining budget. Endpoints: `POST /tasks` (402-gated; price = amount × 1.15), `GET /tasks/:id` (long-poll with `wait`), `POST /tasks/:id/approve`, `POST /tasks/:id/dispute`, `POST /tasks/:id/refund` (triggers `expire` when eligible), `POST /check` (dry run, rate-limited per identity/IP, logged), and the worker-session routes: `POST /session` (walletAuth SIWE verified server-side, bound to the stored nullifier), `POST /register`, `GET /tasks?area=` (3-second poll), `POST /tasks/:id/claim`, `POST /tasks/:id/release-claim` (give up, no penalty inside the TTL), `POST /proofs`, `POST /tasks/:id/submit`, `POST /tasks/:id/report` (optional).

> **02-architecture.md — security rows:** **FIX** Agent pays and gets nothing (expiry refund, settle-then-post failure, `resolve`) | `buyer` = x402 payer in `post`; `expire` and `resolve(toBuyer)` pay `buyer` · **FIX** Junk proof, nobody watching the dispute window | `approve_task` / `dispute_task` tools; the API auto-disputes on schema/geofence failure; `disputeWindow` per task · **FIX** Worker-authored text injected into the buyer's agent | Answer = enum + ≤120-char escaped note, wrapped as untrusted data in the tool result · **FIX** Proof photos deanonymise the worker | Private store, EXIF stripped, signed URLs, rounded coordinate in every public record, `geohash5` in the subgraph · **FIX** Operator key compromise | Four keys with one job each; `pause` on `post`/`claim` only; single-signer disclosed · **DOC** Worker's approximate location exposed to the poster | Rounded coordinate only; stated.

> **T-01 (frozen) rows:** `GET /tasks/:id?wait=0..50` | public (+ optional `X-Buyer-Token` reveals `proof.url`) | → `{task_id, status, task_type, amount_usdc, fee_usdc, area, posted_at, claimed_at?, submitted_at?, released_at?, answer?: WorkerAnswer, proof?: {hash, hash_ok, url?, captured_at, coordinate_rounded?: {lat,lon}, gps_unavailable}, tx:{post, claim?, submit?, release?}, dashboard_url, changed: boolean, poll_after_seconds}` · `POST /tasks/:id/approve` · `/dispute` (`{reason}`) · `/refund` | buyer-token (`X-Buyer-Token`) | → `{task_id, status, tx}`; refund → **409** if not yet eligible · `GET /public/feed` · `/public/task/:id` · `/public/refusals` · `/public/posters` · `/public/preflight?task_type=&area=` | public | never raw spec text, never an exact coordinate, never a buyer token, never a requester identity · `POST /admin/pause` · `/unpause` · `/resolve` (`{task_id, to_buyer}`) · `/reset-demo` · `/reset-worker` (`{nullifier}`) · `/sweep` · `/seed-demo` | admin-key (`X-Admin-Key`) | → `{ok:true, tx?}`; every call audit-logged · Generic error bodies: **429** `{error:'rate_limited', retry_after_s}` · **401** `{error:'unauthorized'}` · **404** `{error:'not_found'}`. `WorkerAnswer`: `{ answer, note?, _source: 'worker', _untrusted: true }` — the only shape in which worker text ever reaches an agent. `LONGPOLL_MAX_S = 50`, `PUBLIC_COORD_DECIMALS = 3`. Tables: `tasks` (public columns mirroring `Task` + private `spec_json`, `buyer_token_hash`, `exact_lat/lon`, `agent_id`, `payer`, `auth_nonce`, `price_units`, `float_absorbed`), `proofs`, `screening_log` (`id, at, task_type, class, reason, rule_id, spec_hash, marked, mark_tx, agent_id, payer` — never the raw spec), `posters` (`payer, agent_id, first_seen, allowlisted`), `admin_audit`.

## 2. Exact scope
- `statusBus.ts`: `parseWait(raw: string | null) → number` — `parseInt`; `NaN` or `< 0` → `0`; `> LONGPOLL_MAX_S` → `50`. `versionOf(row) → string` = first 16 hex of `sha256(JSON.stringify([state, worker, claimed_at, submitted_at, released_at, tx_claim, tx_submit, tx_release]))`. `export const deps = { sleep: (ms) => new Promise(r => setTimeout(r, ms)) }` — every wait goes through `deps.sleep` (tests stub it). `waitForChange(db, taskId, baseline: string, maxWaitS) → Promise<{row, changed: boolean}>`: `deadline = Date.now() + maxWaitS * 1000`; `for (i = 0; i < maxWaitS; i++) { if (Date.now() >= deadline) break; await deps.sleep(1000); row = re-read; if (versionOf(row) !== baseline) return {row, changed: true} }` → `{row, changed: false}`. `eligibleAction(row, nowS) → 'autoRelease' | 'expire' | null`: `submitted && nowS ≥ submitted_at + dispute_window_s` → `autoRelease`; `open && nowS > posted_at + claim_ttl_s` or `claimed && nowS > claimed_at + submit_ttl_s` → `expire`; else `null` (pure; T-17's `sweep` may import it). `applyTransition(db, taskId, {state, at, txColumn, tx})` — the single DB writer of this task. `buildTaskView(row, proofRow | null, {reveal: boolean}) → Promise<body minus changed/poll_after_seconds>`.
- `GET /tasks/:id` (`maxDuration = 60`, `runtime = 'nodejs'`, rate-limit 120/min per client): unknown id → 404 `not_found`. `wait = parseWait(searchParams.get('wait'))`. Baseline = the request header `If-None-Match` if present, else `versionOf(row at request start)`. Lifecycle: if `eligibleAction(row, now)` is non-null call `settleIfEligible(taskId)` from `apps/api/src/services/lifecycle.ts` (T-17) **if that module is merged when you fill the draft PR and run `gh pr ready`**; otherwise `statusBus.ts` carries `const lifecycle = { settleIfEligible: async (_id: number) => null }` with `// TODO(T-17)` and the PR body says so. Then `changed = versionOf(row) !== baseline`; if `!changed && wait > 0` → `waitForChange`. Response headers `ETag: "<version>"`, `Cache-Control: no-store`. `poll_after_seconds`: terminal state (`released | refunded | resolved`) → `0`; wait elapsed with no change → `1`; otherwise `3`.
- View rules (`buildTaskView`): `status` = lowercase `TaskState` name; `amount_usdc = fromUsdcUnits(amount)` (3.00), `fee_usdc = fromUsdcUnits(fee)` (0.45); timestamps ISO; `tx` from the `tasks` tx-hash columns (mirroring `txPost/txClaim/txSubmit/txRelease`), absent keys omitted, never `null`; `dashboard_url = ${DASHBOARD_URL}/task/${id}`. `answer` only when state ∈ `submitted | released | disputed | resolved` and the row's `answer` is set: exactly `{answer, note?, _source: 'worker', _untrusted: true}` — `note` copied as stored (T-17 capped it at 120 chars), never interpolated into any other string. `proof` only when `proofHash` is set: `{hash, hash_ok, url?, captured_at, coordinate_rounded?, gps_unavailable}` with `hash_ok` from T-18's `rehash(hash)` computed **once per request at response time** (never cached to `true`), `coordinate_rounded = round100m(exact_lat, exact_lon)` only when the proof has GPS, and `url = signProofUrl(hash, submitted_at_s + dispute_window_s + 3600)` **only when `reveal`** (a valid `X-Buyer-Token`). A wrong token on GET is not an error: `reveal = false`, same body without `url`.
- `buyerToken.ts`: `hashBuyerToken(token) = sha256(utf8 token) hex`; `newBuyerToken() → {token: randomBytes(32).toString('base64url'), hash}` (T-16 imports it); `verifyBuyerToken(token: string | null, storedHash: string | null) → boolean` = both present and `timingSafeEqual(Buffer.from(hashBuyerToken(token), 'hex'), Buffer.from(storedHash, 'hex'))` — no `===` on tokens or hashes anywhere in the file; `requireBuyerToken(req, row)` → 401 `{error:'unauthorized'}` for a missing **and** for a wrong header (same status, same body, same log line `buyer_token_rejected {task_id}` — never the presented value).
- `POST /tasks/:id/approve`: token → state must be `submitted` (else 409 `{error:'bad_state', status}`) → `TxQueue` `approve(taskId)` as role `relayer` → `applyTransition('released', released_at = now, tx_release)` → 200 `{task_id, status:'released', tx}`. `POST /tasks/:id/dispute` (`{reason}`: string 1–300, zod; 400 `invalid_request` otherwise): `submitted` and `now < submitted_at + dispute_window_s` (else 409 `{error:'dispute_window_closed'}`) → `dispute(taskId)` → `applyTransition('disputed')` → `{task_id, status:'disputed', tx}`; `reason` goes to the structured log (`dispute {task_id, reason}`) and to `tasks.dispute_reason` if the frozen schema has it — it never goes onchain. `POST /tasks/:id/refund`: `eligibleAction(row, now) === 'expire'` else 409 `{error:'not_eligible', status, eligible_at}` → `expire(taskId)` → `applyTransition('refunded')` → `{task_id, status:'refunded', tx}` (3.45 = 3.00 + 0.45 goes back to the buyer; no amount in the body). Every relay: a decoded revert → 409 `{error:'chain_revert', name}`; transport failure → 503 `{error:'chain_unavailable'}`; the row is written only after the tx hash is returned.
- `apps/api/app/public/_shared.ts`: `publicTaskView(row, proofRow | null)` builds by **allowlist** (never `...row`): `{task_id, state, task_type, price_usdc, fee_usdc, area, seeded, posted_at, claimed_at?, submitted_at?, released_at?, answer?, proof?, tx: {post, claim?, submit?, release?}, links: {post, claim?, …} (`https://sepolia.basescan.org/tx/<hash>`), dashboard_url}` where `price_usdc` is the posted rate the worker keeps (3.00), `fee_usdc` 0.45 (the dashboard renders `3.00 + 0.45 = 3.45`), `answer` is the enum value only (never the `note`), `proof = {hash, hash_ok, captured_at, coordinate_rounded?, gps_unavailable}` (no `url`, ever). All `/public/*` routes: rate-limit 60/min per client, `Cache-Control: public, max-age=5`.
- `GET /public/feed` → `{tasks: publicTaskView[]}` — the last 20 rows by `posted_at desc`. `GET /public/task/:id` → `publicTaskView` (404 `not_found` if unknown). `GET /public/refusals` → `{classes: [{class, count}] (the six labels, zero-filled, from screening_log where class is not null), recent: [{at, task_type, class, rule_id, marked}] (last 20), examples: [{task_type, class, reason, rule_id, example: true}]}` — `examples` are the refusal rows of `demo-data.json` (parsed with `DemoData` from `@legwork/shared`); `recent` never carries `reason`, `spec_hash`, `agent_id` or `payer`. `GET /public/posters` → `listPosters()` from `apps/api/src/services/posters.ts` (T-30) when merged, else `{distinct_external_buyers: 0, external_tasks: 0, source: 'stub'}` — never a `payer` or `agent_id`. `GET /public/preflight?task_type=&area=` → validate (`TaskType`; `area` `^[0-9b-hjkmnp-z]{5}$`; else 400) → `preflightWorkers({task_type, area})` from `apps/api/src/services/preflight.ts` (T-27) when merged, else the stub `{active: 0, verified: 0, seeded: 0, median_minutes: null, median_source: 'n/a', n_real: 0, score_floor: 0, dashboard_url}`.
- `apps/api/app/admin/_shared.ts`: `requireAdminKey(req)` — `getConfig().adminApiKey` unset → 404 `{error:'not_found'}` for **every** admin route (the group does not exist); header `X-Admin-Key` compared as `timingSafeEqual(sha256(header), sha256(key))` → 401 `{error:'unauthorized'}` on mismatch (log `admin_unauthorized {client}` only). `audited(route, handler)`: inserts one `admin_audit` row per authorized call **before** running it (`route`, `body` with no header values, `outcome: 'started'`) and updates it after (`outcome: 'ok' | 'error'`, `tx?`, `error?`); the presented key is never stored. Bodies zod-validated → 400 `invalid_request`. Rate-limit 30/min.
- Admin routes, all `→ {ok: true, tx?}` through the chain adapter's owner-key writes (`packages/chain` calls that role `owner`; the key is `DEPLOYER_PRIVATE_KEY`): `POST /admin/pause` → `pause()`; `POST /admin/unpause` → `unpause()`; `POST /admin/resolve {task_id, to_buyer}` → row must be `disputed` (409 `bad_state`) → `resolve(taskId, toBuyer)` → `applyTransition('resolved', tx_release)` (to buyer: 3.45 back; to worker: 3.00 to the worker and the 0.45 fee back to the buyer — zero fee on any resolve); `POST /admin/reset-worker {nullifier}` (decimal or 0x-hex string → `BigInt`) → `resetWorker(nullifierHash)` → `nullifiers.worker = null` for that row; `POST /admin/reset-demo {confirm: 'reset-demo'}` (else 400) → deletes all rows of `tasks, proofs, screening_log, marks_log, caps_ledger, idempotency, direct_quotes, observations, sessions, idkit_sessions` (keeps `nullifiers, posters, nonces, admin_audit`; no chain call; `tx` absent); `POST /admin/seed-demo` → inserts the feed rows of `demo-data.json` into `tasks` with `seeded = true` and `tx_post = tx_placeholder`, idempotent (already present → `inserted: 0`), returns `{ok: true, inserted}`. `sweep` is T-17's — do not create `admin/sweep/`.

## 3. Out of scope
- `POST /tasks`, `buyer_token` issuance, x402 — **T-16** (it imports `newBuyerToken`). Worker routes, `submit`, auto-dispute, `lifecycle.ts`, `admin/sweep` — **T-17**. Proof upload, `rehash`, `signProofUrl`, `round100m`, `public/proofs` — **T-18**. `public/observations` — **T-40**. Poster stats service — **T-30**. Preflight service — **T-27**. Chain seeding (`seedWorker`, `setAllowlistedBuyer`) — **T-14/T-29**.
- Do not touch: `apps/api/app/tasks/route.ts`, `apps/api/app/tasks/[id]/{claim,release-claim,submit,report}/**`, `apps/api/app/public/proofs/**`, `apps/api/app/public/observations/**`, `apps/api/app/admin/sweep/**`, `apps/api/src/db/schema.ts`, `apps/api/src/{config,log,errors,session,chain}.ts`, `packages/**`.

## 4. Owned paths
```
apps/api/app/tasks/[id]/route.ts
apps/api/app/tasks/[id]/{approve,dispute,refund}/**
apps/api/app/public/**            (except public/proofs/**, public/observations/**)
apps/api/app/admin/**             (except admin/sweep/**)
apps/api/src/services/{statusBus,buyerToken}.ts
apps/api/test/routes/{buyer,public,admin}*.test.ts
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `route`, `ApiError`, `rateLimit`, `clientKey`, `getConfig`, `getDb`, `logger`, `createTestDb`, `call` | `apps/api/src/**`, `apps/api/test/**` (T-08) | envelope, generic error bodies, pglite harness, `adminApiKey`, `dashboardUrl` |
| `TxQueue`, `FakeChain` | `@legwork/chain` (T-07) | the only chain writer: the adapter's own write methods (`claimFor`, `approve`, `registerFor`, `pause`, … → `{hash}`; T-07 ships no `send({role, …})` — the role is bound to the method); decoded revert names; `FakeChain.calls`, `failNextWith(name)` |
| `tasks`, `proofs`, `screening_log`, `posters`, `admin_audit`, `nullifiers` | `apps/api/src/db/schema.ts` (T-01, frozen) | columns above; `tasks.answer/note` (T-17 writes), `tasks.seeded` (this task writes) |
| `rehash`, `signProofUrl`, `round100m`, `MemoryProofStore` | `apps/api/src/services/{proofStore,signedUrl,geo}.ts` (T-18) | `hash_ok`, buyer URL (`dispute window + 1 h`), rounding |
| `settleIfEligible(taskId)` | `apps/api/src/services/lifecycle.ts` (T-17) | lazy `autoRelease`/`expire`; stubbed until merged |
| `listPosters()`, `preflightWorkers({task_type, area})` | `apps/api/src/services/{posters,preflight}.ts` (T-30, T-27) | stubbed until merged |
| `TaskState`, `TaskType`, `AbuseClass`, `fromUsdcUnits`, `LONGPOLL_MAX_S`, `DemoData`, `WorkerAnswer` | `@legwork/shared` (T-01) | names, 50, demo rows |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `GET /tasks/:id?wait=` (+ `ETag`/`If-None-Match`), `POST /tasks/:id/{approve,dispute,refund}` | `apps/api/app/tasks/[id]/**` | T-27 `task_status`/`approve_task`/`dispute_task`, dashboard (lane D), T-36 e2e |
| `GET /public/{feed,task/:id,refusals,posters,preflight}` | `apps/api/app/public/**` | dashboard (lane D), T-27 `preflight_workers`, pitch |
| `POST /admin/{pause,unpause,resolve,reset-demo,reset-worker,seed-demo}` | `apps/api/app/admin/**` | T-29 `demo:reset`/`demo:run`, operator |
| `newBuyerToken`, `hashBuyerToken`, `verifyBuyerToken`, `requireBuyerToken` | `apps/api/src/services/buyerToken.ts` | T-16 (issue), T-16b (`confirm`) |
| `parseWait`, `versionOf`, `waitForChange`, `eligibleAction`, `applyTransition`, `deps` | `apps/api/src/services/statusBus.ts` | T-17 (`sweep`, `submit` may reuse `applyTransition`), tests |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-19` — it must print `CLAIMED T-19`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read T-08's `http/route.ts`, `session.ts`, `test/app.ts`, `test/db.ts`; T-07's `TxQueue`/`FakeChain` types; the frozen `schema.ts` column names; T-18's `signedUrl.ts`/`proofStore.ts`/`geo.ts` signatures (§5). Note the real column names for `state`, `tx_*`, `answer`, `note`, `seeded`, `dispute_reason` — if one is missing, raise it per §13 and stub `null`.
2. `buyerToken.ts` + `statusBus.ts` (pure parts first: `parseWait`, `versionOf`, `eligibleAction`; then `waitForChange`, `applyTransition`). Unit-test `parseWait`/`eligibleAction` inline in `buyer.test.ts`.
3. `GET /tasks/:id` with the view; `approve`/`dispute`/`refund`. Chain via a `FakeChain`-backed `TxQueue` in tests; proof store via `MemoryProofStore` (T-18's test hook or `vi.mock` of `services/proofStore`).
4. `public/_shared.ts` + the five public routes; `admin/_shared.ts` + the six admin routes. Wire `lifecycle`/`listPosters`/`preflightWorkers` last: real import if merged, else the stubs named in §2.
5. Tests of §8 in `buyer.test.ts` (long-poll ×2, token), `public.test.ts`, `admin.test.ts`. Run §9.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `longPollReturnsOnStateChange` | real timers: seed a `claimed` task; `GET /tasks/1?wait=5` and after 300 ms update the row to `submitted` (answer `open`, note `door open at 09:12`); response arrives in < 3 000 ms with `changed: true`, `status: 'submitted'`, `answer` deep-equal `{answer:'open', note:'door open at 09:12', _source:'worker', _untrusted:true}`, `poll_after_seconds: 3`, an `ETag` header; a second call with `If-None-Match: <that ETag>` and `wait=0` → `changed: false` |
| `longPollCapsAtFifty` | `parseWait('120') === 50`, `parseWait('-3') === 0`, `parseWait('abc') === 0`, `parseWait('7.9') === 7`; with `deps.sleep = vi.fn(async () => {})`, `GET /tasks/1?wait=120` on an unchanging task → `{changed: false, poll_after_seconds: 1}` and `deps.sleep` called exactly 50 times with `1000`; `grep "maxDuration = 60"` in the route file |
| `buyerTokenRequired` | `approve` without `X-Buyer-Token` → 401 `{error:'unauthorized'}`; with a wrong token → 401 same body and `FakeChain.calls` has no `approve`; with the right token on a `submitted` task → 200 `{task_id:1, status:'released', tx}` and `FakeChain` recorded `approve(1n)` from role `relayer`; `GET /tasks/1` without token has no `proof.url`, with the token `proof.url` passes `verifyProofUrl` and expires at `submitted_at + dispute_window_s + 3600`; `refund` on a fresh `open` task → 409 `{error:'not_eligible'}` and no `expire` call; on an `open` task past `claim_ttl_s` → 200 `status:'refunded'` and `expire(1n)` recorded |
| `publicNeverLeaksSpecOrExactCoordinate` | seed a task whose `spec_json` contains `SENTINEL-SPEC-7f3a`, `payer` `0xPAYER…`, `agent_id` `8004-1207`, a buyer token `SENTINEL-TOKEN`, a proof at `(39.74362, -8.80713)` and a note `SENTINEL-NOTE`; the raw JSON text of `/public/feed`, `/public/task/1`, `/public/refusals`, `/public/posters`, `/public/preflight?task_type=verify-open&area=ez1dp` and of `GET /tasks/1` (no token) contains none of `SENTINEL-SPEC-7f3a`, `0xPAYER`, `8004-1207`, `SENTINEL-TOKEN`, `39.74362`, `-8.80713`, `exact_lat`, `spec_json`, `buyer_token`, `"url"`; `/public/task/1` has `coordinate_rounded` deep-equal `{lat: 39.744, lon: -8.807}`, `hash_ok: true`, `price_usdc: 3`, `fee_usdc: 0.45`, `answer: 'open'` and no `SENTINEL-NOTE`; `/public/refusals` `classes` has six entries |
| `adminAuditLogged` | `ADMIN_API_KEY` set: `POST /admin/pause` with the key → 200 `{ok:true, tx}`, `FakeChain` recorded `pause()` from role `owner`, `admin_audit` has one row `route: '/admin/pause', outcome: 'ok'` whose JSON does not contain the key; wrong key → 401, no chain call, no new audit row; `POST /admin/resolve {task_id: 1, to_buyer: true}` on a `disputed` task → `resolve(1n, true)` recorded, row `resolved`, audit row `body.task_id === 1`; `ADMIN_API_KEY` unset (new app instance) → `/admin/pause` and `/admin/resolve` → 404 `{error:'not_found'}` |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/api typecheck
pnpm --filter @legwork/api test -- -t longPollReturnsOnStateChange
pnpm --filter @legwork/api test -- -t longPollCapsAtFifty
pnpm --filter @legwork/api test -- -t buyerTokenRequired
pnpm --filter @legwork/api test -- -t publicNeverLeaksSpecOrExactCoordinate
pnpm --filter @legwork/api test -- -t adminAuditLogged
grep -n "maxDuration = 60" apps/api/app/tasks/\[id\]/route.ts                      # must print one line
grep -rn "spec_json\|exact_lat\|exact_lon\|buyer_token_hash\|auth_nonce" apps/api/app/public   # must print nothing
grep -rn "===" apps/api/src/services/buyerToken.ts                                 # must print nothing
grep -rn "writeContract" apps/api/app                                              # must print nothing (TxQueue only)
scripts/ci/banned-words.sh apps/api
```
Expected: five tests green; the first grep prints one line; the other three print nothing.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). `price_usdc`/`amount_usdc` is 3.00, `fee_usdc` 0.45; a refund or `resolve(toBuyer)` returns 3.45; `resolve` to the worker pays 3.00 and returns the 0.45 fee.
- No secrets in code or client bundles; read keys only from `process.env` via `getConfig()`; `.env.example` is the only env file in git. `ADMIN_API_KEY`, `PROOF_URL_SECRET`, `DASHBOARD_URL` come from `getConfig()`.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted); never Supabase, never a facilitator, never World — `FakeChain`, `MemoryProofStore`, pglite only.
- Every chain write goes through `TxQueue` (`approve`, `dispute`, `expire` as `relayer`; `pause`, `unpause`, `resolve`, `resetWorker` as `owner`); no `walletClient.writeContract` in this task, ever.
- The buyer token and the admin key are compared in constant time (`sha256` both sides, `timingSafeEqual`); a missing and a wrong token return the same 401; neither value is ever logged, stored, echoed or put in an audit row.
- Worker text reaches an agent only as `WorkerAnswer {answer, note?, _source: 'worker', _untrusted: true}` — never concatenated into a message, never in a public route (public gets the enum only).
- `/public/*` and the token-less `GET /tasks/:id` never carry `spec_json`, `exact_lat/lon`, `buyer_token_hash`, `payer`, `agent_id`, `auth_nonce`, a proof `url`, or a `note`; every public coordinate goes through `round100m`; public objects are built from an allowlist, never by spreading a row.
- Never log raw spec text: log lines carry `task_id`, `status`, `action`, `tx`, `client` — never `spec_json`, a token, a key or a coordinate.
- `changed` is never faked and the wait never exceeds 50 s: a wait that elapsed returns `changed: false, poll_after_seconds: 1`; `maxDuration = 60` stays in the file.
- `autoRelease` and `expire` are never gated by the paused flag — the API never checks `paused` before the lazy path or `refund`. `seed-demo` rows carry `seeded: true`; a seeded row is never rendered as a real task.
- Honesty line for the `hash_ok` doc comment, verbatim: "`task_status` and the proof card re-hash the served file and show "hash matches onchain ✓" — an anchor nobody checks is decoration."

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed; `public/proofs`, `public/observations`, `admin/sweep` untouched.
- [ ] Verification output from §9 pasted into the PR; the PR body names which of `lifecycle`/`listPosters`/`preflightWorkers` are real imports and which are stubs.
- [ ] Route documentation as a comment block at the top of `statusBus.ts` (`apps/api/README.md` is T-08's).
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-19 — Buyer, public and admin routes — long-poll status, approve/dispute/refund, /public/*, /admin/*
owned-paths:
  - apps/api/app/tasks/[id]/route.ts
  - apps/api/app/tasks/[id]/{approve,dispute,refund}/**
  - apps/api/app/public/**            (except public/proofs/**, public/observations/**)
  - apps/api/app/admin/**             (except admin/sweep/**)
  - apps/api/src/services/{statusBus,buyerToken}.ts
  - apps/api/test/routes/{buyer,public,admin}*.test.ts
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
Stubs in place: <none | lifecycle | listPosters | preflightWorkers>
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

Known gaps to raise as written:
- `INTERFACE REQUEST: apps/api/src/db/schema.ts — tasks.answer, tasks.note (written by T-17 at submit, read here), tasks.seeded (written by seed-demo), tasks.dispute_reason (optional)` — if any is missing.
- `INTERFACE REQUEST: docs/api.md — GET /tasks/:id ETag/If-None-Match and the poll_after_seconds rule (0 terminal · 1 wait elapsed · 3 otherwise); error bodies 409 {bad_state|not_eligible|dispute_window_closed|chain_revert}, 503 {chain_unavailable}; POST /admin/reset-demo requires {confirm:'reset-demo'}`.
- `INTERFACE REQUEST: T-16 imports newBuyerToken/hashBuyerToken from apps/api/src/services/buyerToken.ts (sha256 hex of the utf8 token)` — if T-16 merged first with its own hash, adopt T-16's function here and delete yours; say so in the PR.

## 14. Reviewer notes
Open `statusBus.ts` first: the loop counts iterations **and** checks the deadline; `deps.sleep` is the only sleep; `eligibleAction` matches `ITaskEscrow` (`≥` for `autoRelease`, `>` for both `expire` cases). Then `app/tasks/[id]/route.ts`: `maxDuration = 60`; `rehash` called once at response time; `url` only under `reveal`; `answer` built as `WorkerAnswer`. Then `buyerToken.ts` and `admin/_shared.ts`: `timingSafeEqual` over digests, no `===`, 404 when the key is unset, audit row inserted before the handler. Then `public/_shared.ts`: allowlist, `round100m`, enum-only `answer`, no `url`. Most likely wrong: `...row` spread into a public object; `hash_ok` read from a column instead of re-hashed; a wrong buyer token returning 403 with a different body; `wait=120` honoured; `reset-demo` deleting `nullifiers`; a real `writeContract` "just for pause".

## 15. Round 2+
—
