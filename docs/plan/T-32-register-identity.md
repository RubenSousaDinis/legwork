---
id: T-32
title: Register the Task API's ERC-8004 identity + one live write
lane: A
day: 3
size: S
agent_class: L
must: true
depends_on: [T-14, T-04]              # needs the deployed AbuseMark + escrow and T-04's confirmed ERC-8004 selectors
owned_paths:
  - scripts/register-identity.ts
  - docs/spikes/RESULTS.md#Identity
labels: [area:scripts, wave:3, size:S, agent:local]
branch: t-32/register-identity
---

# T-32 — Register the Task API's ERC-8004 identity + one live write

## 1. Context
`AbuseMark` (T-13) is the only writer of agent-side feedback and holds the Task API's own ERC-8004 identity; until `registerIdentity` has run, `selfAgentId()` is `0` and the "Legwork is itself a registered agent" line in the pitch is untrue. This lead-run script registers that identity on Base Sepolia with the owner (deployer) key, proves the pipe end to end by releasing one task whose `buyerAgentId` is a real ERC-8004 id — which makes `TaskEscrow._release` call `AbuseMark.outcome(agentId, taskId, 1)` and write `paid-on-proof` to the ERC-8004 ReputationRegistry — and reads the result back with `getSummary`. The dashboard's identity chip, the README's ERC-8004 paragraph and the demo agent's `agent_id` all come from what this script records.

> **02-architecture — AbuseMark** "a thin onchain caller that holds the Task API's registered ERC-8004 identity and is the only writer of agent-side feedback […] `outcome(agentId, taskId, …)` (tags `paid-on-proof` / `disputed`, called by TaskEscrow on release / resolve). […] The `agentId` is **never read from the request body**: the Task API resolves it from the x402 payer address via `IdentityRegistry` at screening time. No registered identity → a dashboard log entry, no mark. […] Operator-attested in v0; say so."

Frozen names this script calls (T-01 §2): `IAbuseMark.registerIdentity(string agentURI) → uint256` (`onlyOwner`; reverts `IdentityAlreadyRegistered` on a second call), `selfAgentId()`, event `Outcome(uint256 indexed agentId, uint256 indexed taskId, uint8 outcome)`; `IERC8004Identity.register(string agentURI) → uint256 agentId`, `ownerOf(uint256) → address`, `getAgentWallet(uint256) → address`; `IERC8004Reputation.getSummary(uint256 agentId, address[] clients, string tag1, string tag2) → (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)`; `ITaskEscrow.post(PostParams p)`, `claimFor`, `submitFor`, `approve`, `allowlistedBuyer(address)`, `activeClaimOf(address)`, `taskCount()`, `getTask(uint256)`, event `TaskReleased(uint256 indexed taskId, address indexed worker, uint96 amount, uint96 fee)`. `_release` writes `abuseMark.outcome(buyerAgentId, taskId, OUTCOME_PAID)` only when `buyerAgentId != 0`; AbuseMark maps outcome `1` to `giveFeedback(agentId, +1, 0, "paid-on-proof", "", "", "", bytes32(taskId))` (T-13 §2). Addresses: `contracts/deployments/base-sepolia.json` (T-14) and `packages/shared/src/addresses.ts` (`ERC8004_IDENTITY`, `ERC8004_REPUTATION`, `CHAIN_ID = 84532`).

