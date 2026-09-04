# `@legwork/api` — the Task API

The Next.js App Router service on Vercel: the x402 seller, the worker-session routes the
mini-app calls, the public dashboard reads and the admin controls.

T-08 ships the floor the rest of lane B stands on — a validated config, a logger that cannot
print a spec or a key, one Drizzle client with a pglite twin, the session model, the
rate-limit and admin guards, and a 501 stub for every route a later task owns.

## Layout

```
app/                      one directory per route; every file exports runtime + dynamic
  healthz/                liveness, the db check, and the two modes
  session/nonce/          GET  — a single-use SIWE nonce
  session/                POST — walletAuth or idkit, in exchange for a worker session
  <everything else>       501 stubs, each with its `// OWNER: T-xx` first line
src/
  config.ts               process.env, parsed once, with the three derived addresses
  log.ts                  pino, JSON, with the redaction list
  errors.ts               ApiError and the eight codes
  http/route.ts           the wrapper: request id, one log line, the error envelope, CORS
  http/rateLimit.ts       an in-memory sliding window
  http/adminKey.ts        X-Admin-Key, compared in constant time
  db/client.ts            getDb(), rawQuery(), transaction()
  db/schema.ts            frozen (T-01) — never edited here
  db/migrate.ts           applies drizzle/ to DATABASE_URL
  chain.ts                the only import site of @legwork/chain
  session.ts              nonces, the idkit session, the worker session
  siwe.ts                 the one call into MiniKit's SIWE verifier
  services/               resolveAgentId and markIfIdentified — stubs owned by T-30
