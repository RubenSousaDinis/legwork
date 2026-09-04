---
id: T-11
title: WorkerRegistry — ATTESTED registration, seeding, reset, O(1) views
lane: A
day: 1→2
size: M
agent_class: C
must: true
depends_on: [T-01a]                    # T-01a (IWorkerRegistry, mocks, Keys.sol) is enough to start
owned_paths:
  - contracts/src/WorkerRegistry.sol
  - contracts/test/WorkerRegistry*.t.sol
labels: [area:contracts, wave:1, size:M, agent:cloud]
branch: t-11/worker-registry
---

# T-11 — WorkerRegistry: ATTESTED registration, seeding, reset, O(1) views

## 1. Context
`WorkerRegistry` is the "one human, one worker account" contract. The Task API verifies a World ID proof in the cloud (IDKit), signs an EIP-712 attestation with the **attestation verifier key**, and the relayer calls `registerFor`. The contract's whole job is to make that attestation single-use, chain-bound, contract-bound and bound to exactly one `(nullifierHash, worker)` pair, and to keep seeded demo workers visibly separate from verified ones. `TaskEscrow` (T-12) reads `isWorker`, `isSeeded` and `nullifierOf` on every claim and release; the subgraph and dashboard render `seeded` from the `WorkerSeeded` event; T-14 seeds 20 workers through `seedWorker`; a follow-up S PR proves the API's TypeScript signer (T-20) and this contract agree on the digest.

> **02-architecture — WorkerRegistry** "`registerFor(nullifierHash, worker, area, taskTypes, deadline, attestation)` — called by the relayer after IDKit cloud verification. `attestation` is an EIP-712 signature from the **attestation verifier key** over `(nullifierHash, worker, area, taskTypes, deadline)` with `chainId` and `verifyingContract` in the domain, so one attestation cannot be replayed to bind the same human to a second address or replayed on another chain. A known `nullifierHash` reverts. `worker` is the app-generated payout key. `area` (a coarse geohash-5 string) and `taskTypes` (bitmask) exist so `preflight_workers(taskType, area)` can be answered from indexed data instead of a vanity registration count. · `seedWorker(worker, syntheticNullifier, area, taskTypes)` — owner-only; sets `seeded = true`; emits `WorkerSeeded`, **never** `WorkerRegistered`. Seeded rows come from an admin function that cannot produce a verified registration; the subgraph and the dashboard render the flag from this event, not from a hardcoded list. · `resetWorker(nullifierHash)` — owner-only; deletes a binding; used only so the demo World ID can be rehearsed before it is filmed. Disclosed in the README under "operator powers in v0" beside `resolve()`. · O(1) reads: `isWorker`, `isSeeded`, `nullifierOf`, `areaOf`, `taskTypesOf`. · Caption on screen: "cloud-verified, operator-attested — onchain World ID verification is Orb-only today.""

> **02-architecture — security table** "**FIX** Fake / duplicate workers — One nullifier = one account; attestation domain-bound with a deadline and (nullifier, worker) binding; a known nullifier reverts — `test_Register_DuplicateNullifierReverts`, `test_Register_ReplayedAttestationReverts`" · "**FIX** Seeded workers mint "verified humans" — `seedWorker` is a separate owner-only path emitting `WorkerSeeded`; seeded workers can only claim operator-funded tasks; the flag is indexed and rendered — `test_Seeded_CannotClaimExternalTask` (T-12)"

The frozen surface, verbatim from **T-01 §2 `IWorkerRegistry`** (read `contracts/src/interfaces/IWorkerRegistry.sol` before coding):
> `registerFor(uint256 nullifierHash, address worker, string area, uint8 taskTypes, uint256 deadline, bytes attestation)` — `onlyRelayer`. Reverts: `NotRelayer`, `DuplicateNullifier` (nullifier already bound), `WorkerAlreadyBound` (address already bound), `AttestationExpired` (`block.timestamp > deadline`), `BadAttestation` (signer ≠ attestation verifier), `AttestationUsed` (digest seen before). · `seedWorker(address worker, uint256 syntheticNullifier, string area, uint8 taskTypes)` — `onlyOwner`; marks `seeded = true`; emits `WorkerSeeded`, **never** `WorkerRegistered`. · `resetWorker(uint256 nullifierHash)` — `onlyOwner`; deletes both directions of the binding; emits `WorkerReset`. · `setRelayer(address)`, `setAttestationVerifier(address)` — `onlyOwner`. · Views: `isWorker(address) → bool`, `isSeeded(address) → bool`, `nullifierOf(address) → uint256`, `workerOf(uint256) → address`, `areaOf(address) → string`, `taskTypesOf(address) → uint8`, `relayer()`, `attestationVerifier()`. · Events: `WorkerRegistered(uint256 indexed nullifierHash, address indexed worker, string area, uint8 taskTypes)` · `WorkerSeeded(uint256 indexed syntheticNullifier, address indexed worker, string area, uint8 taskTypes)` · `WorkerReset(uint256 indexed nullifierHash, address indexed worker)`. · EIP-712: domain name `"Legwork WorkerRegistry"`, version `"1"`, `chainId`, `verifyingContract`. Typehash `Attestation(uint256 nullifierHash,address worker,string area,uint8 taskTypes,uint256 deadline)` (the `string` is hashed with `keccak256(bytes(area))` per EIP-712). `usedDigest[digest]` mapping prevents replay.