## 2. Exact scope
- `scripts/register-identity.ts` — run as `pnpm tsx scripts/register-identity.ts [--dry-run]`; `viem` clients on `BASE_SEPOLIA_RPC_URL`; ABIs from `packages/shared/src/abi/*.json`; addresses from `@legwork/shared` (`addresses.ts`); refuses to start unless the RPC's chain id is `84532`; never prints a private key; every step is idempotent so a re-run after a partial failure resumes; exits non-zero if any read-back fails. `--dry-run` prints the planned calls and every read-back, sends nothing.
- **Step A — register.** If `abuseMark.selfAgentId() != 0` → print it and skip. Else choose `agentURI`: `GET ${DASHBOARD_URL}/agent.json` — if it answers 200 with JSON containing `name`, use that URL; otherwise a data URI `data:application/json;base64,<…>` of `{"type":"https://eips.ethereum.org/EIPS/eip-8004#registration-v1","name":"Legwork Task API","description":"Hire a verified human for a small real-world check; pays USDC on proof.","services":[{"name":"web","endpoint":"<DASHBOARD_URL>"}]}`. Send `abuseMark.registerIdentity(agentURI)` from `DEPLOYER_PRIVATE_KEY`; wait for the receipt; read `selfAgentId()`; assert `identity.ownerOf(selfAgentId) == abuseMark address` (the contract minted to itself by calling `register`).
- **Step B — a buyer-owned agent id.** `agentId = BUYER_AGENT_ID` if set and `identity.ownerOf(agentId) == buyer || identity.getAgentWallet(agentId) == buyer` (buyer = address of `BUYER_PRIVATE_KEY`). Otherwise register one **directly on the IdentityRegistry** from `BUYER_PRIVATE_KEY` with a data URI naming `"Legwork demo agent"`, read the id from the receipt, and print `ENV REQUEST: BUYER_AGENT_ID=<id>` for the operator's `.env`. This id is what the demo agent passes as `agent_id` to `hire_human` and what T-16/T-30 verify against the payer. Never use `selfAgentId` as the subject — the reference registry rejects feedback from an agent's own owner.
- **Step C — one released task carrying the id.** Preconditions: `escrow.allowlistedBuyer(buyer) == true` (T-14), `escrow.activeClaimOf(cliWorker) == 0` (else stop and say which task blocks), relayer USDC balance ≥ `3_450_000` and allowance ≥ `3_450_000`. From `RELAYER_PRIVATE_KEY`: `post({taskType: 1, specHash: keccak256("identity-check-<unix>"), amount: 3_000_000, buyer, buyerAgentId: agentId, area: "ez1dp", claimTTL: 1800, submitTTL: 3600, disputeWindow: 120})` → `taskId` from `TaskPosted` → `claimFor(taskId, cliWorker)` → `submitFor(taskId, cliWorker, keccak256("identity-proof-<unix>"))` → `approve(taskId)`. From the `approve` receipt decode `TaskReleased(taskId, cliWorker, 3000000, 450000)` and `Outcome(agentId, taskId, 1)` (AbuseMark address). Step C runs at most once per script run and is skipped when `--only-register` is passed.
- **Step D — read back.** `reputationRegistry.getSummary(agentId, [abuseMarkAddress], "paid-on-proof", "")` → assert `count ≥ 1n` and `summaryValue ≥ 1n`; also print `getSummary(agentId, [], "", "")`.
- **Step E — RESULTS.** `docs/spikes/RESULTS.md#Identity` (heading exactly `## Identity`): `selfAgentId`, the `agentURI` (URL, or the first 120 chars of the data URI), `ownerOf`, the register tx link (`https://sepolia.basescan.org/tx/<hash>`); `BUYER_AGENT_ID` and how it was obtained; the four lifecycle tx links; the decoded `Outcome` event; both `getSummary` outputs; the note "after this run `taskCount()` is 6 — T-14's check of 5 predates it"; and the two honesty lines of §10 verbatim.

## 3. Out of scope
- Contract changes (T-13), deploy/seed (T-14), the dashboard's `/agent.json` route and identity chip (lane D — if absent the data URI is used), the API's payer → agentId resolution (T-30), the self-deploy fallback (T-13b), the ERC-8004 ABI confirmation (T-04).
- Any `mark` call (screening only — T-30), any `resolve`, any real-worker task.
- Do not touch: `contracts/**`, `packages/**`, `apps/**`, `scripts/package.json` (§13), `.env.example`.