drizzle/                  the migration generated from the frozen schema
test/                     app.ts, db.ts, siwe.ts and the suites
```

There is deliberately **no `middleware.ts`**. Next.js middleware runs on the edge runtime,
which cannot open the Postgres driver or use pino; "middleware" in this service means the
composable wrappers in `src/http/`.

## Environment

Every name lives in the repo's `.env.example` and is parsed once by `getConfig()`. Routes read
`getConfig()`, never `process.env`.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Supabase Postgres. Required. |
| `BASE_SEPOLIA_RPC_URL`, `CHAIN_ID` | `CHAIN_ID` must be `84532`. |
| `RELAYER_PRIVATE_KEY`, `ATTESTATION_VERIFIER_PRIVATE_KEY`, `ABUSEMARK_SIGNER_PRIVATE_KEY` | Required. `relayerAddress`, `attestationVerifierAddress` and `abuseMarkSignerAddress` are derived from them with viem and are the only form the rest of the app sees. |
| `SESSION_SECRET`, `PROOF_URL_SECRET` | At least 32 characters. |
| `PAYMENT_MODE` | `x402` \| `direct`. |
| `DATA_MODE` | `live` \| `demo`. |
| `WORLD_CREDENTIAL_LEVEL` | `selfie` \| `orb`. |
| `LONGPOLL_MAX_S` | Defaults to 50 and is capped at 50 — Vercel ends the invocation well before a longer poll returns. |
| `DEMO_DISPUTE_WINDOW_S` | Defaults to 120. |
| `ADMIN_API_KEY`, `DEPLOYER_PRIVATE_KEY`, `SUBGRAPH_QUERY_URL` | Optional. With `ADMIN_API_KEY` unset the admin routes answer 404, not 401. |

A parse failure lists the **names** of the variables it rejected and never their values.

## Running

```bash
pnpm --filter @legwork/api dev              # http://localhost:3000
pnpm --filter @legwork/api typecheck
pnpm --filter @legwork/api test
pnpm --filter @legwork/api build
pnpm --filter @legwork/api drizzle:generate # regenerate drizzle/ from the frozen schema
pnpm --filter @legwork/api drizzle:migrate  # apply drizzle/ to DATABASE_URL
```

`build` and `dev` pass `--webpack`. `@legwork/chain` imports its own modules as `./env.js` —
the extension TypeScript's NodeNext convention writes and the file on disk does not have —
and webpack maps it back with `resolve.extensionAlias`, which Turbopack has no equivalent
for. `next.config.ts` says so at the line that does it.

`drizzle:generate` runs behind a small `NODE_OPTIONS` preload
(`scripts/drizzle-bigint-json.cjs`). The frozen `src/db/schema.ts` declares
`caps_ledger.daily_units` with `.default(0n)`, and drizzle-kit serialises every default with
`JSON.stringify`, which throws on a BigInt before it writes a line of SQL. The preload teaches
`JSON.stringify` one method; the generated DDL is the column the schema asks for,
`bigint DEFAULT 0 NOT NULL`.

## Tests

`vitest`, on fakes only. There is no `DATABASE_URL`, no RPC and no key in CI.

- `test/db.ts` — `createTestDb()` boots `@electric-sql/pglite` in process, applies the same
  `drizzle/` folder production applies, and installs itself as the database `getDb()` returns.
- `src/chain.ts` — `setChainForTests(new FakeChain())` makes `getChain()` return the fake.
- `test/app.ts` — `call(handler, {method, url, headers, body, cookies, params})` hands a route
  handler a real `Request` and gives you back a real `Response`. No server, no port.
- `test/siwe.ts` — `walletAuthPayload(account, nonce, domain)` builds the MiniKit-shaped
  walletAuth payload from a viem account. The CLI worker copies it. `offlineSiweProvider()`
  keeps MiniKit's EIP-1271 fallback off the network.
- `src/config.ts` — `resetConfigForTests(overrides)` builds a config from a minimal valid
  environment, so no test needs a real one.

```bash
pnpm --filter @legwork/api test -t sessionIssuedForRegisteredWorker
```

## The stub convention

Every route a later task owns exists here already as a file whose first line reads

```ts
// OWNER: T-17 — replace this file; do not edit from any other task
```

and whose body is one `route()` call that throws `501 not_implemented`. The owner replaces
the whole file; nobody else touches it. A missing stub is two tasks later discovering they
both wrote the same path.

The same applies to `src/services/identity.ts` and `src/services/abuseMark.ts`, which T-16
codes against and T-30 fills in. Until then `resolveAgentId` reports every caller as
unidentified and `markIfIdentified` marks nothing — the safe answer, because an agent id is
never trusted from a request body and a mark is a permanent public record.

## The rate limit is per instance

`rateLimit(key, {limit, windowS})` is a sliding window in one instance's memory. Vercel runs
several and they share nothing, so the effective limit is `limit × instances`. It is a brake
on a runaway client, not a quota — the caps that money depends on are enforced on chain.

## Sessions

`GET /session/nonce` returns 16 random bytes of hex and records them. `POST /session` spends
one:

- `mode: 'walletAuth'` — MiniKit's `verifySiweMessage` must accept the payload against that
  nonce, the nonce must still be unspent, and the address must have both a `nullifiers` row
  and `isWorker(address) === true` on chain.
- `mode: 'idkit'` — the short-lived `lw_idkit` cookie is required, and the `worker_address` in
  the body must be the one bound to that session's nullifier. `isWorker` is checked here too.

The registry is the record and the row is only a claim, which is why `isWorker` is asked in
both modes: a database that has been restored, edited or seeded wrongly still cannot mint a
session for an address the chain does not know.

The response is `{worker, nullifier, mode, token}` and sets `lw_worker` for twelve hours.
`token` is the same JWT, for the CLI worker, which has no cookie jar —
`requireWorkerSession` accepts either the cookie or `Authorization: Bearer <jwt>`. Cookies are
`SameSite=None; Secure` in production, because the mini-app and the dashboard are separate
origins, and `SameSite=Lax` in dev and test, where there is no HTTPS for `Secure` to attach to.

"Already spent" and "never issued" are the same 401 `{error: 'unauthorized', reason:
'nonce_used'}`: telling them apart would tell a caller which nonces this server has handed out.

### Where a nonce is stored

The frozen `sessions` table has no nonce shape — no `kind`, no `consumed_at`, and `worker`,
`nullifier` and `mode` are all `NOT NULL` — so a nonce is a `sessions` row with `id` set to
the nonce, `mode = 'nonce'` and sentinels in the other two columns, and consuming it deletes
the row. `idkit_sessions` has no `action` column, so `action` travels in the signed idkit JWT
instead. Both are recorded as an `INTERFACE REQUEST:` on the T-08 PR; both are a few lines to
undo once the schema carries the fields.