## 2. Exact scope
- `contracts/src/WorkerRegistry.sol`: `contract WorkerRegistry is IWorkerRegistry, Ownable, EIP712` (OpenZeppelin 5). Constructor `(address initialOwner, address relayer_, address attestationVerifier_)`; `EIP712("Legwork WorkerRegistry", "1")`. Storage: `struct Record { uint256 nullifier; string area; uint8 taskTypes; bool seeded; bool bound; }`, `mapping(address => Record) records`, `mapping(uint256 => address) workerOf`, `mapping(bytes32 => bool) public usedDigest`, `address relayer`, `address attestationVerifier`. No arrays, no loops anywhere.
- `registerFor` check order — **exactly this, so the same error fires first in every test**: (1) `msg.sender != relayer` → `NotRelayer`; (2) `block.timestamp > deadline` → `AttestationExpired`; (3) `digest = _hashTypedDataV4(keccak256(abi.encode(ATTESTATION_TYPEHASH, nullifierHash, worker, keccak256(bytes(area)), taskTypes, deadline)))`; `usedDigest[digest]` → `AttestationUsed`; (4) `ECDSA.tryRecover(digest, attestation)` returns an error or a signer ≠ `attestationVerifier` → `BadAttestation`; (5) `workerOf[nullifierHash] != address(0)` → `DuplicateNullifier`; (6) `records[worker].bound` → `WorkerAlreadyBound`. Then: `usedDigest[digest] = true`, write both directions, `seeded = false`, emit `WorkerRegistered`.
- `seedWorker`: `onlyOwner`; same (5) and (6) checks with the same errors; writes both directions with `seeded = true`; emits `WorkerSeeded` and never `WorkerRegistered`.
- `resetWorker(nullifierHash)`: `onlyOwner`; `workerOf[nullifierHash] == address(0)` → `UnknownNullifier` (see §13); deletes `records[worker]` (including `seeded`) and `workerOf[nullifierHash]`; **does not** clear `usedDigest`; emits `WorkerReset(nullifierHash, worker)`.
- `isWorker(a)` is `records[a].bound` — **true for seeded workers too** (the escrow requires `isWorker` on every claim and seeded workers claim allowlisted tasks). `isSeeded(a)` is `records[a].seeded`. Unknown address: `false / false / 0 / "" / 0`.
- `setRelayer`, `setAttestationVerifier`: `onlyOwner`; no zero-address check beyond OZ's; no events beyond the interface (none are frozen).
- `ATTESTATION_TYPEHASH` is a `bytes32 public constant`; tests recompute the digest **independently** (their own domain separator from the four fields, never via `eip712Domain()` or a contract helper) so a wrong domain is caught, not mirrored.
- Tests in `contracts/test/WorkerRegistry.t.sol` (contract `WorkerRegistryTest`), roles from `contracts/test/utils/Keys.sol` (`deployer, relayer, verifier, worker1..3`), helper `_attest(uint256 nullifier, address worker, string area, uint8 taskTypes, uint256 deadline, uint256 signerKey, uint256 chainId, address verifyingContract) → bytes` built with `vm.sign`.
- Follow-up S PR (same branch prefix, opened after T-20 merges `contracts/test/fixtures/attestation.json`): `contracts/test/WorkerRegistry.fixture.t.sol` reads the fixture with `vm.readFile` + `vm.parseJson` (`chainId, verifyingContract, verifier, nullifierHash, worker, area, taskTypes, deadline, signature`), `vm.chainId(chainId)`, `deployCodeTo("WorkerRegistry.sol", abi.encode(owner, relayer, verifier), verifyingContract)`, `vm.warp(deadline - 1)`, then `registerFor` as the relayer succeeds — the TypeScript signer and Solidity agree byte for byte.
- `contracts/README.md` is **not** yours; document operator powers (`seedWorker`, `resetWorker`) in the contract's NatSpec header instead: "operator powers in v0 — disclosed".