## 4. Owned paths
```
scripts/register-identity.ts
docs/spikes/RESULTS.md#Identity
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `AbuseMark`, `TaskEscrow` ABIs | `packages/shared/src/abi/AbuseMark.json`, `TaskEscrow.json` | the functions and events named in §1 |
| `IERC8004Identity`, `IERC8004Reputation` ABIs | `packages/shared/src/abi/` (or T-04's confirmed ABI file) | `register`, `ownerOf`, `getAgentWallet`, `getSummary` |
| `addresses.ts` | `packages/shared/src/addresses.ts` | the four contract addresses, `ERC8004_IDENTITY`, `ERC8004_REPUTATION`, `CHAIN_ID` |
| Seeded state | Base Sepolia (T-14) | buyer allowlisted; `cliWorker` seeded with `isWorker == true`; relayer float and allowance |
| Env | `.env` (operator machine) | `BASE_SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`, `BUYER_PRIVATE_KEY`, `CLI_WORKER_PRIVATE_KEY` (address only), `DASHBOARD_URL`, optional `BUYER_AGENT_ID` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `selfAgentId` value + register tx | RESULTS `## Identity` | README/dashboard identity chip (lane D), pitch |
| `BUYER_AGENT_ID` (env value) | RESULTS + operator `.env` | demo agent (`hire_human.agent_id`), T-16/T-30 verification, T-29 `demo:run` |
| Task 6: `Released`, `buyerAgentId = BUYER_AGENT_ID`, `Outcome(agentId, 6, 1)` | Base Sepolia | dashboard feed, subgraph `Outcome` entity, T-40 |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-32` — it must print `CLAIMED T-32`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `docs/spikes/RESULTS.md#S5` and `#Deploy`, `packages/shared/src/addresses.ts`, the AbuseMark/TaskEscrow ABIs, `scripts/package.json` (confirm `viem` and `tsx` are dependencies — §13 if not).
2. Write the script with the five steps as functions; `--dry-run` first against Base Sepolia; paste the plan into the PR.
3. Run for real; if Step C stops on `activeClaimOf(cliWorker) != 0`, ask the operator to finish that task, then re-run (Steps A/B are skipped automatically).
4. Write RESULTS `## Identity`; `pnpm -r typecheck`; fill the draft PR and run `gh pr ready` with the `ENV REQUEST` line if a buyer id was minted.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `pnpm tsx scripts/register-identity.ts --dry-run` | prints chain id `84532`, current `selfAgentId`, the chosen `agentURI` source (`dashboard` or `data-uri`), the buyer id source, the planned five calls; sends no transaction |
| `pnpm tsx scripts/register-identity.ts` | exits 0; prints `selfAgentId`, `ownerOf == <AbuseMark>`, `BUYER_AGENT_ID`, `taskId`, both `getSummary` tuples |
| `pnpm tsx scripts/register-identity.ts --only-register` (second run) | prints `selfAgentId … already registered`, sends nothing, exits 0 |
| `cast call $ABUSEMARK_ADDRESS "selfAgentId()(uint256)"` | non-zero |
| `cast call $ERC8004_IDENTITY_ADDRESS "ownerOf(uint256)(address)" <selfAgentId>` | equals `ABUSEMARK_ADDRESS` |
| `cast call $ERC8004_REPUTATION_ADDRESS "getSummary(uint256,address[],string,string)(uint64,int128,uint8)" <agentId> "[<ABUSEMARK_ADDRESS>]" "paid-on-proof" ""` | `count ≥ 1`, `summaryValue ≥ 1`, decimals `0` |
| `cast call $TASK_ESCROW_ADDRESS "getTask(uint256)" 6` | state `4` (`Released`), `buyerAgentId == <agentId>`, `amount 3000000`, `fee 450000`, `worker == cliWorker` |
| `cast logs --address $ABUSEMARK_ADDRESS "Outcome(uint256,uint256,uint8)" --from-block <startBlock>` | one log with `agentId`, `6`, `1` |
| `pnpm -r typecheck` | green with the new script |
| `docs/spikes/RESULTS.md` | `## Identity` complete per §2 with every link |

