---
id: T-01
title: Interface freeze — contracts, schemas, API/MCP contracts, subgraph schema, DB schema
lane: lead
day: 1
size: L
agent_class: L
must: true
depends_on: [T-00]
owned_paths:
  - contracts/src/interfaces/**
  - contracts/test/mocks/**
  - contracts/test/utils/**
  - contracts/script/abi-gen.sh
  - packages/shared/**
  - subgraph/schema.graphql
  - apps/api/src/db/schema.ts
  - docs/api.md
  - docs/mcp.md
  - docs/keys.md
  - demo-data.json
  - .env.example
labels: [area:shared, wave:1, size:L, agent:local, interface-change]
branch: t-01/interface-freeze
---

# T-01 — Interface freeze

Two PRs: **T-01a** (contracts side; unblocks lane A) and **T-01b** (TypeScript side; unblocks lanes B–D). Owner: the lead. Target: 01a merged by ~18:00 UTC, 01b by ~19:30 UTC on Day 1. Everything below is **frozen** once merged; later changes ship only as small `interface-change` PRs by the lead, merged first and announced in every open PR.

## 1. Context

Every other task is written against the names and shapes in this brief so that ~3 agents can work in parallel without touching each other's files. The pack (02-architecture, 10-schemas) is the source, with these corrections baked in: `post()` takes a `PostParams` struct carrying `area` (geohash5) and `buyerAgentId`; `postAsBuyer` exists from day one (the S3 pivot); `allowlistedBuyer` drives both the seeded-claim rule and `PosterStats`; `AbuseMark.markCooldown` is owner-settable (120 s for the shoot); the API returns a `buyer_token` because task ids are public; the agent id is *verified* against the ERC-8004 IdentityRegistry, never trusted from the body; the MCP server has a hosted and a local mode. Money: agent pays 3.45, escrow locks 3.45, worker receives 3.00, fee 0.45 (`FEE_BPS = 1500`, fee on top).

## 2. Exact scope

### T-01a — contracts side

**Conventions.** Solidity `^0.8.24`, OpenZeppelin 5 (`Ownable`, `Pausable`, `EIP712`, `ECDSA`, `SafeERC20`). USDC has 6 decimals; every amount is a 6-decimal integer (`3.00 USDC = 3_000_000`). Task ids are sequential `uint256` starting at 1. Nullifiers are `uint256` (the World ID `nullifier` hex parsed as a 256-bit integer). Task-type bitmask: `verify-open = 1`, `photo-of = 2`, `call-confirm = 4`, `compare-two = 8`. Area is a geohash-5 string (e.g. `"ez5ku"` — Leiria).

**`IWorkerRegistry`**
- `registerFor(uint256 nullifierHash, address worker, string area, uint8 taskTypes, uint256 deadline, bytes attestation)` — `onlyRelayer`. Reverts: `NotRelayer`, `DuplicateNullifier` (nullifier already bound), `WorkerAlreadyBound` (address already bound), `AttestationExpired` (`block.timestamp > deadline`), `BadAttestation` (signer ≠ attestation verifier), `AttestationUsed` (digest seen before).
- `seedWorker(address worker, uint256 syntheticNullifier, string area, uint8 taskTypes)` — `onlyOwner`; marks `seeded = true`; emits `WorkerSeeded`, **never** `WorkerRegistered`.
- `resetWorker(uint256 nullifierHash)` — `onlyOwner`; deletes both directions of the binding; emits `WorkerReset`. Disclosed operator power for rehearsals.
- `setRelayer(address)`, `setAttestationVerifier(address)` — `onlyOwner`.
- Views: `isWorker(address) → bool`, `isSeeded(address) → bool`, `nullifierOf(address) → uint256`, `workerOf(uint256) → address`, `areaOf(address) → string`, `taskTypesOf(address) → uint8`, `relayer()`, `attestationVerifier()`.
- Events: `WorkerRegistered(uint256 indexed nullifierHash, address indexed worker, string area, uint8 taskTypes)` · `WorkerSeeded(uint256 indexed syntheticNullifier, address indexed worker, string area, uint8 taskTypes)` · `WorkerReset(uint256 indexed nullifierHash, address indexed worker)`.
- EIP-712: domain name `"Legwork WorkerRegistry"`, version `"1"`, `chainId`, `verifyingContract`. Typehash `Attestation(uint256 nullifierHash,address worker,string area,uint8 taskTypes,uint256 deadline)` (the `string` is hashed with `keccak256(bytes(area))` per EIP-712). `usedDigest[digest]` mapping prevents replay.

**`ITaskEscrow`**
- `enum TaskState { None, Open, Claimed, Submitted, Released, Refunded, Disputed, Resolved }`
- `struct PostParams { uint8 taskType; bytes32 specHash; uint96 amount; address buyer; uint256 buyerAgentId; string area; uint32 claimTTL; uint32 submitTTL; uint32 disputeWindow; }`
- `struct Task { uint8 taskType; bytes32 specHash; uint96 amount; uint96 fee; address buyer; uint256 buyerAgentId; string area; address worker; TaskState state; uint64 postedAt; uint64 claimedAt; uint64 submittedAt; uint32 claimTTL; uint32 submitTTL; uint32 disputeWindow; bytes32 proofHash; }`
- `post(PostParams p) → uint256 taskId` — `onlyRelayer`, `whenNotPaused`. Pulls `p.amount + fee` USDC from `msg.sender` (the relayer float) with `safeTransferFrom`. Requires `p.amount ≤ MAX_TASK_AMOUNT`, `p.amount ≥ 1_000_000`, `openTasksOf(p.buyer) < maxOpenTasksPerBuyer` (else `OverOpenCap`), `p.taskType ∈ {1,2,4,8}`. Emits `TaskPosted`.
- `postAsBuyer(PostParams p) → uint256` — `whenNotPaused`; requires `p.buyer == msg.sender`; pulls from `msg.sender`; otherwise identical. (The S3-fail pivot; also the self-custodial roadmap.)
- `claimFor(uint256 taskId, address worker)` — `onlyRelayer`, `whenNotPaused`. `claim(uint256 taskId)` — `worker = msg.sender`, `whenNotPaused`. Rules for both: `registry.isWorker(worker)`; worker has no other open claim (`activeClaimOf[worker] == 0`); `block.timestamp ≥ cooldownUntil[worker]` (else `InCooldown`); if `registry.isSeeded(worker)` then `allowlistedBuyer[task.buyer]` must be true (else `SeededCannotClaimExternal`); state is `Open`, **or** `Claimed` with `block.timestamp > claimedAt + claimTTL` — in that case emit `ClaimExpired(taskId, staleWorker)`, set `cooldownUntil[staleWorker] = block.timestamp + CLAIM_COOLDOWN`, clear the stale claimant's active claim, then proceed (lazy expiry; no keeper). Sets `claimedAt`, `worker`; emits `TaskClaimed`.
- `releaseClaimFor(uint256 taskId, address worker)` — `onlyRelayer`. `releaseClaim(uint256 taskId)` — `msg.sender`. `Claimed` by that worker → `Open`; no cooldown (give-up inside the TTL is free). Emits `ClaimReleased`.
- `submitFor(uint256 taskId, address worker, bytes32 proofHash)` — `onlyRelayer`. `submit(uint256 taskId, bytes32 proofHash)` — `msg.sender`. Requires `Claimed` by that worker and `block.timestamp ≤ claimedAt + submitTTL` (else `SubmitWindowClosed`). → `Submitted`, `submittedAt`, `proofHash`; emits `TaskSubmitted`. **Never gated by pause.**
- `approve(uint256 taskId)` — caller is `task.buyer` **or** the relayer. Requires `Submitted`. → `_release`.
- `dispute(uint256 taskId)` — caller is `task.buyer` or the relayer. Requires `Submitted` and `block.timestamp < submittedAt + disputeWindow`. → `Disputed`; emits `TaskDisputed`.
- `autoRelease(uint256 taskId)` — anyone. Requires `Submitted` and `block.timestamp ≥ submittedAt + disputeWindow`. → `_release`. **Never gated by pause.**
- `resolve(uint256 taskId, bool toBuyer)` — `onlyOwner`. Requires `Disputed`. `toBuyer = true`: transfer `amount + fee` to buyer. `toBuyer = false`: transfer `amount` to worker **and** `fee` back to buyer (zero fee on any resolve). Feedback outcome `ResolvedToBuyer` / `ResolvedToWorker` (below). → `Resolved`; emits `TaskResolved(taskId, toBuyer)`.
- `expire(uint256 taskId)` — anyone. Requires (`Open` and `block.timestamp > postedAt + claimTTL`) **or** (`Claimed` and `block.timestamp > claimedAt + submitTTL`). Refunds `amount + fee` to `buyer`. → `Refunded`; emits `TaskRefunded(taskId, buyer, amount + fee)`. **Never gated by pause.**
- `_release` (internal): checks-effects-interactions — set `Released`, clear the worker's active claim, then `USDC.safeTransfer(worker, amount)`, `USDC.safeTransfer(treasury, fee)`, `reputation.feedback(registry.nullifierOf(worker), raterKey, OUTCOME_PAID, taskId)`, and if `buyerAgentId != 0` `abuseMark.outcome(buyerAgentId, taskId, OUTCOME_PAID)`. Emits `TaskReleased(taskId, worker, amount, fee)`. `raterKey = buyerAgentId != 0 ? bytes32(buyerAgentId) : bytes32(uint256(uint160(buyer)))`.
- `pause()` / `unpause()` — `onlyOwner`; gates **only** `post`, `postAsBuyer`, `claimFor`, `claim`. The asymmetry is the design: a stop can never trap a worker's earned funds.
- `setAllowlistedBuyer(address buyer, bool allowed)` — `onlyOwner`; emits `BuyerAllowlisted(buyer, allowed)`.
- Constants/config: `FEE_BPS = 1500`, `MAX_TASK_AMOUNT = 10_000_000` (10 USDC, immutable), `maxOpenTasksPerBuyer = 5`, `CLAIM_COOLDOWN = 900`. `fee = amount * FEE_BPS / 10_000` (3.00 → 0.45).
- Views: `getTask(uint256) → Task`, `openTasksOf(address) → uint256`, `activeClaimOf(address) → uint256`, `cooldownUntil(address) → uint256`, `allowlistedBuyer(address) → bool`, `taskCount() → uint256`, `usdc()`, `treasury()`, `relayer()`, `registry()`, `reputation()`, `abuseMark()`.
- Events: `TaskPosted(uint256 indexed taskId, address indexed buyer, uint256 buyerAgentId, uint8 taskType, bytes32 specHash, uint96 amount, uint96 fee, string area, uint32 claimTTL, uint32 submitTTL, uint32 disputeWindow)` · `TaskClaimed(uint256 indexed taskId, address indexed worker)` · `ClaimReleased(uint256 indexed taskId, address indexed worker)` · `ClaimExpired(uint256 indexed taskId, address indexed staleWorker)` · `TaskSubmitted(uint256 indexed taskId, address indexed worker, bytes32 proofHash)` · `TaskReleased(uint256 indexed taskId, address indexed worker, uint96 amount, uint96 fee)` · `TaskDisputed(uint256 indexed taskId)` · `TaskResolved(uint256 indexed taskId, bool toBuyer)` · `TaskRefunded(uint256 indexed taskId, address indexed buyer, uint96 total)` · `BuyerAllowlisted(address indexed buyer, bool allowed)` · OZ `Paused`/`Unpaused`.

**`IReputation`** (worker side only; keyed by nullifier so an address rotation never resets it)
- Outcome codes (shared with AbuseMark): `1 = Paid` (paid on proof, +1), `2 = ResolvedToWorker` (+1), `3 = ResolvedToBuyer` (−1).
- `feedback(uint256 nullifierHash, bytes32 raterKey, uint8 outcome, uint256 taskId)` — `onlyEscrow`. `slot[nullifier][raterKey]` stores the latest outcome; a first write from a rater increments `distinctRaters`; a repeat write from the same rater **updates its slot and does not add a voice**; `score` is the running sum of slot values (+1/−1) adjusted on update; `completed` increments on every `Paid`/`ResolvedToWorker` (counts tasks, so "completed 1 → 2 while distinct raters stays 1" is representable).
- Views: `score(uint256 nullifier) → int256`, `completed(uint256) → uint256`, `distinctRaters(uint256) → uint256`, `slotOf(uint256 nullifier, bytes32 raterKey) → uint8`. `setEscrow(address)` — `onlyOwner`.
- Event: `Feedback(uint256 indexed nullifierHash, bytes32 indexed raterKey, uint8 outcome, uint256 taskId, bool newRater)`.

**`IAbuseMark`** (holds the Task API's ERC-8004 identity; the only writer of agent-side feedback)
- Class ids: `1 credential fraud · 2 identity impersonation · 3 automated reconnaissance · 4 social media manipulation · 5 authentication circumvention · 6 referral fraud` (Mehta, arXiv:2602.19514 — labels verbatim).
- `mark(uint256 agentId, uint8 classId, bytes32 specHash) → bool written` — `onlySigner`. Idempotent per `(agentId, specHash)`: a repeat returns `false`, writes nothing, emits nothing. Rate-limited: if `block.timestamp < lastMarkAt[agentId] + markCooldown` revert `MarkCooldown`. Writes `giveFeedback(agentId, -1, 0, "task-refused", <class label>, "", "", specHash)` to the ERC-8004 ReputationRegistry; sets `lastMarkAt`, increments `marksOf`; emits `Marked(agentId, classId, specHash)`.
- `outcome(uint256 agentId, uint256 taskId, uint8 outcome)` — `onlyEscrow`. Writes `giveFeedback(agentId, +1|−1, 0, "paid-on-proof" | "disputed", "", "", "", bytes32(taskId))`; emits `Outcome(agentId, taskId, outcome)`.
- `registerIdentity(string agentURI) → uint256` — `onlyOwner`; calls `IdentityRegistry.register`; stores `selfAgentId`.
- `setMarkCooldown(uint256 seconds)`, `setSigner(address)`, `setEscrow(address)` — `onlyOwner`. Default `markCooldown = 86400`; the filmed run uses `120`, disclosed like `disputeWindow`.
- Views: `marked(uint256 agentId, bytes32 specHash) → bool`, `lastMarkAt(uint256) → uint256`, `marksOf(uint256) → uint256`, `markCooldown()`, `selfAgentId()`, `signer()`, `escrow()`.
- Events: `Marked(uint256 indexed agentId, uint8 classId, bytes32 specHash)` · `Outcome(uint256 indexed agentId, uint256 indexed taskId, uint8 outcome)`.

**Custom errors (declared on the interfaces so `FakeChain`, the API and the tests decode the same names).** `IWorkerRegistry`: `NotRelayer`, `DuplicateNullifier`, `WorkerAlreadyBound`, `AttestationExpired`, `BadAttestation`, `AttestationUsed`, `UnknownNullifier`. `ITaskEscrow`: `NotRelayer`, `NotBuyer`, `NotBuyerOrRelayer`, `NotWorker`, `HasActiveClaim`, `AlreadyClaimed`, `NotClaimant`, `InCooldown`, `SeededCannotClaimExternal`, `OverOpenCap`, `BadState`, `BadTaskType`, `AmountOutOfRange`, `SubmitWindowClosed`, `DisputeWindowClosed`, `DisputeWindowOpen`, `NotExpired`. `IReputation`: `NotEscrow`, `BadOutcome`. `IAbuseMark`: `NotSigner`, `NotEscrow`, `BadClass`, `BadOutcome`, `MarkCooldown`, `IdentityAlreadyRegistered`. Plus OpenZeppelin's `EnforcedPause`, `OwnableUnauthorizedAccount`.

**`contracts/src/interfaces/Outcomes.sol`** — `library Outcomes { uint8 constant PAID = 1; uint8 constant RESOLVED_TO_WORKER = 2; uint8 constant RESOLVED_TO_BUYER = 3; }` (interfaces cannot hold constants). `AbuseMark.outcome` maps `PAID → (+1, "paid-on-proof")`, `RESOLVED_TO_WORKER → (−1, "disputed")` (the agent's dispute was rejected), `RESOLVED_TO_BUYER → (+1, "disputed")` (the agent's dispute was upheld). `TaskEscrow` calls `abuseMark.outcome` on release **and** on both resolve outcomes when `buyerAgentId != 0`.

**Two product rules fixed here:** `activeClaimOf[worker]` is cleared on `_release`, on `resolve` (either way) and on `expire` — i.e. a worker holds one task through `Submitted`/`Disputed` and cannot claim a second until it settles (bounds a worker's exposure; disclosed in the README). `expire` sets no cooldown (the buyer's deadline passed, not the worker's fault). `TaskEscrow` has no relayer/treasury setter in v0 — both are constructor-immutable; a key rotation is a redeploy (disclosed).

**`IERC8004Identity` / `IERC8004Reputation`** — minimal external interfaces: `register(string agentURI) → uint256 agentId`, `ownerOf(uint256) → address`, `getAgentWallet(uint256) → address`; `giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)`, `getSummary(uint256 agentId, address[] clients, string tag1, string tag2) → (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)`. **Marked "confirm in T-04"; only T-04 may amend them (as an `interface-change` PR).** Addresses on Base Sepolia: IdentityRegistry proxy `0x8004A818BFB912233c491871b3d84c89A494BD9e`, ReputationRegistry proxy `0x8004B663056A597Dffe9eCcC1965A193B7388713`.

**Mocks** (`contracts/test/mocks/`): `MockUSDC` (6 decimals, `mint`), `MockRegistry` (settable `isWorker/isSeeded/nullifierOf`), `MockReputation` (records calls), `MockAbuseMark` (records calls), `MockIdentityRegistry` (`register` returns incrementing ids; settable `ownerOf`/`getAgentWallet`), `MockReputationRegistry` (records `giveFeedback` calls, `getSummary` from recorded values). `contracts/test/utils/Keys.sol`: deterministic role private keys (`deployer, relayer, verifier, signer, buyer, worker1..3, treasury`) via `vm.addr`.

**`contracts/script/abi-gen.sh`**: `forge build` then copy `out/*.sol/*.json` ABIs for the four contracts into `packages/shared/src/abi/*.json` and `subgraph/abis/*.json`. CI fails if running it produces a diff.

### T-01b — TypeScript side

**`packages/shared/src/enums.ts`**: `TaskType = 'verify-open' | 'photo-of' | 'call-confirm' | 'compare-two'` with `TASK_TYPE_BIT = {verify-open:1, photo-of:2, call-confirm:4, compare-two:8}`; `TaskState` (mirrors the enum, numeric + string names); `ABUSE_CLASSES` = the six labels as a `readonly [string, ...string[]]` tuple in id order (zod enums derive from it; nothing re-types the labels), `AbuseClass = typeof ABUSE_CLASSES[number]`, `ABUSE_CLASS_ID` 1–6; `Outcome = {Paid:1, ResolvedToWorker:2, ResolvedToBuyer:3}`; `FeedbackTag = 'paid-on-proof' | 'disputed' | \`task-refused:${AbuseClass}\``.

**`packages/shared/src/constants.ts`**: `FEE_BPS = 1500`; `USDC_DECIMALS = 6`; `PRICE_FLOOR_USDC = {verify-open: 3.00, photo-of: 3.00, call-confirm: 2.00, compare-two: 1.00}`; `MAX_TASK_AMOUNT_USDC = 10`; `MAX_OPEN_TASKS_PER_BUYER = 5`; `DAILY_CAP_USDC = 25`; `DEFAULT_CLAIM_TTL_S = 1800`; `DEFAULT_SUBMIT_TTL_S = 3600`; `DEFAULT_DISPUTE_WINDOW_S = 86400`; `DEMO_DISPUTE_WINDOW_S = 120`; `SPEC_MAX_CHARS = 300`; `NOTE_MAX_CHARS = 120`; `NEED_BY_MIN_LEAD_S = 1200`; `GEOFENCE_M = 150`; `PUBLIC_COORD_DECIMALS = 3` (≈ 100 m); `LONGPOLL_MAX_S = 50`; `CLAIM_COOLDOWN_S = 900`; `CLASSIFIER_TIMEOUT_MS = 3000`; `CLASSIFIER_TIMEOUT_LABEL = 'keyword class — classifier timeout'`; `NO_RETRY_SENTENCE = 'do not rephrase and retry; report this refusal to your principal'`; `toUsdcUnits(n) / fromUsdcUnits(bigint)`; `priceWithFee(amountUnits) = amount + amount*1500n/10000n`.

**`packages/shared/src/addresses.ts`**: typed export read from `contracts/deployments/base-sepolia.json` (placeholders `0x0000…` until T-14; the file carries `addresses{workerRegistry, taskEscrow, reputation, abuseMark, erc8004Identity?, erc8004Reputation?}`, `startBlock`, `txs`, `deployer`, `deployedAt`, `chainId` — the loader ignores unknown keys; `deployments/anvil.json` is gitignored) plus constants: `CHAIN_ID = 84532`, `USDC` (Base Sepolia FiatTokenV2_2 — value filled by T-00 from Circle's deployments page), `ERC8004_IDENTITY`, `ERC8004_REPUTATION` (above), `WORLD_ID_ROUTER = 0x42FF98C4E85212a5D31358ACbFe76a621b50fC02` (feedback-doc only).

**`packages/shared/src/schemas/*.ts`** (zod v4) — transcribed from 10-schemas §1–§8, field for field:
- `Envelope`: `task_type` (enum), `spec` (per-type discriminated union), `amount_usdc` (number, ≥ floor for the type, ≤ 10, 2 decimals), `need_by?` (ISO; must be ≥ 20 min in the future), `claim_ttl_s` (default 1800), `submit_ttl_s` (default 3600), `dispute_window_s` (default 86400), `agent_id?` (string of digits). Serialized `spec` ≤ 300 chars (checked after canonicalisation).
- `Place`: `place_id` (`^(node|way|relation)/\d+$`, required), `google_place_id?`, `name`, `street_address`, `locality`, `country` (`PT`).
- `VerifyOpenSpec`: `place`, `question: 'open_now'`, `claimed_open: boolean | null`, `claimed_hours: string ≤ 60 | null`, `source: 'google'|'osm'|'own-list'|'website'|'other'|'none'`.
- `PhotoOfSpec`: `place`, `subject` ∈ `storefront|door|hours_sign|signage|notice|menu_board|shelf_price|queue_length|construction_notice`, `subject_detail? ≤ 80`, `claimed_state? ≤ 60`, `source`.
- `CallConfirmSpec`: `place`, `phone` (E.164), `template_id` ∈ `open_now|have_item|price_of|accepts_payment|closes_at_today|takes_reservation`, `slots: { item? ≤ 40, payment_method?: 'cash'|'card'|'mbway'|'multibanco' }`. Export `CALL_CONFIRM_TEMPLATES` (id → rendered question, answer enum) and `CALL_CONFIRM_DENYLIST` (PT+EN terms from 10-schemas §5, plus the rules "4+ consecutive digits inside `slots`" and "any URL") **as data** — the gate (T-06) applies them.
- `CompareTwoSpec`: `a`, `b`: `{ kind: 'image'|'text', url?: https ≤ 5 MB jpeg/png, text? ≤ 500, sha256 }`, `criterion_id` ∈ `more_legible|matches_reference|better_lit|same_place|which_is_newer|which_is_open`, `reference?`.
- Proofs: `VerifyOpenProof` `{ photo_hash, gps: {lat, lon, accuracy_m} | null, gps_unavailable: boolean, worker_confirmed_at_place: boolean, captured_at, answer: 'open'|'closed'|'unclear', note? ≤ 120 }` (invariant: `gps === null ⇔ gps_unavailable === true`, and then `worker_confirmed_at_place` must be true); `PhotoOfProof` same with `answer: 'captured'|'not_found'|'refused_by_staff'`; `CallConfirmProof` `{ answer: <per template>, called_at, note? }` labelled "self-reported answer + timestamp (unverified)"; `CompareTwoProof` `{ choice: 'a'|'b'|'neither', reason ≤ 120 }`.
- `RefusalPayload`: `{ refused: true, class: AbuseClass | null, reason, rule_id, retryable: false, allowed_task_types: TaskType[], mark_tx?, mark_status?: 'marked' | 'logged, cooldown' | 'no identity', message: NO_RETRY_SENTENCE }`. Gate failures that are **not** one of the six classes use `{ error: 'invalid_request', field, reason }` (400) — they never mark.
- `WorkerAnswer`: `{ answer, note?, _source: 'worker', _untrusted: true }` — the only shape in which worker text ever reaches an agent.
- `Observation`: from 10-schemas §8 (`observation_id, place_key, claim{type,value}, evidence_hash|null, worker_nullifier, observed_at, confidence, task_id, seeded`).
- `specHash(envelope)`: `keccak256(utf8(canonicalJson(spec)))` with sorted keys and no whitespace (`fast-json-stable-stringify`), exported for API, MCP and tests.
- `DemoData` schema for `demo-data.json`.

**`packages/shared/src/api-contract.ts` + `docs/api.md`** — every route with `auth ∈ public | x402 | buyer-token | worker-session | idkit-session | admin-key`, zod request/response, error codes:

| Route | Auth | Request → Response |
|---|---|---|
| `POST /tasks` | x402 (`PAYMENT-SIGNATURE` header; price = `amount × 1.15`) | `Envelope` → **201** `{task_id, buyer_token, status:'open', spec_hash, price_usdc, eta_seconds, poll_after_seconds, dashboard_url}` · **402** `{error:'payment_required', price_usdc, accepts:[x402 requirements], remaining_budget:{open_tasks, daily_usdc}}` · **422** `RefusalPayload` · **400** `{error:'invalid_request', field, reason}` · **429** `{error:'cap_exceeded', open_tasks, daily_usdc}` |
| `GET /tasks/:id?wait=0..50` | public (+ optional `X-Buyer-Token` reveals `proof.url`); `ETag`/`If-None-Match` supported; `poll_after_seconds` = 0 when `changed`, 1 while `Claimed`/`Submitted`, 3 otherwise | → `{task_id, status, task_type, amount_usdc, fee_usdc, area, posted_at, claimed_at?, submitted_at?, released_at?, answer?: WorkerAnswer, proof?: {hash, hash_ok, url?, captured_at, coordinate_rounded?: {lat,lon}, gps_unavailable}, tx:{post, claim?, submit?, release?}, dashboard_url, changed: boolean, poll_after_seconds}` |
| `POST /tasks/:id/approve` · `/dispute` (`{reason}`) · `/refund` | buyer-token (`X-Buyer-Token`) | → `{task_id, status, tx}`; refund → **409** if not yet eligible |
| `POST /check` | public, rate-limited | `Envelope` → `{accepted:true, spec_hash, price_usdc}` or **422** `RefusalPayload` (no mark, ever) |
| `POST /idkit/request` | public | `{action}` → `{rp_context: {rp_id, nonce, created_at, expires_at, signature}}` |
| `POST /idkit/verify` | public | IDKit result payload (forwarded as-is to `POST https://developer.world.org/api/v4/verify/{rp_id}`) → `{verified:true, nullifier, level}` + idkit-session cookie; **409** `{error:'nullifier_already_registered'}` |
| `GET /session/nonce` | public | → `{nonce}` |
| `POST /session` | idkit-session **or** dev path | `{mode:'walletAuth', payload, nonce}` (verified with `verifySiweMessage`) or `{mode:'idkit', worker_address}` → worker-session cookie `{worker, nullifier, mode}`. **Dev path (seeded workers only):** a `walletAuth` SIWE payload from an address with `registry.isSeeded(worker) == true` is accepted without an idkit-session and bound to `nullifierOf(worker)` — this is how the CLI worker (T-29) and the e2e harness (T-36) sign in; never for a real worker |
| `POST /register` | idkit-session | `{worker_address, area, task_types}` → `{tx, worker}` (EIP-712 attestation signed by the verifier key, `deadline = now + 600`, then relayed `registerFor`) |
| `GET /tasks?area=&lat=&lon=` | worker-session | → `{tasks:[{task_id, task_type, title, price_usdc, distance_m?, claim_expires_in_s?, state, seeded}]}` (open + lazily-expirable) |
| `POST /tasks/:id/claim` | worker-session | → `{tx, claim_expires_at, submit_deadline}`; **409** `InCooldown | AlreadyClaimed | SeededCannotClaimExternal` |
| `POST /tasks/:id/release-claim` | worker-session | → `{tx}` |
| `POST /proofs` | worker-session, multipart ≤ 8 MB | `file, lat?, lon?, accuracy_m?, gps_unavailable?, worker_confirmed_at_place?` → `{proofHash, url, captured_at}` |
| `POST /tasks/:id/submit` | worker-session | `{proofHash?, answer, note?}` (+ per-type proof fields; `proofHash` required for `verify-open`/`photo-of`, absent for `call-confirm`/`compare-two` where the API stores `keccak256(canonicalJson(proof))` as the onchain `proofHash`) → `{tx, status: 'submitted' \| 'disputed', auto_dispute_reason?}` |
| `POST /tasks/:id/report` | worker-session | `{class}` → `{recorded:true}` (optional feature) |
| `GET /me/earnings` | worker-session | → `{released_usdc, completed, score, distinct_raters}` (earned-only: sums `TaskReleased` to this worker) |
| `GET /public/feed` | public | → `{tasks: [{task_id, status, task_type, title?, amount_usdc, fee_usdc, area, posted_at, claimed_at?, submitted_at?, released_at?, seeded, spec_hash, buyer_agent_id?, tx:{post, claim?, submit?, release?}}]}` (last 20) — never raw spec text, never an exact coordinate, never a buyer token, never a payer address |
| `GET /public/task/:id` | public | → the `GET /tasks/:id` shape minus `proof.url` (thumbnail only via a signed URL when the operator flag allows), plus `seeded`, `coordinate_rounded` |
| `GET /public/refusals` | public | → `{counts: Record<AbuseClass, number>, total, recent: [{at, task_type, class, reason, rule_id, spec_hash, marked, mark_tx?, mark_status?}]}` — never `payer`, never `agent_id` |
| `GET /public/posters` | public | → `{distinct_external_buyers, external_tasks}` |
| `GET /public/preflight?task_type=&area=` | public | → the MCP `preflight_workers` result shape |
| `GET /public/proofs/:hash/verify` | public | → `{hash, hash_ok, captured_at}` |
| `GET /tasks/:id/spec` | worker-session (claimant only) | → `{task_type, spec}` — the only route that returns spec fields to a human, and only to the worker holding the claim (needed for `call-confirm` templates and `compare-two`) |
| `POST /admin/pause` · `/unpause` · `/resolve` (`{task_id, to_buyer}`) · `/reset-demo` · `/reset-worker` (`{nullifier}`) · `/sweep` · `/seed-demo` | admin-key (`X-Admin-Key`) | → `{ok:true, tx?}`; every call audit-logged |
| `GET /openapi.json` · `GET /healthz` | public | |
| `GET /public/observations?place_id=` (optional, T-40) | public | → `{observations:[Observation minus worker_nullifier], delta?: {checked, listing_wrong}}` |
| **Direct mode only** (`PAYMENT_MODE=direct`, T-16b): `POST /tasks` with headers `X-Buyer-Signature` (EIP-191 over `${spec_hash}:${timestamp}`) + `X-Buyer-Timestamp` (±300 s) → **202** `{quote: {spec_hash, post_params, total_units, escrow, deadline}}`; `POST /tasks/:id/confirm` → `{task_id, buyer_token}` after `TaskPosted` with that `spec_hash` is observed | signed header | the x402 rows above do not apply in this mode |
| Generic error bodies (any route) | — | **429** `{error:'rate_limited', retry_after_s}` · **413** `{error:'payload_too_large', max_bytes}` · **403** `{error:'origin_not_allowed'}` · **401** `{error:'unauthorized'}` · **404** `{error:'not_found'}` · **409** `{error: 'bad_state' \| 'not_eligible' \| 'dispute_window_closed' \| 'chain_revert' \| 'worker_already_bound' \| 'nullifier_already_registered' \| 'InCooldown' \| 'AlreadyClaimed' \| 'SeededCannotClaimExternal', detail?}` · **500** `{error:'attestation_rejected'}` · **503** `{error:'chain_unavailable'}`. `POST /admin/reset-demo` requires body `{confirm:'reset-demo'}`. |

Shared helpers: `apps/api/src/services/buyerToken.ts` (`newBuyerToken()` → 32 random bytes base64url, `hashBuyerToken(token)` → sha256 hex, `verifyBuyerToken(token, hash)` constant-time) is owned by T-19 and imported by T-16; `apps/api/src/services/lifecycle.ts` exposes `settleIfEligible(taskId)` (T-17) used by T-19's long-poll and by `/admin/sweep`. Public `price_usdc` is the worker rate (3.00) with `fee_usdc` (0.45) alongside; `agent_pays_usdc` (3.45) appears only on buyer-authenticated responses.

Handler order for `POST /tasks` (frozen): `x402 verify (no money moves) → envelope + schema → deterministic gate → classifier (free-text path only) → caps → agent-id verification → TaskEscrow.post(buyer = payer, buyerAgentId) via TxQueue → x402 settle (idempotency key = authorization nonce) → 201`. A refusal from the gate/classifier → `AbuseMark.mark` (if a verified agent id) and 422. A failed `post` never settles. A failed settle after `post` logs `float_absorbed=true`.

**`packages/shared/src/mcp-contract.ts` + `docs/mcp.md`** — six tools (zod input/output), two modes:
- `preflight_workers({task_type, area})` → `{active, verified, seeded, median_minutes: number|null, median_source: 'real'|'seeded'|'n/a', n_real, score_floor, dashboard_url}` (active = completed a task in the last 7 days).
- `hire_human({task_type, spec, amount_usdc, need_by?, agent_id?})` → local mode: `{task_id, status, eta_seconds, poll_after_seconds, dashboard_url}` or `RefusalPayload`; hosted mode: `{payment_required: true, endpoint, price_usdc, network: 'eip155:84532', asset: 'USDC', pay_to, install_line: 'claude mcp add legwork -- npx @legwork/mcp', dashboard_url}`.
- `task_status({task_id, wait_seconds ≤ 50})` → the `GET /tasks/:id` shape (`answer` always wrapped as `WorkerAnswer`).
- `approve_task({task_id, buyer_token?})`, `dispute_task({task_id, reason, buyer_token?})` → `{task_id, status, tx}`.
- `check_task({task_type, spec})` → `{accepted, spec_hash, price_usdc}` or `RefusalPayload`.
- Every result carries `dashboard_url`. Refusals carry `NO_RETRY_SENTENCE`.

**`subgraph/schema.graphql`**: `Worker { id: Bytes! (address), nullifier: BigInt!, seeded: Boolean!, reset: Boolean!, area: String!, taskTypes: Int!, completed: Int!, lastCompletedAt: BigInt, score: BigInt!, distinctRaters: Int!, registeredAt: BigInt! }` · `Task { id: ID! (taskId), taskType: Int!, specHash: Bytes!, amount: BigInt!, fee: BigInt!, buyer: Buyer!, buyerAgentId: BigInt!, worker: Worker, state: String!, area: String!, postedAt: BigInt!, claimedAt: BigInt, submittedAt: BigInt, releasedAt: BigInt, proofHash: Bytes, seeded: Boolean!, txPost: Bytes!, txClaim: Bytes, txSubmit: Bytes, txRelease: Bytes }` · `Buyer { id: Bytes!, allowlisted: Boolean!, taskCount: Int!, countedExternal: Boolean!, tasks: [Task!]! @derivedFrom(field: "buyer") }` (the two counters exist because `@derivedFrom` fields are not readable inside an AssemblyScript mapping: `PosterStats` is incremented on `TaskPosted` when the buyer is not allowlisted, and a later `BuyerAllowlisted` flip sets the flag and logs a warning rather than retro-decrementing — the demo order allowlists before posting, so the count is exact) · `Feedback { id: ID! (`<worker address>-<raterKey>` — the entity **is** the rater slot, updated in place so a repeat outcome replaces the previous value), worker: Worker!, raterKey: Bytes!, outcome: Int!, task: Task!, newRater: Boolean!, at: BigInt! }` · `Mark { id: ID!, agentId: BigInt!, classId: Int!, specHash: Bytes!, at: BigInt!, tx: Bytes! }` · `Outcome { id: ID!, agentId: BigInt!, task: Task!, outcome: Int!, at: BigInt! }` · `PosterStats { id: ID! ("global"), distinctExternalBuyers: Int!, externalTasks: Int! }`. **No coordinate anywhere; `area` (geohash5) only.**

**`apps/api/src/db/schema.ts`** (Drizzle, Postgres) — all tables pre-declared: `tasks` (public columns mirroring `Task` + `seeded` (from the claiming worker's flag), `answer` (enum string), `note` (≤120 chars, escaped), `dispute_reason`, `auto_dispute_reason` + private: `spec_json`, `buyer_token_hash` (sha256 hex of the utf8 token), `exact_lat/lon`, `agent_id`, `payer`, `auth_nonce`, `price_units`, `float_absorbed`), `proofs` (`hash` PK, `storage_key`, `captured_at`, `exact_lat/lon/accuracy`, `gps_unavailable`, `worker`, `task_id`, `place_id`), `sessions`, `idkit_sessions`, `nullifiers` (`nullifier NUMERIC(78,0)` UNIQUE, `action`, `worker`), `idempotency` (`auth_nonce` PK → `task_id`, `settle_tx`), `screening_log` (`id, at, task_type, class, reason, rule_id, spec_hash, marked, mark_tx, agent_id, payer` — **never the raw spec**), `caps_ledger` (`payer, day, open_tasks, daily_units`), `marks_log` (`id, at, payer, agent_id_claimed, agent_id, class, spec_hash, outcome ∈ marked|no_identity|not_owner|already_marked|cooldown|tx_failed, tx`), `observations`, `posters` (`payer, agent_id, first_seen, allowlisted`), `admin_audit`, `nonces` (`key_role` PK, `next_nonce`, `locked_at`), `direct_quotes` (`spec_hash` PK, `payer, post_params_json, total_units, deadline, task_id, created_at` — used only in `PAYMENT_MODE=direct`, T-16b).

**`demo-data.json`** (schema in shared): Leiria placeholders — shop `Farmácia Central · Rua Direita 12, Leiria` with an OSM `node/…` id to be replaced by the operator, worker `#w-0417`, agent `#8004-1207`, money `{agent_pays: 3.45, escrow_locked: 3.45, worker_receives: 3.00, fee: 0.45}`, the four feed rows (verify-open released · hire_human/call-confirm refused with class `authentication circumvention` · photo-of submitted (seeded) · compare-two open (seeded)), worker pool `{real: 1, seeded: 20}` rendered as "1 real · +20 seeded (demo data)", preflight `{active: 4, verified: 1, seeded: 3, score_floor: 4.2, median_minutes: 9, median_source: 'seeded'}`, chips (`sandbox World ID`, `operator-attested`, `relayed claim · gas paid by Legwork`, `testnet USDC — not spendable`, `GPS unavailable in webview — disclosed`, `1 real · +20 seeded (demo data)`), `narrationVariant: 'A' | 'B'`, `tx_placeholder: '0x8f2a…c41d'`.

**`.env.example`** (names only, grouped): `BASE_SEPOLIA_RPC_URL`, `CHAIN_ID=84532` · keys `DEPLOYER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`, `ATTESTATION_VERIFIER_PRIVATE_KEY`, `ABUSEMARK_SIGNER_PRIVATE_KEY`, `BUYER_PRIVATE_KEY`, `CLI_WORKER_PRIVATE_KEY`, `TREASURY_ADDRESS`, `BUYER_AGENT_ID` (the demo agent's ERC-8004 id, filled by T-32), `BASESCAN_API_KEY` (verification), `FORCE_REDEPLOY=0` · addresses `WORKER_REGISTRY_ADDRESS`, `TASK_ESCROW_ADDRESS`, `REPUTATION_ADDRESS`, `ABUSEMARK_ADDRESS`, `USDC_ADDRESS`, `ERC8004_IDENTITY_ADDRESS`, `ERC8004_REPUTATION_ADDRESS` · World `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, `WORLD_ACTION=legwork-worker`, `WORLD_ENV=staging`, `WORLD_CREDENTIAL_LEVEL=selfie|orb`, `NEXT_PUBLIC_WORLD_APP_ID` · payments `PAYMENT_MODE=x402|direct`, `X402_FACILITATOR_URL=https://x402.org/facilitator`, `X402_NETWORK=eip155:84532` · Supabase `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PROOF_BUCKET=proofs` · Graph `SUBGRAPH_QUERY_URL`, `GRAPH_API_KEY`, `GRAPH_DEPLOY_KEY`, `SUBGRAPH_SLUG` · Anthropic `ANTHROPIC_API_KEY`, `CLASSIFIER_MODEL=claude-opus-5`, `LIVE_LLM=0` · API `API_BASE_URL`, `DASHBOARD_URL`, `MINIAPP_URL`, `ADMIN_API_KEY`, `SESSION_SECRET`, `PROOF_URL_SECRET`, `DEMO_DISPUTE_WINDOW_S=120`, `DATA_MODE=live|demo`, `LONGPOLL_MAX_S=50`, `SWEEP_SECRET` · Next public `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUBGRAPH_QUERY_URL`, `NEXT_PUBLIC_ADMIN_UI=0` (dashboard admin panel flag; the key itself is never an env of the dashboard).

**`docs/keys.md`**: role table — deployer (owner of the four contracts; disclosed operator powers `seedWorker`, `resetWorker`, `resolve`, `pause`, `setAllowlistedBuyer`, `setMarkCooldown`) · relayer (holds the float; `post`, `registerFor`, `claimFor`, `releaseClaimFor`, `submitFor`, `approve`/`dispute` on behalf; x402 `payTo`) · attestation verifier (signs EIP-712 attestations; never onchain) · AbuseMark signer (`mark` only) · buyer (the demo agent; allowlisted) · CLI worker (seeded) · treasury (receives fees). One job per key; never a personal key.

## 3. Out of scope
- Any implementation (contracts, routes, UI). Interfaces, mocks, schemas, contracts-as-documents only.
- Deploy addresses (T-14), ERC-8004 ABI confirmation (T-04).

## 4. Owned paths
```
contracts/src/interfaces/**   contracts/test/mocks/**   contracts/test/utils/**   contracts/script/abi-gen.sh
packages/shared/**   subgraph/schema.graphql   apps/api/src/db/schema.ts
docs/api.md   docs/mcp.md   docs/keys.md   demo-data.json   .env.example
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| ERC-8004 registries | Base Sepolia | `giveFeedback` 8-param selector (02-architecture; confirmed by T-04) |
| World ID v4 | docs.world.org | `nullifier` is a 0x-hex 256-bit integer; verify endpoint `POST /api/v4/verify/{rp_id}` |

## 6. Interfaces produced
Everything in §2. Consumers: every task T-02 … T-49.

## 7. Step list
1. 01a: write the six Solidity interfaces + errors + events exactly as §2; write the mocks; `forge build`; `abi-gen.sh`; commit `packages/shared/src/abi/*.json` and `subgraph/abis/*.json`.
2. 01a: `enums.ts`, `constants.ts`, `addresses.ts`, `demo-data.json` + schema; `pnpm --filter @legwork/shared typecheck`.
3. 01b: zod schemas with a unit test per schema (happy + one failure each) and `specHash` golden vectors; `api-contract.ts`; `mcp-contract.ts`; `subgraph/schema.graphql`; `apps/api/src/db/schema.ts` + `drizzle-kit generate`; `docs/api.md`, `docs/mcp.md`, `docs/keys.md`; `.env.example`.
4. Open the two PRs with the `interface-change` label; announce merge in the Day-1 dispatch messages.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `forge build` | six interfaces + mocks compile |
| `contracts/script/abi-gen.sh && git diff --exit-code` | generated ABIs committed and in sync |
| `pnpm --filter @legwork/shared test` | every zod schema accepts its example and rejects one invalid case; `specHash` golden vectors stable; `Envelope` rejects `amount_usdc` below floor, `need_by` < 20 min, spec > 300 chars |
| `pnpm --filter @legwork/api drizzle:generate && git diff --exit-code` | migration in sync with `schema.ts` |
| `graph codegen` (in `subgraph/`) | schema compiles |

## 9. Verification commands
```bash
forge build && contracts/script/abi-gen.sh && git diff --exit-code
pnpm -r typecheck && pnpm --filter @legwork/shared test
cd subgraph && pnpm graph codegen
```

## 10. Hard rules
- Banned words: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures 3.45 / 3.00 / 0.45; `FEE_BPS = 1500` on top.
- No coordinate in the subgraph schema; `area` only.
- The six abuse-class labels are the paper's own, spelled exactly.
- Nothing from `fafo/hackathon-legwork/pitch/` or `design-system/` is copied; `demo-data.json` is typed fresh from this brief.

## 11. Definition of done
- [ ] Both PRs merged with CI green; labels `interface-change`.
- [ ] `docs/api.md` and `docs/mcp.md` match `api-contract.ts` / `mcp-contract.ts` (hand-checked).
- [ ] Dispatch messages for Day-1-night tasks reference the merged commit.

## 12. PR checklist
```
Task: T-01a|b — Interface freeze
owned-paths: (see §4)
Scope confirmed · §8 tests present · §9 output pasted
AI-Usage: <one line>
```

## 13. If blocked
The lead owns this brief; blockers are decisions — record them in `docs/plan/DECISIONS.md` with the choice made.

## 14. Reviewer notes
Read `ITaskEscrow` state machine against 02-architecture's diagram; check pause scope, `expire` conditions, `raterKey` rule, `_release` order (CEI), the seeded ⇒ allowlisted rule on **both** claim paths. Check `RefusalPayload` vs `invalid_request` split (marks vs no marks).

## 15. Round 2+
—