## 3. Out of scope
- Escrow claim rules that read this registry (T-12); seeding 20 workers on Base Sepolia (T-14); the TypeScript attestation signer and `POST /register` (T-20); the fixture file itself (`contracts/test/fixtures/attestation.json`, T-20).
- Any onchain World ID verification (`IWorldID.verifyProof`) — the single `ATTESTED` mode is the design (S1 in T-04 is feedback-doc only).
- Do not touch: `contracts/src/interfaces/**`, `contracts/test/mocks/**`, `contracts/test/utils/**`, `contracts/script/**`, `foundry.toml`, `packages/**`, `subgraph/**`.

## 4. Owned paths
```
contracts/src/WorkerRegistry.sol
contracts/test/WorkerRegistry*.t.sol
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `IWorkerRegistry` | `contracts/src/interfaces/IWorkerRegistry.sol` | every function, event and error name exactly as T-01 §2 (quoted in §1) |
| `Keys` | `contracts/test/utils/Keys.sol` | deterministic private keys for `deployer, relayer, verifier, worker1..3` via `vm.addr` |
| OpenZeppelin 5 | `lib/openzeppelin-contracts` | `Ownable(initialOwner)`, `EIP712`, `ECDSA.tryRecover`; error `OwnableUnauthorizedAccount` |
| forge-std | `lib/forge-std` | `vm.sign`, `vm.warp`, `vm.chainId`, `vm.recordLogs`, `vm.expectRevert`, `deployCodeTo`, `vm.parseJson` |
| `contracts/test/fixtures/attestation.json` (follow-up PR only) | written by T-20 | fields listed in §2 |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `WorkerRegistry` constructor `(address initialOwner, address relayer_, address attestationVerifier_)` | `contracts/src/WorkerRegistry.sol` | T-14 (`Deploy.s.sol`), T-36 |
| `ATTESTATION_TYPEHASH` (public constant), `usedDigest(bytes32) → bool` (public mapping) | same | T-20 (mirror the typehash string in TypeScript), tests |
| `_attest(...)` test helper | `contracts/test/WorkerRegistry.t.sol` | T-11 follow-up PR; T-14 may copy it |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-11` — it must print `CLAIMED T-11`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, then `contracts/src/interfaces/IWorkerRegistry.sol`, `contracts/test/utils/Keys.sol`, and the OZ 5 `EIP712` / `ECDSA` sources in `lib/`.
2. Write the contract with the storage layout and the check order in §2; `forge build`.
3. Write `WorkerRegistryTest.setUp`: deploy with `Keys.deployer` as owner, `Keys.relayer`, `Keys.verifier`; `vm.chainId(84532)`; `vm.warp(1_757_000_000)`; a default attestation for `(nullifier = 0xA11CE, worker1, "ez5ku", 15, deadline = block.timestamp + 600)` signed by the verifier key.
4. Implement each test in §8, one revert per `vm.expectRevert(Selector.selector)`; for events use `vm.expectEmit` and, for `test_Seed_EmitsWorkerSeededNotRegistered`, `vm.recordLogs()` + a topic-0 scan.
5. `forge test --match-contract WorkerRegistry -vvv`; `forge coverage --report summary` (row `src/WorkerRegistry.sol` ≥ 95 % lines); `forge fmt --check`.
6. Open PR 1. When T-20 merges the fixture, open the follow-up PR with `WorkerRegistry.fixture.t.sol` only.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `test_Register_DuplicateNullifierReverts` | first `registerFor(n, worker1, …)` succeeds and emits `WorkerRegistered(n, worker1, "ez5ku", 15)`; a **fresh** attestation for the same `n` bound to `worker2` reverts `DuplicateNullifier`; a fresh attestation for a new nullifier bound to `worker1` reverts `WorkerAlreadyBound`; `seedWorker` with a bound synthetic nullifier or a bound address reverts the same two errors |
| `test_Register_ReplayedAttestationReverts` | (a) same attestation bytes submitted twice → second reverts `AttestationUsed` (fires before `DuplicateNullifier`); (b) attestation signed under a domain with `chainId + 1` → `BadAttestation`; (c) attestation signed for `worker1`, submitted with `worker = worker2` → `BadAttestation`; (d) signed by `Keys.relayer` instead of the verifier → `BadAttestation`; (e) domain with `verifyingContract = address(0xdead)` → `BadAttestation` |
| `test_Register_ExpiredAttestationReverts` | `vm.warp(deadline)` → succeeds (boundary is `>`); a second attestation with `vm.warp(deadline + 1)` → `AttestationExpired`, and `usedDigest` stays `false` for it |
| `test_Register_OnlyRelayer` | from `deployer`, `verifier`, `worker1` → `NotRelayer`; after `setRelayer(worker3)` the old relayer reverts `NotRelayer` and `worker3` succeeds; `setRelayer` from a non-owner → `OwnableUnauthorizedAccount` |
| `test_Seed_EmitsWorkerSeededNotRegistered` | `seedWorker(worker2, 0x5EED, "ez5kv", 3)` from the owner emits exactly one log whose topic 0 is `WorkerSeeded.selector` and none with `WorkerRegistered.selector`; `isWorker(worker2) == true`, `isSeeded(worker2) == true`, `nullifierOf(worker2) == 0x5EED`, `workerOf(0x5EED) == worker2`, `areaOf == "ez5kv"`, `taskTypesOf == 3`; from the relayer → `OwnableUnauthorizedAccount` |
| `test_Reset_AllowsFreshAttestationOnly` | register `worker1` with attestation A; `resetWorker(n)` emits `WorkerReset(n, worker1)` and every view for `worker1`/`n` returns the zero value; replaying A → `AttestationUsed`; attestation B (same `n`, same `worker1`, `deadline + 1`) → succeeds; `resetWorker(0xBAD)` → `UnknownNullifier`; `resetWorker` of a seeded worker clears `isSeeded` too; from a non-owner → `OwnableUnauthorizedAccount` |
| `test_Views_O1Reads` | after one registration and one seed, each of `isWorker`, `isSeeded`, `nullifierOf`, `workerOf`, `areaOf`, `taskTypesOf` returns the stored value; each external view call measured with `gasleft()` before/after costs `< 15_000` gas; unknown address and unknown nullifier return zero values |
| `forge coverage --report summary` | `src/WorkerRegistry.sol` lines ≥ 95 % |
| follow-up PR: `test_Fixture_TypeScriptAttestationVerifies` | the T-20 fixture registers successfully under `vm.chainId(fixture.chainId)` at `fixture.verifyingContract`; `usedDigest(fixture.digest) == true` afterwards |

