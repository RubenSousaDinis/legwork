---
id: T-13
title: Reputation + AbuseMark — worker feedback, agent-side writer
lane: A
day: 1→2
size: M
agent_class: C
must: true
depends_on: [T-01a, T-04]              # T-01a (interfaces, mocks, Keys.sol) is enough to start; T-04's confirmed giveFeedback selector must be merged before review
owned_paths:
  - contracts/src/Reputation.sol
  - contracts/src/AbuseMark.sol
  - contracts/test/Reputation*.t.sol
  - contracts/test/AbuseMark*.t.sol
labels: [area:contracts, wave:1, size:M, agent:cloud]
branch: t-13/reputation-abusemark
---

# T-13 — Reputation + AbuseMark: worker feedback, agent-side writer

## 1. Context
Two small contracts, one PR. `Reputation` is the **worker-side** record: `TaskEscrow` (T-12) calls `feedback` on every release and resolve, keyed by the worker's World ID nullifier so an address rotation never resets it, deduplicated per rater so one agent is one voice. `AbuseMark` is the **agent-side** writer: it holds the Task API's own ERC-8004 identity (`registerIdentity`, run by T-32) and is the only contract that writes to the deployed ERC-8004 ReputationRegistry — `mark` when the Task API refuses a task in one of the six abuse classes (signer key), `outcome` when the escrow releases or resolves (escrow only). The dashboard renders `score`/`completed`/`distinctRaters` and the `Marked`/`Outcome` events through the subgraph; T-14 deploys both and wires `setEscrow`/`setSigner`; T-30 (API screening) calls `mark`.

> **02-architecture — Reputation** "**worker side only.** Keyed by `nullifierHash`, so a worker cannot reset by rotating addresses. `feedback(…)` is called by TaskEscrow on release / resolve only — the task is the review. Deduplicated per (nullifier, rater): a second outcome from the same agent updates its slot and does not add a voice. O(1) reads: `score`, `completed`, `distinctRaters`. […] Recency decay is roadmap. The agent side is **not** mirrored into a second accumulator: it is written straight to the deployed ERC-8004 ReputationRegistry — a better standards story than a mirror and half a day less code."

> **02-architecture — AbuseMark** "a thin onchain caller that holds the Task API's registered ERC-8004 identity and is the only writer of agent-side feedback: `mark(agentId, classId, specHash)` and `outcome(agentId, taskId, …)` (tags `paid-on-proof` / `disputed`, called by TaskEscrow on release / resolve). Callable only by the operator's AbuseMark signer key (separate from the relayer and the attestation verifier). Idempotent per (agentId, specHash); rate-limited to one mark per agentId per rolling [`markCooldown`, default 86 400 s]. The `agentId` is **never read from the request body**: the Task API resolves it from the x402 payer address via `IdentityRegistry` at screening time. No registered identity → a dashboard log entry, no mark. A schema error → an ordinary 4xx, no mark. Operator-attested in v0; say so."

> **02-architecture — security table** "**FIX** AbuseMark against an agentId nothing authenticates — agentId resolved from the payer via IdentityRegistry; no identity → log only; schema error → no mark; rate limit per agentId — `test_Mark_Idempotent`, `test_Mark_RateLimited`" · "**DOC** Self-dealing (operator's own worker farms reputation) — Per-nullifier dedup caps it at one voice; the filmed run has the operator on both sides and says so — README, narration"

