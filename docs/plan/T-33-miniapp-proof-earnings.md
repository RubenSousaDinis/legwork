---
id: T-33
title: Mini-app proof flow + earnings — capture, GPS downgrade, submit, paid state
lane: D
day: 3
size: M
agent_class: C
must: true
depends_on: [T-25, T-18]
owned_paths:
  - apps/miniapp/app/proof/**
  - apps/miniapp/app/earnings/**
  - apps/miniapp/lib/gps.ts
  - apps/miniapp/tests/proof/**
labels: [area:miniapp, wave:3, size:M, agent:cloud]
branch: t-33/miniapp-proof-earnings
---

# T-33 — Mini-app proof flow + earnings

## 1. Context
This is the beat the whole submission rests on: a real person photographs the door, the app records where and when, the relayer submits, and the escrow releases 3.00 USDC to the worker while the agent's 0.45 fee goes to the treasury. Video beat 7: "Hand framing the hours sign; photo + GPS ±80 m + timestamp; SUBMIT. One continuous shot: LOCKED 3.45 → RELEASED 3.00 to the worker + 0.45 fee." The GPS downgrade is mandatory scope, not a fallback: World App exposes no location permission, so `getCurrentPosition` may fail, and the pre-decided path is photo + server timestamp + the worker's tapped confirmation, disclosed. The earnings page shows only what this account actually earned.

> 02-architecture: "capture via `<input type="file" accept="image/*" capture="environment">` … → GPS via `getCurrentPosition` with a 10 s timeout and the pre-decided downgrade (photo + server timestamp + the worker's tapped confirmation; dashboard chip 'GPS unavailable in webview — disclosed'; a feedback-doc entry) → upload to `/proofs` → relayed submit → earnings showing **only what the account actually earned**, with a 'testnet USDC — not spendable' chip. Copy on the capture screen: 'you are paid for the proof, not the answer — 'closed' pays the same as 'open'' and 'don't photograph people'."

> 09-design-prompt, Screen 3: "Camera capture with the photo thumbnail, GPS ±80 m, timestamp 14:32, the yes/no answer toggle ('open now?' — No selected), copy line … SUBMIT; then the paid state: 'Released · 3.00 USDC' with the tx chip, 'testnet USDC — not spendable', and the line '+1 completed'. **Earned-only rule:** the filmed worker account shows only what it actually earned — no seeded balance, no seeded score, no completion count the account did not do. Never show a paid state without the proof above it."

> 10-schemas, downgrade variant: "`gps: null`, `gps_unavailable: true`, `worker_confirmed_at_place: true`, `captured_at` from the server; dashboard chip 'GPS unavailable in webview — disclosed'; `Observation.confidence` drops [to 0.6]."

## 2. Exact scope
- `app/proof/[id]/page.tsx` (`/proof/<task_id>`): `requireVerified()`; requires `readActiveClaim().task_id === id`, else redirect `/tasks`. Header shows the claimed task's title, type tag and `Countdown` to `submit_deadline` (label `submit within`).
- Step 1 — capture: `<input type="file" accept="image/*" capture="environment">` behind a 56 px primary label `Take the photo`; on change, re-encode through a canvas to JPEG, long edge ≤ 1600 px, quality 0.85 (`app/proof/image.ts`; strips EXIF as a side effect and keeps uploads under Vercel's 4.5 MB body limit); show the thumbnail (object URL, 4:3 box ≤ 320 px tall) with `Retake`. The copy lines `you are paid for the proof, not the answer — 'closed' pays the same as 'open'` and `don't photograph people` sit directly under the capture button, 16 px, always visible before submit.
- Step 2 — location (`lib/gps.ts`): `getPosition(): Promise<GpsResult>` calling `navigator.geolocation.getCurrentPosition` with `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }`; `GpsResult = { ok: true; lat; lon; accuracy_m } | { ok: false; code: 'timeout' | 'denied' | 'unavailable' | 'unsupported' }`. Starts automatically after capture; UI "Getting your location (up to 10 s)"; success → `±<accuracy_m> m` and the coordinate rounded to 3 decimals; failure → the downgrade panel: "Location unavailable in this webview — disclosed on the receipt", `Button variant="ghost"` `I am at the place` → sets `gps_unavailable: true`, `worker_confirmed_at_place: true`, chip `GPS unavailable in webview — disclosed`. `Retry location` stays available. A photo is required in both paths; a location is never required.
- Step 3 — answer, by type, as segmented 44 px buttons (one selected, none preselected): `verify-open` → question `open now?` with `open | closed | unclear`; `photo-of` → `captured | not_found | refused_by_staff`; `call-confirm` → `Button` `I called` (records `called_at` client-side for display; the server timestamps) then the template's answer enum from `CALL_CONFIRM_TEMPLATES` — the task's `template_id` is not in the API shapes (see §13), so show a picker "Which question did the task ask?" over the six rendered questions, then that template's enum (`yes | no | no_answer`, `yes | no | unknown | no_answer`, `{amount, currency} | unknown | no_answer`, `HH:MM | closed_today | no_answer`); label the whole block `self-reported answer + timestamp (unverified)`; `compare-two` → `a | b | neither` + `reason` (≤ 120, required) — the two-image view is T-42; here a plain toggle. Optional `note` ≤ 120 chars with a counter (`NOTE_MAX_CHARS`).
- Step 4 — SUBMIT (`Button variant="primary" size="lg" full`, enabled only when photo + answer (+ location or confirmation) exist): `POST /proofs` multipart `file` + `lat, lon, accuracy_m` **or** `gps_unavailable=true, worker_confirmed_at_place=true` → `{proofHash, url, captured_at}`; then `POST /tasks/:id/submit` with `{proofHash, answer, note?}` plus the per-type proof fields exactly as `api-contract.ts` defines them (`captured_at`, `gps | null`, `gps_unavailable`, `worker_confirmed_at_place`; `called_at`; `choice`/`reason`) → `{tx, status: 'submitted' | 'disputed', auto_dispute_reason?}`. Clear the active claim. `disputed` → "Submitted, but flagged: <auto_dispute_reason>. The operator will resolve it — nothing has been paid yet." (no red). `submitted` → "Submitted · waiting for release" + tx chip, then long-poll `GET /tasks/:id?wait=50` until `status === 'released'` (or `disputed`/`refunded`, shown honestly).
- Paid state — `app/proof/PaidState.tsx { proofThumbnailUrl: string | null; amountUsdc; releaseTx; capturedAt }`: renders **nothing** when `proofThumbnailUrl` is null; otherwise, inside the same card and **below the thumbnail**: `Released · 3.00 USDC` (Archivo 40 px, `--verified-700`; the amount is `amount_usdc` from `GET /tasks/:id`, never computed), tx chip `tx 0x… ↗` → `https://sepolia.basescan.org/tx/<tx.release>`, chip `testnet USDC — not spendable`, line `+1 completed`, `Button` `Back to tasks`.
- `app/earnings/page.tsx` (`/earnings`): `requireVerified()`; `GET /me/earnings` → `released_usdc` as the big numeral (Archivo 56, two decimals) + `testnet USDC` + chip `not spendable`; mono line `completed <n> · score <s> · distinct raters <r>`; line `earned only — nothing seeded, nothing projected`; payout address (`getPayoutAddress()`) + Basescan address link; link `Back up payout key` → `/` (T-24's key screen). Zero state reads `0.00`.
- Every interactive element `data-hit="44"`; narrated elements (`Take the photo`, the answer toggle, `SUBMIT`, `Released · 3.00 USDC`, chips, `+1 completed`) carry `data-floor="20"`.

## 3. Out of scope
- Task list/claim/countdown (T-25 — import `Countdown`, `readActiveClaim`, `clearActiveClaim`). The two-image `compare-two` screen and `Report task` (T-42). API behaviour (EXIF strip, hash, geofence, auto-dispute — T-18/T-17). Mocks (T-24; missing scenario → `BLOCKED:`).
- Do not touch: `app/(auth)/**`, `app/tasks/**`, `components/**`, `lib/*` other than `lib/gps.ts`, `mocks/**`, `app/layout.tsx`, `package.json`.

## 4. Owned paths
```
apps/miniapp/app/proof/**   apps/miniapp/app/earnings/**   apps/miniapp/lib/gps.ts   apps/miniapp/tests/proof/**
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `POST /proofs` | `api-contract.ts` / `docs/api.md` | worker-session, multipart ≤ 8 MB · `file, lat?, lon?, accuracy_m?, gps_unavailable?, worker_confirmed_at_place?` → `{proofHash, url, captured_at}` |
| `POST /tasks/:id/submit` | same | worker-session · `{proofHash, answer, note?}` (+ per-type proof fields) → `{tx, status: 'submitted' \| 'disputed', auto_dispute_reason?}` |
| `GET /tasks/:id?wait=0..50` | same | public → `{task_id, status, task_type, amount_usdc, fee_usdc, area, posted_at, claimed_at?, submitted_at?, released_at?, answer?: WorkerAnswer, proof?: {hash, hash_ok, url?, captured_at, coordinate_rounded?: {lat,lon}, gps_unavailable}, tx:{post, claim?, submit?, release?}, dashboard_url, changed: boolean, poll_after_seconds}` |
| `GET /me/earnings` | same | worker-session → `{released_usdc, completed, score, distinct_raters}` (earned-only: sums `TaskReleased` to this worker) |
| Proof schemas (`VerifyOpenProof` … `CompareTwoProof`), invariant `gps === null ⇔ gps_unavailable === true` then `worker_confirmed_at_place` true; `CALL_CONFIRM_TEMPLATES`; `NOTE_MAX_CHARS = 120`; `PUBLIC_COORD_DECIMALS = 3` | `packages/shared` | request bodies validated client-side before sending |
| `Countdown`, `readActiveClaim`, `clearActiveClaim` | T-25 | deadline, claim gate |
| `requireVerified`, `getPayoutAddress`, `apiFetch`, primitives, `[data-hit]`, `[data-floor]` | T-24, T-05 | |
| msw scenarios `proofs: ok`, `submit: submitted \| disputed`, `task: submitted \| released`, `earnings: zero \| one_paid` | T-24 `mocks/**` | |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `getPosition(): Promise<GpsResult>`, `GpsResult` | `lib/gps.ts` | T-42 (`compare-two` needs none; `Report` none) — reference implementation for any later GPS use |
| `PaidState` props (above) | `app/proof/PaidState.tsx` | T-42 (compare screen reuses it) |
| `reencodeImage(file): Promise<Blob>` | `app/proof/image.ts` | T-42 |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-33` — it must print `CLAIMED T-33`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `api-contract.ts` (the four routes + proof schemas), T-25's `activeClaim.ts` and `Countdown.tsx`, T-24's mocks/scenarios.
2. `lib/gps.ts` with the exact options; unit-test with a fake `navigator.geolocation`.
3. `app/proof/image.ts` (canvas re-encode; in tests, stub `createImageBitmap`/canvas and assert the output type is `image/jpeg`).
4. `app/proof/[id]/page.tsx` + client `ProofFlow.tsx` (steps 1–4), `PaidState.tsx`, `AnswerToggle.tsx` (per type), `Downgrade.tsx`.
5. `app/earnings/page.tsx`.
6. Tests (§8), `app/proof/README.md` (the downgrade path, the earned-only rule), PR. Ask the operator for the phone test (merge-to-test).

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `downgradePathSubmits` | geolocation mocked to fail with `TIMEOUT` → the downgrade panel and chip `GPS unavailable in webview — disclosed` render → tap `I am at the place`, pick `closed`, `SUBMIT` → the `/proofs` request has fields `gps_unavailable=true`, `worker_confirmed_at_place=true` and no `lat`/`lon`; the `/submit` body parses with `VerifyOpenProof` (`gps: null`, invariant holds) |
| `paidStateRequiresProofAbove` | `PaidState` with `proofThumbnailUrl: null` renders an empty container; with a URL, the `img` precedes the text `Released · 3.00 USDC` in DOM order inside the same card, and the chip `testnet USDC — not spendable` and `+1 completed` are present |
| `earningsEarnedOnly` | scenario `zero` → `0.00` and `completed 0`; scenario `one_paid` (`released_usdc: 3, completed: 1, score: 1, distinct_raters: 1`) → `3.00`, `completed 1`; the page contains no figure that is not in the response (assert `4.6` and `11` absent) |
| `copyLinesPresent` | before submit the proof screen contains both lines verbatim: `you are paid for the proof, not the answer — 'closed' pays the same as 'open'` and `don't photograph people` |
| `gpsTimeoutIsTenSeconds` | `getPosition()` calls `getCurrentPosition` with `timeout: 10000`, `enableHighAccuracy: true`, `maximumAge: 0`; each error code maps to the `GpsResult` code |
| `amountNeverDeducted` | with `GET /tasks/:id` → `{amount_usdc: 3, fee_usdc: 0.45, status: 'released', ...}` the paid state shows `3.00` and never a deducted figure (no string starting `2.` in the card; the worker keeps the whole posted rate) |
| `pnpm --filter @legwork/miniapp build` | passes; `/proof/[id]`, `/earnings` listed |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/miniapp typecheck && pnpm --filter @legwork/miniapp lint
pnpm --filter @legwork/miniapp test
pnpm --filter @legwork/miniapp build
```
Expected: clean; 6 named tests green; build lists both routes.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). The paid state shows the API's `amount_usdc`; never a deducted figure; never `amount − fee`.
- No secrets in code or client bundles; the payout private key is never read here (address only).
- Tests never call a live model or a live chain; the network is msw only.
- Leiria placeholders only.
- **Never render the paid state without the proof photo above it** (`PaidState` enforces it). The earnings page is earned-only: nothing seeded, nothing projected, no demo numbers.
- The GPS downgrade is disclosed with the chip `GPS unavailable in webview — disclosed` on the phone and travels to the receipt as `gps_unavailable: true`; the location is never faked and never required.
- A proof photo must never contain a face (`don't photograph people` stays on screen); `capture="environment"` is mandatory (rear camera, no gallery by default).
- Phone floors 16 px body / 20 px narrated; hit targets ≥ 44 px; verified chip above the fold (do not hide the header); no faces, no emoji, no gradients, no red; paper-ground tokens only; nothing copied from `pitch/` or `design-system/`.
- Honesty rules (09-design-prompt, verbatim): (1) Three copy blocks in `08-pitch-deck.md` are verbatim-locked (tagline, claim, trust model incl. the daily-cap clause) — reproduce exactly. (2) Never show escrow releasing without a proof above or beside it; never show a refusal moving the escrow meter ("a refused task moves no money"). (3) The tag is `task-refused` (never "violation"); the name is Legwork (never Witness/Fieldnote unless the collision check renamed it, in which case swap everywhere at once). (4) Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia. (5) "Bot-proof, not fraud-proof"; "bounded, attributable work"; never "trustless". (6) No faces anywhere — the worker is hands and a phone. (7) Locations are Leiria (the real shop once chosen). Never Brooklyn, never "24h". (8) The filmed worker account shows only what it actually earned. (9) Every seeded row — worker or task — carries a "seeded" chip; the pool reads "1 real · +20 seeded (demo data)". (10) Fee figures are 3.45 / 3.00 / 0.45 (agent pays / worker receives / fee) on every surface; no deducted-fee numbers anywhere.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `app/proof/README.md` written.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.
- [ ] Operator (after merge, on the phone): one full capture → submit → release on a rehearsal task; note whether GPS resolved or the downgrade fired (→ `FEEDBACK-WORLD.md`), and the fresh-install → paid timing (→ `docs/spikes/RESULTS.md`). The agent states in the PR that this is the operator's step.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-33 — Mini-app proof flow + earnings
owned-paths:
  - apps/miniapp/app/proof/**
  - apps/miniapp/app/earnings/**
  - apps/miniapp/lib/gps.ts
  - apps/miniapp/tests/proof/**
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
Operator step pending: phone capture → submit → release; GPS or downgrade noted
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it. Frozen interfaces: `INTERFACE REQUEST:`. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
Known at dispatch — comment at start, continue with the written fallback: `INTERFACE REQUEST: the worker has no route that returns the task's spec fields needed to answer (call-confirm template_id + slots, photo-of subject, compare-two a/b/criterion)`; fallback = the template picker of §2. If `api-contract.ts`'s submit body names the photo field `photo_hash` rather than reusing `proofHash`, send both exactly as the schema says.

## 14. Reviewer notes
Open `lib/gps.ts` (options exact, every error code mapped), then `ProofFlow.tsx` (submit disabled until photo + answer + location-or-confirmation; downgrade sets both flags; long-poll ends in an honest state), then `PaidState.tsx` (null thumbnail → nothing; amount from the API). Most likely wrong: `lat/lon` sent as `0` on the downgrade path, the paid amount computed, the copy lines hidden behind a step, `capture` attribute dropped by the re-encode wrapper.

## 15. Round 2+
—