## 9. Verification commands
```bash
cd contracts
forge build
forge test --match-contract WorkerRegistry -vvv
forge coverage --report summary | grep -E "WorkerRegistry|Total"
forge fmt --check
```
Expected: every test in §8 listed by name and green; the coverage row for `src/WorkerRegistry.sol` shows ≥ 95 % lines; `forge fmt --check` prints nothing.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). Not used by this contract; do not introduce other figures.
- No secrets in code or client bundles; test keys come only from `contracts/test/utils/Keys.sol`; `.env.example` is the only env file in git.
- Tests never call a live model or a live chain. C-class: no RPC URL, no key, no Base Sepolia — `forge test` only.
- Solidity `^0.8.24`, OpenZeppelin 5 only (`Ownable`, `EIP712`, `ECDSA`); no other library; no assembly.
- Checks-effects-interactions: there are no external calls in this contract; keep it that way (no callbacks, no hooks).
- Frozen interfaces are implemented, never redefined: the contract `is IWorkerRegistry`; no local copy of an event or error that the interface already declares; the error names in §13 that are not yet in the interface are declared **locally** until the lead lifts them.
- Honesty line (NatSpec header, verbatim): "cloud-verified, operator-attested — onchain World ID verification is Orb-only today."
- `isWorker` is true for seeded workers; `WorkerSeeded` is the only way a seeded flag exists; no hardcoded seeded list anywhere.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] NatSpec header lists the two operator powers and the honesty line.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-11 — WorkerRegistry — ATTESTED registration, seeding, reset, O(1) views
owned-paths:
  - contracts/src/WorkerRegistry.sol
  - contracts/test/WorkerRegistry*.t.sol
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- `INTERFACE REQUEST` (known, pre-filed by T-07 §13 and shared with T-12/T-13): T-01 names no error for `resetWorker` of an unbound nullifier. Use `error UnknownNullifier();` declared in the contract until the lead lifts it into `IWorkerRegistry`; if the lead ships a different name, rename in one commit.
- If `IWorkerRegistry` in the merged T-01a differs from the quote in §1 (a missing view, a different event field order), the merged file wins — implement it and note the difference in the PR body; do not edit the interface.
- If `abi-gen.sh` / `pnpm abi:gen` produces a diff in `packages/shared/src/abi/WorkerRegistry.json` once the concrete contract exists, do not commit it: `BLOCKED: abi-gen diff — lead to regenerate under T-01 ownership`.

## 14. Reviewer notes
Open `registerFor` first and check the order in §2 (deadline → digest used → signer → duplicate nullifier → address bound); then that the digest hashes `keccak256(bytes(area))`, not `area`; then that `resetWorker` leaves `usedDigest` alone (the reset-then-replay test is the guard). In the tests, confirm the domain separator is computed by hand in the test file — a test that calls the contract's `eip712Domain()` proves nothing. Confirm `test_Seed_EmitsWorkerSeededNotRegistered` scans **all** recorded logs, not just the first.

## 15. Round 2+
—
