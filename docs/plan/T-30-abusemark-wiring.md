---
id: T-30
title: AbuseMark wiring — identity, marks, screening log, posters
lane: B
day: 3
size: M
agent_class: C
must: true
depends_on: [T-16, T-13]
owned_paths:
  - apps/api/src/services/abuseMark.ts
  - apps/api/src/services/abuseMark.test.ts
  - apps/api/src/services/identity.ts
  - apps/api/src/services/identity.test.ts
  - apps/api/src/services/screeningLog.ts
  - apps/api/src/services/screeningLog.test.ts
  - apps/api/src/services/posters.ts
  - apps/api/src/services/posters.test.ts
labels: [area:api, wave:3, size:M, agent:cloud]
branch: t-30/abusemark-wiring
---

# T-30 — AbuseMark wiring — identity, marks, screening log, posters

## 1. Context
A refused task is the product's second half: an agent that asked for something in one of the six abuse classes gets a negative feedback entry on its ERC-8004 identity, written by the Task API's own identity through `AbuseMark`. This task wires the four services behind that beat: verifying the agent id against the IdentityRegistry (the body is a hint, never a fact), sending `AbuseMark.mark` through the signer-role `TxQueue`, writing one `screening_log` row per screening decision (class, reason, rule id, spec hash — never the spec), and upserting `posters` on every accepted task. T-16's `POST /tasks` route (merged) calls into these files at the "agent-id verification" step and on its refusal path; T-19's `/check`, `/public/refusals` and `/public/posters`, T-26's dashboard and T-27's MCP results consume what they write.

> **02-architecture.md — AbuseMark:** a thin onchain caller that holds the Task API's registered ERC-8004 identity and is the only writer of agent-side feedback: `mark(agentId, classId, specHash)` (tag `task-refused:<class>`) and `outcome(agentId, taskId, tag)` (tags `paid-on-proof` / `disputed`, called by TaskEscrow on release / resolve). Callable only by the operator's AbuseMark signer key (separate from the relayer and the attestation verifier). Idempotent per (agentId, specHash); rate-limited to one mark per agentId per rolling `markCooldown` [T-01: 86400 s default, 120 s in the filmed run]. The `agentId` is **never read from the request body**: the Task API resolves it from the x402 payer address via `IdentityRegistry` at screening time. No registered identity → a dashboard log entry, no mark. A schema error → an ordinary 4xx, no mark — the classifier's refusals are the only ones that mark. Operator-attested in v0; say so.

> **10-schemas.md §9, step 5 — Refusal side effects:** if the payer has a registered ERC-8004 identity → `AbuseMark.mark(agentId, class, specHash)` (idempotent, one per agentId per rolling `markCooldown`); no identity → dashboard log entry only. The refusal payload: `{ refused: true, class, reason, rule_id, retryable: false, allowed_task_types, mark_tx? }` plus "do not rephrase and retry; report this refusal to your principal."

> **10-schemas.md §10 — Marking rule across the corpus:** only rows whose class is one of the six mark the agent (if it has an identity); every "schema:", "type gate", "cap:" and "region" row is a plain 4xx with the reason and **no mark**.

T-01 corrections that win over the pasted text: the deterministic gate's six-class hits mark exactly like the classifier's (the pack sentence "the classifier's refusals are the only ones that mark" predates the gate); "has a registered identity" means **verified**: an id is accepted iff `IdentityRegistry.ownerOf(id) == payer || getAgentWallet(id) == payer`; the cooldown is `markCooldown()` read from the contract, never a duration in code; `RefusalPayload.mark_tx?` carries the `mark` transaction hash and is absent otherwise.

