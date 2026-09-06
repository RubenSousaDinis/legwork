---
id: T-03
title: Spike S3 — x402 seller and buyer round-trip on Base Sepolia
lane: B
day: 1
size: M
agent_class: L
must: true
depends_on: [T-00]
owned_paths:
  - scripts/spikes/s3-x402/**
  - docs/spikes/RESULTS.md          # the `## S3` section only — append it; never edit another spike's section
labels: [area:payments, wave:1, size:M, agent:local, spike]
branch: t-03/spike-x402
---

# T-03 — Spike S3 — x402 seller and buyer round-trip on Base Sepolia

**Time box: 45–90 minutes of wall clock from the first command.** At minute 90 you stop in whatever state you are in and write the `## S3` section. A FAIL written on time is a pass for this task; a PASS written at minute 140 is not. "Do not fight it": if the library will not do a step the way the plan needs, record the step and the error, and move on — the Day-6 pivot exists for exactly this outcome.

## 1. Context
`POST /tasks` is an x402 seller: the agent's first call gets a 402 with payment requirements, its client signs a USDC authorization, retries with a `PAYMENT-SIGNATURE` header, and the API verifies, does the work, then settles. The price is **dynamic** (`amount × 1.15`, so 3.00 USDC → 3.45), which rules out static-price middleware: the requirements must be built inside the route handler, and `settle` must run **after** `TaskEscrow.post`. This spike proves the round-trip with the v2 scoped packages (`@x402/core`, `@x402/evm`, `@x402/fetch`) against the reference facilitator on Base Sepolia, and proves that replaying the same authorization cannot charge twice. Its output is one section in `docs/spikes/RESULTS.md` that T-15 (`X402Gateway`) and T-16 (`POST /tasks`) copy from, and the `PAYMENT_MODE` value the lead puts in the deployment env.

> **02-architecture.md — Task API:** x402 seller (exact-EVM scheme, USDC on Base Sepolia, reference facilitator). Order on `POST /tasks`: `/verify` the payment authorization (no money moves) → screen → if refused: AbuseMark (if the payer has an identity) and a 4xx that names the class and the reason → if accepted: `TaskEscrow.post(…, buyer = payer)` from the operator float → `/settle` with an idempotency key on the authorization nonce (a retried settle cannot double-charge). A failed `post` never takes the agent's money. If `settle` fails after `post`, the float absorbed the task and the log says so. "Our custody is the one block between settlement and escrow, and we say so."

> **T-01 (frozen) handler order for `POST /tasks`:** `x402 verify (no money moves) → envelope + schema → deterministic gate → classifier (free-text path only) → caps → agent-id verification → TaskEscrow.post(buyer = payer, buyerAgentId) via TxQueue → x402 settle (idempotency key = authorization nonce) → 201`. A failed `post` never settles. A failed settle after `post` logs `float_absorbed=true`.

## 2. Exact scope
- `scripts/spikes/s3-x402/README.md`: prerequisites (buyer wallet holds ≥ 5 Base Sepolia USDC from Circle's faucet; the buyer needs **no ETH** — EIP-3009 authorizations are gasless for the payer, the facilitator pays gas), the env names below, the three commands, and the 90-minute rule.
- `scripts/spikes/s3-x402/price.ts`: `priceUnits(amountUsdc: string): bigint` — parse a 2-decimal string into 6-decimal integer units, then `units + units * 1500n / 10000n`. `"3.00"` → `3_450_000n`; `"1.00"` → `1_150_000n`. **Never** `amount * 1.15` in floating point (`3.00 * 1.15` is not `3.45` in IEEE-754).
- `scripts/spikes/s3-x402/server.ts`: a `node:http` server on `127.0.0.1:4021` with one route, `POST /tasks`, body `{ "amount_usdc": "3.00" }`:
  1. build the payment requirements with `@x402/core` + `@x402/evm` primitives: scheme `exact`, network `eip155:84532`, asset `USDC_ADDRESS`, `payTo` = the relayer address (derived from `RELAYER_PRIVATE_KEY` with viem's `privateKeyToAccount`; the key itself is never used here), amount `priceUnits(body.amount_usdc)`, `maxTimeoutSeconds` 300, description `"Legwork task"`;
  2. no `PAYMENT-SIGNATURE` header → respond **402** with the requirements the way the library wants them (header and/or body — record which) **and** a JSON body `{ "error": "payment_required", "price_usdc": "3.45", "accepts": [...] }`;
  3. header present → decode the payload, call the facilitator's `verify` through the library's HTTP facilitator client (`X402_FACILITATOR_URL`); invalid → 402 again with `reason`;
  4. idempotency: read the authorization nonce from the decoded payload; if a `Map<nonce, result>` already holds it → respond **200** with the stored result and **do not call `settle` again**; log `replay=true`;
  5. `stubScreen()` → always accepts; `stubPost()` → waits 300 ms and returns an incrementing `taskId`;
  6. `settle` through the facilitator; store `{taskId, settle_tx}` under the nonce; respond **200** `{ "taskId": n, "settle_tx": "0x…" }`.
  Print one line per step to stdout: `402 sent` · `PAYMENT-SIGNATURE received` · `verify ok payer=0x…` · `post stub taskId=1` · `settle ok tx=0x…` · `200 {taskId:1}`. Print the payer address and the tx hash, never a key, never the raw header.
- `scripts/spikes/s3-x402/buyer.ts`: wraps `fetch` with `@x402/fetch` (`wrapFetchWithPayment` or the pinned version's equivalent) and a viem account from `BUYER_PRIVATE_KEY`; `POST http://127.0.0.1:4021/tasks` with `{ "amount_usdc": "3.00" }`; logs every request/response status through a logging fetch wrapper so the `402 → retry-with-header → 200` sequence is visible. Then **replay**: take the exact `PAYMENT-SIGNATURE` header value the wrapper sent on the second request and re-send it with plain `fetch`; expect `200 {taskId: 1}` (same id) and `replay=true` on the server.
- `scripts/spikes/s3-x402/check-balance.ts`: viem `balanceOf(USDC_ADDRESS)` for the buyer and for `payTo`, printed as 6-decimal integers; run before and after; expected deltas buyer `-3450000`, payTo `+3450000` after one paid call, unchanged after the replay.
- `docs/spikes/RESULTS.md` — append a section whose heading is exactly `## S3` (so the anchor is `#s3`) with these fields, each on its own line: `Result: PASS | FAIL` · `PAYMENT_MODE: x402 | direct` · `Time used: <min>` · `Packages: @x402/core@<v>, @x402/evm@<v>, @x402/fetch@<v>` · `Requirements builder: <exact import + call>` · `Facilitator client: <exact import + verify/settle calls>` · `Header names: request <…>, 402 <…>, response <…>` · `402 JSON body: <how it is attached, or "body is free; requirements travel in header X">` · `Payer path: <property path in the decoded payload>` · `Nonce path: <property path>` · `Settle tx: <Basescan link>` · `Replay: <settle count stayed 1 | FAIL + what happened>` · `Failing step (if FAIL): <step number + error text>`.

## 3. Out of scope
- `packages/payments` (`PaymentGateway`, `X402Gateway`, `FakeFacilitator`) — **T-15**. The real `POST /tasks` — **T-16**. The MCP buyer — **T-28**.
- Any change to `.env.example` (**T-01**), `pnpm-workspace.yaml` or the catalog (**T-00**): if a package version is missing, `DEP REQUEST:` and use the pinned one.
- Screening, caps, escrow: stubs only. No contract calls at all — the only chain effect is the facilitator's USDC transfer.
- Do not touch: `apps/**`, `packages/**`, `contracts/**`, any other `docs/spikes/RESULTS.md` section.

## 4. Owned paths
```
scripts/spikes/s3-x402/**
docs/spikes/RESULTS.md      (the `## S3` section only)
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `@x402/core`, `@x402/evm`, `@x402/fetch` | catalog (pinned by T-00) | resource-server primitives (build requirements, verify, settle), the exact EVM scheme, the paying fetch wrapper |
| Reference facilitator | `X402_FACILITATOR_URL=https://x402.org/facilitator` | `verify` moves no money; `settle` submits the EIP-3009 transfer and pays gas |
| USDC (Base Sepolia, 6 decimals) | `USDC_ADDRESS` (filled by T-00 from Circle's deployments page) | `balanceOf` for the before/after check |
| Env | `.env.example` | `BUYER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY` (address derivation only), `USDC_ADDRESS`, `X402_FACILITATOR_URL`, `X402_NETWORK=eip155:84532`, `BASE_SEPOLIA_RPC_URL` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `## S3` section: result, `PAYMENT_MODE`, import names, header names, 402-body method, payer/nonce property paths, settle tx | `docs/spikes/RESULTS.md#s3` | T-15 (`paths.ts`, `X402Gateway`), T-16, T-28, lead (`PAYMENT_MODE` in the deploy env) |
| `priceUnits` reference implementation | `scripts/spikes/s3-x402/price.ts` | T-15 (`priceMathSixDecimals` copies the vectors) |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-03` — it must print `CLAIMED T-03`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Minute 0–10: open the three packages' `README.md` under `node_modules` at the pinned versions. Find: how the resource server registers the exact EVM scheme; how requirements are built (dynamic amount, `payTo`, network string); the HTTP facilitator client's `verify`/`settle`; the header names; where the decoded payload keeps the payer address and the authorization nonce. Write them into the `## S3` section as you find them — the section is your notebook.
2. Minute 10–35: `price.ts`, then `server.ts` per §2 (steps 1–6). Start it: `pnpm tsx scripts/spikes/s3-x402/server.ts`.
3. Minute 35–55: `check-balance.ts` (run once, keep the numbers), then `buyer.ts`; run it; watch the server log for the six lines.
4. Minute 55–70: the replay half of `buyer.ts`; run `check-balance.ts` again; confirm settle ran once.
5. Minute 70–90: fill the remaining fields; open the settle tx on Basescan and paste the link; decide `PAYMENT_MODE`; commit.
6. If any step fails twice for the same reason: stop retrying, write `Failing step`, set `Result: FAIL`, `PAYMENT_MODE: direct`, and commit. The Day-6 pivot is direct funding — the buyer calls `TaskEscrow.postAsBuyer` itself and T-16 verifies the `TaskPosted` event; T-15's `DirectFundingGateway` is its seam.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `pnpm tsx scripts/spikes/s3-x402/server.ts` | listens on `127.0.0.1:4021`; a bare `curl -X POST … -d '{"amount_usdc":"3.00"}'` returns 402 with `price_usdc: "3.45"` in the JSON body |
| `pnpm tsx scripts/spikes/s3-x402/buyer.ts` | client log shows `402` then `200`; server log shows the six lines in order, `settle ok` after `post stub` |
| `pnpm tsx scripts/spikes/s3-x402/check-balance.ts` (before/after) | buyer delta `-3450000`, payTo delta `+3450000` after the paid call; both unchanged after the replay |
| replay half of `buyer.ts` | `200 {taskId: 1}` a second time; server prints `replay=true`; settle count stays 1 |
| `docs/spikes/RESULTS.md#s3` | every §2 field present; `Result` and `PAYMENT_MODE` filled; no hex private key anywhere in the diff |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm tsx scripts/spikes/s3-x402/check-balance.ts
pnpm tsx scripts/spikes/s3-x402/server.ts &            # leave running
pnpm tsx scripts/spikes/s3-x402/buyer.ts
pnpm tsx scripts/spikes/s3-x402/check-balance.ts
grep -n "^## S3" docs/spikes/RESULTS.md
git diff --cached | grep -E "^\+.*_(PRIVATE_KEY|SECRET|KEY)\s*=\s*['\"]?0x[0-9a-fA-F]{64}" ; echo "exit=$? (must be 1: no key-named variable assigned a 64-hex value; tx hashes are fine)"
```
Expected: the balance deltas above; the six server lines with `settle ok` after `post stub`; the replay line; the `## S3` heading present; the final grep prints nothing (exit 1).

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). In units: `3_450_000` / `3_000_000` / `450_000`. Fee math is integer: `units + units * 1500n / 10000n`.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git. The scripts print addresses and tx hashes, never a key and never a raw `PAYMENT-SIGNATURE` value.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted) — this spike is the exception by design: it is L-class, runs by hand, and is **not** a CI test. Nothing under `scripts/spikes/` is imported by any package.
- `verify` must precede the stubbed work; `settle` must follow it. If the library only offers a middleware that settles before the handler runs, that is a **finding**, not something to patch around: record it, and T-15 builds from primitives.
- The 90-minute box is hard. "Do not fight it."
- Never write to `TaskEscrow`, never call `post`/`postAsBuyer` — the escrow is not deployed yet and this spike has nothing to say about it.

## 11. Definition of done
- [ ] Every acceptance row in §8 executed by hand; the outputs pasted into the PR.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] `## S3` section complete with `Result` and `PAYMENT_MODE`; the lead is pinged with the value in the PR description.
- [ ] `scripts/spikes/s3-x402/README.md` says how to rerun in one paragraph.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-03 — Spike S3 — x402 seller and buyer round-trip on Base Sepolia
owned-paths:
  - scripts/spikes/s3-x402/**
  - docs/spikes/RESULTS.md (## S3 section only)
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 rows executed · §9 output pasted below
Result: PASS | FAIL · PAYMENT_MODE: x402 | direct · Time used: <min>
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

Known gaps to raise as written:
- `ENV REQUEST: buyer wallet has < 5 Base Sepolia USDC` — the operator funds it from Circle's faucet; do not wait more than 10 minutes inside the box.
- `DEP REQUEST: @x402/core|evm|fetch missing from the catalog` — T-00 adds them; state the versions you tested against.
- A facilitator outage (5xx from `X402_FACILITATOR_URL`) for more than 15 minutes is a FAIL with `Failing step: facilitator unavailable`, not a reason to extend the box.

## 14. Reviewer notes
Open `docs/spikes/RESULTS.md#s3` first: are `Payer path`, `Nonce path`, `Header names` and `402 JSON body` concrete enough that T-15 can code without opening the library? Then `server.ts`: `verify` before the stubbed work, `settle` after it, the nonce map consulted before `settle`. Then the balance deltas in the PR (`3450000`, not a rounded float). Most likely wrong: `amount * 1.15` in floats; settle called from a middleware before the handler; the replay re-signing a fresh authorization instead of re-sending the captured header (which would prove nothing); a key printed in a debug line.

## 15. Round 2+
Merged (Sept 6, #105): PASS in 11 minutes, `PAYMENT_MODE: x402`. §9's last grep used to match the settle tx hashes §2 asks for; it now looks for a key-named variable assigned a 64-hex value, the same line CI's `secrets` job draws. The nonce-before-settle finding is already T-16's §2 step 3 (`idem.reserve(nonce)` before the work).
