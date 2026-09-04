---
id: T-38
title: API hardening — limits, CORS, admin gate, log redaction
lane: B
day: 5
size: S
agent_class: C
must: true
depends_on: [T-19]
owned_paths:
  - apps/api/src/middleware/**
  - apps/api/SECURITY.md
labels: [area:api, wave:5, size:S, agent:cloud]
branch: t-38/api-hardening
---

# T-38 — API hardening — limits, CORS, admin gate, log redaction

## 1. Context
The Task API is public from Day 1 and takes money, cookies and an admin key. Before the filmed run and the judges' traffic it needs the boring guards: per-IP/session rate limits on the free routes an attacker can hammer (`/check`, `/proofs`, `/session`, `/idkit/*`), body caps, a CORS allowlist for the two browser frontends, admin routes that do not exist unless `ADMIN_API_KEY` is set, and a logger that can never print a token or a key. Everything lives in `apps/api/src/middleware/**` as one Next.js edge middleware plus helpers, tested in isolation; `SECURITY.md` states what is and is not protected. T-16's paid `POST /tasks` is limited by money and `caps_ledger`, not by this task.

> **T-01 — routes this task guards:** `POST /check` — public, rate-limited · `POST /proofs` — worker-session, multipart ≤ 8 MB · `GET /session/nonce`, `POST /session` — public / idkit-session · `POST /idkit/request`, `POST /idkit/verify` — public · `POST /admin/pause` · `/unpause` · `/resolve` · `/reset-demo` · `/reset-worker` · `/sweep` · `/seed-demo` — admin-key (`X-Admin-Key`); every call audit-logged · `POST /tasks/:id/approve` · `/dispute` · `/refund` — buyer-token (`X-Buyer-Token`).

> **02-architecture.md, security table:** **FIX** Worker-authored text injected into the buyer's agent → Answer = enum + ≤120-char escaped note, wrapped as untrusted data in the tool result → MCP contract test.

## 2. Exact scope
- `apps/api/src/middleware/edge.ts` exports `createMiddleware(deps: { env: MiddlewareEnv; store?: RateLimitStore; now?: () => number })` returning `(req: NextRequest) => NextResponse | Promise<NextResponse>`, plus `middleware = createMiddleware({ env: readEnv(process.env) })` and `config = { matcher: ['/((?!_next|favicon.ico).*)'] }`. `MiddlewareEnv = { MINIAPP_URL?: string; DASHBOARD_URL?: string; ADMIN_API_KEY?: string }` — the only env read, once, in `readEnv`.
- `rateLimit.ts`: sliding-window limiter behind `RateLimitStore { hit(key: string, windowMs: number, limit: number, now: number): { allowed: boolean; retry_after_s: number } }` with `MemoryRateLimitStore` (module-scope `Map`, pruned on hit). Policy table `RATE_LIMITS` (per key, per minute): `POST /check` 30/IP · `POST /proofs` 10/session + 20/IP · `GET /session/nonce` + `POST /session` 10/IP · `POST /idkit/*` 10/IP · `POST /register` 5/IP · `GET /tasks`, `GET /tasks/:id`, `GET /public/*` 120/IP · `POST /tasks/:id/claim|release-claim|submit|report` 30/session. Over limit → **429** `{ error: 'rate_limited', retry_after_s }` with a `Retry-After` header. IP = first hop of `x-forwarded-for`, else `x-real-ip`, else `'unknown'`; session key = the worker-session cookie value hashed (sha-256, first 16 hex) — never the cookie itself.
- `bodyLimit.ts`: `BODY_CAPS` — `POST /proofs` 8 MiB (`8 * 1024 * 1024`, the frozen limit), every other JSON route 16 KiB. A request whose `Content-Length` exceeds its cap → **413** `{ error: 'payload_too_large', max_bytes }`; a JSON route with no `Content-Length` and a body → 411 `{ error: 'length_required' }`. Export `readJsonWithCap(req, maxBytes)` for handlers (T-19 may adopt it later; not wired here).
- `cors.ts`: allowlist = `[MINIAPP_URL, DASHBOARD_URL]` (origins only; scheme + host + port, trailing slash stripped). Request with no `Origin` → pass through untouched (agents, MCP, curl). `Origin` in the allowlist → echo it in `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`, `Vary: Origin`; `OPTIONS` → **204** with `Access-Control-Allow-Methods: GET,POST,OPTIONS`, `Access-Control-Allow-Headers: Content-Type, X-Buyer-Token, PAYMENT-SIGNATURE`, `Access-Control-Max-Age: 600`. `Origin` present and **not** allowlisted (including `null`) → **403** `{ error: 'origin_not_allowed' }` with no CORS headers.
- `adminGate.ts`: `ADMIN_API_KEY` unset or shorter than 32 characters → every `/admin/*` request → **404** `{ error: 'not_found' }` (the routes do not exist); set → `X-Admin-Key` compared in constant time (XOR over `Uint8Array`, Web Crypto only — the edge runtime has no `node:crypto`); mismatch or missing → **401** `{ error: 'unauthorized' }`; match → pass through. `/admin/*` never gets CORS headers.
- `redact.ts`: `REDACT_PATHS` for pino (`req.headers.authorization`, `req.headers.cookie`, `req.headers["x-buyer-token"]`, `req.headers["x-admin-key"]`, `req.headers["payment-signature"]`, `req.headers["x-buyer-signature"]`, `res.headers["set-cookie"]`, `*.buyer_token`, `*.privateKey`, `*.private_key`, `*.secret`, `*.token`, `*.cookie`) with `censor: '[REDACTED]'`; `createLogger(opts?)` = pino with `redact: { paths: REDACT_PATHS, censor }` and a request serializer that **allowlists** headers (`content-type`, `content-length`, `user-agent`, `origin`, `x-request-id`) — every other header is dropped, not censored. If T-19 already has a logger module outside owned paths, export `REDACT_PATHS` + `headerSerializer` and request the one-line wiring (§13).
- `index.ts` re-exports; every guard is a pure function of `(req, env, store, now)` so tests need no server.
- `apps/api/SECURITY.md`: what is protected (the tables above), what is **not** (limits are per instance on Vercel — best effort; the durable limit on money is `caps_ledger`: `MAX_OPEN_TASKS_PER_BUYER = 5`, `DAILY_CAP_USDC = 25`), disclosed operator powers (pointer to `docs/keys.md`), the worker-text rule quoted from 02-architecture above, "testnet USDC — not spendable", and how to report (the operator contact in the root README; no email typed here).

## 3. Out of scope
- Route behaviour, session cookies, `caps_ledger` — **T-16/T-19**. x402 verification — **T-15/T-16**. Proof storage limits beyond `Content-Length` — **T-17**. Admin route bodies and `admin_audit` rows — **T-19**.
- Wiring `apps/api/middleware.ts` (one line re-export) and adopting `readJsonWithCap` in handlers — the lead / T-19 (§13).
- A shared rate-limit store (Redis/Upstash) — not in v0; documented in `SECURITY.md`.
- Do not touch: `apps/api/app/**`, `apps/api/middleware.ts`, `apps/api/src/services/**`, `apps/api/src/db/**`, `packages/**`.

## 4. Owned paths
```
apps/api/src/middleware/**
apps/api/SECURITY.md
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| Route table | `packages/shared/src/api-contract.ts` | paths, methods, `auth` per route (drives the policy tables) |
| `MAX_OPEN_TASKS_PER_BUYER`, `DAILY_CAP_USDC` | `packages/shared/src/constants.ts` | quoted in `SECURITY.md` |
| Worker-session cookie name | T-19's session helper under `apps/api/src/` | the cookie whose hashed value keys per-session limits |
| `NextRequest`, `NextResponse` | `next/server` | edge middleware primitives; `NextResponse.next()` for pass-through with added headers |
| `pino` | catalog | `redact.paths`, `censor`, serializers |
| Env | `.env.example` | `MINIAPP_URL`, `DASHBOARD_URL`, `ADMIN_API_KEY` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `middleware`, `config`, `createMiddleware(deps)` | `apps/api/src/middleware/edge.ts` | `apps/api/middleware.ts` (lead's one-line re-export) |
| `RATE_LIMITS`, `RateLimitStore`, `MemoryRateLimitStore` | `apps/api/src/middleware/rateLimit.ts` | edge.ts, a future shared store |
| `BODY_CAPS`, `readJsonWithCap(req, maxBytes)` | `apps/api/src/middleware/bodyLimit.ts` | edge.ts, T-19 handlers (opt-in) |
| `REDACT_PATHS`, `headerSerializer`, `createLogger` | `apps/api/src/middleware/redact.ts` | T-19's logger, T-16, T-30 |
| `SECURITY.md` | `apps/api/SECURITY.md` | judges, T-48 |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-38` — it must print `CLAIMED T-38`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `api-contract.ts` for the route list; read `apps/api/middleware.ts` if it exists and T-19's session helper for the cookie name; read the existing logger (if any) to learn its import path.
2. `rateLimit.ts` + `bodyLimit.ts` + `cors.ts` + `adminGate.ts` as pure functions with unit tests; `MemoryRateLimitStore` with an injected clock.
3. `edge.ts`: order per request — CORS (OPTIONS answered here) → admin gate → body cap → rate limit → pass through with CORS headers set on `NextResponse.next()`.
4. `redact.ts` + test with a pino instance writing to an in-memory stream.
5. `SECURITY.md`. Run §9.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `rateLimitReturns429` | 30 `POST /check` from IP `203.0.113.7` within one minute pass; the 31st → 429 `{error:'rate_limited', retry_after_s > 0}` with `Retry-After`; a different IP is unaffected; advancing the injected clock 60 s re-allows; `POST /proofs` from one session key is limited at 10 regardless of IP |
| `corsRejectsUnknownOrigin` | `OPTIONS /check` with `Origin: https://evil.example` → 403, no `Access-Control-Allow-Origin`; with `Origin: <MINIAPP_URL>` → 204, `Access-Control-Allow-Origin` echoes the origin, `Access-Control-Allow-Credentials: true`, `Vary: Origin`; `Origin: null` → 403; a request with no `Origin` header passes through without CORS headers |
| `adminDisabledWithoutKey` | env without `ADMIN_API_KEY` → `POST /admin/pause` → 404 `{error:'not_found'}` even with an `X-Admin-Key` header; env with a 32+ char key: missing header → 401, wrong key of equal length → 401, right key → pass through; a 10-character key behaves as unset |
| `bodyCapReturns413` | `POST /check` with `Content-Length: 20000` → 413 `{error:'payload_too_large', max_bytes: 16384}`; `POST /proofs` with `Content-Length: 8388608` passes and `8388609` → 413; `readJsonWithCap` rejects a streamed body over the cap before parsing |
| `redactsTokensAndKeys` | logging a request with `X-Buyer-Token: tok_abc`, `X-Admin-Key: k…`, `PAYMENT-SIGNATURE: sig…`, `Cookie: legwork_worker=…` and a body `{buyer_token, privateKey}` produces output containing none of those values, `[REDACTED]` for the body fields, and only allowlisted header names |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/api typecheck && pnpm --filter @legwork/api test -- middleware
grep -rn "process.env" apps/api/src/middleware | grep -v "edge.ts"   # must print nothing
grep -rn "node:crypto\|from 'crypto'" apps/api/src/middleware   # must print nothing (edge runtime)
scripts/ci/banned-words.sh apps/api/src/middleware apps/api/SECURITY.md
```
Expected: five §8 tests green; both `grep`s print nothing; banned-words clean.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate) — `SECURITY.md` uses these when it mentions caps.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git. `ADMIN_API_KEY` is read once in `readEnv`, compared in constant time, never logged, never echoed in an error body.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted); every test drives `createMiddleware` with an injected env, store and clock.
- `X-Buyer-Token` is never logged: header allowlist plus redact paths; a test proves it.
- Admin routes are absent (404) without `ADMIN_API_KEY`; they never answer 401 in that state (no oracle for the route's existence).
- Requests without an `Origin` header are never blocked by CORS — agents and the local MCP must keep working.
- `agentId` is never trusted from the body and screening errors never mark — this task adds no screening logic and never touches those paths.
- Limits are disclosed as best-effort per instance in `SECURITY.md`; no claim of DDoS protection.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `apps/api/SECURITY.md` written per §2.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-38 — API hardening — limits, CORS, admin gate, log redaction
owned-paths:
  - apps/api/src/middleware/**
  - apps/api/SECURITY.md
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

Known gaps to raise as written (do not resolve them yourself):
- `INTERFACE REQUEST: api-contract.ts has no 429 {error:'rate_limited', retry_after_s}, 413 {error:'payload_too_large', max_bytes} or 403 {error:'origin_not_allowed'} bodies; this task ships them and asks for their addition.`
- `INTERFACE REQUEST: apps/api/middleware.ts must re-export { middleware, config } from './src/middleware/edge' — one line, lead's file.`
- `INTERFACE REQUEST: T-19's logger should pass redact: { paths: REDACT_PATHS } and serializers.req = headerSerializer from apps/api/src/middleware/redact.ts.`

## 14. Reviewer notes
Open `edge.ts` first: guard order, no `process.env` outside `readEnv`, `NextResponse.next()` carries the CORS headers. Then `adminGate.ts`: 404 without key, constant-time compare, minimum key length. Then `redact.ts`: allowlist, not denylist, for headers. Most likely wrong: blocking requests with no `Origin`; `Retry-After` missing; rate-limit keys built from the raw cookie; `node:crypto` imported into the edge bundle; `/admin` answering 401 when the key is unset.

## 15. Round 2+
—
