---
id: T-36
title: e2e on anvil — deploy, seed, API fakes, worker, asserts
lane: A
day: 4
size: M
agent_class: C
must: false
depends_on: [T-29]                    # T-29 (cli-worker + demo:run) implies T-14, T-15, T-16, T-20 are merged
owned_paths:
  - scripts/e2e/**
labels: [area:scripts, wave:4, size:M, agent:cloud, optional]
branch: t-36/e2e-anvil
---

# T-36 — e2e on anvil: deploy, seed, API fakes, worker, asserts

## 1. Context
Optional; dropped first when the schedule slips. Every layer has its own tests with fakes; nothing yet proves that the real contracts, the real API and the real CLI worker agree on a whole lifecycle. This harness boots a local `anvil`, runs T-14's `scripts/deploy.sh --anvil` (mocks for USDC and the ERC-8004 registries on chain id 31337, 20 seeded workers, five seeded lifecycles), starts the API with `PAYMENT_MODE=x402` behind the `FakeFacilitator`, the `FakeClassifier` and pglite, starts the seeded CLI worker, runs `demo:run` as the demo agent, and asserts the final chain state: task `Released`, worker `+3_000_000`, treasury `+450_000`. The lead wires it into `.github/workflows/e2e.yml` on `main` pushes; this task writes the script and documents the workflow shape, nothing under `.github/`.

> **02-architecture — TaskEscrow** "Demo task: agent pays 3.45, escrow locks 3.45, worker receives 3.00, treasury 0.45. […] `release` → `USDC.transfer(worker, amount)` + `USDC.transfer(treasury, fee)`."

> **T-01 §2 — `POST /session` dev path** "**Dev path (seeded workers only):** a `walletAuth` SIWE payload from an address with `registry.isSeeded(worker) == true` is accepted without an idkit-session and bound to `nullifierOf(worker)` — this is how the CLI worker (T-29) and the e2e harness (T-36) sign in; never for a real worker."

Frozen names this harness reads (T-01 §2): `ITaskEscrow.getTask(uint256) → Task` (`state`, `amount`, `fee`, `worker`, `buyerAgentId`), `taskCount()`, `TaskState.Released == 4`; `IWorkerRegistry.nullifierOf(address)`, `isSeeded(address)`; `IReputation.completed(uint256)`, `distinctRaters(uint256)`; API `GET /tasks/:id` → `{task_id, status, …, tx:{post, claim?, submit?, release?}}`, `GET /public/feed` (never a coordinate, never a buyer token), `GET /healthz`. Deployment file: `contracts/deployments/anvil.json` (T-14 §6: `workerRegistry`, `taskEscrow`, `reputation`, `abuseMark`, `usdc`, `erc8004Identity`, `erc8004Reputation`, `treasury`, `relayer`, `deployer`). Env names: T-01 `.env.example`; the fake toggles as documented in `apps/api/README.md` by T-07/T-15 (§13 if absent).

## 2. Exact scope
- `scripts/e2e/run.sh` (`#!/usr/bin/env bash`, `set -euo pipefail`; `trap` kills anvil, the API and the worker on exit; every process logs to `scripts/e2e/.out/<name>.log`; `scripts/e2e/.gitignore` contains `.out/`):
  1. Preconditions: `anvil`, `forge`, `cast`, `pnpm`, `jq` on `PATH`; refuse to run if `CHAIN_ID` is set to anything but `31337` or if `BASE_SEPOLIA_RPC_URL` is set to a non-localhost URL (print why and exit 2).
  2. `anvil --chain-id 31337 --block-time 1 --port 8545 --mnemonic "$MNEMONIC"` in the background with `MNEMONIC="test test test test test test test test test test test junk"`; wait until `cast chain-id --rpc-url http://127.0.0.1:8545` prints `31337` (≤ 30 s).
  3. Role keys derived at runtime, **never literal in the repo**: `key(n) = cast wallet private-key --mnemonic "$MNEMONIC" --mnemonic-index n`; export `DEPLOYER_PRIVATE_KEY=key(0)`, `RELAYER_PRIVATE_KEY=key(1)`, `ATTESTATION_VERIFIER_PRIVATE_KEY=key(2)`, `ABUSEMARK_SIGNER_PRIVATE_KEY=key(3)`, `BUYER_PRIVATE_KEY=key(4)`, `CLI_WORKER_PRIVATE_KEY=key(5)`, `TREASURY_ADDRESS=$(cast wallet address --private-key "$(key 6)")`, `CHAIN_ID=31337`, `BASE_SEPOLIA_RPC_URL=http://127.0.0.1:8545`. `set +x` throughout; no `echo` of any exported key.
  4. `bash scripts/deploy.sh --anvil` (T-14) → `contracts/deployments/anvil.json`; export the address env names from it with `jq` (`WORKER_REGISTRY_ADDRESS`, `TASK_ESCROW_ADDRESS`, `REPUTATION_ADDRESS`, `ABUSEMARK_ADDRESS`, `USDC_ADDRESS`, `ERC8004_IDENTITY_ADDRESS`, `ERC8004_REPUTATION_ADDRESS`).
  5. Snapshot balances before the demo into `scripts/e2e/.out/before.json`: USDC of the CLI worker, treasury, relayer, escrow (`cast call $USDC_ADDRESS "balanceOf(address)(uint256)"`), plus `taskCount()` and `Reputation.completed(nullifierOf(cliWorker))`.
  6. Start the API in the background (`pnpm --filter @legwork/api dev` or the start script named in `apps/api/README.md`) with: the addresses above, `PAYMENT_MODE=x402`, the FakeFacilitator toggle, the FakeClassifier toggle, `LIVE_LLM=0`, `DATABASE_URL` for pglite, `DATA_MODE=live`, `DEMO_DISPUTE_WINDOW_S=120`, `ADMIN_API_KEY=e2e-admin`, `SESSION_SECRET`/`PROOF_URL_SECRET` from `openssl rand -hex 32`, `API_BASE_URL=http://127.0.0.1:3001`, `DASHBOARD_URL=http://127.0.0.1:3000`, `LONGPOLL_MAX_S=50`; wait on `GET /healthz` (≤ 60 s).
  7. Start the CLI worker (T-29) in the background with `LEGWORK_API_URL=http://127.0.0.1:3001` and `CLI_WORKER_PRIVATE_KEY`; it signs in through the seeded SIWE dev path, polls `GET /tasks?area=ez1dp`, claims, uploads its fixture proof, submits.
  8. `pnpm demo:run` (T-29) as the demo agent with `BUYER_PRIVATE_KEY`, `LEGWORK_API_URL`: posts a `verify-open` task for `amount_usdc: 3.00` (price `3.45`), polls until `submitted`, approves; must print `task_id=<n>`; overall timeout 300 s (`timeout 300 pnpm demo:run`).
  9. `pnpm tsx scripts/e2e/assert.ts` (below); print `E2E PASS` or the first failing assertion; exit with its code.
- `scripts/e2e/assert.ts` (`viem`, reads `anvil.json`, `.out/before.json`, the `task_id` from `.out/demo.log`, and the API): asserts, each with a one-line message —
  - `getTask(taskId).state == 4` (`Released`); `amount == 3_000_000n`; `fee == 450_000n`; `worker == cliWorker`.
  - USDC deltas vs the snapshot: CLI worker `+3_000_000n`; treasury `+450_000n`; escrow `0n` net; relayer `−3_450_000n` (the fake facilitator settles no tokens — say so in the message).
  - `Reputation.completed(nullifierOf(cliWorker))` is `before + 1`; `distinctRaters ≥ 1`.
  - `GET /tasks/:id` → `status == 'released'`, `amount_usdc == 3`, `fee_usdc == 0.45`, `tx.release` is the hash of a receipt containing `TaskReleased(taskId, cliWorker, 3000000, 450000)`.
  - `GET /public/feed` contains the task with `seeded == true` (the CLI worker is seeded) and no key named `lat`/`lon`/`exact_*`; `GET /public/task/:id` has no `buyer_token` and no raw spec text.
  - `taskCount() == before.taskCount + 1`.
  - Optional (only when `demo:run` printed `agent_id=`): `MockReputationRegistry` recorded one call with `tag1 == "paid-on-proof"` for that id (via the mock's recorded-call accessor).
- `scripts/e2e/README.md`: how to run locally (`bash scripts/e2e/run.sh`; expected ≤ 10 min; logs in `.out/`); the env names it derives and the ones it needs from `apps/api/README.md`; and the workflow shape **for the lead to create** as `.github/workflows/e2e.yml` (documented, not created here): `on: push: branches: [main]` + `workflow_dispatch`; `runs-on: ubuntu-latest`; `timeout-minutes: 20`; steps `actions/checkout@v4` (`submodules: recursive`), `foundry-rs/foundry-toolchain@v1`, `pnpm/action-setup@v4`, `actions/setup-node@v4` (node 22, `cache: pnpm`), `pnpm install --frozen-lockfile`, `bash scripts/e2e/run.sh`, `actions/upload-artifact@v4` of `scripts/e2e/.out/*.log` with `if: failure()`; no repository secrets (all keys come from the public anvil mnemonic; `LIVE_LLM=0`).

## 3. Out of scope
- `.github/workflows/e2e.yml` (lead), `scripts/deploy.sh`/`Deploy.s.sol`/`Seed.s.sol` (T-14), the CLI worker and `demo:run` (T-29), the API's fakes and env names (T-07/T-15/T-16), any Base Sepolia run, any real World ID or x402 facilitator call.
- Do not touch: `contracts/**`, `apps/**`, `packages/**`, `scripts/deploy.sh`, `scripts/register-identity.ts`, `scripts/package.json`, `.github/**`.

## 4. Owned paths
```
scripts/e2e/**
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `scripts/deploy.sh --anvil` + `contracts/deployments/anvil.json` | T-14 | mocks on 31337; 20 seeded workers with `worker_1 = cliWorker`; buyer allowlisted; JSON keys in §1 |
| `cli-worker`, `demo:run` | T-29 (`scripts/package.json`, `apps/cli-worker` or as T-29 names it) | seeded SIWE dev sign-in; `demo:run` prints `task_id=<n>` and approves after `submitted` |
| API fakes | `apps/api/README.md` (T-07/T-15) | the env toggles for `FakeFacilitator`, `FakeClassifier`, pglite `DATABASE_URL` |
| `TaskEscrow`, `WorkerRegistry`, `Reputation`, `MockUSDC`, `MockReputationRegistry` ABIs | `packages/shared/src/abi/*.json`, `contracts/out/` | the views and events in §1 |
| API routes | `docs/api.md` | `GET /healthz`, `GET /tasks/:id`, `GET /public/feed`, `GET /public/task/:id` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `bash scripts/e2e/run.sh` → exit 0 on `E2E PASS` | `scripts/e2e/run.sh` | lead's `.github/workflows/e2e.yml`, operator's pre-shoot check |
| `scripts/e2e/.out/{anvil,api,worker,demo}.log`, `before.json` | local only (gitignored) | debugging; CI artifact on failure |
| Workflow shape | `scripts/e2e/README.md` | lead |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-36` — it must print `CLAIMED T-36`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, T-14's `scripts/deploy.sh` and `Seed.s.sol` (what the seeded state is), T-29's README (how the worker signs in and what `demo:run` prints), `apps/api/README.md` (fake toggles), `docs/api.md`.
2. Write `run.sh` steps 1–5 and get `scripts/deploy.sh --anvil` green from inside the harness; commit.
3. Add steps 6–8; run until `demo:run` prints `task_id=`; commit.
4. Write `assert.ts`; run the full harness twice in a row (fresh anvil each time); `shellcheck scripts/e2e/run.sh`; write the README; fill the draft PR and run `gh pr ready`.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `bash scripts/e2e/run.sh` | exits 0 and prints `E2E PASS` in ≤ 10 min on a laptop; all four logs present in `.out/` |
| `bash scripts/e2e/run.sh` (second consecutive run) | passes again — no state leaks between runs (fresh anvil, fresh pglite) |
| `assert.ts` — chain | `state == 4`, `amount == 3_000_000n`, `fee == 450_000n`, `worker == cliWorker`; worker `+3_000_000n`, treasury `+450_000n`, escrow `0n`, relayer `−3_450_000n`; `completed` `+1`; `taskCount` `+1` |
| `assert.ts` — API | `status == 'released'`, `tx.release` receipt carries `TaskReleased(taskId, cliWorker, 3000000, 450000)`; feed row `seeded == true`; no `lat`/`lon`/`exact_*`/`buyer_token` in public bodies |
| `CHAIN_ID=84532 bash scripts/e2e/run.sh` | exits 2 before starting anything, with a message naming the guard |
| `grep -rEn "0x[0-9a-fA-F]{64}" scripts/e2e` | no output (no literal private key anywhere) |
| `shellcheck scripts/e2e/run.sh` | no warnings |
| `pnpm -r typecheck` | green with `assert.ts` |
| `scripts/e2e/README.md` | documents the run and the workflow shape of §2 |

## 9. Verification commands
```bash
bash scripts/e2e/run.sh; echo "exit=$?"
bash scripts/e2e/run.sh; echo "exit=$?"
CHAIN_ID=84532 bash scripts/e2e/run.sh; echo "exit=$?"
grep -rEn "0x[0-9a-fA-F]{64}" scripts/e2e || echo "no literal keys"
shellcheck scripts/e2e/run.sh
pnpm -r typecheck
```
Expected: `E2E PASS` and `exit=0` twice; `exit=2` for the guard; `no literal keys`; shellcheck silent; typecheck green. Paste the tail of `.out/demo.log` and the `assert.ts` output into the PR.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). In `assert.ts`: `3_450_000n`, `3_000_000n`, `450_000n`; in `demo:run` input `3.00`.
- No secrets in code or client bundles; keys are derived at runtime from the public anvil mnemonic and never written to a file or log; `.env.example` is the only env file in git; the harness never reads the operator's `.env`.
- Tests never call a live model or a live chain. C-class: anvil (`31337`, localhost) only — the chain-id and RPC guards are mandatory; `LIVE_LLM=0`; the fake facilitator and fake classifier are the only payment and screening backends.
- Nothing under `.github/`; the workflow is documented, not created.
- `set -euo pipefail`, `trap` cleanup, timeouts on every wait; a hang is a failure, never a retry loop without a bound.
- Frozen interfaces are consumed, never edited; if `demo:run` or the worker need a flag that does not exist, `BLOCKED` (§13), do not patch T-29's code.

## 11. Definition of done
- [ ] Every acceptance row in §8 satisfied; outputs pasted into the PR.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] `scripts/e2e/README.md` written with the workflow shape; the lead pinged to add `.github/workflows/e2e.yml`.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-36 — e2e on anvil — deploy, seed, API fakes, worker, asserts
owned-paths:
  - scripts/e2e/**
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 rows satisfied · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- If `apps/api/README.md` does not name the env toggles for `FakeFacilitator`, `FakeClassifier` and pglite: `ENV REQUEST: fake toggles — names for FakeFacilitator / FakeClassifier / pglite DATABASE_URL` to the lead (T-07/T-15 owners).
- If `demo:run` does not print `task_id=<n>` or does not approve after `submitted`: `BLOCKED: T-29 — demo:run output/approve` with the log tail; do not parse other text.
- If `scripts/deploy.sh --anvil` fails inside the harness but passes for the lead: paste `.out/anvil.log` and the wrapper's output and `BLOCKED: T-14 — anvil path`.
- If the API's x402 middleware rejects the fake facilitator on chain id 31337 (network `eip155:31337` not accepted): `INTERFACE REQUEST: X402_NETWORK override for 31337` to T-15's owner.
- If `shellcheck` or `tsx` is missing from the toolchain: `DEP REQUEST`.

## 14. Reviewer notes
Open `run.sh` first: the two guards (chain id, localhost RPC) before anything starts; keys derived from the mnemonic and never echoed; `trap` cleanup; bounded waits. Then `assert.ts`: every delta is against `before.json`, not an absolute; the relayer `−3_450_000n` message states why; the public-body checks look for absent keys, not for values. Confirm nothing was added under `.github/` and that the README's workflow shape needs no repository secret.

## 15. Round 2+
—