## 2. Exact scope
- `identity.ts` exports `verifyAgentId(claimed: string | undefined, payer: Address, deps = defaultDeps()): Promise<VerifiedIdentity>` with `VerifiedIdentity = { verified: true; agentId: bigint } | { verified: false; agentId: null; reason: 'none_claimed' | 'not_owner' | 'lookup_failed' }`. Rule: `claimed` absent → `none_claimed`. Otherwise read `IERC8004Identity.ownerOf(id)` and `getAgentWallet(id)` at `ERC8004_IDENTITY` (from `@legwork/shared` `addresses.ts`) through the chain reader; verified iff either equals `payer` (compare with viem `isAddressEqual`); `ownerOf` reverting (no such id) → `not_owner`; any RPC error → `lookup_failed`. Never throws into the caller; no cross-request cache (ownership can change). There is no reverse lookup in `IERC8004Identity`: no claimed id means no identity.
- `abuseMark.ts` exports `markIfIdentified(cls: AbuseClass, specHash: Hex, payer: Address, agentId?: string, deps = defaultDeps()): Promise<MarkResult>` with `MarkResult = { marked: true; mark_tx: Hex; agent_id: string } | { marked: false; outcome: 'not_markable' | 'no_identity' | 'not_owner' | 'already_marked' | 'cooldown' | 'tx_failed'; agent_id: string | null }`. Order: (1) `isMarkableClass(cls)` — `ABUSE_CLASS_ID[cls]` must be 1–6, else return `not_markable` with **no read, no write, no log**; (2) `verifyAgentId` — unverified → one `marks_log` row (`outcome` `no_identity` | `not_owner`), return; (3) read `AbuseMark.marked(agentId, specHash)` → `true` → `already_marked` (row, no tx); (4) read `lastMarkAt(agentId)` + `markCooldown()` → still cooling → `cooldown` (row, no tx); (5) enqueue `AbuseMark.mark(agentId, ABUSE_CLASS_ID[cls], specHash)` on the `TxQueue` with role `signer`; a `MarkCooldown` revert (decoded from the `IAbuseMark` ABI — the pre-check can race) → `cooldown`; any other failure → `tx_failed`; success → `marks_log` row `outcome 'marked'` with the tx hash and `{marked: true, mark_tx, agent_id}`.
- Export `isMarkableClass(x: unknown): x is AbuseClass`, `MARK_OUTCOME_LABEL: Record<MarkResult['outcome'] | 'marked', string>` = `{ marked: 'marked', cooldown: 'logged, cooldown', no_identity: 'no identity', not_owner: 'claimed id not owned by payer', already_marked: 'already marked', tx_failed: 'mark failed — logged', not_markable: 'not a marking class' }`; the dashboard (T-26) and `/public/refusals` (T-19) render these strings, never the raw outcome codes.
- `screeningLog.ts` exports `logScreening(entry: ScreeningEntry, deps = defaultDeps()): Promise<void>` inserting one row into `screening_log` (`at, task_type, class, reason, rule_id, spec_hash, marked, mark_tx, agent_id, payer`). `ScreeningEntry` has exactly those fields (no `spec`, no `envelope`, no coordinates); `agent_id` is the **verified** id or `null`; `payer` is `null` for `POST /check` rows; accepted decisions log `class: null, reason: 'accepted', rule_id: 'accept', marked: false`. Runtime guard: `reason` longer than 200 characters, containing a newline or a `{` throws `TypeError('screening_log.reason must be the gate sentence, not spec text')` — nothing is written.
- `posters.ts` exports `upsertPoster({ payer, agentId }: { payer: Address; agentId: bigint | null }, deps = defaultDeps()): Promise<void>` — called on every **accepted** task: inserts `posters (payer, agent_id, first_seen = now, allowlisted)` or updates `agent_id` when a later task verifies one; `allowlisted` = `ITaskEscrow.allowlistedBuyer(payer)` read through the chain reader (cached 60 s per payer); "external" = `allowlisted === false`. Also exports `listPosters(deps?)` → `{ posters: [{payer, agent_id, first_seen, allowlisted}], distinct_external_buyers: number }` for T-19's `/public/posters`.
- `defaultDeps()` (in `identity.ts`, re-exported by the other three) resolves `{ chain: ChainReader, txQueue: TxQueue, db: Db, now: () => Date }` from T-13's API-side chain singleton and the Drizzle client T-16/T-19 use — read the imports in `apps/api/app/tasks/route.ts` and use the same modules; never a second client, never `process.env` in the four files.
- Keep the exported names T-16's route already imports from these four files (stubs left by T-16). If the route imports a name not listed here, keep it as an alias; if it does not import `markIfIdentified`, `logScreening` or `upsertPoster` at all, stop and comment `BLOCKED:` naming the call site (§13).

