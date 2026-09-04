---
id: T-07
title: packages/chain — clients, TxQueue, typed contracts, FakeChain
lane: A
day: 1→2
size: M
agent_class: C
must: true
depends_on: [T-01]                    # T-01a (ABIs, enums, constants, addresses) is enough to start
owned_paths:
  - packages/chain/**
labels: [area:chain, wave:1, size:M, agent:cloud]
branch: t-07/chain-package
---

# T-07 — `packages/chain`: clients, TxQueue, typed contracts, FakeChain

## 1. Context
Every chain write from the Task API (`post`, `claimFor`, `submitFor`, `approve`, `registerFor`, `mark`, …) and every read (task state, worker flags, agent identity) goes through `@legwork/chain`. The API runs as many concurrent serverless invocations on Vercel with **one** relayer key, so a single `TxQueue` — serialized with a Postgres advisory lock and resynced from the pending nonce — is the only sender. Cloud agents and tests never see a chain: `FakeChain` implements the same `ChainAdapter` as the live client, with the full escrow state machine and `warp()`. T-16, T-17, T-19, T-20, T-29, T-30, T-32 and T-36 build on this package.

> **13-build-plan.md — Decision 5** "Serverless-safe ops: one `TxQueue` (Postgres advisory lock + viem nonce resync) is the only relayer-key writer; `autoRelease`/`expire` run lazily inside long-polls and list calls plus `POST /admin/sweep` from a GitHub Actions cron every 5 min; MCP stateless; long-poll `maxDuration = 60`, `wait ≤ 50`, `poll_after_seconds` on timeout — many function invocations, one key; Vercel Hobby cron is daily-only."

> **13-build-plan.md — Hazards** "One relayer key. Only `TxQueue` sends; scripts use the owner key for owner-only calls and the admin routes for anything relayed." · "Cloud agents have no keys and no RPC. Nothing in a C-class task may depend on live chain state; FakeChain, pglite, msw and fixtures are the test substrate."

The rules FakeChain must reproduce, verbatim from **T-01 §2 `ITaskEscrow`** (read the whole block in `docs/plan/T-01-interface-freeze.md` §2 before coding):
> `post(PostParams p)` — `onlyRelayer`, `whenNotPaused`. Pulls `p.amount + fee` USDC from `msg.sender`. Requires `p.amount ≤ MAX_TASK_AMOUNT`, `p.amount ≥ 1_000_000`, `openTasksOf(p.buyer) < maxOpenTasksPerBuyer` (else `OverOpenCap`), `p.taskType ∈ {1,2,4,8}`. · `postAsBuyer(PostParams p)` — requires `p.buyer == msg.sender`; pulls from `msg.sender`; otherwise identical. · `claimFor` / `claim` rules: `registry.isWorker(worker)`; `activeClaimOf[worker] == 0`; `block.timestamp ≥ cooldownUntil[worker]` (else `InCooldown`); if `registry.isSeeded(worker)` then `allowlistedBuyer[task.buyer]` must be true (else `SeededCannotClaimExternal`); state is `Open`, **or** `Claimed` with `block.timestamp > claimedAt + claimTTL` — then emit `ClaimExpired(taskId, staleWorker)`, set `cooldownUntil[staleWorker] = block.timestamp + CLAIM_COOLDOWN`, clear the stale claimant's active claim, then proceed. · `releaseClaim*`: `Claimed` by that worker → `Open`; no cooldown. · `submit*`: requires `Claimed` by that worker and `block.timestamp ≤ claimedAt + submitTTL` (else `SubmitWindowClosed`); never gated by pause. · `approve`: buyer or relayer; `Submitted` → `_release`. · `dispute`: buyer or relayer; `Submitted` and `block.timestamp < submittedAt + disputeWindow` → `Disputed`. · `autoRelease`: anyone; `Submitted` and `block.timestamp ≥ submittedAt + disputeWindow` → `_release`; never gated by pause. · `resolve(taskId, toBuyer)`: owner; `Disputed`; `toBuyer = true` → `amount + fee` to buyer; `false` → `amount` to worker and `fee` back to buyer (zero fee on any resolve). · `expire`: anyone; (`Open` and `block.timestamp > postedAt + claimTTL`) or (`Claimed` and `block.timestamp > claimedAt + submitTTL`) → refund `amount + fee` to buyer → `Refunded`; never gated by pause. · `_release`: set `Released`, clear the worker's active claim, then `USDC.safeTransfer(worker, amount)`, `USDC.safeTransfer(treasury, fee)`, `reputation.feedback(registry.nullifierOf(worker), raterKey, OUTCOME_PAID, taskId)`, and if `buyerAgentId != 0` `abuseMark.outcome(buyerAgentId, taskId, OUTCOME_PAID)`; `raterKey = buyerAgentId != 0 ? bytes32(buyerAgentId) : bytes32(uint256(uint160(buyer)))`. · `pause()` gates **only** `post`, `postAsBuyer`, `claimFor`, `claim`. · Constants: `FEE_BPS = 1500`, `MAX_TASK_AMOUNT = 10_000_000`, `maxOpenTasksPerBuyer = 5`, `CLAIM_COOLDOWN = 900`; `fee = amount * FEE_BPS / 10_000`.

Plus **`IReputation.feedback`** dedup ("a first write from a rater increments `distinctRaters`; a repeat write from the same rater updates its slot and does not add a voice; `completed` increments on every `Paid`/`ResolvedToWorker`") and **`IAbuseMark.mark`** ("idempotent per `(agentId, specHash)`: a repeat returns `false`, writes nothing, emits nothing; if `block.timestamp < lastMarkAt[agentId] + markCooldown` revert `MarkCooldown`"; default `markCooldown = 86400`).

## 2. Exact scope
- `src/env.ts`: zod schema `ChainEnv` + `parseChainEnv(env: Record<string, string | undefined>)` with exactly these names from `.env.example`: `BASE_SEPOLIA_RPC_URL`, `CHAIN_ID` (`84532` | `31337`), `RELAYER_PRIVATE_KEY`, `ABUSEMARK_SIGNER_PRIVATE_KEY`, `DEPLOYER_PRIVATE_KEY?`, `WORKER_REGISTRY_ADDRESS`, `TASK_ESCROW_ADDRESS`, `REPUTATION_ADDRESS`, `ABUSEMARK_ADDRESS`, `USDC_ADDRESS`, `ERC8004_IDENTITY_ADDRESS`, `ERC8004_REPUTATION_ADDRESS`. The library never reads `process.env` itself; callers pass the object.
- `createClients(env)` → `{ publicClient, wallets: { relayer, signer, owner? } }` (viem). Chain from `CHAIN_ID`: `84532` → `baseSepolia`, `31337` → `foundry`. Transport `http(BASE_SEPOLIA_RPC_URL)` — the variable name is historical; it is *the* RPC URL for whichever chain `CHAIN_ID` selects (T-36 points it at anvil).
- `TxQueue`: `new TxQueue({ role: 'relayer' | 'signer' | 'owner', walletClient, publicClient, lock: NonceLock, logger?, maxAttempts = 3, gasBumpPercent = 15 })`; `send({ to, data, value? }) → Promise<{ hash }>`; `sendAndWait(request) → Promise<TransactionReceipt>`. Inside `lock.withLock(role, …)`: nonce = stored `next_nonce` if present else `publicClient.getTransactionCount({ address, blockTag: 'pending' })`; estimate fees; sign; `sendRawTransaction`; store `nonce + 1`. The lock is held for sign + send only — never while waiting for a receipt. On a nonce error (message matches `nonce too low`, `nonce has already been used`, `already known`, `replacement transaction underpriced`): re-read `getTransactionCount('pending')`, overwrite the stored nonce, bump `maxFeePerGas` and `maxPriorityFeePerGas` by `gasBumpPercent`, retry, up to `maxAttempts`. Structured pino logs `{ role, nonce, attempt, hash, err }` on every attempt; never the raw tx or a key.
- `NonceLock` interface: `withLock<T>(role: string, fn: (store: { get(): Promise<bigint | null>; set(n: bigint): Promise<void> }) => Promise<T>): Promise<T>`. Two implementations: `PgNonceLock(executor)` — one transaction: `SET LOCAL lock_timeout = '10s'`; `SELECT pg_advisory_xact_lock(hashtext('nonces:' || $1))`; `INSERT INTO nonces (key_role, next_nonce, locked_at) VALUES ($1, NULL, now()) ON CONFLICT (key_role) DO UPDATE SET locked_at = now()`; `get`/`set` read and write `next_nonce` for that `key_role`; commit releases the lock (a crashed invocation releases it too — that is why it is transaction-scoped). `executor` is `{ transaction<T>(fn: (query: (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>): Promise<T> }` so the API can wrap `postgres` (postgres.js) and tests can wrap pglite. `MemoryNonceLock` — a per-role promise-chain mutex, used by tests and FakeChain.
- Typed clients over the ABIs in `@legwork/shared` (`packages/shared/src/abi/*.json`): `RegistryClient`, `EscrowClient`, `ReputationClient`, `AbuseMarkClient`, `UsdcClient`. Reads via viem `getContract(...).read`; writes encode with `encodeFunctionData` and go through the queue for that role. Method names are **identical** to the Solidity names in T-01.
- `ChainAdapter` interface (§6) + `LiveChain implements ChainAdapter` (the five clients, a relayer queue and a signer queue, an optional owner queue) + `FakeChain implements ChainAdapter` with `warp(seconds)`, `mintUsdc(to, units)`, `setAgentIdentity(agentId, owner, wallet)`, `setWorker(address, { nullifier, seeded, area, taskTypes })`, `events()`. FakeChain rejects with `ChainRevert(name)` using the same error names as the contracts (§13 lists them), returns fake `0x`-prefixed 32-byte hashes, and records decoded events in order.
- Event helpers: `decodeEvents(logs) → DecodedEvent[]` (viem `parseEventLogs` over the four ABIs; `{ name, args, txHash, logIndex }`), `taskIdFromReceipt(receipt) → bigint` (from `TaskPosted`).
- Tests (vitest) named in §8; the lifecycle scenarios live in `test/fixtures/lifecycle.ts` as `lifecycleSuite(make: () => ChainAdapter & { warp(s: number): Promise<void> })` so T-36 can point the same suite at anvil later.
- `packages/chain/README.md`: the queue algorithm in ten lines, the env list, "only `TxQueue` sends from the relayer key; scripts use the owner key", how to use FakeChain in a route test.

## 3. Out of scope
- Route logic, the lazy sweeper, agent-id verification policy (T-16 / T-17 / T-19 / T-30) — you expose `ownerOf` / `getAgentWallet`, nothing decides with them here.
- Deployed addresses (T-14); ERC-8004 ABI confirmation (T-04) — use `packages/shared/src/abi/erc8004/*.json` if merged, else the ABI generated from `IERC8004Identity` / `IERC8004Reputation`.
- Do not touch: `packages/shared/**`, `apps/**`, `contracts/**`, `subgraph/**`, root configs, lockfile (`DEP REQUEST:` if a dependency is missing from the catalog).

## 4. Owned paths
```
packages/chain/**
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| ABIs `WorkerRegistry.json`, `TaskEscrow.json`, `Reputation.json`, `AbuseMark.json` (+ `erc8004/*.json` after T-04) | `packages/shared/src/abi/` | function, event and error names exactly as T-01 §2 |
| `TaskState`, `TASK_TYPE_BIT`, `Outcome` | `packages/shared/src/enums.ts` | enum numbering (`None, Open, Claimed, Submitted, Released, Refunded, Disputed, Resolved`; `Paid = 1`, `ResolvedToWorker = 2`, `ResolvedToBuyer = 3`) |
| `FEE_BPS`, `CLAIM_COOLDOWN_S`, `MAX_TASK_AMOUNT_USDC`, `MAX_OPEN_TASKS_PER_BUYER`, `toUsdcUnits`, `priceWithFee` | `packages/shared/src/constants.ts` | FakeChain money math |
| `CHAIN_ID = 84532`, contract placeholders | `packages/shared/src/addresses.ts` | defaults when env omits an address |
| Table `nonces` (`key_role` PK, `next_nonce`, `locked_at`) | `apps/api/src/db/schema.ts` (T-01) | accessed by raw SQL through the executor — never import from `apps/api` |
| Catalog | `pnpm-workspace.yaml` | `viem`, `zod`, `pino`, `vitest`, `@electric-sql/pglite` (tests only) |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `parseChainEnv`, `createClients` | `packages/chain/src/env.ts`, `clients.ts` | T-08, T-16, T-17, T-19, T-20, T-29, T-32 |
| `TxQueue`, `NonceLock`, `PgNonceLock`, `MemoryNonceLock` | `packages/chain/src/tx-queue.ts`, `nonce-lock.ts` | T-08 (wires `PgNonceLock` to `DATABASE_URL`), every writer |
| `RegistryClient`, `EscrowClient`, `ReputationClient`, `AbuseMarkClient`, `UsdcClient` | `packages/chain/src/contracts/*.ts` | T-14 (`deploy.sh` sanity reads), T-32, T-36 |
| `ChainAdapter`, `LiveChain`, `FakeChain`, `ChainRevert` | `packages/chain/src/adapter.ts`, `live.ts`, `fake.ts` | T-16, T-17, T-19, T-20, T-29, T-30, T-36 |
| `decodeEvents`, `taskIdFromReceipt`, `DecodedEvent` | `packages/chain/src/events.ts` | T-17 (reconcile), T-19, T-36 |
| `lifecycleSuite` | `packages/chain/test/fixtures/lifecycle.ts` | T-36 |

`ChainAdapter` (TypeScript; `Address` = `0x${string}`, amounts `bigint` in 6-decimal units, timestamps `bigint` seconds). Reads: `getTask(taskId) → Task` (mirrors `ITaskEscrow.Task` field for field, `state: TaskState`), `taskCount()`, `openTasksOf(buyer)`, `activeClaimOf(worker)`, `cooldownUntil(worker)`, `allowlistedBuyer(buyer)`, `paused()`, `isWorker(a)`, `isSeeded(a)`, `nullifierOf(a)`, `workerOf(n)`, `areaOf(a)`, `taskTypesOf(a)`, `score(n)`, `completed(n)`, `distinctRaters(n)`, `slotOf(n, raterKey)`, `marked(agentId, specHash)`, `lastMarkAt(agentId)`, `markCooldown()`, `selfAgentId()`, `ownerOf(agentId)`, `getAgentWallet(agentId)`, `usdcBalanceOf(a)`, `now()`. Writes, each `→ Promise<TxResult>` where `TxResult = { hash, blockNumber, events: DecodedEvent[] }`: relayer role — `post(p: PostParams) → TxResult & { taskId }`, `claimFor(taskId, worker)`, `releaseClaimFor(taskId, worker)`, `submitFor(taskId, worker, proofHash)`, `approve(taskId)`, `dispute(taskId)`, `autoRelease(taskId)`, `expire(taskId)`, `registerFor(nullifierHash, worker, area, taskTypes, deadline, attestation)`; signer role — `mark(agentId, classId, specHash)`; owner role — `pause()`, `unpause()`, `resolve(taskId, toBuyer)`, `resetWorker(nullifierHash)`, `setAllowlistedBuyer(buyer, allowed)`, `seedWorker(worker, syntheticNullifier, area, taskTypes)`, `setMarkCooldown(seconds)`. Direct-path writes used by scripts (`postAsBuyer`, `claim`, `submit`) take an explicit `walletClient` argument and bypass the queue — they are not the relayer key.

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-07` — it must print `CLAIMED T-07`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, then `docs/plan/T-01-interface-freeze.md` §2 (contracts side) end to end, then `packages/shared/src/{enums,constants,addresses}.ts` and the ABI JSONs.
2. `env.ts` + `clients.ts`; typecheck.
3. `nonce-lock.ts` (`MemoryNonceLock` first, then `PgNonceLock`); `tx-queue.ts`. Test transport: viem `custom({ request })` that answers `eth_chainId`, `eth_getTransactionCount`, `eth_estimateGas`, `eth_maxPriorityFeePerGas`/`eth_feeHistory`, `eth_gasPrice`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_sendRawTransaction` (decode the raw tx with `parseTransaction` to read the nonce and fees), `eth_getTransactionReceipt`. Programmable failures per call.
4. `contracts/*.ts` typed clients; `events.ts`.
5. `adapter.ts`, `live.ts`; then `fake.ts` — one `state` object (tasks, balances, registry, reputation slots, marks, identities, `paused`, `now`), one method per adapter function, checks in the same order as T-01's text so the same error name fires first.
6. `test/fixtures/lifecycle.ts` and the tests in §8; README; `pnpm --filter @legwork/chain typecheck && pnpm --filter @legwork/chain test`.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `txqueue.test.ts › serializes 20 concurrent sends with strictly increasing nonces` | 20 `Promise.all` sends through one `TxQueue` + `MemoryNonceLock` against the mock transport; nonces decoded from the raw txs are exactly `0..19` in send order; `eth_getTransactionCount` called once |
| `txqueue.test.ts › resyncs from the pending nonce after a nonce error and retries` | first `eth_sendRawTransaction` rejects `nonce too low`; queue calls `getTransactionCount('pending')` (mock returns 7), resends nonce 7 with `maxFeePerGas ≥ 115 %` of attempt 1; exactly 2 attempts |
| `txqueue.test.ts › gives up after maxAttempts and surfaces the last error` | three nonce errors → rejects with the third error; three log entries with `attempt: 1..3` |
| `txqueue.test.ts › releases the lock before waiting for the receipt` | with receipts delayed 200 ms, two `sendAndWait` on the same role complete in < 300 ms total wall time |
| `pg-nonce-lock.test.ts › upserts the nonces row and round-trips next_nonce on pglite` | after `withLock('relayer', s => s.set(5n))`, `SELECT next_nonce FROM nonces WHERE key_role = 'relayer'` is `5`; `locked_at` not null; a second `withLock` reads `5n` |
| `fakechain.test.ts › post → claimFor → submitFor → approve pays 3.00 to the worker and 0.45 to the treasury` | relayer −3_450_000; worker +3_000_000; treasury +450_000; `TaskReleased(taskId, worker, 3000000n, 450000n)` in `events()`; `completed(nullifier) === 1n`; `activeClaimOf(worker) === 0n`; state `Released` |
| `fakechain.test.ts › expire refunds amount + fee to the buyer` | Open; `warp(claimTTL)` → `expire` rejects `NotExpired`; `warp(1)` → buyer +3_450_000, state `Refunded`, `TaskRefunded(taskId, buyer, 3450000n)` |
| `fakechain.test.ts › lazy expiry re-claims a stale task and cools the stale worker down` | claim by w1; `warp(claimTTL)` → claimFor(w2) rejects `AlreadyClaimed`; `warp(1)` → succeeds; events `ClaimExpired(taskId, w1)` then `TaskClaimed(taskId, w2)`; `cooldownUntil(w1) === now + 900n`; w1 claiming another task → `InCooldown`; `warp(900)` → succeeds |
| `fakechain.test.ts › seeded worker cannot claim a task from a non-allowlisted buyer` | `SeededCannotClaimExternal` from `claimFor` and from direct `claim`; after `setAllowlistedBuyer(buyer, true)` both succeed |
| `fakechain.test.ts › pause blocks post and claim, never submit, autoRelease or expire` | as named; `paused()` toggles; unpause restores |
| `fakechain.test.ts › dispute inside the window, autoRelease after it, resolve pays zero fee` | `dispute` at `submittedAt + disputeWindow − 1` ok, at `+ disputeWindow` → `DisputeWindowClosed`; `autoRelease` before → `DisputeWindowOpen`; `resolve(false)` → worker +3_000_000, buyer +450_000, treasury +0 |
| `fakechain.test.ts › reputation dedups per rater and abuseMark.mark is idempotent and cooled down` | two `Paid` outcomes from one rater → `completed 2`, `distinctRaters 1`, `score 1`; second identical `mark` returns `false` with no event; different `specHash` within `markCooldown` → `MarkCooldown` |
| `events.test.ts › taskIdFromReceipt decodes TaskPosted` | fixture receipt with one `TaskPosted` log → `1n`; a receipt without it throws |

## 9. Verification commands
```bash
pnpm --filter @legwork/chain typecheck
pnpm --filter @legwork/chain lint
pnpm --filter @legwork/chain test
```
Expected: 0 type errors; every test in §8 listed by name and green; no test opens a network socket (the mock transport is `custom()`; pglite is in-process).

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). In code: `3_450_000n`, `3_000_000n`, `450_000n`.
- No secrets in code or client bundles; keys arrive only through the `env` object the caller built from `process.env`; `.env.example` is the only env file in git; never log a private key or a raw signed tx.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted). C-class: no RPC URL, no key, no Base Sepolia — FakeChain, mock transport and pglite only.
- No new dependency: `viem`, `zod`, `pino`, `vitest`, `@electric-sql/pglite` are in the catalog; anything else is a `DEP REQUEST:`.
- Only `TxQueue` may hold the relayer key; direct-path helpers take an explicit wallet and are documented as script-only.
- Frozen interfaces are quoted, never redefined: no local copy of enums/constants — import from `@legwork/shared`.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `packages/chain/README.md` written (algorithm, env list, FakeChain usage).
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-07 — packages/chain — clients, TxQueue, typed contracts, FakeChain
owned-paths:
  - packages/chain/**
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- `INTERFACE REQUEST` (known, pre-filed by this brief): T-01 names only `OverOpenCap`, `InCooldown`, `SeededCannotClaimExternal`, `SubmitWindowClosed` for `ITaskEscrow` and `MarkCooldown` for `IAbuseMark`; the other reverts have no error names in the frozen ABI. Until the lead lifts them into the interfaces, `FakeChain` and `ChainRevert` use these names, shared with T-11/T-12/T-13: escrow `NotRelayer`, `NotBuyer`, `NotBuyerOrRelayer`, `NotWorker`, `HasActiveClaim`, `AlreadyClaimed`, `NotClaimant`, `BadState`, `BadTaskType`, `AmountOutOfRange`, `DisputeWindowClosed`, `DisputeWindowOpen`, `NotExpired`; registry `UnknownNullifier`; reputation `NotEscrow`, `BadOutcome`; abuseMark `NotSigner`, `NotEscrow`, `BadClass`, `IdentityAlreadyRegistered`; OZ `EnforcedPause`, `OwnableUnauthorizedAccount`. If the lead ships different names, rename in one commit.
- `ENV REQUEST` (known): if the API needs a distinct RPC variable for anvil, the lead adds it; until then `BASE_SEPOLIA_RPC_URL` + `CHAIN_ID=31337` is the documented way.

## 14. Reviewer notes
Open `tx-queue.ts` first: the lock must wrap sign+send only; the nonce error list must be a match on the error message, not on the error class; the stored nonce must be overwritten (not incremented) after a resync. Then `fake.ts` `claimFor`: check order — `isWorker`, active claim, cooldown, seeded ⇒ allowlisted, then state / lazy expiry — and that lazy expiry emits `ClaimExpired` **before** `TaskClaimed` and sets the cooldown of the *stale* worker only. Then `pg-nonce-lock`: `pg_advisory_xact_lock` (transaction-scoped), not `pg_advisory_lock`.

## 15. Round 2+
—