## 9. Verification commands
```bash
set -a; source .env; set +a
pnpm tsx scripts/register-identity.ts --dry-run
pnpm tsx scripts/register-identity.ts
pnpm tsx scripts/register-identity.ts --only-register
cast call "$ABUSEMARK_ADDRESS" "selfAgentId()(uint256)" --rpc-url "$BASE_SEPOLIA_RPC_URL"
cast call "$ERC8004_IDENTITY_ADDRESS" "ownerOf(uint256)(address)" "$(cast call "$ABUSEMARK_ADDRESS" "selfAgentId()(uint256)" --rpc-url "$BASE_SEPOLIA_RPC_URL")" --rpc-url "$BASE_SEPOLIA_RPC_URL"
cast call "$ERC8004_REPUTATION_ADDRESS" "getSummary(uint256,address[],string,string)(uint64,int128,uint8)" "$BUYER_AGENT_ID" "[$ABUSEMARK_ADDRESS]" "paid-on-proof" "" --rpc-url "$BASE_SEPOLIA_RPC_URL"
pnpm -r typecheck
```
Expected: a non-zero id; the AbuseMark address; `1 1 0` (or higher count); typecheck green. Paste outputs with no key or RPC token.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). In the script: `3_000_000n`, `450_000n`, `3_450_000n`.
- No secrets in code or client bundles; keys only from `process.env`; `.env.example` is the only env file in git; the script never logs a key, and RESULTS carries addresses, ids and tx hashes only.
- Tests never call a live model or a live chain; this script **is** a live-chain tool run by the lead with the operator's `.env` — it is not a test and has no test file; it refuses any chain id but `84532`.
- The feedback subject is a buyer-owned id, never `selfAgentId`; `agent_id` is verified against `IdentityRegistry` (`ownerOf`/`getAgentWallet`), never trusted from an argument.
- Honesty lines (RESULTS, verbatim): "the Task API's ERC-8004 identity is operator-attested in v0" and "the agent id is verified against the IdentityRegistry, never trusted from a request body".
- Idempotent: every step reads before it writes; `--dry-run` sends nothing.

## 11. Definition of done
- [ ] Every acceptance row in §8 satisfied; outputs pasted into the PR.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] RESULTS `## Identity` complete; `BUYER_AGENT_ID` handed to the operator.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-32 — Register the Task API's ERC-8004 identity + one live write
owned-paths:
  - scripts/register-identity.ts
  - docs/spikes/RESULTS.md#Identity
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 rows satisfied · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- `ENV REQUEST: BUYER_AGENT_ID` — not in T-01's `.env.example`; the lead adds the name (T-01 ownership); the operator sets the value this script prints.
- `scripts/package.json` is not yours: if `viem`/`tsx` are missing or a `register-identity` script entry is wanted, `DEP REQUEST` to the lead (T-29 owns the entries).
- If `registerIdentity` reverts on the canonical IdentityRegistry (S5 failed after all), stop: `BLOCKED: S5 — dispatch T-13b`, do not retry with other arguments.
- If `getSummary` returns `count == 0` after a confirmed `Outcome` event, the ReputationRegistry's `giveFeedback` reverted silently inside AbuseMark is impossible (it would revert the release) — so check you queried with `clients = [abuseMark]` and `tag1 = "paid-on-proof"`; if still zero, `BLOCKED: T-04 — getSummary semantics` with the tx link.

## 14. Reviewer notes
Open Step B first: the subject id must be buyer-owned and verified by `ownerOf`/`getAgentWallet`, never `selfAgentId`. Then Step C: `buyerAgentId` is set on the `post`, the relayer pays, the CLI worker (seeded) claims a task whose buyer is allowlisted — that is the only reason it can. Then the `getSummary` call: `clients` must contain the AbuseMark address. Check the two honesty lines in RESULTS and that no `.env` value other than addresses appears anywhere.

## 15. Round 2+
—
