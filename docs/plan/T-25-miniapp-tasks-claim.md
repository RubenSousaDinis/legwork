---
id: T-25
title: Mini-app task list + claim — 3 s poll, countdown, release-claim
lane: D
day: 3
size: M
agent_class: C
must: true
depends_on: [T-24, T-17]
owned_paths:
  - apps/miniapp/app/tasks/**
  - apps/miniapp/components/TaskCard.tsx
  - apps/miniapp/components/Countdown.tsx
labels: [area:miniapp, wave:3, size:M, agent:cloud]
branch: t-25/miniapp-tasks-claim
---

# T-25 — Mini-app task list + claim

## 1. Context
After verification (T-24) the worker lands on `/tasks`: nearby open tasks with price, distance and TTL, one expanded card with the address, the question and the proof requirements, a single CLAIM button, and — once claimed — a visible countdown to `claim_expires_at` and a "release this claim" button. The claim is relayed: the worker never pays gas, and the chip says so. Video beat 5 films this screen ("Task card, CLAIM, chip 'relayed claim · gas paid by Legwork'. Wall clock 14:23 visible on both panes."). The API's worker routes exist after T-17; you consume them through the same-origin `/api` rewrite with the msw handlers T-24 generated.

> 02-architecture: "task list on a 3-second poll with price, distance, TTL → relayed claim with a visible countdown and a 'release this claim' button" · "**Lazy expiry:** … An expired claimant enters a short cooldown (one mapping, ~15 min) so a single worker cannot deny a task by claiming and vanishing in a loop." · `POST /tasks/:id/release-claim` "(give up, no penalty inside the TTL)".

> 09-design-prompt, Screen 2: "Below: task list with distance, price, TTL ('claim within 30 min'); the `verify-open` task expanded with the address, the question, the proof requirements (photo of door + hours sign, GPS, timestamp), a single CLAIM button and the chip 'relayed claim · gas paid by Legwork'. Footer: earnings **0.00 testnet USDC** with the chip 'not spendable'." · "Phone screens: light, high-contrast, thumb-sized buttons; the verified chip is always visible above the fold." · "Phone type: 16px body, 20px floor for anything narrated."

## 2. Exact scope
- `app/tasks/page.tsx` (`/tasks`): `requireVerified()`; polls `GET /tasks?area=&lat=&lon=` every 3 s (`area` from `resolveArea()`, `lat/lon` from `lastKnownPosition()` when known), paused while `document.hidden`, resumed on focus; 401 → redirect `/`. Empty state: "No open tasks near you right now — the list refreshes every 3 s."
- `components/TaskCard.tsx` collapsed: `MonoTag` type, title, price (Archivo 28 px `3.00` + mono `USDC`), distance (`~180 m` from `distance_m`, `—` when absent), TTL line `claim within 30 min` (from `DEFAULT_CLAIM_TTL_S`; see §13), `StatusBadge`, chip `seeded` when `seeded`. Tap (whole card is a 44 px+ target) → expanded.
- Expanded: address (the `title` — the API renders it as `<place> · <street>, <locality>`), the question by type (`verify-open`: "Is it open right now?"; `photo-of`: "Photograph the subject named in the title"; `call-confirm`: "Call and ask the template question shown after you claim"; `compare-two`: "Pick A or B against the criterion shown after you claim"), proof requirements by type (`verify-open`/`photo-of`: "photo of the door + hours sign · location · timestamp"; `call-confirm`: "your answer + the time you called — self-reported, unverified"; `compare-two`: "one choice + one line"), the line "you are paid for the proof, not the answer", `Button variant="primary" size="lg" full` `CLAIM`, chip `relayed claim · gas paid by Legwork`.
- CLAIM → `POST /tasks/:id/claim` → `{tx, claim_expires_at, submit_deadline}`; store `{task_id, claim_expires_at, submit_deadline, tx}` in `localStorage['legwork.activeClaim.v1']`; claimed card pinned at the top with `Countdown` to `claim_expires_at`, the tx chip `tx 0x8f2a…c41d ↗` (short form: first 6 + `…` + last 4, link `https://sepolia.basescan.org/tx/<hash>`), chip `relayed claim · gas paid by Legwork`, `Button` `Go to proof` → `/proof/<task_id>` (T-33), `Button variant="ghost"` `release this claim` → `POST /tasks/:id/release-claim` → clear the local claim, back to the list.
- `components/Countdown.tsx { until: string; label: string; onExpire? }`: `mm:ss` mono 24 px, ticking every second, `00:00` then `onExpire` (the claimed card shows "claim expired — it returned to the pool" and clears the local claim). No colour change with urgency (amber means refusal; nothing else).
- 409 handling: `InCooldown` → "You released or let a claim expire recently. You can claim again within 15 min." (`CLAIM_COOLDOWN_S`); `AlreadyClaimed` → "Someone claimed this task first." + immediate re-poll; `SeededCannotClaimExternal` → "This account is a seeded demo worker; it can only claim operator-funded tasks." Errors render inline under the button, 16 px, no red.
- Footer on `/tasks`: `earnings 0.00 testnet USDC` (from `GET /me/earnings.released_usdc`, fetched once per minute) + chip `not spendable`, linking to `/earnings` (T-33).
- Every interactive element `data-hit="44"`; narrated elements (`price`, `CLAIM`, countdown, chips, the claimed card's title) carry `data-floor="20"` and are sized ≥ 20 px.

## 3. Out of scope
- Proof capture, submit, paid state, earnings page (T-33). Unverified visitor list, `compare-two` screen, `Report task` (T-42). Auth, session, mocks (T-24 — if a scenario is missing, `BLOCKED:`).
- Do not touch: `app/(auth)/**`, `lib/**`, `mocks/**`, `components/ui/**`, `components/VerifiedState.tsx`, `app/layout.tsx`, `next.config.ts`, `package.json`.

## 4. Owned paths
```
apps/miniapp/app/tasks/**   apps/miniapp/components/TaskCard.tsx   apps/miniapp/components/Countdown.tsx
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `GET /tasks?area=&lat=&lon=` | `api-contract.ts` / `docs/api.md` | worker-session → `{tasks:[{task_id, task_type, title, price_usdc, distance_m?, claim_expires_in_s?, state, seeded}]}` (open + lazily-expirable) |
| `POST /tasks/:id/claim` | same | worker-session → `{tx, claim_expires_at, submit_deadline}`; **409** `InCooldown \| AlreadyClaimed \| SeededCannotClaimExternal` |
| `POST /tasks/:id/release-claim` | same | worker-session → `{tx}` |
| `GET /me/earnings` | same | worker-session → `{released_usdc, completed, score, distinct_raters}` (footer figure only) |
| `DEFAULT_CLAIM_TTL_S = 1800`, `CLAIM_COOLDOWN_S = 900`, `TaskType` | `packages/shared` | TTL line, cooldown copy, type tags |
| `useSession`, `requireVerified`, `resolveArea`, `lastKnownPosition`, `apiFetch`, `ApiError` | T-24 `lib/*` | session + area |
| `Button`, `Chip`, `MonoTag`, `StatusBadge`, `[data-hit]`, `[data-floor]` | T-05 `components/ui/*`, `globals.css` | primitives |
| msw handlers + `setScenario` | T-24 `mocks/**` | scenarios `two_rows`, `ok`, `InCooldown`, `AlreadyClaimed`, `SeededCannotClaimExternal`, `zero` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `Countdown { until; label; onExpire? }` | `components/Countdown.tsx` | T-33 (submit deadline) |
| `readActiveClaim()`, `clearActiveClaim()` — `localStorage['legwork.activeClaim.v1']` `{task_id, claim_expires_at, submit_deadline, tx}` | `app/tasks/activeClaim.ts` | T-33, T-42 |
| `TaskCard { row; expanded; onToggle; onClaim; claim?; onRelease; error? }` | `components/TaskCard.tsx` | T-42 (adds the Report link later) |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-25` — it must print `CLAIMED T-25`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `api-contract.ts` (the three routes), T-24's `lib/session.ts`, `lib/area.ts`, `mocks/scenarios.ts`, T-05's primitives.
2. `app/tasks/activeClaim.ts`, `components/Countdown.tsx` (fake-timer friendly: reads `Date.now()` through an injectable `now` prop defaulting to `Date.now`).
3. `components/TaskCard.tsx` collapsed/expanded/claimed states; the copy of §2 verbatim.
4. `app/tasks/page.tsx` + `app/tasks/TaskList.tsx` (client): poll loop with `setInterval(3000)` + visibility handling; claim/release calls; error mapping; footer.
5. Tests (§8), `app/tasks/README.md`, PR.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `pollRendersTasks` | scenario `two_rows` (one seeded) → both titles render; the seeded row shows a chip with text exactly `seeded`; after advancing fake timers by 3 s the `GET /tasks` handler has been hit twice; with `document.hidden = true` no further request |
| `claimShowsCountdown` | click `CLAIM` → `POST /tasks/:id/claim` hit → the card shows the chip `relayed claim · gas paid by Legwork`, a tx chip linking to `https://sepolia.basescan.org/tx/<tx>`, and a `Countdown` reading `30:00` or `29:59` for `claim_expires_at = now + 1800 s`; `localStorage['legwork.activeClaim.v1']` holds the task id |
| `releaseClaimCallsRoute` | click `release this claim` → `POST /tasks/:id/release-claim` hit exactly once → local claim cleared → list state |
| `cooldownMessageOn409` | scenario `InCooldown` → the message contains `claim again within 15 min`; `AlreadyClaimed` → `claimed this task first`; `SeededCannotClaimExternal` → `seeded demo worker` |
| `hitTargetsAtLeast44` | every `button` and `a` in the rendered list (collapsed, expanded, claimed) has `data-hit="44"`; the price, `CLAIM`, countdown and chips have `data-floor="20"` |
| `unauthorizedRedirects` | `GET /tasks` 401 → navigation to `/` (mock `next/navigation`) |
| `pnpm --filter @legwork/miniapp build` | passes; `/tasks` listed |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/miniapp typecheck && pnpm --filter @legwork/miniapp lint
pnpm --filter @legwork/miniapp test
pnpm --filter @legwork/miniapp build
```
Expected: clean; 6 named tests green; build lists `/tasks`.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). The list shows the worker's price (`price_usdc`); never a deducted figure.
- No secrets in code or client bundles; nothing secret under `NEXT_PUBLIC_*`.
- Tests never call a live model or a live chain; the network is msw only.
- Leiria placeholders only in fixtures and copy.
- The verified chip is always above the fold (T-05's sticky header — do not hide it on `/tasks`); phone floors 16 px body / 20 px narrated; hit targets ≥ 44 px; no faces, no emoji, no gradients; paper-ground tokens only; nothing copied from `pitch/` or `design-system/`.
- Every seeded task row carries the chip `seeded`. The chip `relayed claim · gas paid by Legwork` appears on every claimed card. The footer earnings figure is the API's `released_usdc` and nothing else (earned-only).
- Honesty rules (09-design-prompt, verbatim): (1) Three copy blocks in `08-pitch-deck.md` are verbatim-locked (tagline, claim, trust model incl. the daily-cap clause) — reproduce exactly. (2) Never show escrow releasing without a proof above or beside it; never show a refusal moving the escrow meter ("a refused task moves no money"). (3) The tag is `task-refused` (never "violation"); the name is Legwork (never Witness/Fieldnote unless the collision check renamed it, in which case swap everywhere at once). (4) Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia. (5) "Bot-proof, not fraud-proof"; "bounded, attributable work"; never "trustless". (6) No faces anywhere — the worker is hands and a phone. (7) Locations are Leiria (the real shop once chosen). Never Brooklyn, never "24h". (8) The filmed worker account shows only what it actually earned. (9) Every seeded row — worker or task — carries a "seeded" chip; the pool reads "1 real · +20 seeded (demo data)". (10) Fee figures are 3.45 / 3.00 / 0.45 (agent pays / worker receives / fee) on every surface; no deducted-fee numbers anywhere.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `app/tasks/README.md` (poll, claim state, error copy).
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.
- [ ] Operator (after merge, on the phone): claim + release once; log pasted in the PR.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-25 — Mini-app task list + claim
owned-paths:
  - apps/miniapp/app/tasks/**
  - apps/miniapp/components/TaskCard.tsx
  - apps/miniapp/components/Countdown.tsx
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it. Frozen interfaces: `INTERFACE REQUEST:`. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
Known at dispatch — comment on the PR at start, then continue with the fallbacks written in §2: `INTERFACE REQUEST: GET /tasks rows carry only title — the worker needs place {name, street_address, locality}, the rendered question (call-confirm template / photo-of subject / compare-two criterion) and claim_ttl_s / submit_ttl_s`; until added, the address is the `title`, the question is type-derived, and the TTL line uses `DEFAULT_CLAIM_TTL_S`.

## 14. Reviewer notes
Open `TaskList.tsx` (interval, visibility pause, 401), then `TaskCard.tsx` (copy verbatim, seeded chip, relayed chip, no red), then `Countdown.tsx` (injectable clock). Most likely wrong: the poll not paused when hidden, distance shown as raw metres, a "23h" style duration (write `<n> h`), the footer showing anything but `released_usdc`.

## 15. Round 2+
—
