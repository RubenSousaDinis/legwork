---
id: T-04
title: Spike S5 + S1 — ERC-8004 round-trip and World ID Router probe
lane: A
day: 1
size: S
agent_class: L
must: true
depends_on: [T-00]
owned_paths:
  - scripts/spikes/s5-erc8004.ts
  - scripts/spikes/s1-router.sh
  - packages/shared/src/abi/erc8004/**
  - docs/spikes/RESULTS.md                              # sections `## S1` and `## S5` only
  - contracts/src/interfaces/IERC8004Identity.sol       # interface-change PR only, after T-01a is merged
  - contracts/src/interfaces/IERC8004Reputation.sol     # interface-change PR only, after T-01a is merged
labels: [area:contracts, wave:1, size:S, agent:local, interface-change]
branch: t-04/spike-erc8004
---

# T-04 — Spike S5 + S1: ERC-8004 round-trip and World ID Router probe

## 1. Context
AbuseMark (T-13) holds the Task API's ERC-8004 identity and is the only writer of agent-side feedback to the deployed ERC-8004 ReputationRegistry on Base Sepolia. Before T-13 is written, this spike proves with real transactions from throwaway keys that the deployed proxies accept `register`, an unsolicited `giveFeedback` from a second identity, and `getSummary` with the signatures frozen in T-01, and it vendors the reference ABIs into `packages/shared`. It is the **only** task allowed to amend `IERC8004Identity` / `IERC8004Reputation`. The S1 probe of the World ID Router has feedback-document value only: nothing downstream changes on any outcome. Lane A's T-13 and the lead's T-13b decision both wait on the `S5: PASS | FAIL` line you write.

> **04-spike-gates.md — S5** "AbuseMark writes agent-side feedback to the deployed ReputationRegistry from the Task API's registered identity. Both proxies have code on 84532 (implementations `0x7274e874ca62410a93bd8bf61c69d8045e399c02` / `0x16e0fa7f7c56b9a767e34b192b51f921be31da34`) and the reputation bytecode carries the post-feedbackAuth `giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)` selector, so unsolicited feedback is legal. **Test:** `cast call` the implementation ABIs; register one throwaway identity at `0x8004A818…`; `giveFeedback` on a second throwaway from it at `0x8004B663…`; read it back with `getSummary`. **PASS:** read and write production ERC-8004 directly (expected). **FAIL:** deploy the current reference registries ourselves, labelled "ERC-8004 v1.x-compliant instance (self-deployed)" in the README and on the dashboard."

> **04-spike-gates.md — S1** "It no longer decides the architecture. `WorkerRegistry` ships in one cloud-verified `ATTESTED` mode because onchain World ID verification is Orb-only and our workers use Selfie Check / Orb-level *staging* credentials. The probe exists so the feedback document can say what a Base Sepolia builder actually finds. **Test:** `cast code 0x42FF98C4E85212a5D31358ACbFe76a621b50fC02 --rpc-url $BASE_SEPOLIA`; one `verifyProof` staticcall with a simulator proof for action `legwork-worker`. Code present, proof rejected (expected: staging identities are not in the bridged root, and the credential is not Orb): one paragraph in `FEEDBACK-WORLD.md`. Code present, proof verifies: note it; still ship `ATTESTED`. No code: note it. Nothing downstream changes."

> **T-01 §2 — `IERC8004Identity` / `IERC8004Reputation`** "minimal external interfaces: `register(string agentURI) → uint256 agentId`, `ownerOf(uint256) → address`, `getAgentWallet(uint256) → address`; `giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)`, `getSummary(uint256 agentId, address[] clients, string tag1, string tag2) → (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)`. Marked "confirm in T-04"; only T-04 may amend them (as an `interface-change` PR). Addresses on Base Sepolia: IdentityRegistry proxy `0x8004A818BFB912233c491871b3d84c89A494BD9e`, ReputationRegistry proxy `0x8004B663056A597Dffe9eCcC1965A193B7388713`."

## 2. Exact scope
- Vendor the ERC-8004 reference ABIs as `packages/shared/src/abi/erc8004/IdentityRegistry.json` and `packages/shared/src/abi/erc8004/ReputationRegistry.json` (plain ABI arrays, not Foundry artifacts) plus `packages/shared/src/abi/erc8004/README.md` naming the source (github.com/erc-8004/erc-8004-contracts, CC0), the commit hash used, and the two proxy + two implementation addresses.
- `scripts/spikes/s5-erc8004.ts` (run with `pnpm tsx`): generate two throwaway keys A and B in memory; fund each with 0.002 ETH from `DEPLOYER_PRIVATE_KEY`; call `register(string agentURI)` from A and from B at the IdentityRegistry proxy (URI: `https://legwork.example/spike/<a|b>`); read `ownerOf(agentIdA)` and `getAgentWallet(agentIdA)`; call `giveFeedback(agentIdA, 1, 0, "paid-on-proof", "", "", "", 0x00…00)` from B at the ReputationRegistry proxy; read `getSummary(agentIdA, [B], "paid-on-proof", "")`. Print every tx as `https://sepolia.basescan.org/tx/<hash>`. Exit 0 only if `count == 1` and `summaryValue == 1`.
- Two `eth_call` simulations in the same script, no gas spent: (a) `register("probe")` with `from = USDC_ADDRESS` (an address with code and no `onERC721Received`) — records whether the registry mints with `_safeMint` (revert naming the receiver) or `_mint` (success); (b) `giveFeedback(...)` `from` a third, never-registered throwaway C — records whether an unregistered caller may give feedback. Both findings go to RESULTS; T-13 decides `onERC721Received` from (a).
- Compare every function the script used (name, parameter types, return types, overloads) against `contracts/src/interfaces/IERC8004Identity.sol` and `IERC8004Reputation.sol`. Identical → RESULTS says "interfaces confirmed, no change". Different → a second PR labelled `interface-change` editing only those two files to match the deployed bytecode, with the mock edits the lead must make listed as `INTERFACE REQUEST:` in the PR body.
- S1: `cast code` of the Router and one `verifyProof` staticcall; record the exact outcome (code present/absent; revert selector or string; or success) in RESULTS `## S1`; post the one-paragraph feedback-doc text as a comment on the T-02 issue (you do not edit `FEEDBACK-WORLD.md`).
- Fill `docs/spikes/RESULTS.md` sections `## S5` and `## S1` (headings created empty by T-02): first line of `## S5` is exactly `S5: PASS` or `S5: FAIL — <reason>`; then addresses, agent ids, tx links, both simulation findings, the interface verdict.

## 3. Out of scope
- Any Solidity beyond the two interface files (AbuseMark is T-13; the self-deploy fallback is T-13b, dispatched by the lead only if `## S5` says FAIL).
- Registering the real Task API identity or the real buyer identity (T-32). Editing `FEEDBACK-WORLD.md` (T-02/T-41).
- Do not touch: `contracts/test/mocks/**` (request mock changes with `INTERFACE REQUEST:`), `packages/shared/src/abi/*.json` (generated by `abi-gen.sh`), `packages/shared/src/addresses.ts`, anything outside §4.

## 4. Owned paths
```
scripts/spikes/s5-erc8004.ts
scripts/spikes/s1-router.sh
packages/shared/src/abi/erc8004/**
docs/spikes/RESULTS.md                              (sections ## S1 and ## S5 only)
contracts/src/interfaces/IERC8004Identity.sol       (interface-change PR only)
contracts/src/interfaces/IERC8004Reputation.sol     (interface-change PR only)
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| ERC-8004 IdentityRegistry proxy `0x8004A818BFB912233c491871b3d84c89A494BD9e` | Base Sepolia | `register(string) → uint256`, `ownerOf(uint256)`, `getAgentWallet(uint256)` |
| ERC-8004 ReputationRegistry proxy `0x8004B663056A597Dffe9eCcC1965A193B7388713` | Base Sepolia | 8-parameter `giveFeedback`, `getSummary(uint256, address[], string, string)` |
| World ID Router `0x42FF98C4E85212a5D31358ACbFe76a621b50fC02` | Base Sepolia | `verifyProof(uint256 root, uint256 groupId, uint256 signalHash, uint256 nullifierHash, uint256 externalNullifierHash, uint256[8] proof)` — staticcall only |
| Env (operator `.env`) | `process.env` | `BASE_SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `USDC_ADDRESS`, `ERC8004_IDENTITY_ADDRESS`, `ERC8004_REPUTATION_ADDRESS` |
| Catalog | `pnpm-workspace.yaml` | `viem`, `tsx` — nothing added |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| Vendored ABIs `IdentityRegistry.json`, `ReputationRegistry.json` | `packages/shared/src/abi/erc8004/` | T-07 (`ownerOf`/`getAgentWallet` reads), T-30, T-32 |
| Confirmed or amended `IERC8004Identity`, `IERC8004Reputation` | `contracts/src/interfaces/` | T-13, T-13b, T-14 |
| `S5: PASS \| FAIL` line + mint-mode finding + unregistered-caller finding | `docs/spikes/RESULTS.md#S5` | lead (T-13b dispatch), T-13, T-37 |
| `## S1` paragraph | `docs/spikes/RESULTS.md#S1` | T-02/T-41 (`FEEDBACK-WORLD.md`) |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-04` — it must print `CLAIMED T-04`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`. Read `contracts/src/interfaces/IERC8004Identity.sol` and `IERC8004Reputation.sol` if T-01a is merged; otherwise start at step 2 and compare at step 6.
2. Clone `erc-8004/erc-8004-contracts` into a scratch directory **outside** the repo; `forge build`; copy only the `abi` arrays of `IdentityRegistry` and `ReputationRegistry` into the two JSON files; write the README with the commit hash. If the clone or build fails, take the verified implementation ABIs from Basescan for `0x7274e874ca62410a93bd8bf61c69d8045e399c02` and `0x16e0fa7f7c56b9a767e34b192b51f921be31da34` and say so in the README.
3. Write `scripts/spikes/s5-erc8004.ts` with `viem` (`createPublicClient` / `createWalletClient`, `http(process.env.BASE_SEPOLIA_RPC_URL)`, chain `baseSepolia`, keys via `generatePrivateKey()`); read addresses from `process.env` with the vendored ABIs imported from `@legwork/shared`'s `abi/erc8004` path. Run it; keep the console output.
4. Add the two `eth_call` simulations; record revert data verbatim (selector + decoded name when the ABI knows it).
5. S1: `cast code … | head -c 40`; then `cast call` `verifyProof` with a simulator proof if the operator has one from S2', else with all-zero arguments — record the revert selector/string either way.
6. Compare against the interfaces; fill RESULTS `## S5` and `## S1`; open PR 1 (spike script, vendored ABIs, RESULTS). If anything differs, open PR 2 (`interface-change`, two files only) and comment on the T-13 issue: "T-04 amended `IERC8004*`; rebase before writing AbuseMark".

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `pnpm tsx scripts/spikes/s5-erc8004.ts` | exits 0; prints `agentIdA`, `agentIdB`, `ownerOf(agentIdA) == A`, three Basescan tx links, `getSummary → count=1 summaryValue=1 summaryValueDecimals=0` |
| `pnpm --filter @legwork/shared typecheck` | the two JSON files are importable (`resolveJsonModule`); no other file in `packages/shared` changed |
| `grep -n "^S5: " docs/spikes/RESULTS.md` | exactly one line, `S5: PASS` or `S5: FAIL — <reason>` |
| RESULTS `## S5` body | contains `mint mode: _safeMint` or `mint mode: _mint`, and `unregistered caller: allowed` or `unregistered caller: reverts <reason>` |
| RESULTS `## S1` body | one paragraph with the `cast code` result and the `verifyProof` outcome |
| `forge build` (PR 2 only) | interfaces compile; mocks compile after the lead's mock commit lands on the branch |

## 9. Verification commands
```bash
pnpm tsx scripts/spikes/s5-erc8004.ts
cast code 0x42FF98C4E85212a5D31358ACbFe76a621b50fC02 --rpc-url "$BASE_SEPOLIA_RPC_URL" | head -c 40; echo
pnpm --filter @legwork/shared typecheck
grep -n "^S5: " docs/spikes/RESULTS.md
```
Expected: three tx links and `count=1 summaryValue=1`; `cast code` prints `0x` followed by bytecode; typecheck clean; one `S5:` line.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). Not used by this spike; do not introduce other figures.
- No secrets in code: throwaway keys exist only in process memory and are never printed or written; `DEPLOYER_PRIVATE_KEY` is read from `process.env` only; RESULTS records addresses, ids and tx hashes only.
- L-class: this is the only lane-A task that touches Base Sepolia before T-14. No test file is added; the script is not wired into any `pnpm test`.
- Honesty line for RESULTS (02-architecture): "Live, not ours: World ID …, ERC-8004 identity and reputation registries on Base Sepolia, the x402 reference facilitator, USDC." On FAIL the fallback label is verbatim: "ERC-8004 v1.x-compliant instance (self-deployed)".
- Never edit `contracts/test/mocks/**`, `packages/shared/src/abi/*.json`, `packages/shared/src/addresses.ts` or `FEEDBACK-WORLD.md`.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed; PR 2 (if any) carries the `interface-change` label and touches only the two interface files.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `packages/shared/src/abi/erc8004/README.md` states source, commit and addresses.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-04 — Spike S5 + S1 — ERC-8004 round-trip and World ID Router probe
owned-paths:
  - scripts/spikes/s5-erc8004.ts
  - scripts/spikes/s1-router.sh
  - packages/shared/src/abi/erc8004/**
  - docs/spikes/RESULTS.md (## S1, ## S5)
  - contracts/src/interfaces/IERC8004Identity.sol (PR 2 only)
  - contracts/src/interfaces/IERC8004Reputation.sol (PR 2 only)
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
S5 verdict: PASS | FAIL — <reason> · mint mode: _safeMint | _mint · unregistered caller: allowed | reverts
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them — the two `IERC8004*.sol` files are your one exception. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- No Base Sepolia ETH on the deployer → `BLOCKED: needs-operator — fund DEPLOYER with ≥ 0.01 ETH on Base Sepolia`.
- `docs/spikes/RESULTS.md` has no `## S1` / `## S5` headings yet (T-02 not merged) → add those two headings only, nothing else in the file.
- The interface change needs matching edits in `contracts/test/mocks/MockIdentityRegistry.sol` / `MockReputationRegistry.sol` → `INTERFACE REQUEST: mocks — <exact signature changes>`; the lead pushes that commit onto your branch.

## 14. Reviewer notes
Open RESULTS `## S5` first (verdict line, mint-mode finding, unregistered-caller finding — T-13 depends on both). Then the ABI README's commit hash and that the JSON files are bare ABI arrays. Then the script: `getSummary` must be read with `clients = [B]` (an empty client list may aggregate every rater and hide a wrong write); no private key reaches `console.log`. If PR 2 exists, diff it against the vendored ABI line by line.

## 15. Round 2+
—