The frozen surface, verbatim from **T-01 §2** (read `contracts/src/interfaces/IReputation.sol`, `IAbuseMark.sol`, `IERC8004Identity.sol`, `IERC8004Reputation.sol` before coding; the merged files win over this quote):
> **`IReputation`** (worker side only; keyed by nullifier so an address rotation never resets it) · Outcome codes (shared with AbuseMark): `1 = Paid` (paid on proof, +1), `2 = ResolvedToWorker` (+1), `3 = ResolvedToBuyer` (−1). · `feedback(uint256 nullifierHash, bytes32 raterKey, uint8 outcome, uint256 taskId)` — `onlyEscrow`. `slot[nullifier][raterKey]` stores the latest outcome; a first write from a rater increments `distinctRaters`; a repeat write from the same rater **updates its slot and does not add a voice**; `score` is the running sum of slot values (+1/−1) adjusted on update; `completed` increments on every `Paid`/`ResolvedToWorker` (counts tasks, so "completed 1 → 2 while distinct raters stays 1" is representable). · Views: `score(uint256 nullifier) → int256`, `completed(uint256) → uint256`, `distinctRaters(uint256) → uint256`, `slotOf(uint256 nullifier, bytes32 raterKey) → uint8`. `setEscrow(address)` — `onlyOwner`. · Event: `Feedback(uint256 indexed nullifierHash, bytes32 indexed raterKey, uint8 outcome, uint256 taskId, bool newRater)`.

