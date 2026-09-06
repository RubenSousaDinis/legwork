---
id: T-08
title: Task API skeleton — config, logging, DB, sessions, middleware, 501 stubs
lane: B
day: 1
size: M
agent_class: C
must: true
depends_on: [T-01b]
owned_paths:
  - apps/api/**                      # EXCEPT apps/api/src/db/schema.ts (frozen, T-01) and the stub files listed in §4, which pass to their owners on merge
labels: [area:api, wave:1, size:M, agent:cloud]
branch: t-08/api-skeleton
---

# T-08 — Task API skeleton — config, logging, DB, sessions, middleware, 501 stubs

Day 1 night → Day 2 morning. Everything in lane B (T-15 … T-20, T-27, T-30, T-35) starts from this PR, so it ships **small and boring**: no business logic, every later route present as a 501 stub with an `// OWNER:` line, and three tests that prove the session path end to end on pglite with a fake chain.

## 1. Context
`apps/api` is the Next.js App Router service hosted on Vercel from Day 1: the x402 seller (`POST /tasks`), the worker-session routes the mini-app calls, the public dashboard reads and the admin controls. This task lays the floor those routes stand on — a validated config, a logger that cannot leak a spec or a key, one Drizzle client for Supabase Postgres with a pglite twin for tests, the session model (idkit-session → worker-session), the rate-limit and admin-key guards, and a stub file per later route so that path ownership never overlaps.

> **02-architecture.md — Task API (worker-session routes):** `POST /session` (walletAuth SIWE verified server-side, bound to the stored nullifier), `POST /register`, `GET /tasks?area=` (3-second poll), `POST /tasks/:id/claim`, `POST /tasks/:id/release-claim` (give up, no penalty inside the TTL), `POST /proofs`, `POST /tasks/:id/submit`, `POST /tasks/:id/report` (optional).

> **02-architecture.md — Hosting:** the Task API, MCP server, mini-app and dashboard deploy to Vercel (or Railway for the long-poll endpoint if Vercel's function limits bite) in the first hour of Day 1; the stable URL is registered in the Developer Portal once.

> **T-01 (frozen) routes owned here:** `GET /session/nonce` | public | → `{nonce}` · `POST /session` | idkit-session | `{mode:'walletAuth', payload, nonce}` (verified with `verifySiweMessage`) or `{mode:'idkit', worker_address}` → worker-session cookie `{worker, nullifier, mode}` · `GET /openapi.json` · `GET /healthz` | public.

## 2. Exact scope
- **Package**: `apps/api/package.json` name `@legwork/api`; scripts `dev`, `build`, `typecheck`, `test` (vitest), `drizzle:generate`, `drizzle:migrate`. Every route file exports `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`.
- **Config** `apps/api/src/config.ts`: `getConfig(): Config` parses `process.env` once with zod (every name in `.env.example`; `CHAIN_ID` literal `84532`; `PAYMENT_MODE` enum `x402|direct`; `DATA_MODE` enum `live|demo`; `WORLD_CREDENTIAL_LEVEL` enum `selfie|orb`; `SESSION_SECRET`/`PROOF_URL_SECRET` ≥ 32 chars; `ADMIN_API_KEY`, `DEPLOYER_PRIVATE_KEY`, `SUBGRAPH_QUERY_URL` optional; `LONGPOLL_MAX_S` default 50 capped at 50; `DEMO_DISPUTE_WINDOW_S` default 120). Derived fields `relayerAddress`, `attestationVerifierAddress`, `abuseMarkSignerAddress` via viem `privateKeyToAccount`. `resetConfigForTests(overrides)` for vitest. A parse failure lists the **names** of the bad variables and never their values.
- **Logger** `apps/api/src/log.ts`: pino, JSON, `logger.child({route, request_id})`. `redact.paths` (censor `[redacted]`): `req.headers.cookie`, `req.headers.authorization`, `req.headers["payment-signature"]`, `req.headers["x-buyer-token"]`, `req.headers["x-admin-key"]`, `spec`, `*.spec`, `spec_json`, `*.spec_json`, `buyer_token`, `*.buyer_token`, `payload`, `*.payload`, `signature`, `*.signature`, `*_PRIVATE_KEY`, `*.privateKey`. Raw spec text is never a log field even before redaction — log `spec_hash`.
- **Errors** `apps/api/src/errors.ts`: `class ApiError { status; code; extra? }`; codes `invalid_request` (400, `{field, reason}`), `unauthorized` (401), `forbidden` (403), `not_found` (404), `conflict` (409), `rate_limited` (429), `not_implemented` (501), `internal` (500). Envelope: `{ error: <code>, ...extra }`. A `ZodError` becomes `invalid_request` with `field` = the first issue's dotted path and `reason` = its message.
- **Route wrapper** `apps/api/src/http/route.ts`: `route(handler)` adds `request_id` (uuid), logs method/path/status/duration, maps `ApiError`/`ZodError`/unknown to the envelope (unknown → 500 with `request_id`, stack logged not returned), adds CORS for `MINIAPP_URL` and `DASHBOARD_URL` origins with credentials (`OPTIONS` handled). "Middleware" in this brief means these composable wrappers — Next.js `middleware.ts` runs on the edge runtime and cannot open the DB or use pino; do not create it.
- **DB** `apps/api/src/db/client.ts`: `getDb(): Db` (Drizzle over the `postgres` driver, `DATABASE_URL`, `max: 5`, `prepare: false` for Supabase's pooler) and `rawQuery(text, params): Promise<Record<string, unknown>[]>`; `export type Db = PgDatabase<PgQueryResultHKT, typeof schema>`. `apps/api/drizzle.config.ts` → `drizzle/` migrations from the frozen `src/db/schema.ts`; `src/db/migrate.ts` runs them. `apps/api/test/db.ts`: `createTestDb(): Promise<{ db: Db; rawQuery; close(): Promise<void> }>` on `@electric-sql/pglite` with the same migrations applied, plus `setDbForTests(db)` consumed by `getDb()`.
- **Chain access** `apps/api/src/chain.ts`: `getChain(): ChainAdapter` and `getTxQueue(): TxQueue` from `@legwork/chain` (T-07), built from config; `setChainForTests(fake: FakeChain)` makes both return the fake. This file is the **only** import site of `@legwork/chain` in `apps/api`.
- **Sessions** `apps/api/src/session.ts` (JWT via `jose`, HS256, `SESSION_SECRET`): `issueIdkitSession({nullifier, level, action})` → cookie `lw_idkit` (15 min) + row in `idkit_sessions`; `requireIdkitSession(req)` → `{nullifier, level, action}` or 401; `issueWorkerSession({worker, nullifier, mode})` → cookie `lw_worker` (12 h) with claims `{sub: worker, nullifier, mode, kind:'worker'}`; `requireWorkerSession(req)` accepts the cookie **or** `Authorization: Bearer <jwt>` (the CLI worker has no cookie jar) → `{worker, nullifier, mode}` or 401. Cookies `HttpOnly; Secure; SameSite=None` in production, `SameSite=Lax` in dev/test. `nullifier` travels as a decimal string (`NUMERIC(78,0)`).
- **`GET /session/nonce`** → `{nonce}`: 16 random bytes hex, persisted (issued/consumed) in the `sessions` table; expires in 10 minutes.
- **`POST /session`**: `mode:'walletAuth'` → `verifySiweMessage(payload, nonce)` from `@worldcoin/minikit-js/siwe` (`isValid` false → 401 `unauthorized`), nonce must exist and be unconsumed (else 401 `{error:'unauthorized', reason:'nonce_used'}`), consume it, `worker = payload.address`, `nullifier` from the `nullifiers` row whose `worker` matches (none → 403 `{error:'forbidden', reason:'not_registered'}`), `await getChain().isWorker(worker)` must be true (else the same 403); `mode:'idkit'` → `requireIdkitSession`, `worker_address` must equal the `nullifiers.worker` bound to the session nullifier and `isWorker` must be true. Both → `issueWorkerSession`; body `{worker, nullifier, mode, token}` (`token` = the same JWT, for non-browser clients). walletAuth mode does **not** require the idkit-session cookie (the SIWE signature plus the stored binding is the proof — see §13).
- **Rate limit** `apps/api/src/http/rateLimit.ts`: `rateLimit(key, {limit, windowS})` in-memory sliding window, throws `rate_limited` with `retry_after_s`; `clientKey(req)` = `x-forwarded-for` first hop or `'local'`. Per instance on Vercel — the README says so.
- **Admin key** `apps/api/src/http/adminKey.ts`: `requireAdminKey(req)` — `ADMIN_API_KEY` unset → 404 `not_found` (admin surface disabled); header `X-Admin-Key` compared with `crypto.timingSafeEqual` → 401 on mismatch.
- **`GET /healthz`** → `{ok: true, db: 'ok'|'error', chain_id: 84532, payment_mode, data_mode, version: <git sha or 'dev'>}`; db check is `select 1`.
- **Stubs**: one file per later route, body exactly `export const POST = route(async () => { throw new ApiError(501, 'not_implemented') })` (or `GET`), first line `// OWNER: T-xx — replace this file; do not edit from any other task`. Files: T-16 `app/tasks/route.ts` (POST), `app/check/route.ts` · T-17 `app/tasks/list/route.ts`, `app/tasks/[id]/claim/route.ts`, `…/release-claim/route.ts`, `…/submit/route.ts`, `…/report/route.ts`, `app/me/earnings/route.ts`, `app/admin/sweep/route.ts` · T-18 `app/proofs/route.ts`, `app/proofs/[hash]/route.ts`, `app/public/proofs/[hash]/verify/route.ts` · T-19 `app/tasks/[id]/route.ts`, `…/approve`, `…/dispute`, `…/refund`, `app/public/{feed,refusals,posters,preflight}/route.ts`, `app/public/task/[id]/route.ts`, `app/admin/{pause,unpause,resolve,reset-demo,reset-worker,seed-demo}/route.ts` · T-20 `app/idkit/{request,verify}/route.ts`, `app/register/route.ts`, `app/config/world/route.ts` · T-27 `app/mcp/route.ts` · T-35 `app/openapi.json/route.ts`. Plus two **service** stubs for T-30 with typed exports: `src/services/identity.ts` `resolveAgentId(payer: Hex, claimed?: string): Promise<{agentId: bigint; verified: boolean}>` returning `{agentId: 0n, verified: false}`, and `src/services/abuseMark.ts` `markIfIdentified(p: {agentId: bigint; verified: boolean; classId: number; specHash: Hex; payer: Hex}): Promise<{marked: false} | {marked: true; tx: Hex}>` returning `{marked: false}` and logging `mark_skipped=stub`.
- **Test helpers** `apps/api/test/app.ts` (`call(handler, {method, url, headers?, body?, cookies?}) → Response`), `apps/api/test/siwe.ts` (`walletAuthPayload(account, nonce, domain)` — builds a MiniKit-shaped `{status:'success', message, signature, address, version: 1}` from a viem account and a SIWE message; used by tests and copied by the CLI worker).
- `apps/api/README.md`: layout, env, how to run tests, the stub/OWNER convention, the per-instance rate-limit caveat.

## 3. Out of scope
- Any route body beyond `/healthz`, `/session/nonce`, `/session`. All other routes are 501 stubs — **T-16, T-17, T-18, T-19, T-20, T-27, T-30, T-35** own them from merge.
- `apps/api/src/db/schema.ts` — **T-01** (frozen). The migration generated from it under `apps/api/drizzle/` is this task's (§2, §4, §8). If a table lacks a column you need, `INTERFACE REQUEST:`.
- Payments (**T-15**), screening (**T-06**), the chain package (**T-07**).
- Do not touch: `packages/**`, `contracts/**`, `subgraph/**`, `.env.example`, `docs/api.md`.

## 4. Owned paths
```
apps/api/**
EXCEPT (never edited by this task):        apps/api/src/db/schema.ts
EXCEPT (created once as stubs, then owned by the task in their OWNER line):
  T-16  apps/api/app/tasks/route.ts  apps/api/app/check/route.ts
  T-17  apps/api/app/tasks/list/**  apps/api/app/tasks/[id]/{claim,release-claim,submit,report}/**  apps/api/app/me/**  apps/api/app/admin/sweep/**
  T-18  apps/api/app/proofs/**  apps/api/app/public/proofs/**
  T-19  apps/api/app/tasks/[id]/route.ts  apps/api/app/tasks/[id]/{approve,dispute,refund}/**  apps/api/app/public/** (except proofs)  apps/api/app/admin/** (except sweep)
  T-20  apps/api/app/idkit/**  apps/api/app/register/**  apps/api/app/config/**
  T-27  apps/api/app/mcp/**      T-30  apps/api/src/services/{identity,abuseMark}.ts      T-35  apps/api/app/openapi.json/**
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| Drizzle tables | `apps/api/src/db/schema.ts` (T-01, frozen) | `sessions`, `idkit_sessions`, `nullifiers (nullifier NUMERIC(78,0) UNIQUE, action, worker)`, `admin_audit`; read the merged file first — column names come from it, not from this brief |
| `ChainAdapter`, `TxQueue`, `FakeChain` | `@legwork/chain` (T-07) | `isWorker(address)` read; `FakeChain.setWorker(address, {nullifier, seeded})` in tests; names mirror the frozen Solidity views |
| `verifySiweMessage(payload, nonce)` | `@worldcoin/minikit-js/siwe` | returns `{isValid, siweMessageData}`; payload is MiniKit's walletAuth success shape |
| `SignJWT`, `jwtVerify` | `jose` | HS256 with `SESSION_SECRET` |
| Env names | `.env.example` (T-01) | the full list; this task adds none |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `getConfig()`, `Config`, `resetConfigForTests` | `apps/api/src/config.ts` | every lane-B task |
| `logger`, `childLogger(bindings)` | `apps/api/src/log.ts` | every lane-B task |
| `ApiError`, `route()`, `rateLimit`, `clientKey`, `requireAdminKey` | `apps/api/src/errors.ts`, `apps/api/src/http/*.ts` | T-16 … T-20, T-27, T-30, T-35 |
| `getDb()`, `rawQuery`, `Db`; `createTestDb()`, `setDbForTests` | `apps/api/src/db/client.ts`, `apps/api/test/db.ts` | every lane-B task; T-15's `SqlIdempotencyStore` takes `rawQuery` |
| `getChain()`, `getTxQueue()`, `setChainForTests` | `apps/api/src/chain.ts` | T-16 … T-20, T-30 |
| `requireWorkerSession`, `requireIdkitSession`, `issueIdkitSession`, `issueWorkerSession` | `apps/api/src/session.ts` | T-17, T-18 (worker); T-20 (idkit) |
| `resolveAgentId`, `markIfIdentified` (stubs) | `apps/api/src/services/{identity,abuseMark}.ts` | T-16 codes against them; T-30 replaces the bodies |
| `call()`, `walletAuthPayload()` | `apps/api/test/{app,siwe}.ts` | every lane-B test file |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-08` — it must print `CLAIMED T-08`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read the merged `apps/api/src/db/schema.ts` and `.env.example`; list the columns of `sessions`, `idkit_sessions`, `nullifiers`. If `sessions` cannot record a nonce's issue and consumption, stop and post the `INTERFACE REQUEST:` from §13 before writing code.
2. `config.ts` + a test that a missing `SESSION_SECRET` fails with the name only. `log.ts` + a test that a logged object with `spec` and `buyer_token` prints `[redacted]`.
3. `errors.ts`, `http/route.ts`, `http/rateLimit.ts`, `http/adminKey.ts`; `GET /healthz`.
4. `db/client.ts`, `drizzle.config.ts`, `db/migrate.ts`; `pnpm drizzle:generate` must produce **no** diff against T-01's committed migration. `test/db.ts` on pglite running the same migration folder.
5. `chain.ts` with `setChainForTests`. `session.ts`. `GET /session/nonce`, `POST /session` (both modes). `test/siwe.ts`.
6. All stub files with their `// OWNER:` line; the two T-30 service stubs. `README.md`. Run §9.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `sessionIssuedForRegisteredWorker` | pglite + `FakeChain` with `isWorker(w) = true` and a `nullifiers` row `(n, 'legwork-worker', w)`: `GET /session/nonce` → nonce; `POST /session {mode:'walletAuth', payload: walletAuthPayload(w, nonce), nonce}` → 200, `Set-Cookie` `lw_worker`, body `{worker: w, nullifier: n, mode:'walletAuth', token}`; `jwtVerify(token)` claims `sub === w`, `nullifier === n` |
| `sessionRefusedForUnregistered` | same flow with `isWorker(w) = false` (no `nullifiers` row) → 403 `{error:'forbidden', reason:'not_registered'}`, no `Set-Cookie`; a payload whose signature does not match → 401 `unauthorized` |
| `nonceSingleUse` | a second `POST /session` with the same nonce → 401 `{error:'unauthorized', reason:'nonce_used'}`; a never-issued nonce → 401 |
| `pnpm --filter @legwork/api drizzle:generate && git diff --exit-code apps/api/drizzle` | no drift from the frozen schema |
| `grep -rL "OWNER: T-" <every stub path in §4>` | prints nothing — every stub carries its owner line |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/api typecheck && pnpm --filter @legwork/api test
pnpm --filter @legwork/api test -- -t sessionIssuedForRegisteredWorker
pnpm --filter @legwork/api drizzle:generate && git diff --exit-code apps/api/drizzle
grep -rn "@legwork/chain" apps/api/src apps/api/app | grep -v "apps/api/src/chain.ts"   # must print nothing
grep -rn "console.log" apps/api/src apps/api/app                                        # must print nothing (pino only)
scripts/ci/banned-words.sh apps/api
```
Expected: tests green (the three named plus the config/log tests); no migration drift; both greps print nothing.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). This task shows no money; it must not introduce any other figure.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git. Config errors name variables, never values; `healthz` exposes no address derived from a key.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted): pglite + `FakeChain` only; `DATABASE_URL` is never read in tests.
- Never log raw spec text: the redaction list is a backstop, not the rule — no code path passes `spec` or `spec_json` to the logger.
- Every chain write goes through `TxQueue` from `@legwork/chain`; this task performs no chain write at all, and `chain.ts` is the only import site.
- `agentId` is never trusted from a request body — `resolveAgentId` (stub now, T-30 later) is the only source.
- A schema error is a 400 `invalid_request` and never a mark; the wrapper maps `ZodError` to exactly that.
- `POST /session` requires `isWorker(worker)` on chain in **both** modes; a DB row alone never issues a session.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed; every stub carries its `// OWNER:` line; `src/db/schema.ts` untouched.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `apps/api/README.md` written (layout, env, tests, stub convention, rate-limit caveat).
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-08 — Task API skeleton — config, logging, DB, sessions, middleware, 501 stubs
owned-paths:
  - apps/api/** (except src/db/schema.ts; stubs listed in §4 pass to their owners on merge)
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

Known gaps to raise as written:
- `INTERFACE REQUEST: sessions needs (nonce PK, kind, worker?, nullifier?, created_at, consumed_at?) and idkit_sessions needs (id PK, nullifier NUMERIC(78,0), level, action, created_at, expires_at)` — only if the merged `schema.ts` lacks them.
- `INTERFACE REQUEST: docs/api.md — POST /session walletAuth mode is verified by SIWE + the stored nullifier binding and does not require the idkit-session cookie; idkit mode does` — the frozen table lists `idkit-session` for the whole route.
- `INTERFACE REQUEST: docs/api.md — POST /session response body {worker, nullifier, mode, token}; requireWorkerSession also accepts Authorization: Bearer` — for the CLI worker.
- `BLOCKED: T-07 not merged — apps/api/src/chain.ts imports @legwork/chain` — write everything else first; fill the draft PR and run `gh pr ready` with this line if T-07 is still open; the lead merges T-07 first.

## 14. Reviewer notes
Open `session.ts` and `app/session/route.ts` first: `isWorker` checked in both modes, nonce consumed before the session is issued, no session without a `nullifiers` row. Then `log.ts`: run the redaction test and grep for any `spec` field reaching a log call. Then the stub list against §4 — a missing stub means two tasks will later fight over one file. Most likely wrong: a Next.js `middleware.ts` on the edge runtime trying to open the DB; `SameSite=Lax` cookies in production (the mini-app is cross-origin); `drizzle:generate` producing a new migration because `schema.ts` was "fixed"; `console.log` in a route.

## 15. Round 2+
—
