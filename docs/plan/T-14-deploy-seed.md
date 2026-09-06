---
id: T-14
title: Deploy + seed Base Sepolia — contracts, workers, lifecycles
lane: A
day: 2                                # midday; critical path — everything downstream reads deployments/base-sepolia.json
size: M
agent_class: L
must: true
depends_on: [T-11, T-12, T-13]        # T-12 means BOTH PRs (1/2 and 2/2) merged
owned_paths:
  - contracts/script/Deploy.s.sol
  - contracts/script/Seed.s.sol
  - contracts/script/lib/**
  - contracts/deployments/**
  - scripts/deploy.sh
  - docs/spikes/RESULTS.md#Deploy
labels: [area:contracts, wave:2, size:M, agent:local, critical-path]
branch: t-14/deploy-seed
---

# T-14 — Deploy + seed Base Sepolia: contracts, workers, lifecycles

## 1. Context
Lead-run, on the operator's machine with `.env`. This task puts the four contracts (`WorkerRegistry`, `TaskEscrow`, `Reputation`, `AbuseMark`) on Base Sepolia, wires the roles, verifies the sources on Basescan, writes `contracts/deployments/base-sepolia.json` (which `packages/shared/src/addresses.ts`, the subgraph manifest and every app read), then seeds the demo pool: two allowlisted buyers, 20 seeded workers, five completed task lifecycles so `preflight_workers` has medians and the feed is not empty. It also has to run against a local `anvil` (chain id 31337) with mocks, because the e2e harness (T-36) and the lead's own dry-run reuse the same scripts. Nothing on Day 2 afternoon (API hosting, subgraph deploy, dashboard data) can start until the JSON is committed.

> **02-architecture — WorkerRegistry** "`seedWorker(worker, syntheticNullifier, area, taskTypes)` — owner-only; sets `seeded = true`; emits `WorkerSeeded`, **never** `WorkerRegistered`. Seeded rows come from an admin function that cannot produce a verified registration; the subgraph and the dashboard render the flag from this event, not from a hardcoded list."

> **02-architecture — TaskEscrow** "`claimFor(taskId, worker)` / `submitFor(taskId, worker, proofHash)` — `onlyRelayer`; `isWorker(worker)` required; one open claim per worker; a **seeded** worker may only claim a task whose `buyer` is the operator (seeded completions feed the preflight medians; no seeded address can ever claim a task a real buyer paid for)."

> **02-architecture — security table** "**FIX** Seeded workers mint "verified humans" — `seedWorker` is a separate owner-only path emitting `WorkerSeeded`; seeded workers can only claim operator-funded tasks; the flag is indexed and rendered — `test_Seeded_CannotClaimExternalTask`"

Frozen names this task calls (T-01 §2): `IWorkerRegistry.seedWorker(address worker, uint256 syntheticNullifier, string area, uint8 taskTypes)`, `setRelayer(address)`, `setAttestationVerifier(address)`, views `isWorker`, `isSeeded`, `nullifierOf`, `relayer()`, `attestationVerifier()`; `ITaskEscrow.post(PostParams p)`, `claimFor(uint256 taskId, address worker)`, `submitFor(uint256 taskId, address worker, bytes32 proofHash)`, `approve(uint256 taskId)`, `setAllowlistedBuyer(address buyer, bool allowed)`, views `taskCount()`, `getTask(uint256)`, `allowlistedBuyer(address)`, `activeClaimOf(address)`, `usdc()`, `treasury()`, `relayer()`; `IReputation.setEscrow(address)`, `escrow()`, `completed(uint256)`; `IAbuseMark.setSigner(address)`, `setEscrow(address)`, `signer()`, `escrow()`. `TaskState.Released == 4`. Constructors (T-11/T-12/T-13 §6): `WorkerRegistry(address initialOwner, address relayer_, address attestationVerifier_)`, `Reputation(address initialOwner)`, `AbuseMark(address initialOwner, address signer_, address identityRegistry_, address reputationRegistry_)`, `TaskEscrow(address initialOwner, address usdc_, address treasury_, address relayer_, address registry_, address reputation_, address abuseMark_)`. Money: every seeded task is `amount = 3_000_000`, `fee = 450_000`, escrow pulls `3_450_000`.

## 2. Exact scope
- `contracts/script/lib/Env.s.sol` (`abstract contract Env is Script`): reads roles once — `deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY")`, `relayerKey = vm.envUint("RELAYER_PRIVATE_KEY")`, `relayer = vm.addr(relayerKey)`, `verifier = vm.addr(vm.envUint("ATTESTATION_VERIFIER_PRIVATE_KEY"))`, `signer = vm.addr(vm.envUint("ABUSEMARK_SIGNER_PRIVATE_KEY"))`, `buyer = vm.addr(vm.envUint("BUYER_PRIVATE_KEY"))`, `cliWorker = vm.addr(vm.envUint("CLI_WORKER_PRIVATE_KEY"))`, `treasury = vm.envAddress("TREASURY_ADDRESS")`; `deploymentsPath()` = `deployments/anvil.json` when `block.chainid == 31337`, `deployments/base-sepolia.json` when `84532`, revert otherwise. Never logs a key.
- `contracts/script/Deploy.s.sol` (`contract Deploy is Env`), broadcaster = deployer:
  1. **Externals.** On 31337: deploy `MockUSDC`, `MockIdentityRegistry`, `MockReputationRegistry` (imports from `contracts/test/mocks/`), `mint(relayer, 1_000_000_000)` and `mint(buyer, 1_000_000_000)`. On 84532: `usdc = vm.envAddress("USDC_ADDRESS")`, `identity = vm.envAddress("ERC8004_IDENTITY_ADDRESS")`, `reputationRegistry = vm.envAddress("ERC8004_REPUTATION_ADDRESS")`; `require(usdc.code.length > 0)` for all three.
  2. **Re-run guard.** If `vm.exists(deploymentsPath())` and its `taskEscrow` parses to an address with `code.length > 0` on this chain and `FORCE_REDEPLOY` is unset → load the four addresses from the file and **skip step 3**; log `deploy: skipped, already at <taskEscrow>`.
  3. **Deploy in order:** `WorkerRegistry(deployer, relayer, verifier)` → `Reputation(deployer)` → `AbuseMark(deployer, signer, identity, reputationRegistry)` → `TaskEscrow(deployer, usdc, treasury, relayer, registry, reputation, abuseMark)`.
  4. **Wire, idempotently** (`_ensure`: read the current value, call the setter only if it differs): `registry.relayer() == relayer` (`setRelayer`), `registry.attestationVerifier() == verifier` (`setAttestationVerifier`), `abuseMark.signer() == signer` (`setSigner`), `abuseMark.escrow() == escrow` (`setEscrow`), `reputation.escrow() == escrow` (`setEscrow`). Then `require` all five plus `escrow.usdc() == usdc`, `escrow.treasury() == treasury`, `escrow.relayer() == relayer`.
  5. **Write JSON** with `vm.serialize*` + `vm.writeJson`: `chainId`, `workerRegistry`, `taskEscrow`, `reputation`, `abuseMark`, `usdc`, `erc8004Identity`, `erc8004Reputation`, `treasury`, `relayer`, `deployer`, `startBlock` (= `block.number` at run start; a lower bound), `deployedAt` (unix seconds), `txs` (`{}` here; filled by the wrapper). **Keep the key names T-01 committed in the placeholder file** — read it first; if T-01 used other names for the four contracts, T-01's names win so `addresses.ts` keeps parsing.
- `contracts/script/Seed.s.sol` (`contract Seed is Env`), addresses from the JSON (`vm.readFile` + `vm.parseJsonAddress`):
  1. **Preconditions** (revert with a plain message before any broadcast): `usdc.balanceOf(relayer) >= 17_250_000` (5 × 3_450_000; on 84532 fund the relayer from Circle's faucet, `faucet.circle.com` → Base Sepolia), `deployer.balance > 0.01 ether`, `relayer.balance > 0.01 ether`, `Ownable(registry).owner() == deployer`.
  2. **Deployer broadcast:** `setAllowlistedBuyer(deployer, true)` and `setAllowlistedBuyer(buyer, true)` unless already true (the seeded tasks' buyer of record is the deployer; the demo agent's tasks must be claimable by the seeded CLI worker). Then 20 `seedWorker` calls, skipping any `n` with `isWorker(worker_n)`: `worker_1 = cliWorker` (the CLI worker is **one of the 20**; the pool reads "1 real · +20 seeded (demo data)"), `worker_n = vm.addr(uint256(keccak256(abi.encodePacked("legwork-seed-worker-", vm.toString(n)))))` for `n = 2..20`; `syntheticNullifier_n = uint256(keccak256(abi.encodePacked("seed-", vm.toString(n))))`; `area_n = ["ez1dp","ez5kv","ez5ks","ez5kt","ez5kg"][n % 5]`; `taskTypes_n = 15` for `n ≤ 5`, else `[1, 2, 4, 8, 15][n % 5]`.
  3. **Relayer broadcast:** `usdc.approve(escrow, type(uint256).max)` if `allowance < 17_250_000`; then for `k = 1..5`, skipping while `escrow.taskCount() >= k`: `post(PostParams{taskType: [1,2,4,8,1][k-1], specHash: keccak256("seed-task-<k>"), amount: 3_000_000, buyer: deployer, buyerAgentId: 0, area: area_k, claimTTL: 1800, submitTTL: 3600, disputeWindow: 120})` → `claimFor(id, worker_k)` → `submitFor(id, worker_k, keccak256("seed-proof-<k>"))` → `approve(id)` (the relayer may approve). One lifecycle completes before the next; the open count never exceeds 1. `buyerAgentId = 0` means no ERC-8004 write and `raterKey = bytes32(uint256(uint160(deployer)))`.
- `scripts/deploy.sh` (`#!/usr/bin/env bash`, `set -euo pipefail`, usage `scripts/deploy.sh [--anvil] [--skip-seed]`): `set -a; source .env; set +a` (never echoed); `--anvil` → `RPC=http://127.0.0.1:8545`, otherwise `RPC=$BASE_SEPOLIA_RPC_URL` and `--verify --etherscan-api-key "$BASESCAN_API_KEY"`; steps: `forge build` → `forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast --slow [verify flags]` → merge `txs` and `startBlock` into the JSON with `jq` from `contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json` (`.transactions[] | select(.transactionType == "CREATE") | {contractName, hash}`; `startBlock` = the `WorkerRegistry` receipt's `blockNumber`, decimal) → `forge script script/Seed.s.sol:Seed --rpc-url "$RPC" --broadcast --slow` (unless `--skip-seed`) → `pnpm abi:gen && git diff --exit-code packages/shared/src/abi subgraph/abis` → the `cast call` checks of §8 (20 × `isSeeded`, `taskCount`, five `getTask` states, wiring reads) → print a RESULTS-ready block (addresses with `https://sepolia.basescan.org/address/<addr>` links, tx links, `startBlock`, relayer float before/after, treasury delta `+2_250_000`). Any failed check exits non-zero. If `--verify` fails for a contract, the wrapper prints the four `forge verify-contract --chain base-sepolia --watch <addr> src/<C>.sol:<C> --constructor-args $(cast abi-encode "constructor(...)" …)` commands and exits non-zero.
- `docs/spikes/RESULTS.md#Deploy`: heading exactly `## Deploy`; the address table with Basescan links (four "Contract Source Code Verified"), the tx table, `startBlock`, the 20-row seeded-worker table (`n`, address, area, taskTypes, nullifier), the five lifecycles (taskId, type, worker, four tx links), balances before/after, and the line "20 seeded (demo data) — seeded rows come from `seedWorker`, emit `WorkerSeeded`, never `WorkerRegistered`".
- Commit `contracts/deployments/base-sepolia.json` (and `anvil.json` only if T-01's placeholder set includes it; otherwise add `deployments/anvil.json` to `.gitignore` via `DEP REQUEST` — see §13).

## 3. Out of scope
- Contract code (T-11/T-12/T-13), `abi-gen.sh` (T-01), the ERC-8004 self-deploy (T-13b), registering the Task API identity (T-32), API hosting and the subgraph deploy (lanes B/C), the e2e harness itself (T-36 — it calls `scripts/deploy.sh --anvil`).
- Any real World ID registration; any `registerFor`; any task with a real buyer.
- Do not touch: `contracts/src/**`, `contracts/test/**`, `contracts/script/abi-gen.sh`, `contracts/script/DeployERC8004.s.sol`, `foundry.toml`, `packages/**`, `subgraph/**`, `.env.example`.

## 4. Owned paths
```
contracts/script/Deploy.s.sol
contracts/script/Seed.s.sol
contracts/script/lib/**
contracts/deployments/**
scripts/deploy.sh
docs/spikes/RESULTS.md#Deploy
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `WorkerRegistry`, `TaskEscrow`, `Reputation`, `AbuseMark` constructors | `contracts/src/*.sol` (T-11/T-12/T-13 §6) | signatures quoted in §1 |
| `IWorkerRegistry`, `ITaskEscrow`, `IReputation`, `IAbuseMark` | `contracts/src/interfaces/` | the setters, views and `PostParams` named in §1 |
| Mocks | `contracts/test/mocks/` | `MockUSDC.mint`, `MockIdentityRegistry`, `MockReputationRegistry` — 31337 only |
| forge-std | `lib/forge-std` | `vm.envUint/envAddress`, `vm.exists`, `vm.readFile`, `vm.parseJsonAddress`, `vm.serialize*`, `vm.writeJson`, `vm.startBroadcast(key)` |
| Placeholder JSON | `contracts/deployments/base-sepolia.json` (T-01) | key names the `addresses.ts` reader expects |
| Env | `.env` (operator machine) | names from T-01 `.env.example` + `BASESCAN_API_KEY` (§13) |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `contracts/deployments/base-sepolia.json` (keys in §2, `startBlock`, `txs`) | committed | `packages/shared/src/addresses.ts`, subgraph manifest (lane C), API/dashboard env, T-32, T-36 |
| `contracts/deployments/anvil.json` (same keys, chain 31337) | written by `scripts/deploy.sh --anvil` | T-36 |
| `scripts/deploy.sh [--anvil] [--skip-seed]` | root scripts | T-36, operator runbook |
| Seeded pool: 20 seeded workers (`worker_1 = cliWorker`), allowlisted `deployer` + `buyer`, tasks 1–5 `Released` | Base Sepolia | T-29 (CLI worker), T-32, preflight medians, feed |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-14` — it must print `CLAIMED T-14`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, the four contracts' constructors, the interfaces, the mocks, T-01's placeholder JSON and `.env.example`; confirm `foundry.toml` has `fs_permissions = [{ access = "read-write", path = "./deployments" }]` (§13 if not).
2. Write `lib/Env.s.sol`, `Deploy.s.sol`, `Seed.s.sol`; `forge build`.
3. Dry-run on anvil: `anvil --chain-id 31337` in one terminal, `scripts/deploy.sh --anvil` in another (role keys from the anvil mnemonic via `cast wallet private-key --mnemonic … --mnemonic-index N`, exported for this shell only). Run it **twice**; the second run must print `deploy: skipped` and seed nothing.
4. Fund on Base Sepolia: deployer and relayer ETH; relayer ≥ 17.25 USDC from Circle's faucet. Dry-run `forge script … Deploy` without `--broadcast` against `$BASE_SEPOLIA_RPC_URL`.
5. `scripts/deploy.sh`; fix verification if needed; run the §8 `cast` checks; commit the JSON (+ an `interface-change` commit for any `pnpm abi:gen` diff — you are the lead); write RESULTS `## Deploy`; fill the draft PR and run `gh pr ready`; announce the addresses in every open PR.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `scripts/deploy.sh --anvil` (fresh anvil) | four contracts deployed, wired, `deployments/anvil.json` written; Seed leaves `taskCount() == 5`; exit 0 |
| `scripts/deploy.sh --anvil` again (same anvil) | prints `deploy: skipped`, seeds nothing new, `taskCount()` still 5; exit 0 |
| Basescan | `WorkerRegistry`, `TaskEscrow`, `Reputation`, `AbuseMark` each "Contract Source Code Verified"; links in RESULTS |
| `cast call $WORKER_REGISTRY_ADDRESS "isSeeded(address)(bool)" <worker_n>` for `n = 1..20` | `true` × 20; `isWorker` `true` × 20; `nullifierOf(worker_n) == keccak256("seed-<n>")`; `worker_1 == cliWorker` |
| `cast logs --from-block $START --address $WORKER_REGISTRY_ADDRESS "WorkerRegistered(uint256,address,string,uint8)"` | empty; the same for `WorkerSeeded(uint256,address,string,uint8)` returns 20 logs |
| `cast call $TASK_ESCROW_ADDRESS "taskCount()(uint256)"` | `5`; `getTask(k)` state `4` (`Released`), `amount 3000000`, `fee 450000`, `buyer == deployer` for `k = 1..5` |
| `cast call $TASK_ESCROW_ADDRESS "allowlistedBuyer(address)(bool)" <addr>` | `true` for the deployer and for the buyer; `false` for `worker_2` |
| Wiring reads | `registry.relayer() == relayer`, `registry.attestationVerifier() == verifier`, `abuseMark.signer() == signer`, `abuseMark.escrow() == escrow`, `reputation.escrow() == escrow`, `escrow.treasury() == treasury`, `escrow.usdc() == USDC_ADDRESS` |
| `cast call $REPUTATION_ADDRESS "completed(uint256)(uint256)" <nullifier_k>` | `1` for `k = 1..5`; `distinctRaters == 1`; `usdc.balanceOf(worker_k) == 3000000`; treasury delta `+2250000` |
| `pnpm abi:gen && git diff --exit-code packages/shared/src/abi subgraph/abis` | no diff |
| `pnpm --filter @legwork/shared typecheck` | `addresses.ts` parses the committed JSON (no placeholder `0x0000…` left for the four contracts) |
| `docs/spikes/RESULTS.md` | `## Deploy` section complete per §2 |

## 9. Verification commands
```bash
cd contracts && forge build && cd ..
scripts/deploy.sh --anvil && scripts/deploy.sh --anvil          # against a running anvil; second run skips
scripts/deploy.sh                                               # Base Sepolia; prints the RESULTS block
set -a; source .env; set +a
cast call "$TASK_ESCROW_ADDRESS" "taskCount()(uint256)" --rpc-url "$BASE_SEPOLIA_RPC_URL"
cast call "$WORKER_REGISTRY_ADDRESS" "isSeeded(address)(bool)" "$(cast wallet address --private-key "$CLI_WORKER_PRIVATE_KEY")" --rpc-url "$BASE_SEPOLIA_RPC_URL"
cast call "$REPUTATION_ADDRESS" "escrow()(address)" --rpc-url "$BASE_SEPOLIA_RPC_URL"
pnpm abi:gen && git diff --exit-code packages/shared/src/abi subgraph/abis
pnpm --filter @legwork/shared typecheck
```
Expected: `5`, `true`, the `TaskEscrow` address; no diff; typecheck green; the wrapper's final block shows four Basescan-verified links. Paste outputs with no key or RPC token.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. The pool is "1 real · +20 seeded (demo data)"; never write the total.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). In scripts: `3_000_000`, `450_000`, `3_450_000`, float check `17_250_000`.
- No secrets in code or client bundles; keys only via `vm.envUint`/`process.env`; `.env.example` is the only env file in git; the wrapper never echoes `.env`; RESULTS and PR bodies carry addresses and tx hashes only.
- Tests never call a live model or a live chain; this task has no `forge test`; the only live chain is Base Sepolia, run by the lead. `anvil` is the rehearsal.
- Solidity `^0.8.24`; scripts import only the repo's contracts, mocks and forge-std.
- Seeded workers only through `seedWorker`; never `registerFor`, never a real nullifier, never a `WorkerRegistered` event; seeded lifecycles only with `buyer = deployer`.
- Idempotent: every step reads before it writes; a re-run against a deployed chain changes nothing and exits 0.
- Honesty lines (RESULTS, verbatim): "20 seeded (demo data)" and "seeded completions feed the preflight medians; no seeded address can ever claim a task a real buyer paid for".

## 11. Definition of done
- [ ] Every acceptance row in §8 satisfied; outputs pasted into the PR.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed (plus the lead's separate `interface-change` commit if `abi:gen` moved).
- [ ] `contracts/deployments/base-sepolia.json` committed with `startBlock` and `txs`.
- [ ] RESULTS `## Deploy` complete; addresses announced in open PRs and the Day-2 dispatch messages.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-14 — Deploy + seed Base Sepolia — contracts, workers, lifecycles
owned-paths:
  - contracts/script/Deploy.s.sol
  - contracts/script/Seed.s.sol
  - contracts/script/lib/**
  - contracts/deployments/**
  - scripts/deploy.sh
  - docs/spikes/RESULTS.md#Deploy
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 rows satisfied · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- `foundry.toml` needs `fs_permissions = [{ access = "read-write", path = "./deployments" }]` for `vm.exists`/`vm.readFile`/`vm.writeJson` — T-00 ownership; the lead adds it in a one-line commit before running this task.
- `ENV REQUEST: BASESCAN_API_KEY` (verification) — add the name to `.env.example` (T-01 ownership) in the same one-line commit. Optional `FORCE_REDEPLOY=1`.
- If `contracts/deployments/base-sepolia.json` from T-01 lacks `startBlock`/`txs`/`deployer`/`deployedAt`, add them (this task owns the file); if `addresses.ts` breaks on the new keys, fix `addresses.ts` as an `interface-change` commit (lead).
- `deployments/anvil.json`: commit it only if `addresses.ts` ignores it; otherwise `.gitignore` it (root file — lead).
- If `pnpm abi:gen` shows a diff, commit the regenerated ABIs as a separate `interface-change` commit before the deploy commit — never leave CI red for the lane-B/C agents.
- If the relayer's USDC faucet is rate-limited, seed with fewer lifecycles is **not** acceptable — wait or fund from another faucet; five released tasks are the demo's floor.

## 14. Reviewer notes
Open `Seed.s.sol` first: `worker_1 == cliWorker`, exactly 20 `seedWorker` calls, `buyer = deployer` on every `post`, `buyerAgentId = 0`, each lifecycle closed before the next. Then `Deploy.s.sol`: the re-run guard reads code length, not just the file; wiring uses read-then-set; the JSON keys match T-01's placeholder. Then `scripts/deploy.sh`: `set -euo pipefail`, no `echo` of env, `jq` merge keeps the script's keys, exit codes propagate. Check RESULTS says "20 seeded (demo data)" and lists four verified links.

## 15. Round 2+
—