> **`IAbuseMark`** (holds the Task API's ERC-8004 identity; the only writer of agent-side feedback) · Class ids: `1 credential fraud · 2 identity impersonation · 3 automated reconnaissance · 4 social media manipulation · 5 authentication circumvention · 6 referral fraud` (Mehta, arXiv:2602.19514 — labels verbatim). · `mark(uint256 agentId, uint8 classId, bytes32 specHash) → bool written` — `onlySigner`. Idempotent per `(agentId, specHash)`: a repeat returns `false`, writes nothing, emits nothing. Rate-limited: if `block.timestamp < lastMarkAt[agentId] + markCooldown` revert `MarkCooldown`. Writes `giveFeedback(agentId, -1, 0, "task-refused", <class label>, "", "", specHash)` to the ERC-8004 ReputationRegistry; sets `lastMarkAt`, increments `marksOf`; emits `Marked(agentId, classId, specHash)`. · `outcome(uint256 agentId, uint256 taskId, uint8 outcome)` — `onlyEscrow`. Writes `giveFeedback(agentId, +1|−1, 0, "paid-on-proof" | "disputed", "", "", "", bytes32(taskId))`; emits `Outcome(agentId, taskId, outcome)`. · `registerIdentity(string agentURI) → uint256` — `onlyOwner`; calls `IdentityRegistry.register`; stores `selfAgentId`. · `setMarkCooldown(uint256 seconds)`, `setSigner(address)`, `setEscrow(address)` — `onlyOwner`. Default `markCooldown = 86400`; the filmed run uses `120`, disclosed like `disputeWindow`. · Views: `marked(uint256 agentId, bytes32 specHash) → bool`, `lastMarkAt(uint256) → uint256`, `marksOf(uint256) → uint256`, `markCooldown()`, `selfAgentId()`, `signer()`, `escrow()`. · Events: `Marked(uint256 indexed agentId, uint8 classId, bytes32 specHash)` · `Outcome(uint256 indexed agentId, uint256 indexed taskId, uint8 outcome)`.

> **`IERC8004Identity` / `IERC8004Reputation`** — minimal external interfaces: `register(string agentURI) → uint256 agentId`, `ownerOf(uint256) → address`, `getAgentWallet(uint256) → address`; `giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)`, `getSummary(uint256 agentId, address[] clients, string tag1, string tag2) → (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)`. **Marked "confirm in T-04"; only T-04 may amend them.**

Custom errors beyond T-01 that `FakeChain` (T-07) and the API decode, from `tasks/LEAD-NOTES.md`: reputation `NotEscrow`, `BadOutcome`; AbuseMark `NotSigner`, `NotEscrow`, `BadClass`, `IdentityAlreadyRegistered`; plus OpenZeppelin's `OwnableUnauthorizedAccount`.

## 2. Exact scope
- `contracts/src/Reputation.sol`: `contract Reputation is IReputation, Ownable` (OpenZeppelin 5). Constructor `(address initialOwner)`; `escrow` starts at `address(0)` and is set by `setEscrow` (T-14 wires it after `TaskEscrow` exists). Storage as public mappings whose getters match the interface: `mapping(uint256 => int256) public score`, `mapping(uint256 => uint256) public completed`, `mapping(uint256 => uint256) public distinctRaters`, `mapping(uint256 => mapping(bytes32 => uint8)) public slotOf`, `address public escrow`. No arrays, no loops, no external calls.
- `feedback` check order: (1) `msg.sender != escrow` → `NotEscrow`; (2) `outcome == 0 || outcome > 3` → `BadOutcome`. Effects: `old = slotOf[n][r]`; `newRater = (old == 0)`; if `newRater` then `distinctRaters[n]++`; `score[n] += _value(outcome) - (old == 0 ? int256(0) : _value(old))` where `_value(1) = _value(2) = 1`, `_value(3) = -1`; `slotOf[n][r] = outcome`; if `outcome != 3` then `completed[n]++` (every call, repeat rater or not); emit `Feedback(n, r, outcome, taskId, newRater)`.
- `contracts/src/AbuseMark.sol`: `contract AbuseMark is IAbuseMark, Ownable`. Constructor `(address initialOwner, address signer_, address identityRegistry_, address reputationRegistry_)`; the two registries are `immutable` and exposed as `identityRegistry()` / `reputationRegistry()` getters (typed as the merged interfaces). Storage: `address public signer`, `address public escrow`, `uint256 public markCooldown = 86400`, `uint256 public selfAgentId`, `mapping(uint256 => mapping(bytes32 => bool)) public marked`, `mapping(uint256 => uint256) public lastMarkAt`, `mapping(uint256 => uint256) public marksOf`.
- `classLabel(uint8 classId) public pure returns (string memory)` — the six labels verbatim, in the order of the ids; `classId` outside `1..6` → `BadClass`. The labels appear **once** in the codebase (this function); tests compare against literals.
- `mark` check order — **exactly this**: (1) `msg.sender != signer` → `NotSigner`; (2) `classId == 0 || classId > 6` → `BadClass`; (3) `marked[agentId][specHash]` → `return false` (no write, no event, no revert); (4) `lastMarkAt[agentId] != 0 && block.timestamp < lastMarkAt[agentId] + markCooldown` → `MarkCooldown` (the `!= 0` guard keeps a first mark valid on a chain whose timestamp is below `markCooldown`). Effects: `marked[agentId][specHash] = true`; `lastMarkAt[agentId] = block.timestamp`; `marksOf[agentId]++`; emit `Marked(agentId, classId, specHash)`. Interaction last: `reputationRegistry.giveFeedback(agentId, -1, 0, "task-refused", classLabel(classId), "", "", specHash)`. Return `true`.
- `outcome` check order: (1) `msg.sender != escrow` → `NotEscrow`; (2) map the code — `1 (Paid)` → `(+1, "paid-on-proof")`, `2 (ResolvedToWorker)` → `(-1, "disputed")` (the agent's dispute was rejected), `3 (ResolvedToBuyer)` → `(+1, "disputed")` (the agent's dispute was upheld); anything else → `BadOutcome` (declared locally if `IAbuseMark` lacks it; see §13). Effects: emit `Outcome(agentId, taskId, outcome)`. Interaction: `reputationRegistry.giveFeedback(agentId, value, 0, tag1, "", "", "", bytes32(taskId))`. No storage written.
- `registerIdentity(string calldata agentURI) → uint256`: `onlyOwner`; `selfAgentId != 0` → `IdentityAlreadyRegistered`; `id = identityRegistry.register(agentURI)`; `selfAgentId = id`; return `id`. This is the one place the external call precedes the storage write — the value comes from the call and no funds move; say so in a one-line comment.
- `setMarkCooldown`, `setSigner`, `setEscrow` (AbuseMark) and `setEscrow` (Reputation): `onlyOwner`; no zero-address checks beyond OZ's; no events beyond the interface (none are frozen).
- NatSpec headers: Reputation — "worker side only; keyed by nullifier; one rater, one voice; the task is the review"; AbuseMark — "operator-attested in v0 — disclosed", operator powers `setMarkCooldown` (120 s for the filmed run), `setSigner`, `setEscrow`, `registerIdentity`, and the line "the agentId is never read from a request body; the Task API resolves it from the payer via IdentityRegistry".
- Tests: `contracts/test/Reputation.t.sol` (`contract ReputationTest is Test`) and `contracts/test/AbuseMark.t.sol` (`contract AbuseMarkTest is Test`). Roles from `contracts/test/utils/Keys.sol` (`deployer` = owner, `signer`, `relayer`, `worker1..3`); the escrow caller is `address escrowAddr = makeAddr("escrow")` set through `setEscrow`. Mocks from `contracts/test/mocks/`: `MockIdentityRegistry` (`register` returns incrementing ids), `MockReputationRegistry` (records every `giveFeedback` call). `setUp` does `vm.warp(1_757_000_000)`. Constants in tests: `AGENT = 1207`, nullifiers `0xA11CE`, `0xB0B`, rater keys `bytes32(uint256(1207))` and `bytes32(uint256(uint160(worker3)))`.

## 3. Out of scope
- Calling these contracts from the escrow (T-12), deploying and wiring them (T-14), registering the real identity on Base Sepolia (T-32), confirming the ERC-8004 ABI (T-04), the API's payer → agentId resolution and marks log (T-30), subgraph handlers (lane C).
- Recency decay, per-class cooldowns, any agent-side accumulator in this repo.
- Do not touch: `contracts/src/interfaces/**`, `contracts/test/mocks/**`, `contracts/test/utils/**`, `contracts/script/**`, `foundry.toml`, `packages/**`, `subgraph/**`.

## 4. Owned paths
```
contracts/src/Reputation.sol
contracts/src/AbuseMark.sol
contracts/test/Reputation*.t.sol
contracts/test/AbuseMark*.t.sol
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `IReputation`, `IAbuseMark` | `contracts/src/interfaces/` | every function, event and error exactly as T-01 §2 (quoted in §1) |
| `IERC8004Identity`, `IERC8004Reputation` | `contracts/src/interfaces/` | `register(string) → uint256`; the 8-argument `giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)` as confirmed by T-04 |
| `MockIdentityRegistry`, `MockReputationRegistry`, `Keys` | `contracts/test/mocks/**`, `contracts/test/utils/Keys.sol` | incrementing `register` ids; recorded `giveFeedback` calls (read whatever accessor the mock exposes — last call or array — and adapt the test, not the mock) |
| OpenZeppelin 5 | `lib/openzeppelin-contracts` | `Ownable(initialOwner)`; error `OwnableUnauthorizedAccount` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `Reputation` constructor `(address initialOwner)`; `AbuseMark` constructor `(address initialOwner, address signer_, address identityRegistry_, address reputationRegistry_)` | `contracts/src/*.sol` | T-14 (`Deploy.s.sol`), T-36 |
| `classLabel(uint8) → string` (pure) | `contracts/src/AbuseMark.sol` | T-30 tests may mirror it; dashboard copy checks |
| Outcome → (value, tag1) mapping in §2 | same | T-32 (`getSummary` with `tag1 = "paid-on-proof"`), lane C `Outcome` handler |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-13` — it must print `CLAIMED T-13`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, then the four interfaces, the two mocks, `Keys.sol`, and OZ 5 `Ownable` in `lib/`. Check that T-04's `interface-change` PR has merged; if not, code against the merged T-01a files and rebase when it lands (§13).
2. Write `Reputation.sol`; `forge build`; write `Reputation.t.sol` rows of §8.
3. Write `AbuseMark.sol` with the check orders in §2; `forge build`; write `AbuseMark.t.sol` rows of §8. For "emits nothing" use `vm.recordLogs()` and assert the recorded log count from the AbuseMark address is zero; for the recorded `giveFeedback` compare every one of the eight fields.
4. `forge test --match-contract "Reputation|AbuseMark" -vvv`; `forge coverage --report summary --ir-minimum` (rows `src/Reputation.sol` and `src/AbuseMark.sol` ≥ 95 % lines); `forge fmt --check`; fill the draft PR and run `gh pr ready`.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `test_Feedback_OnlyEscrow` | before `setEscrow`: any caller → `NotEscrow`; after `setEscrow(escrowAddr)` from the owner: `escrowAddr` succeeds, `signer`/`relayer`/owner → `NotEscrow`; `setEscrow` from `relayer` → `OwnableUnauthorizedAccount`; `outcome` 0 and 4 → `BadOutcome` |
| `test_Feedback_DedupPerRater` | `feedback(0xA11CE, rA, 1, 1)` → emits `Feedback(0xA11CE, rA, 1, 1, true)`, `score == 1`, `completed == 1`, `distinctRaters == 1`, `slotOf == 1`; `feedback(0xA11CE, rA, 1, 2)` → `newRater == false`, `score == 1`, `completed == 2`, `distinctRaters == 1`; `feedback(0xA11CE, rA, 3, 3)` → `score == -1`, `completed == 2`, `distinctRaters == 1`, `slotOf == 3`; `feedback(0xA11CE, rB, 2, 4)` → `score == 0`, `completed == 3`, `distinctRaters == 2` |
| `test_Feedback_NullifierKeyed` | writes for `0xA11CE` and `0xB0B` from the same rater are independent (`score`, `completed`, `distinctRaters`, `slotOf` each per nullifier); `slotOf(0xB0B, rB) == 0`; the contract has no address parameter — assert `Feedback` is emitted with the nullifier as the first indexed topic |
| `test_Mark_OnlySigner` | `mark` from owner, `relayer`, `escrowAddr` → `NotSigner`; from `signer` → `true`; after `setSigner(worker3)` the old signer → `NotSigner` and `worker3` succeeds; `setSigner` from `relayer` → `OwnableUnauthorizedAccount` |
| `test_Mark_BadClass` | `classId` 0 and 7 → `BadClass`; `classLabel(0)` and `classLabel(7)` → `BadClass`; `classLabel(1..6)` equal the six literals in §1 |
| `test_Mark_Idempotent` | `mark(1207, 3, h)` → `true`, emits `Marked(1207, 3, h)`, `marked(1207, h) == true`, `marksOf == 1`, one recorded `giveFeedback`; `vm.warp(+86_400)`; `mark(1207, 3, h)` → `false`, `marksOf` still 1, no new `giveFeedback`, zero logs, `lastMarkAt` unchanged; `mark(1207, 5, h)` (other class, same hash) → `false` too; `mark(1207, 3, h2)` → `true` |
| `test_Mark_RateLimited` | `markCooldown() == 86400`; owner `setMarkCooldown(120)`; `mark(1207, 1, h1)` at `t0` ok; `mark(1207, 2, h2)` at `t0 + 119` → `MarkCooldown`; at `t0 + 120` ok; `mark(1207, 4, h3)` at `t0 + 239` → `MarkCooldown` (rolling from the second mark), at `t0 + 240` ok; `mark(99, 1, h1)` for another agent at any time ok; `setMarkCooldown` from `signer` → `OwnableUnauthorizedAccount` |
| `test_Mark_WritesGiveFeedback` | for each `classId` 1..6 with a fresh hash and `vm.warp` past the cooldown: the recorded call has `agentId == 1207`, `value == -1`, `valueDecimals == 0`, `tag1 == "task-refused"`, `tag2 == classLabel(classId)` (compared to the literal, e.g. class 5 → `"authentication circumvention"`), `endpoint == ""`, `feedbackURI == ""`, `feedbackHash == specHash` |
| `test_Outcome_OnlyEscrow` | before `setEscrow`: `signer`/owner → `NotEscrow`; after `setEscrow(escrowAddr)`: `outcome(1207, 7, 1)` records `giveFeedback(1207, 1, 0, "paid-on-proof", "", "", "", bytes32(uint256(7)))` and emits `Outcome(1207, 7, 1)`; `outcome(…, 2)` records `(-1, "disputed")`; `outcome(…, 3)` records `(1, "disputed")`; codes 0 and 4 → `BadOutcome`; no storage changes (`marksOf`, `lastMarkAt` unchanged) |
| `test_RegisterIdentity_HoldsAgentId` | `selfAgentId() == 0` initially; owner `registerIdentity("data:application/json,{\"name\":\"Legwork Task API\"}")` returns the mock's next id and `selfAgentId()` equals it; the mock recorded the URI; second call → `IdentityAlreadyRegistered`; from `signer` → `OwnableUnauthorizedAccount` |
| `forge coverage --report summary --ir-minimum` | `src/Reputation.sol` ≥ 95 % lines, `src/AbuseMark.sol` ≥ 95 % lines |

## 9. Verification commands
```bash
cd contracts
forge build
forge test --match-contract "Reputation|AbuseMark" -vvv
forge coverage --report summary | grep -E "Reputation|AbuseMark|Total" --ir-minimum
forge fmt --check
```
Expected: every test in §8 listed by name and green; both coverage rows ≥ 95 % lines; `forge fmt --check` prints nothing.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. Write the default cooldown as `86400` or "86 400 s", never as a day count.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). Not used by these contracts; do not introduce other figures.
- No secrets in code or client bundles; test keys come only from `contracts/test/utils/Keys.sol`; `.env.example` is the only env file in git.
- Tests never call a live model or a live chain. C-class: no RPC URL, no key, no Base Sepolia — `forge test` only; the ERC-8004 registries are the two mocks.
- Solidity `^0.8.24`, OpenZeppelin 5 only (`Ownable`); no other library; no assembly.
- Checks-effects-interactions: in `mark` and `outcome` every storage write and event precedes the single `giveFeedback` call; `registerIdentity` is the documented exception in §2. `Reputation` makes no external calls; keep it that way.
- Frozen interfaces are implemented, never redefined: the contracts `is IReputation` / `is IAbuseMark`; no local copy of an event or error the interfaces already declare; errors the merged interfaces lack are declared **locally** until the lead lifts them.
- The six abuse-class labels are the paper's own, spelled exactly, lower-case, single spaces; `tag1` is exactly `task-refused`, `paid-on-proof`, `disputed`.
- Honesty lines (NatSpec, verbatim): "operator-attested in v0 — disclosed" and "the agentId is never read from a request body".

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] Both NatSpec headers carry the operator powers and honesty lines of §2.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-13 — Reputation + AbuseMark — worker feedback, agent-side writer
owned-paths:
  - contracts/src/Reputation.sol
  - contracts/src/AbuseMark.sol
  - contracts/test/Reputation*.t.sol
  - contracts/test/AbuseMark*.t.sol
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- `INTERFACE REQUEST` (pre-filed via `tasks/LEAD-NOTES.md`): if the merged interfaces lack `NotEscrow`, `BadOutcome`, `NotSigner`, `BadClass` or `IdentityAlreadyRegistered`, declare the missing ones locally and list them in the PR body. `BadOutcome` on `IAbuseMark` is not in the lead notes — declare it locally in `AbuseMark` and file `INTERFACE REQUEST: IAbuseMark.BadOutcome`.
- Decided here, lead may override: the `outcome` code → `(value, tag1)` mapping in §2 (`2 → −1 disputed`, `3 → +1 disputed`); T-01 fixes only `1 → +1 paid-on-proof`.
- If T-04's `interface-change` PR alters `IERC8004Reputation` (argument order or types), the merged file wins; the mock and this contract follow it; do not fill the draft PR and run `gh pr ready` for review until T-04 is merged — comment `BLOCKED: waiting on T-04 selector` if it is not.
- If `pnpm abi:gen` produces a diff in `packages/shared/src/abi/{Reputation,AbuseMark}.json` once the concrete contracts exist, do not commit it: `BLOCKED: abi-gen diff — lead to regenerate under T-01 ownership`.

## 14. Reviewer notes
Open `mark` first: idempotency (`return false`) must come **before** the cooldown revert, and the cooldown guard must skip `lastMarkAt == 0`; then check the eight `giveFeedback` arguments against T-01 (value `-1`, `tag1` `task-refused`, `tag2` the label, `feedbackHash` the spec hash). In `Reputation.feedback` check the score adjustment on a slot update (`+1 → −1` moves the score by 2) and that `completed` increments on a repeat rater. In the tests, confirm `test_Mark_Idempotent` asserts zero logs and zero new mock calls, not merely the `false` return, and that `test_Mark_RateLimited` measures the third mark from the **second** mark's timestamp.

## 15. Round 2+
—
