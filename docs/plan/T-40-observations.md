---
id: T-40
title: Observations — record per completed task + verify-open delta
lane: B
day: 5
size: S
agent_class: C
must: false
depends_on: [T-17]
owned_paths:
  - apps/api/src/services/observations.ts
  - apps/api/src/services/observations.test.ts
  - apps/api/app/public/observations/**
labels: [area:api, wave:5, size:S, agent:cloud]
branch: t-40/observations
---

# T-40 — Observations — record per completed task + verify-open delta

## 1. Context
Every task Legwork completes is a fact about a place at a time: "Farmácia Central was closed at 14:32 on the 12th, photo hash 0x…, worker verified, GPS inside the fence". The `Observation` record is that fact with the task stripped away, so it can be re-checked or sold later without a marketplace, and so the dashboard can say the one line the deck promises: "we checked N places; the listing was wrong about M". This task materialises one `Observation` per completed task from the `tasks` and `proofs` rows T-17's submit/release path writes, applies the stated confidence rule, excludes seeded rows from every aggregate, and serves `GET /public/observations`. Optional: drop first if behind; nothing depends on it except a dashboard tile (T-26).

> **10-schemas.md §8 — The `Observation` record (the task is its wrapper):** Every completed task appends one place-keyed observation so a record can be sold or re-checked without a marketplace: `{ observation_id, place_key: "node/2734018563", claim: { type: "open_now | hours | item_in_stock | price | payment | reservation | photo", value: "closed" }, evidence_hash: "keccak256 (photo) | null (call-confirm)", worker_nullifier: "0x…", observed_at: "2026-09-12T14:32:10Z", confidence: 0.9, task_id, seeded: false }`. Confidence (v0 rule, stated): verified human + photo + GPS inside the ~150 m fence + inside the TTLs → **0.9**; GPS downgraded → **0.6**; `call-confirm` (self-reported) → **0.5**; `compare-two` → n/a (judgement, not observation); any seeded row → **0** and excluded from every aggregate. The subgraph indexes `place_key`, `claim.type`, `observed_at`, `seeded` and a `geohash5` — never the exact coordinate, never a nullifier-keyed movement history.

> **T-01 — `Observation` schema:** `observation_id, place_key, claim{type,value}, evidence_hash|null, worker_nullifier, observed_at, confidence, task_id, seeded`. **`VerifyOpenSpec`:** `place, question: 'open_now', claimed_open: boolean | null, claimed_hours: string ≤ 60 | null, source: 'google'|'osm'|'own-list'|'website'|'other'|'none'`.

## 2. Exact scope
- `observations.ts` exports `buildObservation(input: ObservationInput): Observation | null` — pure. `ObservationInput = { task: TaskRow; proof: ProofRow | null; workerSeeded: boolean; workerNullifier: Hex }` (row types from `apps/api/src/db/schema.ts`). Returns `null` for `compare-two` (n/a) and for any task whose state is not `Released` or `Resolved` with `toBuyer = false`; never for `Refunded`, `Disputed` or `Resolved` to the buyer.
- Field rules: `observation_id = 'obs-' + task_id` (deterministic — one per task); `place_key = spec.place.place_id`; `claim.type` by task type — `verify-open` → `open_now`; `photo-of` → `photo`; `call-confirm` by `template_id`: `open_now → open_now`, `have_item → item_in_stock`, `price_of → price`, `accepts_payment → payment`, `closes_at_today → hours`, `takes_reservation → reservation`; `claim.value` = the worker's enum answer (`open|closed|unclear`, `captured|not_found|refused_by_staff`, or the template's answer enum) — never the note; `evidence_hash = proof.hash` for photo types, `null` for `call-confirm`; `observed_at = proof.captured_at` (photo) or the `called_at` from the submit, else `submitted_at`; `seeded = workerSeeded`.
- Confidence rule, in this order: `seeded` → **0**; `call-confirm` → **0.5**; photo type with `gps_unavailable === false`, `haversine(proof.exact_lat/lon, task.exact_lat/lon) ≤ GEOFENCE_M` (150), `proof.accuracy_m ≤ GEOFENCE_M`, and inside the TTLs (`captured_at` within `[claimed_at − 60 s, submitted_at + 60 s]` and `submitted_at ≤ claimed_at + submit_ttl_s`) → **0.9**; photo type otherwise (`gps_unavailable`, accuracy above the fence, outside the fence but approved, or outside the TTL window) → **0.6**.
- `recordObservation(taskId, deps)` — idempotent upsert into `observations` keyed by `observation_id`; `syncObservations(deps)` — finds completed tasks with no observation row and records them (one query, bounded to 200 per call). Deps: `{ db, chain, now }` injected; `workerSeeded` from `IWorkerRegistry.isSeeded(worker)` and `workerNullifier` from `nullifierOf(worker)` through the chain reader (cached per worker for the process; a seeded flag never flips except by `resetWorker`).
- `listingDelta(rows, specs)` — pure. Over **non-seeded** `open_now` observations from `verify-open` tasks whose `claimed_open !== null` and `claim.value !== 'unclear'`, latest per `place_key`: `checked_places` = distinct places; `wrong_listings` = places where `claimed_open === true && value === 'closed'` or `claimed_open === false && value === 'open'`; `by_source` = the same pair per `source`; `sentence` = `we checked ${checked_places} places; the listing was wrong about ${wrong_listings}`. `claimed_open`, `claimed_hours` and `source` are read from `tasks.spec_json` **inside the service** and never returned.
- `apps/api/app/public/observations/route.ts`: `GET /public/observations?place_id=&include_seeded=` → calls `syncObservations` (lazy materialisation, like the escrow's lazy claim expiry) then answers `{ place_id?: string, delta: { checked_places, wrong_listings, by_source, sentence }, observations: PublicObservation[] }` where `PublicObservation` = the `Observation` **minus** `worker_nullifier`, **plus** `worker_verified: boolean` (= `!seeded`). Without `place_id`: the delta plus the 50 most recent non-seeded observations. `include_seeded=1` adds seeded rows to `observations` (each `seeded: true, confidence: 0`) — the delta never changes. `place_id` must match `^(node|way|relation)/\d+$`, else 400 `{error:'invalid_request', field:'place_id', reason}`. `Cache-Control: public, max-age=30`.
- Never in the response: exact coordinates (the record has none), raw spec text, notes, buyer tokens, payer or agent identities, nullifiers.

## 3. Out of scope
- Writing `tasks`/`proofs` rows, submit, auto-dispute, release — **T-17**. The dashboard tile that renders the sentence — **T-26**. Indexing observations in the subgraph — **T-08** (not in v0's `schema.graphql`; see §13).
- Selling or exporting records; any per-nullifier history endpoint (explicitly refused by 10-schemas §8).
- Do not touch: `apps/api/app/**` other than `apps/api/app/public/observations/**`, `apps/api/src/db/**`, `packages/shared/**`, `apps/api/src/services/*` other than `observations.ts` / `observations.test.ts`.

## 4. Owned paths
```
apps/api/src/services/observations.ts
apps/api/src/services/observations.test.ts
apps/api/app/public/observations/**
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `Observation` schema | `packages/shared/src/schemas/*` | the nine fields above; parse every built record with it before writing |
| `VerifyOpenSpec`, `PhotoOfSpec`, `CallConfirmSpec`, `CALL_CONFIRM_TEMPLATES`, proofs | `packages/shared/src/schemas/*` | `claimed_open`, `claimed_hours`, `source`; `subject`; `template_id` → answer enum; `VerifyOpenProof.gps: {lat, lon, accuracy_m} \| null`, `gps_unavailable`, `captured_at`, `answer` |
| `GEOFENCE_M = 150`, `DEFAULT_SUBMIT_TTL_S`, `PUBLIC_COORD_DECIMALS` | `packages/shared/src/constants.ts` | the fence; TTL defaults; never emit a coordinate at all |
| Tables `tasks`, `proofs`, `observations` | `apps/api/src/db/schema.ts` | `tasks(... state, posted_at, claimed_at, submitted_at, released_at, claim_ttl_s, submit_ttl_s, worker, spec_json, exact_lat/lon ...)`; `proofs(hash, captured_at, exact_lat/lon/accuracy, gps_unavailable, worker, task_id, place_id)`; `observations` as declared |
| `IWorkerRegistry.isSeeded(address)`, `nullifierOf(address)` | `packages/shared/src/abi/WorkerRegistry.json` via T-13's reader; `FakeChain` in tests | seeded flag and nullifier per worker |
| Drizzle client, chain reader | the modules T-17/T-19 import in `apps/api/app/tasks/[id]/submit/route.ts` | never a second client |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `buildObservation(input) → Observation \| null`, `confidenceFor(input) → 0 \| 0.5 \| 0.6 \| 0.9` | `apps/api/src/services/observations.ts` | route, tests, T-26 |
| `recordObservation(taskId, deps)`, `syncObservations(deps)` | `apps/api/src/services/observations.ts` | route; `/admin/sweep` (lead's optional one-liner) |
| `listingDelta(rows, specs)`, `ListingDelta` | `apps/api/src/services/observations.ts` | route, T-26 tile |
| `GET /public/observations?place_id=&include_seeded=` | `apps/api/app/public/observations/route.ts` | T-26, judges |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-40` — it must print `CLAIMED T-40`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `apps/api/src/db/schema.ts` (`tasks`, `proofs`, `observations`), the `Observation` schema, and T-17's submit/release code to learn which columns hold `captured_at`, `called_at`, `answer` and the release state; keep the client imports T-17 uses.
2. `confidenceFor` + `buildObservation` as pure functions first, with a fixture builder `mkTask({task_type, state, ...})` / `mkProof({...})` in the test file; place coordinate for fixtures: Leiria, `39.7436, -8.8071`; a proof 80 m away vs 400 m away (compute with the same haversine).
3. `listingDelta` pure; then `recordObservation`/`syncObservations` over pglite with `FakeChain` for `isSeeded`/`nullifierOf`.
4. The route; a route test with three non-seeded observations, one seeded, and `place_id` filtering.
5. Run §9.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `confidenceRule` | released `verify-open`, verified worker, photo, GPS 80 m from the place, `accuracy_m: 25`, captured between claim and submit → **0.9**; same with `gps_unavailable: true` (GPS `null`, `worker_confirmed_at_place: true`) → **0.6**; same with the proof 400 m away but released → **0.6**; same with `accuracy_m: 300` → **0.6**; `captured_at` 10 min before `claimed_at` → **0.6**; released `call-confirm` → **0.5** with `evidence_hash: null` and `claim.type` mapped from `template_id` for all six templates; `compare-two` → `null`; seeded worker → **0**, `seeded: true`; `Refunded` and `Resolved` to buyer → `null`; every non-null record parses with the `Observation` schema and `observation_id === 'obs-' + task_id` |
| `seededExcludedFromAggregates` | five observations (3 real, 2 seeded, all `verify-open` with `claimed_open: true`, answers `closed, closed, open, closed, closed`): `listingDelta` → `checked_places: 3, wrong_listings: 2`, `by_source` sums equal the totals, the sentence is `we checked 3 places; the listing was wrong about 2`; the seeded rows change nothing; the route without `include_seeded` returns 3 rows, with `include_seeded=1` returns 5 with the two carrying `seeded: true, confidence: 0`; the delta is identical in both responses |
| `verifyOpenDelta` | `claimed_open: null` rows and `value: 'unclear'` rows count in neither `checked_places` nor `wrong_listings`; two observations of the same place use the latest; `claimed_open: false` + `open` counts as wrong; `photo-of` and `call-confirm` observations never enter the delta |
| `publicObservationShape` | the route body has no key `worker_nullifier`, no `lat`/`lon`/`exact_*`, no `note`, no `spec`, no `payer`, no `agent_id`; each row has `worker_verified` as a boolean; `place_id=foo` → 400 `{error:'invalid_request', field:'place_id'}`; `syncObservations` on a released task with no row inserts exactly one and a second call inserts none |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/api typecheck && pnpm --filter @legwork/api test -- observations
grep -rn "worker_nullifier\|exact_lat\|exact_lon\|spec_json" apps/api/app/public/observations   # must print nothing (the route returns PublicObservation only)
grep -rn "process.env" apps/api/src/services/observations.ts   # must print nothing
scripts/ci/banned-words.sh apps/api/src/services/observations.ts apps/api/app/public/observations
```
Expected: four §8 tests green; both `grep`s print nothing; banned-words clean.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate) — observations carry no money; never add a price field.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git. This task reads no key and no env.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted): pglite + `FakeChain` only.
- The public route never returns an exact coordinate, raw spec text, a note, a buyer token, a payer, an agent id or a nullifier. `PUBLIC_COORD_DECIMALS` is irrelevant here because no coordinate is emitted at all.
- Seeded rows are stored with `confidence 0`, labelled `seeded: true`, and excluded from every aggregate; the sentence never counts them. Copy near the sentence says "real observations only; seeded rows excluded".
- Confidence values are exactly `0`, `0.5`, `0.6`, `0.9` — no interpolation, no other value; `call-confirm` records are labelled as "self-reported answer + timestamp (unverified)" wherever a description is shown.
- `agentId` is never trusted from the body and screening errors never mark — this task touches neither path; it reads completed tasks only.
- `claim.value` is an enum; worker notes never enter an observation.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] Behaviour notes for T-26 (response shape, the sentence) in the PR description — no README is owned here.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-40 — Observations — record per completed task + verify-open delta
owned-paths:
  - apps/api/src/services/observations.ts
  - apps/api/src/services/observations.test.ts
  - apps/api/app/public/observations/**
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

Known gaps to raise as written (do not resolve them yourself):
- `INTERFACE REQUEST: api-contract.ts has no GET /public/observations route; this task ships {place_id?, delta, observations: PublicObservation[]} with PublicObservation = Observation minus worker_nullifier plus worker_verified.`
- `INTERFACE REQUEST: observations table lacks <column>` — only if `schema.ts` cannot hold the nine fields (list the missing column; do not store JSON blobs as a workaround).
- `INTERFACE REQUEST: tasks has no called_at column for call-confirm; this task uses submitted_at as observed_at for call-confirm` — raise if true; the fallback is this brief's decision.
- `INTERFACE REQUEST: subgraph/schema.graphql has no Observation entity (10-schemas §8 says the subgraph indexes place_key, claim.type, observed_at, seeded, geohash5)` — raise for T-08; not built here.

## 14. Reviewer notes
Open `confidenceFor` first: order of checks (seeded before everything), the fence uses `GEOFENCE_M`, the TTL window is applied. Then the route: `PublicObservation` mapping strips `worker_nullifier`; `spec_json` is read only inside `listingDelta`'s loader. Most likely wrong: `0.9` granted with `gps_unavailable: true`; seeded rows leaking into `checked_places`; `unclear` counted as wrong; `observation_id` random (breaking idempotency); `claim.value` carrying the note.

## 15. Round 2+
—
