---
id: T-15
title: packages/payments — PaymentGateway, X402Gateway, idempotency, FakeFacilitator
lane: B
day: 2
size: M
agent_class: C
must: true
depends_on: [T-03, T-08]
owned_paths:
  - packages/payments/**
labels: [area:payments, wave:2, size:M, agent:cloud]
branch: t-15/payments-package
---

# T-15 — packages/payments — PaymentGateway, X402Gateway, idempotency, FakeFacilitator

## 1. Context
`POST /tasks` charges the agent through x402: 402 with requirements → the client signs a USDC authorization → `verify` (no money moves) → the API screens and posts the escrow → `settle`. T-03 proved the round-trip by hand and wrote the library's exact import names, header names and payload property paths into `docs/spikes/RESULTS.md#s3`. This package turns that into a small, testable seam: a `PaymentGateway` interface the route handler calls, the `X402Gateway` built from `@x402/core` + `@x402/evm` **primitives** (dynamic price, `payTo` = relayer, in the handler, never middleware), an `IdempotencyStore` keyed on the authorization nonce, a `FakeFacilitator` so every test runs with no chain and no facilitator, and a `DirectFundingGateway` stub for the Day-6 pivot. T-16 wires it into the route; T-28's MCP test harness uses the gateway and the fake as its server double.

> **02-architecture.md — Task API:** x402 seller (exact-EVM scheme, USDC on Base Sepolia, reference facilitator). Order on `POST /tasks`: `/verify` the payment authorization (no money moves) → screen → if refused: AbuseMark (if the payer has an identity) and a 4xx that names the class and the reason → if accepted: `TaskEscrow.post(…, buyer = payer)` from the operator float → `/settle` with an idempotency key on the authorization nonce (a retried settle cannot double-charge). A failed `post` never takes the agent's money. If `settle` fails after `post`, the float absorbed the task and the log says so. "Our custody is the one block between settlement and escrow, and we say so." Per-agent rolling cap (5 open tasks, $25/day in v0), echoed in the 402 body so an honest agent can read its own remaining budget.

> **02-architecture.md — security row:** **FIX** Agent pays and gets nothing (expiry refund, settle-then-post failure, `resolve`) | `buyer` = x402 payer in `post`; `expire` and `resolve(toBuyer)` pay `buyer`; `/verify → screen → post → /settle` with idempotency | `test_Expire_RefundsBuyer`, `test_Resolve_ToBuyer_NoFee`, API test `settleAfterPost`

> **T-01 (frozen) `POST /tasks` row:** x402 (`PAYMENT-SIGNATURE` header; price = `amount × 1.15`) | `Envelope` → **201** `{task_id, buyer_token, status:'open', spec_hash, price_usdc, eta_seconds, poll_after_seconds, dashboard_url}` · **402** `{error:'payment_required', price_usdc, accepts:[x402 requirements], remaining_budget:{open_tasks, daily_usdc}}` · **422** `RefusalPayload` · **400** `{error:'invalid_request', field, reason}` · **429** `{error:'cap_exceeded', open_tasks, daily_usdc}`. Handler order: `x402 verify (no money moves) → … → TaskEscrow.post(buyer = payer, buyerAgentId) via TxQueue → x402 settle (idempotency key = authorization nonce) → 201`. A failed `post` never settles. A failed settle after `post` logs `float_absorbed=true`.

## 2. Exact scope
- `packages/payments/package.json` name `@legwork/payments`; deps `@x402/core`, `@x402/evm`, `viem`, `@legwork/shared` (catalog versions); dev `@x402/fetch`, `@electric-sql/pglite`, `vitest`. Exports from `src/index.ts` everything below.
- `src/gateway.ts` — types and the interface, verbatim:
  ```ts
  export type PriceQuote = { amount_units: bigint; fee_units: bigint; price_units: bigint; price_usdc: number };
  export type RemainingBudget = { open_tasks: number; daily_usdc: number };
  export type PaymentContext = { payer: Hex; authNonce: Hex; priceUnits: bigint; paymentHeader: string; requirements: unknown; network: 'eip155:84532' };
  export type PaymentRequiredBody = { error: 'payment_required'; price_usdc: number; accepts: unknown[]; remaining_budget: RemainingBudget; reason?: string };
  export type RequirePaymentResult =
    | { kind: 'payment_required'; status: 402; body: PaymentRequiredBody; headers: Record<string, string> }
    | { kind: 'verified'; ctx: PaymentContext };
  export type SettleResult = { ok: true; tx: Hex } | { ok: false; reason: string; float_absorbed: true };
  export interface PaymentGateway {
    price(envelope: { task_type: TaskType; amount_usdc: number }): PriceQuote;
    requirePayment(req: Request, quote: PriceQuote, extras: { remaining_budget: RemainingBudget; resource: string }): Promise<RequirePaymentResult>;
    settle(ctx: PaymentContext): Promise<SettleResult>;
    payerOf(ctx: PaymentContext): Hex;
    authNonceOf(ctx: PaymentContext): Hex;
  }
  ```
  `price` uses `toUsdcUnits` and `priceWithFee` from `@legwork/shared` — never floating-point multiplication. `3.00` → `{amount_units: 3_000_000n, fee_units: 450_000n, price_units: 3_450_000n, price_usdc: 3.45}`. A header that is present but fails `verify` returns `kind:'payment_required'` with `body.reason` = the facilitator's invalid reason (same 402 shape, no new error code). `settle` **never throws**: a facilitator failure resolves `{ok:false, reason, float_absorbed: true}`.
- `src/x402/paths.ts` — the two property paths T-03 recorded (`Payer path`, `Nonce path`) as `readPayer(decodedPayload)` and `readNonce(decodedPayload)`; the only file that knows them. Header names from `## S3` as constants (`REQUEST_HEADER = 'PAYMENT-SIGNATURE'`, plus whatever the 402/response headers are called).
- `src/x402/gateway.ts` — `class X402Gateway implements PaymentGateway`, constructor `{ facilitator: FacilitatorClient; payTo: Hex; asset: Hex; network: 'eip155:84532'; maxTimeoutSeconds?: number (300) }`. `requirePayment` builds the requirements per request with the primitives T-03 named (exact EVM scheme registered on the resource server; amount `quote.price_units.toString()`; `payTo`; `resource` = the request URL), returns the 402 (frozen body + the library's 402 header if it has one) when the header is absent, otherwise decodes, calls `facilitator.verify`, and on success returns the `PaymentContext`. `settle(ctx)` calls `facilitator.settle` with the stored header and requirements. `FacilitatorClient` = the library's client interface (`verify`, `settle`, `getSupported`); production passes the HTTP client for `X402_FACILITATOR_URL`, tests pass `FakeFacilitator`.
- `src/x402/fakeFacilitator.ts` — `class FakeFacilitator implements FacilitatorClient`: `verify` decodes the payload, checks `to === payTo`, `value ≥ required amount`, `validBefore > now`, nonce not yet settled → `{isValid: true, payer}` else `{isValid: false, invalidReason}`; `settle` → `{success: true, transaction: keccak256(nonce), network, payer}` and records the nonce; `failNextVerify(reason)`, `failNextSettle(reason)`; counters `verifyCalls`, `settleCalls`; `reset()`. No network, no chain.
- `src/x402/testSigner.ts` — `signPaymentHeader({ privateKey, requirements, nonce? })` producing a real `PAYMENT-SIGNATURE` value with `@x402/evm`'s client-side exact scheme and a viem account (EIP-3009 typed-data signing is offline). Default key: Anvil account #0 (public test vector, not a secret). Exported for T-16 and T-28 tests.
- `src/idempotency.ts` — verbatim:
  ```ts
  export type Reservation = { state: 'reserved' } | { state: 'in_progress' } | { state: 'done'; task_id: number; settle_tx: Hex | null };
  export interface IdempotencyStore {
    reserve(authNonce: Hex): Promise<Reservation>;                       // insert-if-absent; a row with task_id = 0 means reserved, not yet posted
    complete(authNonce: Hex, r: { task_id: number; settle_tx: Hex | null }): Promise<void>;
    setSettleTx(authNonce: Hex, tx: Hex): Promise<void>;
    release(authNonce: Hex): Promise<void>;                              // delete a reservation whose post never happened
  }
  export type SqlExecutor = (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>;
  export class MemoryIdempotencyStore implements IdempotencyStore { … }
  export class SqlIdempotencyStore implements IdempotencyStore { constructor(exec: SqlExecutor) }   // table `idempotency` (auth_nonce PK, task_id, settle_tx); INSERT … ON CONFLICT DO NOTHING
  ```
  Task ids start at 1 on chain, so `task_id = 0` is the reservation sentinel.
- `src/direct/gateway.ts` — `class DirectFundingGateway implements PaymentGateway`: `price` works; `requirePayment`/`settle` throw `new Error('direct funding not implemented — T-16b')`; selected by `PAYMENT_MODE=direct`. The pivot (buyer calls `postAsBuyer`; API verifies the `TaskPosted` event) lands here if S3 failed.
- `src/select.ts` — `selectGateway(mode: 'x402'|'direct', deps) → PaymentGateway`.
- `packages/payments/README.md`: the seam, the frozen order, "verify moves no money; settle follows post", the idempotency sentinel, how to run tests without a facilitator, the honesty lines in §10.

## 3. Out of scope
- The route handler, caps, screening, `buyer_token`, the `tasks` row — **T-16**. Direct-funding implementation — **T-16b** (if dispatched).
- Drizzle, `apps/api/**`, `.env.example` — **T-08 / T-01**. The store takes a `SqlExecutor`; it never imports Drizzle or the API.
- Do not touch: `apps/**`, `packages/shared/**`, `packages/mcp/**`, `scripts/spikes/**`, `docs/spikes/RESULTS.md`.

## 4. Owned paths
```
packages/payments/**
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `## S3` findings | `docs/spikes/RESULTS.md#s3` (T-03) | exact imports for requirements/verify/settle, header names, how the JSON 402 body is attached, payer and nonce property paths |
| `@x402/core`, `@x402/evm` | catalog | resource-server primitives, exact EVM scheme (server and client side), facilitator client interface |
| `toUsdcUnits`, `fromUsdcUnits`, `priceWithFee`, `FEE_BPS`, `TaskType` | `@legwork/shared` (T-01) | integer fee math; `priceWithFee(3_000_000n) === 3_450_000n` |
| `rawQuery` | `apps/api/src/db/client.ts` / `test/db.ts` (T-08) | the `SqlExecutor` shape `(text, params) → rows`; not imported here — T-16 passes it in |
| `idempotency` table | `apps/api/src/db/schema.ts` (T-01, frozen) | columns `auth_nonce` PK, `task_id`, `settle_tx` |
| Env | `.env.example` | `PAYMENT_MODE`, `X402_FACILITATOR_URL`, `X402_NETWORK`, `USDC_ADDRESS` — read by T-16's wiring, never inside this package |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `PaymentGateway`, `PriceQuote`, `PaymentContext`, `RequirePaymentResult`, `SettleResult`, `PaymentRequiredBody` | `packages/payments/src/gateway.ts` | T-16, T-16b |
| `X402Gateway`, `FacilitatorClient` | `packages/payments/src/x402/gateway.ts` | T-16 (prod), T-28 (test harness) |
| `FakeFacilitator`, `signPaymentHeader` | `packages/payments/src/x402/{fakeFacilitator,testSigner}.ts` | T-16, T-28 tests |
| `IdempotencyStore`, `MemoryIdempotencyStore`, `SqlIdempotencyStore`, `SqlExecutor` | `packages/payments/src/idempotency.ts` | T-16 |
| `DirectFundingGateway`, `selectGateway` | `packages/payments/src/{direct/gateway,select}.ts` | T-16, T-16b |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-15` — it must print `CLAIMED T-15`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `docs/spikes/RESULTS.md#s3` and T-03's `server.ts`; copy the imports, header names and property paths into `paths.ts` and the gateway. Do not open the library's source to "improve" on the spike.
2. `gateway.ts` types; `price()` with the shared helpers; test `priceMathSixDecimals` first.
3. `FakeFacilitator` and `testSigner.ts` (sign a header for a requirements object; the fake must accept it).
4. `X402Gateway`: no header → 402; header → verify → ctx; settle. Test the three paths against the fake.
5. `idempotency.ts`: memory store, then the SQL store on pglite (`CREATE TABLE idempotency (auth_nonce text primary key, task_id integer not null, settle_tx text)` in the test — mirror the frozen columns; if the merged `schema.ts` types differ, match them).
6. `DirectFundingGateway`, `selectGateway`, README. Run §9.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `priceMathSixDecimals` | `price({task_type:'verify-open', amount_usdc: 3.00})` → `amount_units 3_000_000n`, `fee_units 450_000n`, `price_units 3_450_000n`, `price_usdc 3.45`; `1.00` → `1_150_000n`; `10.00` → `11_500_000n`; result `price_units` equals `priceWithFee(toUsdcUnits(amount))` for 50 random 2-decimal amounts in `[1, 10]`; no `* 1.15` appears in `src/` (grep in §9) |
| `replayedNonceReturnsStoredTask` | for both stores: `reserve(n)` → `reserved`; `reserve(n)` → `in_progress`; `complete(n, {task_id: 7, settle_tx: null})`; `setSettleTx(n, tx)`; `reserve(n)` → `{state:'done', task_id: 7, settle_tx: tx}`; `release(m)` on a reserved `m` makes `reserve(m)` return `reserved` again; `release(n)` on a done row is a no-op |
| `settleFailureSurfacesFloatAbsorbed` | `FakeFacilitator.failNextSettle('facilitator_unavailable')`: `settle(ctx)` resolves (does not throw) to `{ok:false, reason:'facilitator_unavailable', float_absorbed: true}`; `settleCalls === 1`; a following `settle(ctx)` succeeds |
| `requirePaymentIsVerifyOnly` | no header → `kind:'payment_required'`, body exactly `{error:'payment_required', price_usdc: 3.45, accepts:[…], remaining_budget}`; with `signPaymentHeader` → `kind:'verified'`, `payerOf(ctx)` = the signing address, `authNonceOf(ctx)` = the nonce; `verifyCalls === 1`, `settleCalls === 0`; a tampered header → 402 with `reason` |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/payments typecheck && pnpm --filter @legwork/payments test
pnpm --filter @legwork/payments test -t priceMathSixDecimals
grep -rnE "\* ?1\.15|1\.15 ?\*" packages/payments/src        # must print nothing
grep -rn "x402.org" packages/payments/src packages/payments/test   # only in a comment or README, never a test call
scripts/ci/banned-words.sh packages/payments
```
Expected: tests green; both greps print nothing outside comments; no network call in the test run (vitest completes offline).

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). Units `3_450_000` / `3_000_000` / `450_000`; fee math is `priceWithFee`, never a float multiply.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git. This package reads **no** env at all; the Anvil #0 key in `testSigner.ts` is a public vector and is labelled so.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted); never the x402.org facilitator — `FakeFacilitator` only.
- `verify` moves no money and precedes everything; `settle` is a separate call the route makes **after** `post`. The gateway never settles inside `requirePayment`, and never exposes a "verify-and-settle" helper.
- Never log raw spec text: this package logs nothing; it returns results.
- The idempotency key is the authorization nonce — never the task id, never the payer address.
- `settle` never throws; a failure is `{ok:false, float_absorbed: true}` so the route can log `float_absorbed=true` and still return the task the agent paid for.
- Honesty lines for the README, verbatim: "a refused task moves no money."; "our custody is the one block between settlement and escrow, and we say so."

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `packages/payments/README.md` written per §2.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-15 — packages/payments — PaymentGateway, X402Gateway, idempotency, FakeFacilitator
owned-paths:
  - packages/payments/**
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

Known gaps to raise as written:
- `BLOCKED: docs/spikes/RESULTS.md#s3 lacks <Payer path | Nonce path | Header names>` — T-03 fills it; do not read the library to guess.
- If `## S3` says `Result: FAIL`, build everything in §2 anyway (the interface, the fake, the store) and put the gateway behind `selectGateway`; comment `DECISION NEEDED: S3 FAIL — T-16b direct funding to be dispatched` on the PR.
- `INTERFACE REQUEST: idempotency.task_id must allow 0 as the reservation sentinel` — only if the merged column has a `CHECK (task_id > 0)`.
- `DEP REQUEST: @x402/fetch as devDependency of packages/payments` — only if the catalog lacks it (needed by `testSigner.ts` tests).

## 14. Reviewer notes
Open `x402/gateway.ts` first: `requirePayment` never calls `settle`; `settle` catches and returns, never throws; the 402 body is the frozen shape. Then `paths.ts` against `RESULTS.md#s3` — the two paths must be copied, not guessed. Then `idempotency.ts`: `ON CONFLICT DO NOTHING` plus a read-back, the `task_id = 0` sentinel, `release` deleting only `task_id = 0` rows. Most likely wrong: a float in `price()`; the fake accepting any header (it must check `to`, `value`, `validBefore`, nonce); a test that reaches x402.org; an idempotency key derived from the payer or the spec hash instead of the nonce.

## 15. Round 2+
—
