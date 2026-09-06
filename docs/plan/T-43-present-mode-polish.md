---
id: T-43
title: Present-mode polish — server clock, elapsed timer, one-shot meter, card cuts
lane: D
day: 6                                # Day 6–7
size: S
agent_class: C
must: true
depends_on: [T-26, T-39]
owned_paths:
  - apps/dashboard/app/(present)/**
  - apps/dashboard/components/EscrowMeter.tsx
  - apps/dashboard/test/present*.test.tsx
labels: [area:dashboard, wave:6, size:S, agent:cloud]
branch: t-43/present-mode-polish
---

# T-43 — Present-mode polish

## 1. Context
Present mode is the frame the video films; beat 7 is one uncut shot where the phone submits and the dashboard's escrow meter turns `LOCKED 3.45` into `RELEASED 3.00 + 0.45`. That change must read as **one** movement (no counting numerals, nothing in between) and never happen on a refusal. The wall clock and the `t+mm:ss since posted` timer are the continuity proof across the labeled cut, so they must show the same time the phone shows — the API's clock, not the laptop's. This task owns present mode from here: it takes T-10's canvas, mounts T-26's live poller in it, makes the meter's transition a single ≤ 800 ms change, syncs the clock, and adds the `hideCards` cut that T-39's measurements and T-47's arm's-length read may demand. T-47 films what you ship.

> 05-demo-video: "The escrow meter is the money shot and must be legible as a **change**: one uncut shot where LOCKED 3.45 becomes RELEASED 3.00 + 0.45. It moves only on release/refund; **a refused task moves no money.** A task-elapsed timer (`t+04:12 since posted`) and the wall clock stay visible on both sides of the labeled cut." · Cut table: "Dashboard polish → Present mode with three cards; the phone carries more of the frame."

> DESIGN-SPEC, `EscrowMeter` (`RouteMeter`): "the motif as a working meter: dot → dashed route → footprint; fills toward the footprint — states LOCKED / RELEASED / REFUNDED; **a refusal never moves it**."

## 2. Exact scope
- `app/(present)/serverTime.ts` — `fetchServerOffset(url = '/api/healthz'): Promise<{ offsetMs: number; source: 'server' | 'local' }>`: `t0 = Date.now()`, `fetch(url, { cache: 'no-store' })`, `t1 = Date.now()`, `date = res.headers.get('date')`; `offsetMs = Date.parse(date) + (t1 − t0) / 2 − t1`; any failure or missing header → `{ offsetMs: 0, source: 'local' }`. `useServerNow({ resyncMs = 60_000, tickMs = 250 }) → { nowMs, source }` (client hook; `nowMs = Date.now() + offsetMs`; re-syncs every 60 s; a re-sync failure keeps the last offset and flips `source` to `'local'`). The `Date` header is the API's or the dashboard host's clock (both NTP) — never the viewer's laptop; the phone's `captured_at` is the API's clock, so the two agree.
- `Clock.tsx`: `formatClock(ms) → 'HH:MM:SS'` (24-h, local zone, exported); renders from `useServerNow`, mono 32 (design px via `--u`), `data-floor="24"`, `data-source="server|local"`; when `local` a `--fg-4` mono suffix `· local` (if it shows on Day 8 the API is down — never in the filmed live frame). `nowMs` prop (from `PresentCanvas`) overrides the hook for tests and the OG image.
- `ElapsedTimer.tsx`: `formatElapsed(postedAtIso, nowMs) → 't+mm:ss since posted'`; ≥ 1 h → `t+h:mm:ss since posted`; clamps at `t+00:00`; `featured === null` → `t+—:— since posted`; same `nowMs` as the clock; `data-floor="24"`. T-10's demo anchor (`t+04:12` at load) stays.
- `components/EscrowMeter.tsx` — props unchanged (`{ featured; totals; present? }`, `data-testid="escrow-meter"`, `data-state`, `data-progress`); new attributes `data-transition-ms="700"`, `data-transitions="<n>"`. Behaviour: the numerals are text swapped on state change — never tweened, no intermediate number ever; fill and footprint move by CSS `transition` of `var(--meter-ms)` (700 ms, `ease-out`; hard cap 800); on a `locked | submitted → released` or `→ refunded` change the root gets class `is-transitioning` for `--meter-ms` and `data-transitions` increments by exactly 1 (ref counter in an effect keyed on `featured.state`); `locked → submitted` moves only the fill (0.5 → 0.85) and changes no number and no counter; re-rendering with unchanged `featured` changes nothing; `prefers-reduced-motion: reduce` → `--meter-ms: 0ms`. T-10 rules kept verbatim: `released` renders `proof ✓ <captured_at>` beside the amount when `proofPresent`, else it stays at `submitted` wording; `featured === null` → `LOCKED 0.00`; refused rows never reach it.
- `PresentCanvas.tsx` — props `{ data: DashboardData; nowMs?: number; hideCards?: HideCard[]; taskId?: string }`, `HideCard = 'agent' | 'supply' | 'screening' | 'row2' | 'row3'`. In live mode (`data.dataMode === 'live'`) the canvas renders inside T-26's `LiveDashboard` (`initial = data`, `taskId`) so the meter, rows, screening log and mark counter refresh every 3 s; demo mode renders `data` as is. Hidden cards render nothing and their column keeps fixed grid rows so nothing else moves; the meter and row 1 can never be hidden; `.stage` carries `data-hidden="<comma list>"` (empty when none). Add `data-column="left|centre|right"` on the three columns and wrap each present-mode `TaskRow` in `<div data-testid="task-row" data-row="1|2|3">` — T-39's primary locators. Every `data-floor` T-10 set stays; no bare px inside `.stage`.
- `app/(present)/present/page.tsx` (`/present`): reads `?hide=agent,supply,screening,row2,row3` → `hideCards` (unknown names ignored), `?task=<id>` → `taskId` passed to `await loadDashboardData(mode, { taskId, state })` and the canvas, `?state=` (demo, as T-10), `?crop=1` → also renders `CropGuide.tsx` (two `--hairline-1` vertical rules at the 9:16 band edges and a `--fg-4` mono label `9:16 band 656–1264`) — a rehearsal aid, never in the filmed frame. `/?present=1` (T-10's `app/page.tsx`, frozen) keeps rendering the default canvas; the operator films `/present?task=<id>[&hide=…]` when a pin or a cut is needed.
- `app/(present)/crop.ts`: `nineSixteenBand(w, h) → { left, right, width }` (`width = h × 9/16`, `left = (w − width)/2`) and `insideBand(box, band)` — same numbers as T-39's `e2e/lib/crop.ts`: `656.25 / 1263.75` at 1920×1080, `437.5 / 842.5` at 1280×720.
- `present.css` additions: `.stage { --meter-ms: 700ms }`, `.meter-fill { transition: width var(--meter-ms) ease-out }`, `.meter-footprint { transition: color var(--meter-ms) ease-out }`, `@media (prefers-reduced-motion: reduce) { .stage { --meter-ms: 0ms } }`, fixed grid rows per column, `[data-hidden]` rules. Every length still `calc(<design px> * var(--u))`.
- `app/(present)/README.md`: the query parameters, the one-shot rule, the clock source, the cut order T-47 follows (`row3` → `row2` → anything narrated only with a narration change).

## 3. Out of scope
- `lib/**`, `/task`, `/refusals`, `/admin`, `PosterStats` (T-26); the other components (frozen, T-10 — `BLOCKED:` if a prop is missing); the e2e gate itself (T-39 — you re-run it); the composite and the read (T-47); `app/page.tsx`, `app/layout.tsx`, `opengraph-image.tsx`.
- Do not touch: `apps/dashboard/components/*` other than `EscrowMeter.tsx`, `apps/dashboard/e2e/**`, `apps/dashboard/package.json`, `demo-data.json`, `packages/**`, `apps/api/**`.

## 4. Owned paths
```
apps/dashboard/app/(present)/**   apps/dashboard/components/EscrowMeter.tsx   apps/dashboard/test/present*.test.tsx
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `LiveDashboard { initial; taskId?; children: (data) => ReactNode }`, `useLiveDashboard`, `loadDashboardData(mode, { taskId?, state? })` (awaited; `getDashboardData` stays synchronous and returns the empty live shape) | T-26 `lib/live/*`, `lib/data/index.ts` | 3-s poll with the `changed` short-circuit; `?task=` pin |
| `DashboardData`, `FeaturedTask { taskId; state: 'locked' \| 'submitted' \| 'released' \| 'refunded'; agentPays; escrowLocked; workerReceives; fee; postedAt; releaseTx?; proofPresent }`, `TaskRowData`, `ScreeningLine`, `AgentData` | T-10 `lib/data/types.ts` | shapes verbatim |
| `EscrowMeter` current markup: fill by state `locked 0.5 · submitted 0.85 · released 1.0 · refunded 0`; big line `LOCKED 3.45` / `RELEASED 3.00 → worker · +0.45 fee` / `REFUNDED 3.45 → buyer`; small mono totals line; `data-testid="escrow-meter"`, `data-state`, `data-progress`; footprint own SVG in `--verified-500` | T-10 `components/EscrowMeter.tsx` | keep every string and attribute; add the transition |
| `AgentCard` (`data-testid="mark-counter"`, `is-animating` 600 ms on `marks` increase), `TaskRow`, `PreflightTrio`, `ScreeningLog`, `Chip`, `Wordmark` | T-10 components | rendered by the canvas, unchanged |
| `.stage { --u: min(100vw / 1920, 100vh / 1080) }`, columns 580 / 560 / 580, gaps 40, margins 60 (centre x 680–1240), header 96, present type scale (escrow 84, marks + preflight 56, price 40, chips 32, body 24, labels 16), the `data-floor` map | T-10 `present.css`, `PresentCanvas.tsx` | geometry and floors must survive your edits (T-39 re-run) |
| `GET /healthz` | `api-contract.ts` (public) via T-10's rewrite `/api/:path*` | any response with a `Date` header |
| `nineSixteenBand` numbers, `collectFloors`, `artifacts/floors.json` | T-39 `e2e/lib/*` | mirror the math; read `floors.json` to see which card sits closest to a floor before proposing a cut |
| `demo-data.json` via `DemoData` | `packages/shared` | `postedAt` anchor, money `{3.45, 3.45, 3.00, 0.45}`, the four rows |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `/present?task=&hide=&state=&crop=1`, `PresentCanvas { data; nowMs?; hideCards?; taskId? }`, `HideCard` | `app/(present)/present/page.tsx`, `PresentCanvas.tsx` | T-47 (films `/present?task=<id>[&hide=…]`), T-39 re-run |
| `EscrowMeter` `data-transition-ms`, `data-transitions`, class `is-transitioning` | `components/EscrowMeter.tsx` | T-47 (confirms one transition on the take), tests |
| `formatClock`, `formatElapsed`, `fetchServerOffset`, `useServerNow` | `app/(present)/*.ts(x)` | T-44 (terminal inserts show the same clock), T-47 |
| `data-column`, `[data-testid="task-row"][data-row]`, `data-hidden` | `PresentCanvas.tsx` | T-39 locators, T-47 record |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-43` — it must print `CLAIMED T-43`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `apps/dashboard/README.md` (present mode), `PresentCanvas.tsx`, `present.css`, `EscrowMeter.tsx`, T-26's `lib/live/LiveDashboard.tsx`, T-39's `e2e/lib/crop.ts` and the latest `floors.json` from CI.
2. `EscrowMeter.tsx`: add the transition (effect keyed on `featured?.state`, ref counter, class timer honouring `--meter-ms`); `meterAnimatesOnceOnRelease` and `meterStaticOnRefusal` first.
3. `serverTime.ts`, `Clock.tsx`, `ElapsedTimer.tsx`; `clockUsesServerTime`.
4. `PresentCanvas.tsx` (`LiveDashboard` in live mode, `hideCards`, `data-column`, row wrappers), `crop.ts`, `CropGuide.tsx`, `present/page.tsx`, `present.css`; `hideCardsKeepsCentreFixed`.
5. Re-run T-39's gate (`pnpm --filter @legwork/dashboard e2e`) in demo mode: floors, three rows, meter + row 1 in the band must still pass with and without `?hide=row3`.
6. README, tests, PR with the two 1280×720 PNGs from the gate attached.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `meterAnimatesOnceOnRelease` | render `EscrowMeter` `featured.state: 'locked'` (3.45) → `data-transitions="0"`; rerender `submitted` → still `"0"`, text contains `3.45` and not `3.00`, `data-progress` rose; rerender `released` (`proofPresent: true`, `releaseTx`) → `data-transitions="1"`, class `is-transitioning` present, `data-transition-ms` ≤ 800, text contains `RELEASED`, `3.00`, `0.45`, `proof ✓`; across all three renders every `\d+\.\d\d` match ∈ {`3.45`, `3.00`, `0.45`, `0.00`, `10.00`} (totals line only); rerender identical released props → `"1"`, class gone after 700 ms (fake timers); with `prefers-reduced-motion` matched, `--meter-ms` resolves to `0ms` |
| `meterStaticOnRefusal` | render `PresentCanvas` (demo, `locked`); rerender with a refused `TaskRowData` prepended, a matching refused `ScreeningLine` and `agent.marks: 1` → `[data-testid="escrow-meter"]` `outerHTML` identical, `data-transitions="0"`, no `is-transitioning`; the mark counter did animate (`is-animating`, `data-to="1"`) — the refusal reached the canvas and the meter ignored it |
| `clockUsesServerTime` | msw `GET /api/healthz` → header `Date: Thu, 10 Sep 2026 14:32:05 GMT`; `vi.setSystemTime('2026-09-10T09:00:00Z')`; render `Clock` → text `formatClock(Date.parse(header))` (not `formatClock(Date.now())`), `data-source="server"`; `ElapsedTimer` with `postedAt = header − 252 s` reads `t+04:12 since posted`; with the handler replaced by a network error, a fresh render shows `data-source="local"` and the suffix `· local`; `formatElapsed` at 3 725 s → `t+1:02:05 since posted`, at −5 s → `t+00:00 since posted` |
| `hideCardsKeepsCentreFixed` | `PresentCanvas` with `hideCards: ['agent', 'supply']` → no `mark-counter`, no pool chip; the meter, row 1, clock and timer present with their `data-floor`; `.stage[data-hidden="agent,supply"]`; `['row2','row3']` → exactly one `[data-testid="task-row"]`; `hideCards: []` → three rows and `data-hidden=""`; the centre column's children are unchanged in both cases (same `data-column="centre"` `innerHTML` modulo the row wrapper) |
| `pnpm --filter @legwork/dashboard e2e` | T-39's `presentModeLegible` still green after your changes, with and without `?hide=row3` (the gate shoots the default canvas; check `/present?hide=row3` by hand against the running server — two rows, meter and row 1 unmoved — and paste both PNGs) |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/dashboard typecheck && pnpm --filter @legwork/dashboard lint
pnpm --filter @legwork/dashboard test
DATA_MODE=demo pnpm --filter @legwork/dashboard e2e
DATA_MODE=demo pnpm --filter @legwork/dashboard build
```
Expected: clean; T-10's, T-26's and your 4 named tests green; the e2e gate green; build lists `/present`.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. Elapsed ≥ 1 h is `t+h:mm:ss`, never `<n>h`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top). The meter shows exactly these strings from `featured` — no tweened, rounded or interpolated number ever appears, in any frame of the transition.
- No secrets in code or client bundles; `fetchServerOffset` calls only the public `/api/healthz`; nothing new under `NEXT_PUBLIC_*`; you may not edit `.env.example`.
- Tests never call a live model or a live chain; network = msw; time = `vi.useFakeTimers()`.
- **The meter moves only on release/refund; a refused task moves no money** (asserted by `meterStaticOnRefusal`); **never show escrow releasing without the proof beside it** (`proof ✓ <captured_at>` in the released line; `proofPresent: false` keeps the `submitted` wording).
- One change, ≤ 800 ms, `ease-out`, no counting animation, no flashes, no second movement; `prefers-reduced-motion` → instant.
- Leiria only; no faces, no emoji, no gradients, no red (`--refusal-500 #E4A33F` is the only warm colour; the meter uses `--verified-500 #35C79A` footprint and lit fill, `--ink-700 #202522` track, `--fg-4 #5B615D` refunded footprint, `--hairline-1 #1E2320` crop guide, `--fg-3 #8B918D` labels, `--fg-1 #F1EFE9` numerals); Archivo numerals (escrow 84 present / stat-xl), JetBrains Mono clock and timer 32; every present length `calc(<design px> * var(--u))`; hit targets ≥ 44 px (present mode has none — add none). The verified chip is always above the fold on the phone (not your surface; do not add phone markup here). Every seeded row keeps its `seeded` chip; the pool chip reads `1 real · +20 seeded (demo data)` — hiding `supply` removes the card, never rewrites the string.
- Nothing copied from `pitch/` or `design-system/`; the footprint stays T-10's own drawing.
- Legibility floors (verbatim): "Nothing the narration mentions renders below **24 px** in the delivered 1080p frame; the honesty chips, the refusal class + reason line, the escrow states and the three preflight numbers are **≥ 32 px** at design size — mark them `data-floor="32"`, everything narrated `data-floor="24"`. … `?present=1` shows at most: the escrow meter, the agent card with the mark counter, the screening log, the preflight trio, three task rows, the wall clock and `t+mm:ss since posted` — not the nine-card mock. The escrow meter and one feed row sit inside a centre column that survives a 9:16 crop." `hideCards` may only remove from that list, never add.
- The ten hard rules (verbatim): (1) The three locked copy blocks (tagline, claim, trust model) are reproduced exactly. (2) Never show escrow releasing without a proof above or beside it; never show a refusal moving the escrow meter — "a refused task moves no money". (3) The tag is `task-refused` (never "violation"); the name is Legwork. (4) Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia. (5) "Bot-proof, not fraud-proof"; "bounded, attributable work"; never "trustless". (6) No faces anywhere — the worker is hands and a phone. (7) Locations are Leiria. Never Brooklyn, never "24h". (8) The filmed worker account shows only what it actually earned. (9) Every seeded row — worker or task — carries a `seeded` chip; the pool reads "1 real · +20 seeded (demo data)". (10) Fee figures are **3.45 / 3.00 / 0.45** (agent pays / worker receives / fee) on every surface; no deducted-fee numbers anywhere.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`, plus the dashboard e2e job.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 and the two gate PNGs pasted into the PR.
- [ ] `app/(present)/README.md` written.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.
- [ ] Operator (after merge, live deployment): open `/present?task=<rehearsal id>&crop=1`, watch one rehearsal release — one movement, clock matches the phone's `captured_at` within 2 s; note it in `docs/spikes/RESULTS.md`. The agent states in the PR that this is the operator's step.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-43 — Present-mode polish
owned-paths:
  - apps/dashboard/app/(present)/**
  - apps/dashboard/components/EscrowMeter.tsx
  - apps/dashboard/test/present*.test.tsx
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
Gate: presentModeLegible green after change · meter x <l>–<r> · row1 x <l>–<r> · min 720p floors 24: <n> / 32: <n>
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it. Frozen interfaces: `INTERFACE REQUEST:`. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
Known at dispatch: if `LiveDashboard`'s signature differs from §5, use T-26's exported name and say so; if the `Date` header is stripped by the rewrite in your local run, test against `NEXT_PUBLIC_API_BASE_URL` directly and note it — never fall back to the laptop clock silently (`source: 'local'` + suffix is the fallback). If a floor fails after your change, fix your CSS — never the floor.

## 14. Reviewer notes
Open `EscrowMeter.tsx` first (effect keyed on `featured?.state` only; counter increments on `→ released | refunded`; numerals are plain text; no `requestAnimationFrame` counting), then `PresentCanvas.tsx` (`LiveDashboard` only in live mode; hidden cards leave fixed rows; `data-column`, row wrappers; floors intact), then `serverTime.ts` (round-trip halved; failure → local + suffix), then `present.css` (no bare px). Most likely wrong: the transition firing on the first mount (`data-transitions` must start at 0 and not count the initial state); `meterStaticOnRefusal` passing only because the refused row never reaches the canvas (assert the mark counter animated); the clock formatted in UTC instead of the local zone; `hideCards` reflowing the centre column.

## 15. Round 2+
Amended (Sept 6): the data comes from `await loadDashboardData(mode, { taskId, state })` — `getDashboardData` is synchronous and returns the empty live shape. T-26's `LiveDashboard` exists exactly as §5 says and `useLiveDashboard` carries `highlighted.level` through the poll. `/` already mounts `LiveMissionControl` (lead); `/present` passes `?task=` into the loader and the canvas is yours to make live.
