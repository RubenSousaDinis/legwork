---
id: T-16b
title: Direct funding — signed quote, postAsBuyer, confirm
lane: B
day: 6
size: M
agent_class: C
must: false
depends_on: [T-15]
owned_paths:
  - packages/payments/src/direct/**
  - apps/api/app/tasks/[id]/confirm/**
labels: [area:payments, wave:6, size:M, agent:cloud, substitute]
branch: t-16b/direct-funding
---

**Dispatch only if S3 FAILED** — the x402 `/verify` + `/settle` spike (04-spike-gates). While S3 passes, this brief is not dispatched and `PAYMENT_MODE=x402` stays.

# T-16b — Direct funding — signed quote, postAsBuyer, confirm

## 1. Context
If the x402 facilitator cannot be made to verify and settle on Base Sepolia, the agent pays escrow itself: the Task API screens the request and answers with a **quote**, the agent's own wallet runs `USDC.approve` + `TaskEscrow.postAsBuyer(PostParams)`, and the API confirms the onchain task and hands back the `buyer_token`. `postAsBuyer` exists onchain from Day 1 for exactly this pivot. The seam is T-15's `PaymentGateway`: `DirectFundingGateway` implements it, so T-16's route, T-27's tools and T-28's binary keep their shapes; only the money path changes. The honesty line changes with it: in direct mode Legwork never holds the agent's money — say so.

> **T-01 — `ITaskEscrow.postAsBuyer(PostParams p) → uint256`:** `whenNotPaused`; requires `p.buyer == msg.sender`; pulls from `msg.sender`; otherwise identical [to `post`: pulls `p.amount + fee` USDC with `safeTransferFrom`; requires `p.amount ≤ MAX_TASK_AMOUNT`, `p.amount ≥ 1_000_000`, `openTasksOf(p.buyer) < maxOpenTasksPerBuyer` (else `OverOpenCap`), `p.taskType ∈ {1,2,4,8}`; emits `TaskPosted`]. (The S3-fail pivot; also the self-custodial roadmap.) `struct PostParams { uint8 taskType; bytes32 specHash; uint96 amount; address buyer; uint256 buyerAgentId; string area; uint32 claimTTL; uint32 submitTTL; uint32 disputeWindow; }` · `TaskPosted(uint256 indexed taskId, address indexed buyer, uint256 buyerAgentId, uint8 taskType, bytes32 specHash, uint96 amount, uint96 fee, string area, uint32 claimTTL, uint32 submitTTL, uint32 disputeWindow)`.

> **T-01 — handler order for `POST /tasks` (frozen):** `x402 verify (no money moves) → envelope + schema → deterministic gate → classifier (free-text path only) → caps → agent-id verification → TaskEscrow.post(buyer = payer, buyerAgentId) via TxQueue → x402 settle (idempotency key = authorization nonce) → 201`. A refusal from the gate/classifier → `AbuseMark.mark` (if a verified agent id) and 422.

In direct mode the first step becomes "verify `X-Buyer-Signature` (no money moves)", the `post + settle` pair becomes "return the quote", and `POST /tasks/:id/confirm` finishes the job after the agent's two transactions. Screening, marks (T-30) and caps are unchanged: a refused request still gets a 422 and, with a verified identity, a mark — and still moves no money.

**Prerequisites the lead merges before dispatch** (interface-change PRs, listed in §13): the `direct_quotes` table, the `POST /tasks` 202 quote body, the `POST /tasks/:id/confirm` route in `api-contract.ts`, and a `PaymentGateway` result variant that lets T-16's route return a quote instead of posting.

## 2. Exact scope
- `packages/payments/src/direct/gateway.ts` exports `class DirectFundingGateway implements PaymentGateway` (interface from T-15 — read `packages/payments/src/gateway.ts` for the exact method names and mirror `X402Gateway`'s shape). Constructor deps: `{ quotes: QuoteStore; chain: ChainReader; escrow: Address; usdc: Address; chainId: 84532; now: () => number }`.
- **Signed header.** `verify(req)` requires `X-Buyer-Signature` and `X-Buyer-Timestamp`. It recomputes `specHash(envelope)` from the body (`@legwork/shared`), builds `message = \`${specHash}:${timestamp}\`` (`specHash` 0x-prefixed lowercase hex, `timestamp` decimal unix seconds — the `:` separator is this brief's decision), and recovers the signer with viem `recoverMessageAddress` (EIP-191 `personal_sign`). Recovered address = `payer`. Rejections, all before screening: header missing → **401** `{error:'bad_signature', reason:'missing'}`; `|now − timestamp| > 300` → 401 `{…reason:'stale'}`; recovery fails or the body's `spec_hash`, if present, differs from the recomputed one → 401 `{…reason:'mismatch'}`. No address header exists and none is trusted.
- **Quote.** After screening, caps and agent-id verification (T-30's `verifyAgentId`), the gateway's settle-step returns the quote T-16's route sends as **202**: `{ quote: true, spec_hash, amount_units, fee_units, total_units, escrow, usdc, chain_id: 84532, deadline, post_params: { taskType, specHash, amount, buyer, buyerAgentId, area, claimTTL, submitTTL, disputeWindow } (bigints as decimal strings), dashboard_url }` with `total_units = priceWithFee(amount_units)` (3.00 → `3_000_000` + `450_000` = `3_450_000`), `deadline = now + 600`, `buyer = payer`, `buyerAgentId` = verified id or `0`, `area` and TTLs exactly as T-16 would have posted them (`DEMO_DISPUTE_WINDOW_S` for allowlisted buyers). The quote is stored in `QuoteStore` keyed by `spec_hash`: `{ payer, agent_id, task_type, spec_json, post_params, amount_units, total_units, deadline, created_at, created_block, task_id: null, confirmed_at: null }`; a repeat request with the same `(payer, spec_hash)` before `deadline` returns the same quote (idempotent).
- `packages/payments/src/direct/quoteStore.ts`: `QuoteStore { get(specHash); put(quote); markPosted(specHash, taskId, tx); markConfirmed(specHash) }`, `MemoryQuoteStore` (tests) and `PgQuoteStore` over the `direct_quotes` table (§13).
- **Reconcile.** `reconcileDirectQuotes(deps, { specHash? })` reads `TaskPosted` logs from the escrow since `created_block` (T-13 reader `getLogs`; `buyer` is indexed — filter by payer, then by `specHash` client-side), and for each match whose onchain `getTask(taskId)` equals the quote's `post_params` field for field (`taskType, specHash, amount, buyer, buyerAgentId, area, claimTTL, submitTTL, disputeWindow`) inserts the `tasks` row (`payer`, `agent_id`, `spec_json`, `price_units = total_units`, `auth_nonce = 'direct:' + spec_hash`, `tx.post`) and an `idempotency` row (`auth_nonce → task_id`, `settle_tx = tx.post`); `markPosted`. A mismatch is recorded as `quote_mismatch` on the quote and never becomes a task. Expired quotes (`now > deadline`, no `TaskPosted`) are ignored.
- **Confirm.** `apps/api/app/tasks/[id]/confirm/route.ts` — `POST /tasks/:id/confirm`, body `{ spec_hash, tx }`, headers `X-Buyer-Signature` + `X-Buyer-Timestamp` over the same `message` (fresh timestamp). Steps: signature (as above) → quote by `spec_hash` exists and `quote.payer == recovered` (else **403** `{error:'not_buyer'}`) → `reconcileDirectQuotes({specHash})` → `getTask(id)` matches the quote and `task.state == Open` (else **409** `{error:'quote_mismatch'}`) → not yet confirmed (else **409** `{error:'already_confirmed'}`) → generate `buyer_token`, store `buyer_token_hash` on the task row, `markConfirmed`, `upsertPoster` (T-30) → **201** with exactly the x402 201 body: `{task_id, buyer_token, status:'open', spec_hash, price_usdc, eta_seconds, poll_after_seconds, dashboard_url}`. The token is issued once; a second confirm never re-issues it.
- **Local `hire_human`.** `packages/payments/src/direct/hire.ts` exports `createDirectHire(opts: { wallet: DirectWallet; insert?: (line: string) => void }) → (input, ctx: { apiBase: string; dashboardUrl: string; fetch: typeof fetch; tokenStore: { set(taskId: string, token: string): Promise<void> } }) => Promise<HireHumanResult>` — typed **structurally** (no import from `@legwork/mcp`) so it is assignable to T-27's `LocalHireHandler`. `DirectWallet { address: Address; signMessage(message: string): Promise<Hex>; allowance(spender): Promise<bigint>; approve(spender, units): Promise<Hex>; postAsBuyer(params): Promise<{ tx: Hex; taskId: bigint }> }`; `ViemDirectWallet(privateKey, rpcUrl)` implements it (viem wallet client, `waitForTransactionReceipt`, `parseEventLogs` for `TaskPosted`) and is the only file that touches a key — the key is passed in by T-28's binary, never read from env here. Flow: build the `Envelope`; compute `specHash`; sign; `POST /tasks` → 422 → return the `RefusalPayload` unchanged; 400/429/401 → `isError` result with the API body; 202 → `approve(escrow, total_units)` only if `allowance < total_units` → `postAsBuyer(post_params)` → `POST /tasks/:id/confirm` → `tokenStore.set` → return `{task_id, status, eta_seconds, poll_after_seconds, dashboard_url}` (never the token).
- Insert lines (via `opts.insert`, three lines, each ≤ 72 chars): `hire_human(<task_type> · <place name>, <locality> · 3.00 USDC)` · `→ 202 quote · 3.45 USDC (3.00 + 0.45 fee) · approve + postAsBuyer` · `→ 201 { task_id: <id> } · escrow locked 3.45 · <dashboard_url>`.
- `packages/payments/src/direct/index.ts` re-exports; `packages/payments/src/direct/README.md` — the two-transaction flow, the signature scheme, the honesty line "direct mode: the agent's wallet funds escrow itself; Legwork holds nothing", and "testnet USDC — not spendable".

## 3. Out of scope
- `PaymentGateway`, `X402Gateway`, `FakeFacilitator` — **T-15**. The `POST /tasks` route and selecting the gateway from `PAYMENT_MODE` — **T-16** (one-line composition change by the lead). Marks, identity, posters — **T-30** (called, not edited).
- T-28's `bin/legwork-mcp.ts` wiring (`hireHuman: PAYMENT_MODE === 'direct' ? createDirectHire(...) : localHire`) and README copy — the lead / T-28 (§13). `SKILL.md` wording — **T-31**.
- Contract changes: `postAsBuyer` is deployed as frozen; nothing in `contracts/**`.
- Do not touch: `packages/payments/src/*.ts` outside `direct/`, `packages/mcp/**`, `apps/api/app/tasks/route.ts`, `apps/api/src/**`, `packages/shared/**`.

## 4. Owned paths
```
packages/payments/src/direct/**
apps/api/app/tasks/[id]/confirm/**
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `PaymentGateway`, `X402Gateway` | `packages/payments/src/gateway.ts` (T-15) | the seam T-16's route calls; mirror its method names and result shapes |
| `ITaskEscrow` ABI + `IERC20` | `packages/shared/src/abi/TaskEscrow.json`, USDC | `postAsBuyer(PostParams)`, `getTask(uint256) → Task`, `TaskPosted` event, `allowlistedBuyer`; `approve`, `allowance` |
| `specHash(envelope)`, `Envelope`, `RefusalPayload`, `priceWithFee`, `toUsdcUnits`, `TASK_TYPE_BIT`, `DEMO_DISPUTE_WINDOW_S` | `packages/shared` | canonical hash; 3.00 → 3.45; type bits `{verify-open:1, photo-of:2, call-confirm:4, compare-two:8}` |
| `verifyAgentId`, `upsertPoster` | `apps/api/src/services/{identity,posters}.ts` (T-30) | verified `buyerAgentId`; poster row on confirm |
| `ChainReader`, `FakeChain` | `packages/chain/src/**` (T-13) | `readContract`, `getLogs`, settable `getTask`/`TaskPosted` fixtures |
| Tables `tasks`, `idempotency`, `direct_quotes` | `apps/api/src/db/schema.ts` | `tasks.payer, agent_id, spec_json, price_units, auth_nonce, buyer_token_hash`; `idempotency(auth_nonce → task_id, settle_tx)`; `direct_quotes` (§13) |
| `ADDRESSES` | `packages/shared/src/addresses.ts` | `TASK_ESCROW`, `USDC`, `CHAIN_ID = 84532` |
| Env (composition root / T-28 binary only) | `.env.example` | `PAYMENT_MODE=direct`, `BUYER_PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`, `TASK_ESCROW_ADDRESS`, `USDC_ADDRESS` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `DirectFundingGateway`, `QuoteStore`, `MemoryQuoteStore`, `PgQuoteStore`, `reconcileDirectQuotes` | `packages/payments/src/direct/` | T-16's route (via `PaymentGateway`), the confirm route, `/admin/sweep` (optional one-liner) |
| `POST /tasks/:id/confirm` | `apps/api/app/tasks/[id]/confirm/route.ts` | `createDirectHire`, T-34, judges |
| `createDirectHire(opts)`, `DirectWallet`, `ViemDirectWallet`, `buildSignedHeaders(wallet, specHash, now)` | `packages/payments/src/direct/hire.ts` | T-28's binary (swap point), T-34 |
| Honesty line for direct mode | `packages/payments/src/direct/README.md` | T-28, T-31, T-48 |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-16b` — it must print `CLAIMED T-16b`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `packages/payments/src/gateway.ts` and `x402.ts` (T-15), `apps/api/app/tasks/route.ts` (T-16) for how the gateway result becomes a response, `packages/chain/src/index.ts` (T-13) for the reader and `FakeChain`, and T-30's `identity.ts`/`posters.ts` exports.
2. `quoteStore.ts` + `signature.ts` (`buildSignedHeaders`, `verifySignedHeaders`) with unit tests — viem `privateKeyToAccount` on the Anvil #0 well-known key (public test vector, not a secret).
3. `gateway.ts` per §2; `reconcile.ts`; tests on `FakeChain` with a scripted `TaskPosted` log + `getTask` fixture.
4. The confirm route with a route test (pglite + `FakeChain`).
5. `hire.ts` with a `FakeDirectWallet` (records `approve`/`postAsBuyer`, returns a scripted `taskId`) against `msw` for the API; `ViemDirectWallet` behind `LIVE_CHAIN=1` only.
6. README; run §9.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `directQuoteThenReconcile` | a signed `POST /tasks` (screening stubbed to accept) yields the 202 quote with `total_units === 3_450_000n` for `amount_usdc: 3.00`, `post_params.buyer` = the recovered address, `deadline = now + 600`; a repeat returns the same `spec_hash` and creates no second quote; `FakeChain` emits `TaskPosted` with that `specHash` and `getTask` matching `post_params` → `reconcileDirectQuotes` inserts one `tasks` row with `auth_nonce === 'direct:' + spec_hash` and `price_units === 3_450_000n`, and one `idempotency` row; `POST /tasks/:id/confirm` → 201 with the x402 201 body and a `buyer_token`; a second confirm → 409 `already_confirmed`; a `getTask` whose `amount` differs from the quote → 409 `quote_mismatch` and no `tasks` row |
| `signedHeaderRequired` | `POST /tasks` without `X-Buyer-Signature` → 401 `bad_signature/missing` and screening never runs; timestamp 301 s old → 401 `stale`; a signature over a different `specHash` → 401 `mismatch`; a valid signature from key B → the quote's `buyer` is B (recovery, not a header); confirm signed by B for a quote whose payer is A → 403 `not_buyer`; no `X-Buyer-Address` header is read anywhere (`grep` in §9) |
| `directHireApproveThenPost` | `createDirectHire` with `FakeDirectWallet` (`allowance = 0n`) against an `msw` API: `approve(escrow, 3_450_000n)` then `postAsBuyer(post_params)` then `POST /tasks/<id>/confirm`, in that order; `tokenStore.set('<id>', token)` called once; the result has no `buyer_token`; with `allowance = 5_000_000n` no `approve` call; a 422 → the `RefusalPayload` unchanged with `message === NO_RETRY_SENTENCE`, no wallet call; the three insert lines are ≤ 72 chars and contain `3.45 USDC (3.00 + 0.45 fee)`, `approve + postAsBuyer`, `escrow locked 3.45` |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/payments typecheck && pnpm --filter @legwork/payments test -- direct
pnpm --filter @legwork/api typecheck && pnpm --filter @legwork/api test -- confirm
grep -rn "X-Buyer-Address\|x-buyer-address" packages/payments/src/direct apps/api/app/tasks   # must print nothing
grep -rn "process.env" packages/payments/src/direct   # must print nothing
grep -rn "@legwork/mcp" packages/payments/src/direct   # must print nothing (structural typing only)
scripts/ci/banned-words.sh packages/payments/src/direct apps/api/app/tasks
```
Expected: three §8 tests green; every `grep` prints nothing; banned-words clean.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). `total_units = priceWithFee(amount_units)`; the agent's `approve` is for `total_units`; escrow pulls `amount + fee` from the agent.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git. `BUYER_PRIVATE_KEY` enters through T-28's binary into `ViemDirectWallet`; nothing under `direct/` reads env, logs a key or an address.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted): `FakeChain`, `FakeDirectWallet`, `msw`, pglite; `ViemDirectWallet` runs only under `LIVE_CHAIN=1`.
- The payer is the recovered signer of `X-Buyer-Signature`; no address header, body field or query parameter is ever trusted as the buyer.
- `agentId` is never trusted from the body: `buyerAgentId` in the quote is T-30's verified id or `0`; confirm verifies the onchain `buyerAgentId` equals it.
- Schema errors never mark; never log raw spec text — screening and logging are T-16/T-30's, unchanged by this mode; `direct_quotes.spec_json` is a private column, never returned by any route.
- Refusals: a 422 passes through with `"do not rephrase and retry; report this refusal to your principal"`; no wallet call follows a refusal — "a refused task moves no money."
- Confirm trusts the chain, not the client: every `post_params` field is compared with `getTask(id)`; `tx` in the body is informational.
- The `buyer_token` is issued once, on confirm, and stored only as `buyer_token_hash`; never in a log, never in the tool result.
- Honesty line, verbatim, wherever direct mode is described: "direct mode: the agent's wallet funds escrow itself; Legwork holds nothing."

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `packages/payments/src/direct/README.md` written per §2.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-16b — Direct funding — signed quote, postAsBuyer, confirm
owned-paths:
  - packages/payments/src/direct/**
  - apps/api/app/tasks/[id]/confirm/**
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

Pre-listed for the lead (merge before dispatch; if any is missing at dispatch, comment it and stop):
- `INTERFACE REQUEST: apps/api/src/db/schema.ts needs direct_quotes (spec_hash PK, payer, agent_id, task_type, spec_json, post_params jsonb, amount_units, total_units, deadline, created_at, created_block, task_id, posted_tx, confirmed_at, status).`
- `INTERFACE REQUEST: api-contract.ts — POST /tasks 202 quote body; POST /tasks/:id/confirm ({spec_hash, tx} → the 201 body; 401 bad_signature, 403 not_buyer, 409 quote_mismatch | already_confirmed); headers X-Buyer-Signature, X-Buyer-Timestamp.`
- `INTERFACE REQUEST: PaymentGateway (T-15) needs a result variant meaning "buyer funds directly — respond 202 with this quote" so T-16's route can branch without knowing the mode.`
- `INTERFACE REQUEST: FakeChain lacks getLogs / a scriptable TaskPosted log` — only if T-13's double cannot provide it.
- Lead one-liners outside owned paths: T-16's composition root selects `DirectFundingGateway` when `PAYMENT_MODE=direct`; T-28's `bin/legwork-mcp.ts` passes `createDirectHire({ wallet: new ViemDirectWallet(key, rpcUrl), insert })` as `hireHuman` in that mode; T-28's README swaps the custody line for the direct-mode honesty line.

## 14. Reviewer notes
Open `gateway.ts` first: `specHash` recomputed from the body, recovery not a header, 300 s skew, screening after the signature check. Then the confirm route: the field-by-field `getTask` comparison and the single token issuance. Then `hire.ts`: no `@legwork/mcp` import, no env, `approve` skipped on sufficient allowance, no wallet call after a 422. Most likely wrong: trusting an `X-Buyer-Address` header; issuing the token on reconcile instead of confirm; comparing only `specHash` (not amount/TTLs/agent id) with the onchain task; `approve` for `amount` instead of `total_units`; the token appearing in the tool result.

## 15. Round 2+
—
