---
id: T-42
title: Mini-app optional — compare-two screen, Report task, unverified state
lane: D
day: 5                                # Day 5–6; optional — dropped first when behind
size: M
agent_class: C
must: false
depends_on: [T-33]
owned_paths:
  - apps/miniapp/app/compare/**
  - apps/miniapp/app/report/**
  - apps/miniapp/components/UnverifiedBanner.tsx
  - apps/miniapp/test/optional*.test.tsx
labels: [area:miniapp, wave:5, size:M, agent:cloud]
branch: t-42/miniapp-optional
---

# T-42 — Mini-app optional screens

## 1. Context
Three screens the architecture marks "optional if ahead". `compare-two` is the only task type with no travel: two images or two texts, one choice, one line — and it is the type a judge can complete live at the finals table without leaving the room, so the screen must be finished, not sketched. `Report task` lets a verified worker walk away from a task that smells like abuse: it releases the claim (relayed, no gas, no cooldown inside the window) and records one of the six abuse classes; the API escalates only after operator review or when two distinct nullifiers flag the same buyer. The unverified state shows real tasks and real prices behind a `Verify to claim` banner so a visitor understands the offer before verifying. T-33 built the proof flow and paid state these screens mirror; T-25 built the list, claim and countdown they reuse.

> 02-architecture, mini-app: "Optional if ahead: the `compare-two` screen (two images, one choice, one line — the only travel-free type and the finals live type); `Report task` (abandons the claim offchain, records a class, escalates to an AbuseMark only after operator review or two distinct nullifiers flag the same agent); the unverified state ("Verify to claim" over real prices)."

> T-01, `CompareTwoSpec`: "`a`, `b`: `{ kind: 'image'|'text', url?: https ≤ 5 MB jpeg/png, text? ≤ 500, sha256 }`, `criterion_id` ∈ `more_legible|matches_reference|better_lit|same_place|which_is_newer|which_is_open`, `reference?`." · `CompareTwoProof`: "`{ choice: 'a'|'b'|'neither', reason ≤ 120 }`." · `IAbuseMark` class ids: "`1 credential fraud · 2 identity impersonation · 3 automated reconnaissance · 4 social media manipulation · 5 authentication circumvention · 6 referral fraud` — labels verbatim."

## 2. Exact scope
- `app/compare/[id]/page.tsx` (`/compare/<task_id>`): `requireVerified()`; requires `readActiveClaim().task_id === id`, else redirect `/tasks`. Header: compact `VerifiedChip` (stays above the fold), task title, `MonoTag compare-two`, `Countdown` to `submit_deadline` (label `submit within`). Loads `GET /tasks/:id/spec` → `{task_type, spec}` (§5, §13); `task_type !== 'compare-two'` → redirect `/proof/<id>` (T-33's flow).
- `app/compare/[id]/CompareView.tsx`: question from `CRITERION_QUESTION` — `more_legible` → `Which is more legible?` · `matches_reference` → `Which matches the reference?` · `better_lit` → `Which is better lit?` · `same_place` → `Which shows the same place as the reference?` · `which_is_newer` → `Which is newer?` · `which_is_open` → `Which one is open?`; `reference` (when present) as a smaller card labelled `reference` above the pair. The pair side by side in two equal paper cards labelled `A` / `B` (mono), each ≥ 160 px wide at a 390 px viewport: `kind: 'image'` → `<img src={url} alt="option A|B" loading="eager" referrerPolicy="no-referrer">` in a 1:1 box; tapping it opens a full-width view with a 44 px `Close`; `kind: 'text'` → the text (≤ 500 chars) at 16 px. Copy under the pair, 16 px, always visible before submit: `you are paid for the judgement, not for a particular answer — 'neither' pays the same as 'a'` and `no travel, no camera, no location for this task`.
- Choice + reason + submit: three segmented `Button`s ≥ 44 px `A | B | Neither` (values `a | b | neither`; none preselected; exactly one selected); `<textarea maxLength={120}>` labelled `one line: why?` with counter `<n>/120` (`NOTE_MAX_CHARS`), required, trimmed non-empty. `SUBMIT` (`Button variant="primary" size="lg" full`, `data-hit="44"`, `data-floor="20"`) enabled only when choice and reason exist → `POST /tasks/:id/submit` with `{ answer: choice, choice, reason }` validated client-side with `CompareTwoProof` before sending (`proofHash` only if `api-contract.ts` requires it for `compare-two` — §13). **Never a `POST /proofs` request from this screen.** Response as T-33: `disputed` → `Submitted, but flagged: <auto_dispute_reason>. The operator will resolve it — nothing has been paid yet.` (amber, never red); `submitted` → `Submitted · waiting for release` + tx chip, then long-poll `GET /tasks/:id?wait=50` until `released | disputed | refunded`, each shown honestly. `clearActiveClaim()` after submit.
- `app/compare/[id]/ComparePaidState.tsx { choice: 'a' | 'b' | 'neither' | null; a; b; reason; amountUsdc; releaseTx; capturedAt }`: renders **nothing** when `choice === null`; otherwise, in one card and **above** the amount: the pair again (thumbnail or first 80 chars) with the chosen card outlined in the verified border — for `neither`, the word `neither` in verified text — and the reason in quotes; then `Released · <amount> USDC` (Archivo 40, verified text; `amount` = `amount_usdc` from `GET /tasks/:id`, formatted two decimals, never computed), tx chip `tx 0x… ↗` → `https://sepolia.basescan.org/tx/<tx.release>`, chip `testnet USDC — not spendable`, line `+1 completed`, `Button` `Back to tasks`. (T-33's `PaidState` needs an image; this mirrors its copy so text pairs and `neither` have a proof above the money too.)
- `app/report/[id]/page.tsx` (`/report/<task_id>`) + `ReportForm.tsx`: `requireVerified()`; claim gate as above; compact `VerifiedChip` in the header; heading `Report task`; copy lines, 16 px, visible before any tap: `reporting is free and anonymous to the buyer` · `no gas — the relayer releases your claim` · `the operator reviews reports; a mark is written only after review or when two different verified workers report the same buyer`. Picker: the six `AbuseClass` labels imported from `@legwork/shared` (order 1–6, verbatim) as 44 px radio rows, none preselected. `Button variant="primary"` `Report and release claim` enabled once a class is chosen → **first** `POST /tasks/:id/release-claim` → `{tx}`; **then** `POST /tasks/:id/report` `{class}` → `{recorded: true}`; `clearActiveClaim()`; success card `Reported · claim released` + `Back to tasks`. If release-claim fails (409 or 5xx) → amber line `could not release the claim — try again`, and the report request is **not** sent. `Button variant="ghost"` `Cancel` → back. The screen shows no money, no buyer or agent identity, no task spec beyond the title.
- `components/UnverifiedBanner.tsx { tasks: { task_id: string; task_type: TaskType; title: string; price_usdc: number }[]; verifyHref?: string }` (`verifyHref` default `/`): pure props, no session read, no fetching. Banner card at the top with the verified border: `Verify to claim` (20 px, `data-floor="20"`), line `real tasks, real prices — verification takes about a minute`, `Button variant="verified"` `Verify with World ID` → `verifyHref` (`data-hit="44"`). Then each task as a row: `MonoTag type`, title, `<price_usdc> USDC` (Archivo 24, two decimals — the worker's rate; the agent's price never appears on the phone) and a disabled `Button variant="ghost"` labelled `Verify to claim` (`disabled` + `aria-disabled="true"`). Zero tasks → line `no open tasks right now` under the banner. Mount point is T-25's `app/tasks/page.tsx` when no session exists, fed with open rows of `GET /public/feed` — §13.
- `app/compare/README.md`: the travel-free rule, the report order (release, then report), the banner's mount contract.

## 3. Out of scope
- The photo proof flow, `PaidState`, `image.ts`, GPS (T-33); list/claim/countdown (T-25); auth, session, primitives, mocks (T-24 — add missing msw handlers **inside your test files** with `server.use(...)`, never in `mocks/**`); the API side of `/report`, `/release-claim`, `/tasks/:id/spec` (T-17/T-38); the dashboard.
- Do not touch: `app/(auth)/**`, `app/tasks/**`, `app/proof/**`, `app/earnings/**`, `components/*` other than `UnverifiedBanner.tsx`, `lib/**`, `mocks/**`, `app/layout.tsx`, `package.json`.

## 4. Owned paths
```
apps/miniapp/app/compare/**   apps/miniapp/app/report/**   apps/miniapp/components/UnverifiedBanner.tsx   apps/miniapp/test/optional*.test.tsx
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `POST /tasks/:id/submit` | `packages/shared/src/api-contract.ts`, `docs/api.md` | worker-session · `{proofHash, answer, note?}` (+ per-type proof fields) → `{tx, status: 'submitted' \| 'disputed', auto_dispute_reason?}` — for `compare-two` the per-type fields are `choice`, `reason` |
| `POST /tasks/:id/release-claim` | same | worker-session → `{tx}` (relayed `releaseClaimFor`; give-up inside the TTL is free — no cooldown) |
| `POST /tasks/:id/report` | same | worker-session · `{class}` → `{recorded:true}` (optional feature) |
| `GET /tasks/:id?wait=0..50` | same | public → `{task_id, status, task_type, amount_usdc, fee_usdc, area, posted_at, claimed_at?, submitted_at?, released_at?, answer?: WorkerAnswer, proof?: {hash, hash_ok, url?, captured_at, coordinate_rounded?: {lat,lon}, gps_unavailable}, tx:{post, claim?, submit?, release?}, dashboard_url, changed: boolean, poll_after_seconds}` |
| `GET /tasks/:id/spec` | **expected** (T-33's `INTERFACE REQUEST`; not in T-01) | worker-session, current claimant only → `{task_type, spec}` with `spec` = the per-type spec (`CompareTwoSpec` here). Absent from `api-contract.ts` at dispatch → `BLOCKED:` and stop; this task is optional, there is no workaround |
| `GET /public/feed` | same (T-19) | public rows `{task_id, status, task_type, title?, amount_usdc, …}` — the banner's caller maps `amount_usdc → price_usdc`; the banner itself takes props |
| `CompareTwoSpec`, `CompareTwoProof`, `AbuseClass` (six labels), `TaskType`, `NOTE_MAX_CHARS = 120`, `PRICE_FLOOR_USDC` | `packages/shared` | validate before sending; never retype a label |
| `Countdown`, `readActiveClaim`, `clearActiveClaim` | T-25 | deadline and claim gate |
| `requireVerified`, `apiFetch`, `Button` (`primary \| ghost \| verified`, ≥ 44 px), `Chip`, `MonoTag`, `VerifiedChip`, `[data-hit]`, `[data-floor]`, paper tokens | T-24, T-05 | primitives; never restyle them |
| msw `setupServer` + scenarios `submit: submitted \| disputed`, `task: submitted \| released` | T-24 `mocks/**` | reuse; add `spec`, `release-claim`, `report` handlers per test with `server.use` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `UnverifiedBanner` props (above) | `components/UnverifiedBanner.tsx` | T-25's `app/tasks/page.tsx` (lead mounts it — §13), T-48 screenshots |
| `CRITERION_QUESTION: Record<CompareTwoSpec['criterion_id'], string>` | `app/compare/[id]/CompareView.tsx` | T-45 docs (worker-facing copy) |
| `ComparePaidState` props | `app/compare/[id]/ComparePaidState.tsx` | — |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-42` — it must print `CLAIMED T-42`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `api-contract.ts` (the five routes; confirm `/tasks/:id/spec` exists — else §13), `schemas/compare-two`, T-25's `activeClaim.ts` + `Countdown.tsx`, T-33's `ProofFlow.tsx` (copy its post-submit handling exactly) and `PaidState.tsx`, T-24's `mocks/**`.
2. `UnverifiedBanner.tsx` + `unverifiedShowsPrices` first (no routes, fastest).
3. `CompareView.tsx` with fixtures: `spec-images.json` (`a`, `b` https jpeg URLs of a Leiria hours sign, `criterion_id: 'more_legible'`), `spec-texts.json` (two ≤ 500-char texts, `criterion_id: 'which_is_newer'`); in tests, image URLs are intercepted by msw returning a 1×1 PNG.
4. Submit + long-poll + `ComparePaidState`; then `ReportForm.tsx`.
5. Tests (§8), README, PR. Ask the operator for the phone pass (merge-to-test) and state in the PR that the two mount points are the lead's one-liners.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `compareSubmitsChoice` | scenario `spec-images` → two `img` with the spec URLs and the question `Which is more legible?` render; the copy `'neither' pays the same as 'a'` is visible; `SUBMIT` disabled; tap `B` → still disabled; type `b shows the current hours sign` → enabled; `SUBMIT` → the `/submit` body has `choice: 'b'`, `answer: 'b'`, `reason` as typed and parses with `CompareTwoProof`; **no request hit `/proofs`**; after `GET /tasks/:id` returns `released` (`amount_usdc: 3`, `tx.release`), `ComparePaidState` shows card `B` outlined **before** `Released · 3.00 USDC` in DOM order, plus `testnet USDC — not spendable` and `+1 completed`; no string starting `2.` in the card |
| `compareTextPair` | scenario `spec-texts` → both texts render, no `img`; `Neither` selectable; a 121-char paste is cut to 120 (`maxLength`) and the counter reads `120/120`; with `choice: null` the paid state renders an empty container; with `choice: 'neither'` it shows `neither` and the reason above the amount |
| `reportReleasesThenReports` | pick `credential fraud`, tap `Report and release claim` → msw request log is exactly `POST /tasks/9/release-claim` then `POST /tasks/9/report` with body `{class: 'credential fraud'}`; `clearActiveClaim` was called; `Reported · claim released` shows; with release-claim → 409 no `/report` request is made and `could not release the claim — try again` renders; all three copy lines were present before any tap; all six labels render verbatim in order |
| `unverifiedShowsPrices` | two tasks `price_usdc: 3` → `Verify to claim` present with `data-floor="20"`; `3.00` appears twice; every button labelled `Verify to claim` is `disabled` with `aria-disabled="true"`; the CTA `Verify with World ID` links to `/`; renders with no provider, no session, no msw handler; zero tasks → `no open tasks right now` |
| `pnpm --filter @legwork/miniapp build` | passes; `/compare/[id]`, `/report/[id]` listed |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/miniapp typecheck && pnpm --filter @legwork/miniapp lint
pnpm --filter @legwork/miniapp test
pnpm --filter @legwork/miniapp build
```
Expected: clean; T-24/T-25/T-33's tests plus your 4 named tests green; build lists both routes.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). The phone shows the API's `amount_usdc` / `price_usdc` only; never a deducted figure; test fixtures use `amount_usdc: 3, fee_usdc: 0.45`. The report screen shows no money at all — a report moves no money.
- No secrets in code or client bundles; the payout key is never read here; nothing under `NEXT_PUBLIC_*` beyond `.env.example`.
- Tests never call a live model or a live chain; the network is msw only (`onUnhandledRequest: 'error'`), including the two spec image URLs.
- Leiria only (image fixtures are a Leiria hours sign; texts name Leiria streets); the verified chip is always above the fold on the phone — both screens keep the compact `VerifiedChip` in the header; the unverified list puts the banner first.
- Never render a paid state without the proof above it: `ComparePaidState` renders nothing without a `choice`, and the chosen pair + reason precede the amount. `compare-two` sends no photo, no GPS, no `/proofs` call, and never fakes a location.
- No faces anywhere: the pair images are the agent's evidence; if either contains a person the worker may choose `neither` with the reason `shows a person` — the copy does not say this, the README does. No emoji, no gradients, no red; paper-ground tokens only: page `#FAF9F5` · card `#FFFFFF`, 1 px border `#E4E2DA`, radius 16 (task card) / 14 (panel), shadow `0 2px 10px rgba(20,22,20,.05)` · tag fill `#F0EEE7` · chip border `#D8D6CE` · type `#17191B` primary / `#42564d` body / `#6B716D` muted · verified `#1E9E77` fills, `#137a5b` text, border `rgba(30,158,119,.45)`, tint `rgba(30,158,119,.1)` · refusal amber on paper `#B8860B`. Type: Archivo numerals (40 paid amount, 24 list price), Inter 16 body, JetBrains Mono for `A`/`B`, tags, chips. Phone floors 16 px body / 20 px narrated; hit targets ≥ 44 px (`data-hit="44"` on every control); phone screen corner 46.
- Nothing copied from `pitch/` or `design-system/`; primitives come from T-24, tokens are typed from the table above.
- The ten hard rules (verbatim): (1) The three locked copy blocks (tagline, claim, trust model) are reproduced exactly. (2) Never show escrow releasing without a proof above or beside it; never show a refusal moving the escrow meter — "a refused task moves no money". (3) The tag is `task-refused` (never "violation"); the name is Legwork. (4) Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia. (5) "Bot-proof, not fraud-proof"; "bounded, attributable work"; never "trustless". (6) No faces anywhere — the worker is hands and a phone. (7) Locations are Leiria. Never Brooklyn, never "24h". (8) The filmed worker account shows only what it actually earned. (9) Every seeded row — worker or task — carries a `seeded` chip; the pool reads "1 real · +20 seeded (demo data)". (10) Fee figures are **3.45 / 3.00 / 0.45** (agent pays / worker receives / fee) on every surface; no deducted-fee numbers anywhere.
- Rule (9) here: `UnverifiedBanner` rows render `Chip>seeded` when the caller passes `seeded: true` (accept the optional prop; never drop it). Rule (3): the report picker says `report`, the API's tag is `task-refused`; the word "violation" appears nowhere.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `app/compare/README.md` written.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.
- [ ] Operator (after merge, on the phone): one compare-two rehearsal task claimed → chosen → released; one report on a rehearsal task; note the timings in `docs/spikes/RESULTS.md`. The agent states in the PR that this is the operator's step.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-42 — Mini-app optional screens
owned-paths:
  - apps/miniapp/app/compare/**
  - apps/miniapp/app/report/**
  - apps/miniapp/components/UnverifiedBanner.tsx
  - apps/miniapp/test/optional*.test.tsx
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
Mount points for the lead: app/tasks/page.tsx → <UnverifiedBanner> when no session · app/proof/[id] header → link "Report task" → /report/<id>
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it. Frozen interfaces: `INTERFACE REQUEST:`. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
Known at dispatch — check first, comment, then act as written: (a) `GET /tasks/:id/spec` missing from `api-contract.ts` → `BLOCKED: need GET /tasks/:id/spec (worker-session, claimant only) → {task_type, spec}` and stop the compare screen; the report screen and the banner do not need it — finish those. (b) If the `compare-two` submit schema requires `proofHash` with no upload step → `INTERFACE REQUEST: proofHash optional for compare-two; the API hashes the canonical CompareTwoProof` and stop the submit step. (c) Mount points live in frozen files (T-25 list, T-33 proof header): list them in the PR body as above; your tests do not depend on them.

## 14. Reviewer notes
Open `ReportForm.tsx` first (release before report; no report on a failed release; labels imported), then `CompareView.tsx` (no `/proofs`; `SUBMIT` gating; question map complete), then `ComparePaidState.tsx` (null → nothing; pair before amount; amount from the API), then `UnverifiedBanner.tsx` (pure; disabled buttons; `price_usdc` two decimals). Most likely wrong: the report request fired in parallel with release-claim; `neither` mapped to `null`; the reason `maxLength` enforced only by the counter; the banner reading a session or fetching.

## 15. Round 2+
—
