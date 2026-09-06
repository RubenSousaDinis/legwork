---
id: T-17
title: Worker routes — list, claim, submit, earnings; submit-time checks and sweeper
lane: B
day: 2
size: L
agent_class: C
must: true
depends_on: [T-08, T-07]
owned_paths:
  - apps/api/app/tasks/list/**
  - apps/api/app/tasks/[id]/claim/**
  - apps/api/app/tasks/[id]/release-claim/**
  - apps/api/app/tasks/[id]/submit/**
  - apps/api/app/tasks/[id]/report/**
  - apps/api/app/me/**
  - apps/api/app/admin/sweep/**
  - apps/api/src/services/lifecycle.ts
  - apps/api/src/services/proofChecks.ts
  - apps/api/src/services/sweeper.ts
  - apps/api/src/services/reconcile.ts
  - apps/api/src/services/lifecycle.test.ts
  - apps/api/src/services/proofChecks.test.ts
labels: [area:api, wave:2, size:L, agent:cloud]
branch: t-17/worker-routes
---

# T-17 — Worker routes — list, claim, submit, earnings; submit-time checks and sweeper

Day 2 → Day 3. **Two PRs**: **PR1** = the worker's path through a task (list → claim → submit → earnings, plus release-claim and report). **PR2** = the API as the default reviewer (content-hash reuse and geofence auto-dispute, GPS downgrade, lazy sweeper, reconcile). PR1 merges before PR2 starts; the mini-app (lane D) codes against PR1's shapes.

## 1. Context
The worker never signs a transaction: the mini-app calls these routes with a worker-session and the relayer executes `claimFor` / `releaseClaimFor` / `submitFor` through `TxQueue`, paying gas. The chain is the source of truth for state; the `tasks` table mirrors it so the list, the dashboard and the long-poll can read without an RPC call. At submit the API also does the checking the buyer's agent is not awake to do: an identical proof for the same place and type, or a photo taken 150 m or more from the place, is submitted and then disputed by the API itself — onchain, logged, disclosed. The lazy sweeper replaces a keeper: whoever loads the list, or the admin/cron `POST /admin/sweep`, pushes expirable and auto-releasable tasks forward.

> **02-architecture.md — Screening module (submit time):** At submit time the API also runs the proof checks that make it the default reviewer while the agent is asleep: content-hash reuse for the same place/type and a ~150 m geofence against the coordinate geocoded at post time both **auto-dispute** (API-side; no onchain revert, no mempool race). Every decision is logged; the dashboard renders class + reason + spec hash, never the raw spec text.

> **10-schemas.md §9 step 6 — At submit (the API as the default reviewer):** proof schema; content-hash reuse for the same place/type → auto-dispute; ~150 m geofence against the coordinate geocoded at post time → auto-dispute; both logged, both disclosed.

> **02-architecture.md — security rows:** **FIX** Proof replay / gallery upload / GPS far from the place | Raw content hash anchored; reuse for the same place/type and a ~150 m geofence auto-dispute at the API; `capture="environment"` | API tests `reuseAutoDisputes`, `geofenceAutoDisputes` · **FIX** Junk proof, nobody watching the dispute window | `approve_task` / `dispute_task` tools; the API auto-disputes on schema/geofence failure; `disputeWindow` per task | `test_AutoRelease_AfterWindow`, `test_Dispute_InsideWindow` · **FIX** Claim-and-vanish, stranded task | Lazy expiry inside `claimFor`; cooldown after an expired claim | `test_Claim_LazyExpiry`, `test_Claim_CooldownAfterExpiry` · **DOC** GPS spoofing | "GPS is self-reported and spoofable; we anchor it, geofence it, and dispute outside the radius — we do not prove it."

> **T-01 (frozen) rows:** `GET /tasks?area=&lat=&lon=` | worker-session | → `{tasks:[{task_id, task_type, title, price_usdc, distance_m?, claim_expires_in_s?, state, seeded}]}` (open + lazily-expirable) · `POST /tasks/:id/claim` | worker-session | → `{tx, claim_expires_at, submit_deadline}`; **409** `InCooldown | AlreadyClaimed | SeededCannotClaimExternal` · `POST /tasks/:id/release-claim` | worker-session | → `{tx}` · `POST /tasks/:id/submit` | worker-session | `{proofHash, answer, note?}` (+ per-type proof fields) → `{tx, status: 'submitted' | 'disputed', auto_dispute_reason?}` · `POST /tasks/:id/report` | worker-session | `{class}` → `{recorded:true}` (optional feature) · `GET /me/earnings` | worker-session | → `{released_usdc, completed, score, distinct_raters}` (earned-only: sums `TaskReleased` to this worker) · `POST /admin/sweep` | admin-key | → `{ok:true, tx?}`; every call audit-logged.

**Path note.** The list route lives at **`GET /tasks/list?area=&lat=&lon=`** (`apps/api/app/tasks/list/route.ts`) so that T-16's `apps/api/app/tasks/route.ts` stays POST-only and no file is shared. The frozen table spells it `GET /tasks?area=`; the lead's `interface-change` PR renames it (see §13). Build against `/tasks/list`.

## 2. Exact scope
**PR1**
- `GET /tasks/list` (`maxDuration = 60`): `requireWorkerSession`; `area?` (geohash5), `lat?/lon?`; rows from `tasks` where `state = 'open'`, or `state = 'claimed'` and `claimed_at + claim_ttl_s < now` (lazily expirable — shown as `state:'open'` with `claim_expires_in_s: 0`), **plus** the caller's own active claim (state `claimed`, worker = caller) so a reload resumes. If `chain.isSeeded(caller)` only tasks whose payer is allowlisted are returned. Item: `{task_id, task_type, title, price_usdc, distance_m?, claim_expires_in_s?, state, seeded, brief}` — `title` = `"<task_type> · <place.name> · <place.street_address>"` (compare-two: `"compare-two · <criterion_id>"`), `price_usdc` = the worker's amount (3.00, never 3.45), `distance_m` = haversine from `lat/lon` to `tasks.exact_lat/lon` rounded to metres, `seeded = chain.allowlistedBuyer(payer)` (cached per payer per request), `brief = workerBrief(task)`: place `{name, street_address, locality}` and the question fields only (`question` / `subject`, `subject_detail` / `phone`, `template_question`, `slots` / `a`, `b`, `criterion_id`) — never `claimed_open`, `claimed_hours`, `claimed_state`, `source`. Calls `sweepIfDue()` (PR2; PR1 ships a no-op) before reading.
- `POST /tasks/:id/claim` (`maxDuration = 60`): pre-checks from chain reads — `isWorker(caller)` else 403; `cooldownUntil(caller) > now` → 409 `{error:'InCooldown', cooldown_until}`; `activeClaimOf(caller) != 0` → 409 `{error:'AlreadyClaimed', active_task_id}`; task state not claimable (neither `Open` nor expirable `Claimed`) → 409 `{error:'AlreadyClaimed'}`; `isSeeded(caller) && !allowlistedBuyer(task.buyer)` → 409 `{error:'SeededCannotClaimExternal'}`; then `txq.claimFor(taskId, caller)`; a chain revert named `InCooldown|AlreadyClaimed|SeededCannotClaimExternal` maps to the same 409s. Reconcile the row from `chain.getTask` after the tx; respond `{tx, claim_expires_at, submit_deadline}` (ISO; `claimedAt + claimTTL`, `claimedAt + submitTTL`).
- `POST /tasks/:id/release-claim`: state `claimed` by caller else 409 `conflict`; `txq.releaseClaimFor(taskId, caller)`; row → `open`; `{tx}`.
- `POST /tasks/:id/submit` (`maxDuration = 60`): state `claimed` by caller and `now ≤ claimedAt + submitTTL` else 409 `conflict`; body parsed with the per-type proof schema from `@legwork/shared` (`VerifyOpenProof` / `PhotoOfProof` / `CallConfirmProof` / `CompareTwoProof`, `photo_hash === proofHash` for the photo types); photo types require a `proofs` row with `hash = proofHash` and `worker = caller` (else 400 `invalid_request`, field `proofHash`); for `call-confirm`/`compare-two` the server computes `proofHash = keccak256(canonicalJson(proof body))` and uses that. PR1 flow: `txq.submitFor(taskId, caller, proofHash)`; row → `submitted`, `proof_hash`, `submitted_at`; set `proofs.task_id`, `proofs.place_id`; insert `observations` (`claim = {type, value: answer, note?}`, `evidence_hash = proofHash | null`, `worker_nullifier`, `observed_at`, `confidence`, `task_id`, `seeded`); respond `{tx, status:'submitted'}`. Confidence: `0.9` photo types with GPS; `0.6` GPS downgrade; `0.5` call-confirm; a seeded row carries `0` (the shared observation schema's own rule). `compare-two` writes **no** `observations` row — the shared schema marks it `notApplicable` and the table needs a place; the choice and the reason live on `tasks.answer`/`tasks.note` (settled in #74's review).
- `POST /tasks/:id/report` `{class}` (one of the six labels): `screening_log` row `{task_type, class, reason:'worker report', rule_id:'worker-report', spec_hash, marked:false}`; `{recorded: true}`. Never marks.
- `GET /me/earnings`: `released_usdc` = Σ `amount_usdc` of `tasks` with `worker = caller` and state `released` or resolved-to-worker (earned only — never posted or escrowed amounts); `completed`, `score`, `distinct_raters` from `chain.reputation.{completed,score,distinctRaters}(nullifier)`.
- `lifecycle.ts`: `loadTask`, `assertClaimableBy`, `mirrorFromChain(row, chainTask)`, `workerBrief`, `titleOf`, `claimDeadlines`; every state comparison uses the shared `TaskState` names.

**PR2**
- `proofChecks.ts`: `checkReuse({proofHash, task}) → {hit: true, other_task_id} | {hit: false}` — a `proofs` row with this hash whose `task_id` is another task with the same `place_id` and `task_type`, or another `tasks` row with `proof_hash = proofHash` for that place/type; `checkGeofence({proof, task}) → {hit: true, distance_m} | {hit: false} | {skipped: 'gps_unavailable'}` — haversine between `proofs.exact_lat/lon` and `tasks.exact_lat/lon` `≥ GEOFENCE_M (150)`; `gps: null, gps_unavailable: true, worker_confirmed_at_place: true` → `skipped`, accepted, confidence `0.6`.
- Submit with checks: after `submitFor`, if either check hits → `txq.dispute(taskId)`, row → `disputed`, `screening_log` row `{rule_id: 'submit-reuse' | 'submit-geofence', reason, spec_hash, task_type, marked:false}`, `observations.confidence = 0.1`; respond `{tx, status:'disputed', auto_dispute_reason: 'proof_reuse' | 'geofence', dispute_tx}`. Never a revert, never a refusal to submit.
- `sweeper.ts`: `sweep({db, chain, txq, clock}) → {expired: number[], auto_released: number[]}` — after `reconcileOpen`, for non-final rows: `open && now > posted_at + claim_ttl` → `txq.expire`; `claimed && now > claimed_at + submit_ttl` → `txq.expire`; `submitted && now ≥ submitted_at + dispute_window` → `txq.autoRelease`; every result mirrored to the row; each revert logged and skipped. `sweepIfDue()` — at most once per 30 s per instance, called from the list route. `POST /admin/sweep`: `requireAdminKey` **or** header `X-Sweep-Secret === SWEEP_SECRET` (for a cron); `admin_audit` row; `{ok: true, expired, auto_released}`.
- `reconcile.ts`: `reconcileTask(id)` and `reconcileOpen()` — `chain.getTask` for every non-final row; mirror `state, worker, claimed_at, submitted_at, proof_hash`; log a `state_drift` line when the mirror disagreed.

## 3. Out of scope
- `POST /tasks` — **T-16** (its file is POST-only; do not add a GET there). `GET /tasks/:id`, approve/dispute/refund, `/public/**`, `/admin/**` except `sweep` — **T-19**. `/proofs` upload, EXIF, signed URLs, `round100m` — **T-18** (this task reads `proofs` rows, it never writes files). Sessions, wrapper, DB client — **T-08**.
- Do not touch: `apps/api/app/tasks/route.ts`, `apps/api/app/tasks/[id]/route.ts`, `apps/api/app/proofs/**`, `apps/api/src/db/schema.ts`, `apps/api/src/{config,log,errors,session,chain}.ts`, `packages/**`.

## 4. Owned paths
```
apps/api/app/tasks/list/**
apps/api/app/tasks/[id]/{claim,release-claim,submit,report}/**
apps/api/app/me/**
apps/api/app/admin/sweep/**
apps/api/src/services/{lifecycle,proofChecks,sweeper,reconcile}.ts
apps/api/src/services/{lifecycle,proofChecks}.test.ts
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `TxQueue.{claimFor, releaseClaimFor, submitFor, dispute, expire, autoRelease}` → `{tx}`; `ChainAdapter.{isWorker, isSeeded, getTask, activeClaimOf, cooldownUntil, allowlistedBuyer, reputation}`; `FakeChain` (`setNow/advance`, `calls`, `failNext`, revert names) | `@legwork/chain` via `apps/api/src/chain.ts` (T-07/T-08) | names mirror the frozen Solidity functions; reverts carry `errorName` |
| `requireWorkerSession`, `requireAdminKey`, `route`, `ApiError`, `getDb`, `getConfig`, `logger`, `createTestDb`, `setChainForTests`, `call` | `apps/api/src/**`, `apps/api/test/**` (T-08) | session `{worker, nullifier, mode}`; envelope codes |
| Proof schemas, `TaskState`, `TaskType`, `TASK_TYPE_BIT`, `GEOFENCE_M`, `CALL_CONFIRM_TEMPLATES`, `AbuseClass`, `specHash` | `@legwork/shared` (T-01) | per-type proof shapes; `gps === null ⇔ gps_unavailable === true` |
| Tables `tasks`, `proofs`, `observations`, `screening_log`, `admin_audit`, `posters` | `apps/api/src/db/schema.ts` (T-01, frozen) | `proofs (hash PK, storage_key, captured_at, exact_lat/lon/accuracy, gps_unavailable, worker, task_id, place_id)`; `tasks.exact_lat/lon` = the place coordinate written by T-16 |
| Env | `.env.example` | `SWEEP_SECRET`, `DASHBOARD_URL` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `GET /tasks/list`, claim, release-claim, submit, report, `GET /me/earnings` | `apps/api/app/**` | mini-app (lane D), CLI worker, T-19 (reads the mirrored rows) |
| `workerBrief`, `mirrorFromChain`, `claimDeadlines` | `apps/api/src/services/lifecycle.ts` | T-19 (`GET /tasks/:id` mirrors the same way) |
| `checkReuse`, `checkGeofence` | `apps/api/src/services/proofChecks.ts` | dashboard copy (T-4x quotes the rule ids) |
| `sweep`, `sweepIfDue`, `POST /admin/sweep` | `apps/api/src/services/sweeper.ts`, `apps/api/app/admin/sweep/**` | T-19 (`refund` reuses the eligibility predicate), Vercel cron |
| `reconcileTask`, `reconcileOpen` | `apps/api/src/services/reconcile.ts` | T-19 long-poll (optional call) |
| `observations` rows with `claim.note` | DB | T-19 (`WorkerAnswer`), public feed |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-17` — it must print `CLAIMED T-17`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read the frozen `ITaskEscrow` rules for `claimFor`/`submitFor`/`expire`/`autoRelease` (T-01 §2), the `tasks`/`proofs`/`observations` columns, T-08's `session.ts` and `test/app.ts`, T-07's `FakeChain` README.
2. PR1: `lifecycle.ts` with unit tests for `assertClaimableBy` and `workerBrief` (no `claimed_*`/`source` leaks); then list, claim, release-claim, submit (no checks), report, earnings; `claimCooldownSurfaced`.
3. Open PR1. PR2: `proofChecks.ts` with `reuseAutoDisputes`, `geofenceAutoDisputes`, `gpsDowngradeAccepted` on pglite + `FakeChain`; wire into submit.
4. `reconcile.ts`, `sweeper.ts`, `sweeperAutoReleasesAfterWindow`; `sweepIfDue` in the list route; `POST /admin/sweep`. Run §9.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `reuseAutoDisputes` | two tasks A (released, `proof_hash = H`, place P, type `photo-of`) and B (claimed by worker W, same P and type): `POST /tasks/B/submit` with `proofHash: H` → 200 `{status:'disputed', auto_dispute_reason:'proof_reuse', dispute_tx}`; `FakeChain.calls` = `submitFor(B, W, H)` then `dispute(B)`; `screening_log` row `rule_id 'submit-reuse'`; a different hash for a different place is `submitted` |
| `geofenceAutoDisputes` | `tasks.exact_lat/lon = (39.74362, -8.80713)`, proof at 200 m north → `status:'disputed'`, `auto_dispute_reason:'geofence'`, `dispute` called after `submitFor`; a proof at 80 m → `submitted`, no `dispute` call |
| `gpsDowngradeAccepted` | proof body `gps: null, gps_unavailable: true, worker_confirmed_at_place: true` → 200 `{status:'submitted'}`, no `dispute`, `observations.confidence === 0.6`; `gps: null, gps_unavailable: true, worker_confirmed_at_place: false` → 400 `invalid_request`; `gps: {…}, gps_unavailable: true` → 400 |
| `sweeperAutoReleasesAfterWindow` | a `submitted` task with `dispute_window 120`: `sweep()` at +119 s → no call; at +120 s → `autoRelease(id)` called once, row `released`; an `open` task at `posted_at + claim_ttl + 1` → `expire(id)`; a second `sweep()` makes no further calls |
| `claimCooldownSurfaced` | `FakeChain.cooldownUntil(W) = now + 900` → claim → 409 `{error:'InCooldown', cooldown_until}`, no `claimFor` call; with cooldown 0 but the fake reverting `InCooldown` → the same 409; a seeded W on a non-allowlisted buyer → 409 `SeededCannotClaimExternal`; happy path → `{tx, claim_expires_at, submit_deadline}` and the row `claimed` |
| `pnpm --filter @legwork/api test -- -t workerBriefNeverLeaksClaims` | `workerBrief` output has no `claimed_open`, `claimed_hours`, `claimed_state`, `source` key for any of the four fixture specs |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/api typecheck && pnpm --filter @legwork/api test -- -t "reuseAutoDisputes|geofenceAutoDisputes|gpsDowngradeAccepted|sweeperAutoReleasesAfterWindow|claimCooldownSurfaced"
pnpm --filter @legwork/api test -- -t reuseAutoDisputes
grep -rn "writeContract\|sendTransaction" apps/api/app/tasks apps/api/app/me apps/api/src/services   # must print nothing
grep -rn "spec_json" apps/api/src/services/lifecycle.ts | grep -i "log"                             # must print nothing
scripts/ci/banned-words.sh apps/api
```
Expected: five named tests (plus `workerBriefNeverLeaksClaims`) green; both greps print nothing.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. (Write "reuse" or "seen before", never the past participle.)
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). The worker list and `/me/earnings` show **3.00**; units `3_000_000`.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git. `SWEEP_SECRET` is compared with `timingSafeEqual` and never logged.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted): pglite + `FakeChain` only.
- Every chain write via `TxQueue`: `claimFor`, `releaseClaimFor`, `submitFor`, `dispute`, `expire`, `autoRelease`. No direct `viem` write anywhere in owned files.
- Never log raw spec text: log `task_id`, `spec_hash`, `rule_id`. The worker `brief` is the only spec-derived text that leaves the server, and only to a worker-session.
- `agentId` is never trusted from the body — no route here reads one.
- Schema errors never mark; auto-disputes never mark either (they are outcomes, not refusals): `markIfIdentified` is never imported here.
- An auto-dispute is **submit then dispute**, both onchain — never a refusal to submit, never a silent drop; `auto_dispute_reason` names it and the log records it.
- GPS downgrade is accepted and labelled (`confidence 0.6`, `gps_unavailable: true` on every later surface) — "GPS is self-reported and spoofable; we anchor it, geofence it, and dispute outside the radius — we do not prove it."
- `/me/earnings` is earned-only: released amounts to this worker; never escrowed, never posted.
- The chain is the truth: after every write the row is re-read from `chain.getTask`, never guessed from the request.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed; two PRs, PR1 merged before PR2.
- [ ] Verification output from §9 pasted into each PR.
- [ ] Route documentation as a comment block at the top of `lifecycle.ts` (`apps/api/README.md` is T-08's).
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-17 (PR1 | PR2) — Worker routes — list, claim, submit, earnings; submit-time checks and sweeper
owned-paths:
  - apps/api/app/tasks/list/**
  - apps/api/app/tasks/[id]/{claim,release-claim,submit,report}/**
  - apps/api/app/me/**
  - apps/api/app/admin/sweep/**
  - apps/api/src/services/{lifecycle,proofChecks,sweeper,reconcile}.ts
  - apps/api/src/services/{lifecycle,proofChecks}.test.ts
Scope confirmed: every §2 bullet of this PR done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

Known gaps to raise as written:
- `INTERFACE REQUEST: docs/api.md — GET /tasks?area= becomes GET /tasks/list?area=&lat=&lon=; list items gain brief (place + question fields) and include the caller's own active claim; submit response gains dispute_tx?; claim 409 body is {error: <name>, cooldown_until? | active_task_id?}`.
- `INTERFACE REQUEST: observations.claim carries {type, value, note?}` — the ≤120-char note has no other column.
- `INTERFACE REQUEST: T-07 TxQueue reverts must expose errorName` — needed to map `InCooldown | AlreadyClaimed | SeededCannotClaimExternal`.
- Proof rows are written by T-18; if T-18 is not merged when PR2 starts, insert `proofs` rows directly in the tests (the table is frozen) and say so in the PR.

## 14. Reviewer notes
Open `submit/route.ts` first: `submitFor` **before** `dispute`; the `proofs` row must belong to the caller; the downgrade branch accepted with `0.6`. Then `lifecycle.ts` `workerBrief`: no `claimed_*`, no `source`. Then `sweeper.ts`: `reconcileOpen` before the deadline math; `autoRelease` at `≥`, `expire` at `>` (the contract's operators). Most likely wrong: an auto-dispute implemented as a 4xx instead of submit-then-dispute; `price_usdc` showing 3.45 in the worker list; the list route adding a GET to `apps/api/app/tasks/route.ts`; a sweep that trusts the mirror without reconciling first.

## 15. Round 2+
—