## 3. Out of scope
- The `POST /tasks` route, the x402 flow, `TaskEscrow.post`, building the `RefusalPayload` and placing `mark_tx` in it — **T-16** (this task only returns `MarkResult`; T-16 copies `mark_tx` into the payload).
- `POST /check` and the public routes that read these tables — **T-19**. Dashboard rendering — **T-26**. The gate, the classifier, rule ids, the corpus fixture — **T-06** and the Day-5 corpus task.
- `TxQueue`, nonces, the chain reader, `FakeChain` — **T-13**. `AbuseMark.sol`, `outcome()` — **T-04**. Direct-funding poster rows — **T-16b** (calls `upsertPoster`).
- Do not touch: `apps/api/app/**`, `apps/api/src/db/**`, `packages/shared/**`, `packages/chain/**`, `contracts/**`.

## 4. Owned paths
```
apps/api/src/services/abuseMark.ts       apps/api/src/services/abuseMark.test.ts
apps/api/src/services/identity.ts        apps/api/src/services/identity.test.ts
apps/api/src/services/screeningLog.ts    apps/api/src/services/screeningLog.test.ts
apps/api/src/services/posters.ts         apps/api/src/services/posters.test.ts
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `IAbuseMark` ABI | `packages/shared/src/abi/AbuseMark.json` | `mark(uint256 agentId, uint8 classId, bytes32 specHash) → bool written` (`onlySigner`; idempotent per `(agentId, specHash)`, repeat returns `false`); error `MarkCooldown`; views `marked(agentId, specHash)`, `lastMarkAt(agentId)`, `markCooldown()`; event `Marked(agentId, classId, specHash)` |
| `IERC8004Identity` ABI | `packages/shared/src/abi/*.json`, `addresses.ts` (`ERC8004_IDENTITY` = `0x8004A818BFB912233c491871b3d84c89A494BD9e`) | `ownerOf(uint256) → address`, `getAgentWallet(uint256) → address` |
| `ITaskEscrow.allowlistedBuyer(address) → bool` | `packages/shared/src/abi/TaskEscrow.json` | drives `posters.allowlisted` |
| `AbuseClass`, `ABUSE_CLASS_ID` (1–6), `FeedbackTag` | `packages/shared/src/enums.ts` | the six labels verbatim: `credential fraud · identity impersonation · automated reconnaissance · social media manipulation · authentication circumvention · referral fraud` |
| `RefusalPayload` | `packages/shared/src/schemas/*` | `{ refused: true, class: AbuseClass \| null, reason, rule_id, retryable: false, allowed_task_types, mark_tx?, message }`; gate failures that are not one of the six use `{ error: 'invalid_request', field, reason }` (400) — never mark |
| `TxQueue` (role `signer`), `ChainReader`, `FakeChain` | `packages/chain/src/**` (T-13) | serialised nonce per key role (`nonces` table); read `packages/chain/src/index.ts` for the exact method names — `FakeChain` records writes as `{role, to, functionName, args}`, returns a deterministic tx hash, has settable view results and a settable custom-error revert |
| Tables `screening_log`, `marks_log`, `posters` | `apps/api/src/db/schema.ts` | `screening_log(id, at, task_type, class, reason, rule_id, spec_hash, marked, mark_tx, agent_id, payer)`; `posters(payer, agent_id, first_seen, allowlisted)`; `marks_log` columns as declared (§13) |
| Env (composition root only) | `.env.example` | `ABUSEMARK_ADDRESS`, `ERC8004_IDENTITY_ADDRESS`, `TASK_ESCROW_ADDRESS`; `ABUSEMARK_SIGNER_PRIVATE_KEY` is held by the `TxQueue` signer role — never read here |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `verifyAgentId(claimed, payer, deps?) → VerifiedIdentity` | `apps/api/src/services/identity.ts` | T-16 (accept path: `PostParams.buyerAgentId = verified ? agentId : 0n`), `abuseMark.ts`, `posters.ts`, T-16b |
| `markIfIdentified(cls, specHash, payer, agentId?, deps?) → MarkResult`, `isMarkableClass`, `MARK_OUTCOME_LABEL` | `apps/api/src/services/abuseMark.ts` | T-16 refusal path, T-19 `/public/refusals`, T-26 |
| `logScreening(entry, deps?)`, `ScreeningEntry` | `apps/api/src/services/screeningLog.ts` | T-16 (every `POST /tasks` decision), T-19 (`POST /check`), T-26 |
| `upsertPoster({payer, agentId}, deps?)`, `listPosters(deps?)` | `apps/api/src/services/posters.ts` | T-16, T-16b, T-19 `/public/posters` |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-30` — it must print `CLAIMED T-30`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `apps/api/app/tasks/route.ts` (T-16): find the calls into these four files and the deps/clients it imports; read the stubs T-16 left at the owned paths; read `packages/chain/src/index.ts` (T-13) for `TxQueue`, the reader and `FakeChain`; read `apps/api/src/db/schema.ts` for the three tables and `packages/shared/src/enums.ts` for `ABUSE_CLASS_ID`.
2. `identity.ts` first, with `identity.test.ts` on `FakeChain`: owner match, wallet match, neither, `ownerOf` revert, RPC failure, no claim.
3. `screeningLog.ts` + `posters.ts` over pglite (Drizzle + `@electric-sql/pglite` with the T-01 migration; use the test DB helper T-16/T-19 established if one exists under `apps/api/src/test/`, else build it in the test file). `posters.test.ts`: first-seen insert, later `agent_id` fill-in, `allowlisted` from `FakeChain`, `distinct_external_buyers` counts only `allowlisted === false`.
4. `abuseMark.ts` per §2 order; tests in `abuseMark.test.ts` (§8). The cooldown path must be exercised twice: via the pre-check (`lastMarkAt + markCooldown > now`) and via a `MarkCooldown` revert on the write with the pre-check passing.
5. Mini-corpus table inside `abuseMark.test.ts` for `corpusMarkingRule`: the six classes × {identity, no identity}; plus rows quoted from 10-schemas §10 — row 53 `verify-open | valid place, 6th open task from the same agentId | REFUSE | cap: maxOpenTasksPerBuyer (no mark)`, row 55 `verify-open | valid place, buyer has no ERC-8004 identity, spec fine | ACCEPT | — (N; identity is not required to hire, only to be marked)`, row 56 `free text | "hire someone to check the queue at the bakery" | REFUSE | type gate (no mark; suggests photo-of/queue_length)`; plus one `schema: place.place_id missing` row and one `region: place outside the demo extract` row. If `@legwork/screening` (T-06) already exports the corpus, iterate over it as well — do not copy it.
6. Run §9; fill the draft PR and run `gh pr ready` with §12.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `markSubjectIsPayer` | `ownerOf(1207) = A`, `getAgentWallet(1207) = B`, payer `P` (none equal) → `{marked:false, outcome:'not_owner'}`, `FakeChain` records **zero** writes, one `marks_log` row; `ownerOf(1207) = P` → exactly one write `{role:'signer', to: <AbuseMark>, functionName:'mark', args:[1207n, 5, specHash]}` for class `authentication circumvention`, result `{marked:true, mark_tx, agent_id:'1207'}`; `getAgentWallet(1207) = P` with `ownerOf ≠ P` also marks; `marked(1207, specHash) = true` → `already_marked`, no write; `lastMarkAt + markCooldown > now` → `cooldown`, no write; write reverting `MarkCooldown` → `cooldown`; `MARK_OUTCOME_LABEL.cooldown === 'logged, cooldown'` |
| `corpusMarkingRule` | over the §7-5 table: every row whose class is one of the six marks when the identity verifies and never when it does not; every `schema:`, `type gate`, `cap:` and `region` row produces **no** `FakeChain` write and **no** `marks_log` row even when passed a verified id (`isMarkableClass` false → `not_markable`); row 55 → `logScreening` row `reason:'accepted', marked:false, agent_id:null` and `upsertPoster` called; the six class labels used are byte-equal to `Object.keys(ABUSE_CLASS_ID)` |
| `noIdentityLogsOnly` | `agentId` undefined → `{marked:false, outcome:'no_identity', agent_id:null}`, no reader call to `ownerOf`, no write, one `marks_log` row; `logScreening` with the matching entry stores `marked:false, mark_tx:null, agent_id:null, spec_hash` and the row contains no substring of the spec text used in the test; `logScreening` with a `reason` holding `{` throws and inserts nothing |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/api typecheck && pnpm --filter @legwork/api test -- abuseMark identity screeningLog posters
grep -rn "process.env" apps/api/src/services/abuseMark.ts apps/api/src/services/identity.ts apps/api/src/services/screeningLog.ts apps/api/src/services/posters.ts   # must print nothing
grep -rn "spec_json\|specJson\|envelope" apps/api/src/services/screeningLog.ts apps/api/src/services/abuseMark.ts   # must print nothing
grep -rn "86400" apps/api/src/services   # must print nothing — the cooldown is read from the contract
scripts/ci/banned-words.sh apps/api/src/services
```
Expected: the three §8 tests plus the identity/posters unit tests green; every `grep` prints nothing; banned-words clean.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). "a refused task moves no money." — a mark never touches USDC.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git. The signer key lives inside the `TxQueue`; these four files never read env, never hold a key.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted): `FakeChain` and pglite only; no RPC URL appears in a test.
- `agentId` is never trusted from the body: it is a claim, verified as `ownerOf(id) == payer || getAgentWallet(id) == payer`; unverified → "no identity → `marks_log` only". `PostParams.buyerAgentId` and `screening_log.agent_id` carry verified ids only.
- Schema errors never mark: only an `AbuseClass` reaches the chain; `class: null`, `invalid_request`, `cap_exceeded`, type-gate and region rows produce no read and no write.
- Never log raw spec text: `screening_log` stores `spec_hash`; `reason` is the gate's sentence; no logger call in these files receives the envelope or the spec.
- Cooldown is `markCooldown()` from the contract; the outcome is surfaced as `logged, cooldown`, never as an error to the agent, never as a retry.
- `mark_tx` is the hash of a sent `mark` transaction — never a placeholder, never `null` in the payload (absent when not marked).
- Copy that names the mark says "operator-attested in v0" wherever T-26/T-19 render `MARK_OUTCOME_LABEL`.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] Behaviour notes for T-16, T-19 and T-26 (labels, `MarkResult` shape) in the PR description — no README is owned here.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-30 — AbuseMark wiring — identity, marks, screening log, posters
owned-paths:
  - apps/api/src/services/abuseMark.ts
  - apps/api/src/services/abuseMark.test.ts
  - apps/api/src/services/identity.ts
  - apps/api/src/services/identity.test.ts
  - apps/api/src/services/screeningLog.ts
  - apps/api/src/services/screeningLog.test.ts
  - apps/api/src/services/posters.ts
  - apps/api/src/services/posters.test.ts
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

Known gaps to raise as written (do not resolve them yourself):
- `INTERFACE REQUEST: marks_log has no column set in the T-01 brief; this task needs (at, payer, agent_id_claimed, agent_id, class, spec_hash, outcome, tx). If schema.ts differs, list the missing columns and stop.`
- `INTERFACE REQUEST: RefusalPayload cannot tell the agent that a mark was logged under cooldown; propose optional mark_status: 'marked' | 'logged, cooldown' | 'no identity'.` — raise, do not add.
- `INTERFACE REQUEST: FakeChain lacks a settable custom-error revert (MarkCooldown)` — only if T-13's double cannot simulate it.
- `BLOCKED: apps/api/app/tasks/route.ts does not call markIfIdentified / logScreening / upsertPoster; needed call site: <file:line>` — if T-16 left no stub calls.

## 14. Reviewer notes
Open `abuseMark.ts` first: the `isMarkableClass` guard is the first statement; the `TxQueue` write uses role `signer`; the `MarkCooldown` revert is decoded, not string-matched. Then `identity.ts`: `isAddressEqual`, both views checked, `ownerOf` revert handled. Then `screeningLog.ts`: the entry type has no spec field and the `reason` guard exists. Most likely wrong: marking on `class: null`; trusting `agent_id` from the body when `ownerOf` lookup fails; a hard-coded cooldown; `mark_tx: null` in the result; `posters.allowlisted` read from env instead of `allowlistedBuyer`.

## 15. Round 2+
—
