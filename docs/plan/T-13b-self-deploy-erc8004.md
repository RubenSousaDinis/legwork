---
id: T-13b
title: Self-deploy ERC-8004 registries on Base Sepolia (S5 substitute)
lane: A
day: 2
size: S
agent_class: L
must: false
depends_on: [T-04]                    # dispatched only on the S5 outcome recorded in docs/spikes/RESULTS.md#S5
owned_paths:
  - contracts/script/DeployERC8004.s.sol
  - contracts/lib/erc-8004-contracts/**
  - contracts/remappings.txt
  - .gitmodules
  - docs/spikes/RESULTS.md#ERC8004-selfdeploy
labels: [area:contracts, wave:2, size:S, agent:local, substitute]
branch: t-13b/self-deploy-erc8004
---
Dispatch only if S5 FAILED — that is, `docs/spikes/RESULTS.md#S5` records that `register` / `giveFeedback` / `getSummary` against the canonical Base Sepolia registries (`0x8004A818BFB912233c491871b3d84c89A494BD9e`, `0x8004B663056A597Dffe9eCcC1965A193B7388713`) did not work as `IERC8004Identity` / `IERC8004Reputation` expect. If S5 PASSED, close this task unstarted.

# T-13b — Self-deploy ERC-8004 registries on Base Sepolia (S5 substitute)

## 1. Context
`AbuseMark` (T-13) writes agent-side feedback straight to an ERC-8004 ReputationRegistry, and `registerIdentity` (T-32) needs an IdentityRegistry. The plan is to use the canonical Base Sepolia deployments; spike S5 (T-04) checks that they exist and answer to the 8-argument `giveFeedback`. This task is the fallback: deploy the reference implementations from the `erc-8004/erc-8004-contracts` repository ourselves, verify them on Basescan, and hand the two addresses to the operator so that `Deploy.s.sol` (T-14) points `AbuseMark` at them. Everything downstream (T-13's contract, T-30's screening writes, T-32's `getSummary` read) stays unchanged; only the addresses and one line of disclosure change. The honesty rule applies: a self-deployed instance is a *compliant instance*, not the canonical registry, and every surface says so.

> **02-architecture — AbuseMark** "a thin onchain caller that holds the Task API's registered ERC-8004 identity and is the only writer of agent-side feedback […] The agent side is **not** mirrored into a second accumulator: it is written straight to the deployed ERC-8004 ReputationRegistry — a better standards story than a mirror and half a day less code."

The interfaces the deployed contracts must satisfy, verbatim from **T-01 §2**:
> **`IERC8004Identity` / `IERC8004Reputation`** — minimal external interfaces: `register(string agentURI) → uint256 agentId`, `ownerOf(uint256) → address`, `getAgentWallet(uint256) → address`; `giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)`, `getSummary(uint256 agentId, address[] clients, string tag1, string tag2) → (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)`. **Marked "confirm in T-04"; only T-04 may amend them (as an `interface-change` PR).**

## 2. Exact scope
- `cd contracts && forge install erc-8004/erc-8004-contracts --no-commit` → `contracts/lib/erc-8004-contracts/**` as a git submodule pinned to the latest tagged `v1.x` release (record the tag and commit in RESULTS). The resulting `.gitmodules` entry is the only change outside `contracts/`.
- `contracts/remappings.txt`: add exactly one line mapping `erc-8004/` to the dependency's source directory (`lib/erc-8004-contracts/src/` or `lib/erc-8004-contracts/contracts/` — check which exists). Do not reorder or edit the existing lines. If the dependency needs an OpenZeppelin remapping that the repo does not already provide (e.g. `@openzeppelin/contracts-upgradeable/`), stop: `DEP REQUEST` (§13).
- `contracts/script/DeployERC8004.s.sol`: `contract DeployERC8004 is Script`. Read the dependency's own deployment script and README first and **copy its pattern**: if the implementations are upgradeable (`initialize(...)`), deploy each behind the proxy type the reference uses and call `initialize` in the same transaction batch; if they are plain, `new`. Order: IdentityRegistry, then ReputationRegistry initialised/constructed with the IdentityRegistry address. Broadcast with `vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"))`. `console2.log` both addresses at the end in the exact form `ERC8004_IDENTITY_ADDRESS=0x…` / `ERC8004_REPUTATION_ADDRESS=0x…` so they can be pasted into `.env`.
- Selector check inside the script before broadcasting: `require(IERC8004Reputation.giveFeedback.selector == bytes4(keccak256("giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)")))` and the same for `getSummary(uint256,address[],string,string)`; then compile-time proof that the reference `ReputationRegistry` exposes those selectors (`forge inspect ReputationRegistry methodIdentifiers | grep -E "giveFeedback|getSummary"` pasted into the PR).
- Verify both (implementation and proxy where applicable) on Basescan with `forge verify-contract --chain base-sepolia` (or `--verify` on the `forge script` run); Basescan links go into RESULTS.
- Smoke test on Base Sepolia with `cast` (deployer key): `register("data:application/json,{\"name\":\"legwork-smoke\"}")` from the deployer → an `agentId` (read from the receipt); `ownerOf(agentId) == deployer`; `getSummary(agentId, [], "", "")` → `(0, 0, 0)`; `giveFeedback(agentId, 1, 0, "paid-on-proof", "", "", "", 0x…01)` from a **second** key (`RELAYER_PRIVATE_KEY` as the client — self-feedback from the owner is expected to revert in the reference); `getSummary(agentId, [], "paid-on-proof", "")` → `count == 1`, `summaryValue == 1`. All tx hashes into RESULTS.
- `docs/spikes/RESULTS.md#ERC8004-selfdeploy`: a new section (heading exactly `## ERC8004-selfdeploy`) with the dependency tag + commit, both addresses, Basescan links, the smoke-test tx links, the `methodIdentifiers` lines, and the disclosure text to be rendered everywhere the ERC-8004 registries are named: **"ERC-8004 v1.x-compliant instance (self-deployed)"** (replace `1.x` with the actual tag, e.g. `v1.0`).
- Hand-off (not yours to edit; list in the PR body): the operator sets `ERC8004_IDENTITY_ADDRESS` / `ERC8004_REPUTATION_ADDRESS` in `.env`; T-14 writes them into `contracts/deployments/base-sepolia.json` under `erc8004Identity` / `erc8004Reputation`; the lead updates `packages/shared/src/addresses.ts` (`ERC8004_IDENTITY`, `ERC8004_REPUTATION`), `demo-data.json` chips and `README.md` with the disclosure text as an `interface-change` PR (§13).

## 3. Out of scope
- Any change to `AbuseMark.sol` or its tests (T-13), to `Deploy.s.sol`/`Seed.s.sol`/`deployments/**` (T-14), to `packages/shared/**`, `demo-data.json`, `README.md`, the dashboard (lane D) — request, do not edit.
- The ValidationRegistry of ERC-8004 (not used by Legwork); any modification of the reference sources; any mainnet deployment.
- Do not touch: `contracts/src/**`, `contracts/test/**`, `contracts/script/Deploy.s.sol`, `contracts/script/Seed.s.sol`, `contracts/script/abi-gen.sh`, `foundry.toml`.

## 4. Owned paths
```
contracts/script/DeployERC8004.s.sol
contracts/lib/erc-8004-contracts/**
contracts/remappings.txt            (one added line)
.gitmodules                          (one added submodule entry)
docs/spikes/RESULTS.md#ERC8004-selfdeploy
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `IERC8004Identity`, `IERC8004Reputation` | `contracts/src/interfaces/` | the selectors the deployed reference must expose (quoted in §1) |
| `erc-8004/erc-8004-contracts` | `contracts/lib/erc-8004-contracts/` | `IdentityRegistry`, `ReputationRegistry` reference implementations and their own deploy script |
| Env | `.env` (operator's machine only) | `DEPLOYER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY` (smoke-test client), `BASE_SEPOLIA_RPC_URL`, `BASESCAN_API_KEY` (§13) |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `ERC8004_IDENTITY_ADDRESS`, `ERC8004_REPUTATION_ADDRESS` values (self-deployed) | `.env` (operator), RESULTS | T-14 (`Deploy.s.sol` → `erc8004Identity`/`erc8004Reputation`), T-30, T-32, lead (`addresses.ts`) |
| Disclosure string `ERC-8004 v1.x-compliant instance (self-deployed)` | RESULTS | lead (`demo-data.json` chips, `README.md`), lane D |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-13b` — it must print `CLAIMED T-13b`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `docs/spikes/RESULTS.md#S5` (why S5 failed), `contracts/src/interfaces/IERC8004*.sol`, then the dependency's README and `script/` after installing it.
2. `forge install …`; add the remapping; `forge build` must stay green for the whole repo (the reference sources compile alongside ours).
3. Write `DeployERC8004.s.sol` per §2; dry-run without `--broadcast` against `BASE_SEPOLIA_RPC_URL`; then broadcast with `--verify`.
4. Run the `cast` smoke test; write the RESULTS section; fill the draft PR and run `gh pr ready` with the hand-off list in the body.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `forge build` | whole repo compiles with the dependency and the one remapping line |
| `forge inspect ReputationRegistry methodIdentifiers \| grep -E "giveFeedback|getSummary"` | selectors equal `cast sig "giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)"` and `cast sig "getSummary(uint256,address[],string,string)"` |
| `forge script contracts/script/DeployERC8004.s.sol:DeployERC8004 --rpc-url $BASE_SEPOLIA_RPC_URL` (dry run) | simulation succeeds; prints the two `…_ADDRESS=` lines |
| Basescan | both contracts (and proxies, if any) show "Contract Source Code Verified"; links in RESULTS |
| `cast` smoke test (§2) | `ownerOf(agentId) == deployer`; `getSummary` before `(0,0,0)`, after one client write `count == 1`, `summaryValue == 1` |
| `git diff --stat` | only §4 paths changed; `contracts/remappings.txt` +1 line; `.gitmodules` +1 entry |

## 9. Verification commands
```bash
cd contracts
forge build
forge inspect ReputationRegistry methodIdentifiers | grep -E "giveFeedback|getSummary"
cast sig "giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)"
cast sig "getSummary(uint256,address[],string,string)"
forge script script/DeployERC8004.s.sol:DeployERC8004 --rpc-url "$BASE_SEPOLIA_RPC_URL"            # dry run
forge script script/DeployERC8004.s.sol:DeployERC8004 --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast --verify --etherscan-api-key "$BASESCAN_API_KEY"
cast call "$ERC8004_IDENTITY_ADDRESS" "ownerOf(uint256)(address)" 1 --rpc-url "$BASE_SEPOLIA_RPC_URL"
cast call "$ERC8004_REPUTATION_ADDRESS" "getSummary(uint256,address[],string,string)(uint64,int128,uint8)" 1 "[]" "paid-on-proof" "" --rpc-url "$BASE_SEPOLIA_RPC_URL"
```
Expected: the two selector pairs match; the broadcast prints two verified addresses; `ownerOf(1)` is the deployer; `getSummary` returns `1 1 0` after the client write. Paste outputs with keys redacted (the commands echo no key; do not paste `.env`).

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). Not used by this task; do not introduce other figures.
- No secrets in code or client bundles; keys are read only from `process.env`/`vm.envUint`; `.env.example` is the only env file in git; never paste a private key, RPC URL with a token, or `.env` contents into RESULTS or a PR.
- Tests never call a live model or a live chain; this task has no `forge test`; its live steps are the deploy and the `cast` smoke test run by the L-class agent on the operator's machine.
- Solidity `^0.8.24`; do not edit the reference sources; our own script imports them through the single remapping.
- Honesty: the disclosure string in §2 appears verbatim wherever the registries are named; never call the self-deployed instance "the ERC-8004 registry" or "canonical".
- Frozen interfaces are consumed, never edited: `IERC8004Identity`/`IERC8004Reputation` belong to T-04; if the reference's selectors differ from them, stop (§13).

## 11. Definition of done
- [ ] Every acceptance row in §8 satisfied; outputs pasted into the PR.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] RESULTS section written with the disclosure string and every link.
- [ ] Hand-off list (env values, `INTERFACE REQUEST` for `addresses.ts`/`demo-data.json`/`README.md`) in the PR body.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-13b — Self-deploy ERC-8004 registries on Base Sepolia (S5 substitute)
owned-paths:
  - contracts/script/DeployERC8004.s.sol
  - contracts/lib/erc-8004-contracts/**
  - contracts/remappings.txt
  - .gitmodules
  - docs/spikes/RESULTS.md#ERC8004-selfdeploy
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 rows satisfied · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- `ENV REQUEST: BASESCAN_API_KEY` — not in T-01's `.env.example`; the lead adds the name (T-01 ownership) and the operator sets the value.
- `INTERFACE REQUEST` (file in the PR body): `packages/shared/src/addresses.ts` `ERC8004_IDENTITY`/`ERC8004_REPUTATION` → the self-deployed addresses; `demo-data.json` chips + `README.md` → the disclosure string.
- If the reference `ReputationRegistry`'s `giveFeedback`/`getSummary` selectors differ from `IERC8004Reputation`: `BLOCKED: selector mismatch — T-04 to amend IERC8004Reputation` with both selector lines; do not adapt the interface yourself.
- If the dependency needs a remapping or library the repo lacks: `DEP REQUEST: <remapping or package>`.

## 14. Reviewer notes
Open `DeployERC8004.s.sol` and compare it line by line with the dependency's own deploy script (proxy type, `initialize` arguments, the IdentityRegistry address passed to the ReputationRegistry). Check the pinned tag in `.gitmodules`/RESULTS is a release tag, not `main`. Confirm the smoke test's `giveFeedback` came from a key other than the agent's owner, and that the disclosure string is present and exact in RESULTS. Confirm `remappings.txt` gained one line and nothing else moved.

## 15. Round 2+
—
