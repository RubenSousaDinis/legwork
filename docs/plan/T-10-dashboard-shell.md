---
id: T-10
title: Dashboard shell on DESIGN-SPEC — tokens, cards, present mode, data-floor
lane: D
day: 1
size: M
agent_class: C
must: true
depends_on: [T-01b]            # T-01b (TypeScript side: DemoData schema, enums) must be merged
owned_paths:
  - apps/dashboard/**
labels: [area:dashboard, wave:1, size:M, agent:cloud]
branch: t-10/dashboard-shell
---

# T-10 — Dashboard shell on DESIGN-SPEC

## 1. Context
The dashboard (`apps/dashboard`) is the public, read-only mission control **and the video canvas**: the demo video films `/?present=1` full-frame at 1920×1080 with the phone as a picture-in-picture inset, then delivers 1080p that judges often watch at 720p. Everything the narration names must survive that. This task builds the shell on the **ink ground** from the repo's `DESIGN-SPEC.md` (the token table is repeated in §10 so you do not depend on it), every component with its honesty behaviour built in, the sparse present mode, and a `DATA_MODE=demo` adapter that reads `demo-data.json` and shows a visible "DEMO DATA" chip. T-26 wires live data (`/public/*` + subgraph) into the `DashboardData` shape you define; T-39 measures your `data-floor` attributes with Playwright; T-43 polishes present mode; T-47 reads the composited PNG.

> 02-architecture, dashboard: "public, read-only, at the domain; operator controls behind an env-gated key from the first commit. Routes: `/` (the video canvas; `?present=1` shows at most three task rows plus the card the narration is on), `/task/<id>` …, `/refusals` …. Size floors: nothing the narration mentions below 24 px in the delivered 1080p frame; honesty chips, the refusal class + reason and the three preflight numbers ≥ 32 px at design size; three task rows; the escrow meter and one feed row inside a centre column that survives a 9:16 crop. OG/Twitter-card meta so every link unfurls with the escrow meter. Seeded chips on seeded **task** rows as well as worker rows."

> 05-demo-video, legibility: "The Day-7 dashboard is built as a *sparse video canvas* (`?present=1`): escrow meter, agent card with the mark counter, screening log, preflight trio, three task rows — not the nine-card mock. … The escrow meter is the money shot and must be legible as a **change**: one uncut shot where LOCKED 3.45 becomes RELEASED 3.00 + 0.45. It moves only on release/refund; **a refused task moves no money.** A task-elapsed timer (`t+04:12 since posted`) and the wall clock stay visible on both sides of the labeled cut. … Preflight is on screen ≤5 s with the seeded/real split. Any median shown is either computed from real completions (n=1 on demo day — say so) or labeled 'seeded'."

> 09-design-prompt, demo data: "Worker pool card: **'1 real · +20 seeded (demo data)'** — never '21 workers' · ONE row highlighted `#w-0417 · verified human ✓ · sandbox World ID · <N> min (real)` · the seeded rows carry a **seeded** chip · preflight for `verify-open` near Leiria: **4 active · 1 verified · 3 seeded** · score ≥ 4.2 · any median shown is labeled 'seeded' or computed from real completions only. Screening log: the refusal … with the classifier's one-line reason; beneath it the quieter free-text line and two PASSED lines ('schema ok · placeId resolved'). `call-confirm` proof is always 'self-reported answer + timestamp (unverified)'."

## 2. Exact scope
- Tokens of §10 typed as CSS custom properties in `app/globals.css`; Google Fonts `Archivo` 400–900, `Inter` 400–700, `JetBrains Mono` 400–700 via one `<link>` + `preconnect`; body `background: var(--ink-900); color: var(--fg-2)`. No red token anywhere.
- Components in `components/` with the props of §6: `Chip`, `MonoTag`, `StatusBadge`, `EscrowMeter`, `AgentCard`, `WorkerPool`, `ScreeningLog`, `PreflightTrio`, `TaskRow`, `PosterStats`, `SectionLabel`, `Wordmark`. Pure presentational: data in via props, no fetching, no `next/navigation` hooks inside them (they must render with `react-dom/server` and in jsdom).
- `lib/data/types.ts` (`DashboardData`, §6), `lib/data/demo.ts` (reads `demo-data.json` from the repo root, validates with `DemoData` from `@legwork/shared`, maps to `DashboardData`; supports `?state=locked|submitted|released|refunded` to preview meter states), `lib/data/index.ts` (`getDashboardData(mode, opts)`; `mode` from `process.env.DATA_MODE`, unset → `'demo'`; `'live'` returns an empty `DashboardData` with `dataMode: 'live'` until T-26 replaces it).
- `app/layout.tsx` (fonts, `metadata` with `openGraph`/`twitter` cards pointing at `/opengraph-image`), `app/page.tsx` (`/`: normal mission control; `?present=1` → the present canvas), `app/(present)/PresentCanvas.tsx`, `app/(present)/present.css`, `app/(present)/Clock.tsx`, `app/(present)/ElapsedTimer.tsx`, `app/(present)/present/page.tsx` (`/present` = same canvas, no query needed), `app/opengraph-image.tsx` (`ImageResponse` from `next/og`, 1200×630, ink ground, wordmark, the featured escrow state and amounts, "DEMO DATA" text in demo mode).
- Present mode geometry (design units, see §7): stage 1920×1080 scaled fluidly with `--u`; three columns 580 / 560 / 580 with 40-px gaps and 60-px margins so the centre column (x 680–1240) sits inside the 9:16 crop band (x 656–1264); header 96 tall with wordmark, wall clock, elapsed timer, chips. Content: **centre** EscrowMeter + task row 1; **left** AgentCard + Supply card (PreflightTrio + one highlighted worker row + the pool chip); **right** ScreeningLog + task rows 2–3. Nothing else.
- `data-floor` attributes on every present-mode element that the narration names (list in §7) and CSS that sets those elements' present-mode sizes ≥ the floor in design px.
- `DATA_MODE=demo` renders the chip `DEMO DATA` in the header of every route (normal and present) and in the OG image; `live` never renders it.
- `next.config.ts`: `rewrites()` `afterFiles`: `/api/:path*` → `${NEXT_PUBLIC_API_BASE_URL}/:path*` (default `http://localhost:3001`) — T-26 calls the API through this same-origin prefix.
- Tests (§8) with vitest + jsdom + `@testing-library/react`; scripts in `apps/dashboard/package.json`: `dev`, `build`, `start`, `typecheck`, `lint`, `test` (`vitest run`), `e2e` (`playwright test --config e2e/playwright.config.ts` — the config is T-39's; the script is declared now), `e2e:install` (`playwright install --with-deps chromium`). Edit `scripts` only, never `dependencies`.
- `apps/dashboard/README.md`: routes, `DATA_MODE`, present mode, floor attributes, how T-26/T-39/T-43 plug in.

## 3. Out of scope
- Live data (`/public/*`, subgraph), `/task/[id]`, `/refusals`, `/admin`, per-route OG images, mark polling — T-26. Playwright — T-39. Clock sync with the API, the one-shot LOCKED → RELEASED animation, card cuts — T-43. PNG read — T-47.
- Do not touch: `demo-data.json` (read-only import), `packages/**`, `apps/api/**`, `apps/miniapp/**`, `.env.example`, root configs, `.github/**`.

## 4. Owned paths
```
apps/dashboard/**
```
After this PR merges: `lib/**`, `app/task/**`, `app/refusals/**`, `app/admin/**` → T-26; `e2e/**` → T-39; `app/(present)/**` + `components/EscrowMeter.tsx` → T-43 (Day 6–7). The rest of `apps/dashboard` is frozen after merge; later tasks request changes with `BLOCKED:`.

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `DemoData` zod schema + type | `packages/shared/src/schemas` | field names of `demo-data.json`: shop `Farmácia Central · Rua Direita 12, Leiria`, worker `#w-0417`, agent `#8004-1207`, money `{agent_pays: 3.45, escrow_locked: 3.45, worker_receives: 3.00, fee: 0.45}`, four feed rows (verify-open released · hire_human/call-confirm refused, class `authentication circumvention` · photo-of submitted (seeded) · compare-two open (seeded)), pool `{real: 1, seeded: 20}`, preflight `{active: 4, verified: 1, seeded: 3, score_floor: 4.2, median_minutes: 9, median_source: 'seeded'}`, chips, `narrationVariant`, `tx_placeholder '0x8f2a…c41d'` — import the type; never retype the numbers |
| `TaskType`, `TaskState`, `AbuseClass` (six labels verbatim), `FeedbackTag` | `packages/shared/src/enums.ts` | tag text, badge enums |
| `priceWithFee`, `fromUsdcUnits`, `PUBLIC_COORD_DECIMALS` | `packages/shared/src/constants.ts` | fallback when a row lacks `agent_pays`; never compute a deducted figure |
| Env | `.env.example` | `DATA_MODE=live\|demo` (server), `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUBGRAPH_QUERY_URL` |
| `next`, `react`, `react-dom`, `tailwindcss`, `vitest`, `jsdom`, `@testing-library/react`, `@playwright/test`, `msw` | `apps/dashboard/package.json` (T-00 catalog) | missing → `DEP REQUEST:` and stop |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `DashboardData { dataMode: 'demo' \| 'live'; featured: FeaturedTask \| null; totals: { lockedUsdc, releasedTodayUsdc, refundedUsdc }; feed: TaskRowData[]; agent: AgentData; pool: PoolData; screening: ScreeningLine[]; preflight: PreflightData; posterStats: { distinctExternalBuyers, externalTasks }; generatedAt: string }` | `lib/data/types.ts` | T-26 (live adapter), T-43, T-39 |
| `FeaturedTask { taskId; state: 'locked' \| 'submitted' \| 'released' \| 'refunded'; agentPays: number; escrowLocked: number; workerReceives: number; fee: number; postedAt: string; releaseTx?: string; proofPresent: boolean }` | same | same |
| `TaskRowData { taskId; type: TaskType \| 'free-text'; title; priceUsdc: number; agentPaysUsdc: number; state: TaskState-name \| 'refused'; meta: string; seeded: boolean; refusal?: { class: AbuseClass \| null; reason: string }; tx?: string }` | same | same |
| `AgentData { id: string /* '8004-1207' */; label?: string; score: number \| null; paidOnProof: number; marks: number; lastMarkClass?: AbuseClass }` | same | same |
| `PoolData { real: number; seeded: number; highlighted?: { id: string; minutesReal?: number; level: 'selfie' \| 'orb' }; rows: { id: string; seeded: boolean; area: string; completed: number }[] }` | same | same |
| `ScreeningLine { at: string; outcome: 'refused' \| 'passed'; taskType: TaskType \| 'free-text'; class?: AbuseClass \| null; reason: string; ruleId?: string; specHash: string; marked: boolean; markTx?: string; agentId?: string }` — **never a spec text field** | same | T-26 |
| `PreflightData { active; verified; seeded; scoreFloor; medianMinutes: number \| null; medianSource: 'real' \| 'seeded' \| 'n/a'; nReal }` | same | T-26 |
| `poolString(real, seeded) = "${real} real · +${seeded} seeded (demo data)"` | `lib/format.ts` | WorkerPool, PreflightTrio, T-26 |
| `usdc(n) → "3.45"` (always two decimals), `elapsed(fromIso, nowMs) → "t+04:12 since posted"`, `duration(s)` → `"23 min"` / `"1 h 40 min"` (hours always with a space) | `lib/format.ts` | all |
| `Chip { tone: 'neutral' \| 'verified' \| 'refusal' \| 'seeded' \| 'demo'; floor?: 24 \| 32; children }` | `components/Chip.tsx` | T-26 |
| `StatusBadge { status: 'open' \| 'claimed' \| 'submitted' \| 'released' \| 'refunded' \| 'disputed' \| 'resolved' \| 'refused' \| 'passed' \| 'locked'; size?: 'md' \| 'sm' }` | `components/StatusBadge.tsx` | T-26 |
| `EscrowMeter { featured: FeaturedTask \| null; totals; present?: boolean }` — `data-testid="escrow-meter"`, `data-state`, `data-progress` | `components/EscrowMeter.tsx` | T-43 (owner later) |
| `AgentCard { agent: AgentData; present? }` — `data-testid="mark-counter"` with `data-value`, `data-from`, `data-to`, class `is-animating` for 600 ms when `marks` increases | `components/AgentCard.tsx` | T-26 test `markCounterAnimates` |
| `WorkerPool { pool: PoolData }`, `PreflightTrio { preflight; pool; present? }`, `ScreeningLog { lines; present?; max? }`, `TaskRow { row: TaskRowData; present? }`, `PosterStats { stats }` | `components/*.tsx` | T-26 |
| `PresentCanvas { data: DashboardData; nowMs?: number }` | `app/(present)/PresentCanvas.tsx` | T-43 (owner later), T-39 |
| `getDashboardData(mode, { state? })` | `lib/data/index.ts` | pages, T-26 replaces the live branch |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-10` — it must print `CLAIMED T-10`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `DESIGN-SPEC.md`, `packages/shared/src/schemas` (`DemoData`), `enums.ts`, `constants.ts`, `demo-data.json`.
2. Tokens + fonts + `globals.css`. Component rules: ink cards `--ink-800`, 1 px `--border-1`, radius 12, no shadow; chips mono, pill, 1 px border in the semantic colour at .45–.5 alpha, fill tinted .08–.1; task-type tags mono on `--ink-700`, radius 6; section labels mono uppercase 16 px, +0.1em, `--fg-3`.
3. Components, honesty built in:
   - `EscrowMeter`: the route motif as a working meter — dot (request) → dashed route → footprint (proof); draw the footprint as your own simple inline SVG (a sole and a heel, two rounded shapes), always `--verified-500`. Fill by state: `locked` 0.5, `submitted` 0.85, `released` 1.0 (footprint lit), `refunded` 0 (footprint `--fg-4`). Big line: `LOCKED 3.45` / `RELEASED 3.00 → worker · +0.45 fee` / `REFUNDED 3.45 → buyer`; small mono line: `locked in open tasks X.XX · released today Y.YY · refunded Z.ZZ · per-task cap 10.00 · Base Sepolia · USDC`. **It receives only the featured funded task; refused rows never reach it.** `featured === null` → `LOCKED 0.00` at progress 0.
   - `AgentCard`: `#<id>` mono, label, `score` (hidden when `null`), `<n> tasks paid on proof`, the mark counter numeral (Archivo 56) with label `marks` and, under it, `task-refused:<class>` when `lastMarkClass` is set; chip `ERC-8004 identity`. Animation: on `marks` increase set `data-from/data-to`, add `is-animating` (amber pulse on the numeral, 600 ms, `prefers-reduced-motion` → instant), then `data-value = marks`.
   - `WorkerPool`: headline = `poolString(real, seeded)` as a `Chip tone="seeded"`; never any other total; highlighted row `#w-0417 · verified human ✓ · sandbox Selfie Check|World ID · <N> min (real)` when present; every `seeded` row carries `Chip tone="seeded">seeded`.
   - `ScreeningLog`: each line `REFUSED · <class> · <reason> · spec <specHash short> · task-refused → #<agentId> · tx ↗` (amber badge) or `PASSED · schema ok · placeId resolved · spec <short>` (teal badge). Renders **only** the `ScreeningLine` fields — there is no spec text to render.
   - `PreflightTrio`: `4 active · 1 verified · 3 seeded` as three Archivo numerals with mono labels, `score ≥ 4.2`, median `9 min (seeded)` or `<n> min (real, n=1)` or `—` per `medianSource`; with `present` it also shows the highlighted worker row and the pool chip (the Supply card).
   - `TaskRow`: `MonoTag type` (free-text → tag `free text`), title, price `3.00` Archivo + `USDC`, mono `agent paid 3.45`, `meta`, `StatusBadge`; `state === 'refused'` → 1 px `--refusal-border` border and a `class: … · reason` line; `seeded` → chip `seeded`. `call-confirm` rows always get the meta suffix `self-reported answer + timestamp (unverified)`.
   - `PosterStats`: `external posters <n> · external tasks <n>` + mono `excludes allowlisted buyers`.
4. Present mode. `present.css` defines `.stage { --u: min(100vw / 1920, 100vh / 1080); width: calc(1920 * var(--u)); height: calc(1080 * var(--u)); margin: 0 auto; background: var(--ink-900) }` and **every length inside the stage is `calc(<design px> * var(--u))` — never a bare px, never `transform: scale()`, never `zoom`** (T-39 reads `getComputedStyle().fontSize`, which must equal the rendered size). Present type scale (design px): escrow primary amount 84, marks numeral + preflight numbers 56, task-row price 40, chips 32, refusal class + reason 32, narrated body/meta 24, card titles 24, section labels 16. Header: `Wordmark` left; centre `Clock` (`HH:MM:SS`, mono 32, local time — T-43 syncs it) + `ElapsedTimer` (`t+mm:ss since posted` from `featured.postedAt`, mono 32; demo mode anchors `postedAt` to load-time − 252 s so it reads `t+04:12` at load); right: chips (`DEMO DATA` when demo, `Base Sepolia · USDC`, `testnet USDC — not spendable`).
   `data-floor="32"`: every chip, the refusal class + reason line, the three preflight numerals and their labels, the escrow state word and its amounts, the pool chip. `data-floor="24"`: task-row title/price/badge/meta, agent id, `paid on proof`, marks numeral + label, clock, elapsed timer, PASSED lines, the highlighted worker row. Section labels carry no floor.
5. `lib/data/demo.ts`: featured = feed row 1 (verify-open) with money from the `money` block; `state` from `?state=` (default `released`); `proofPresent = state !== 'locked'`; totals from the rows (locked = sum of unreleased funded rows incl. fee); screening lines = the refusal + the quieter free-text line + two PASSED lines; agent marks = 1 for `released`, 0 for `locked` (the pre-beat-6 state); pool/preflight straight from the JSON; `posterStats` zeros.
6. `app/page.tsx`: server component; `searchParams.present === '1'` → `PresentCanvas`; else the normal layout (feed left; escrow + agent centre; pool, screening, preflight, poster stats right; min-width 1280, single column below). Both render the `DEMO DATA` chip when `dataMode === 'demo'`.
7. `opengraph-image.tsx`, tests, README, PR.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `refusalNeverMovesMeter` | render `PresentCanvas` with demo data (state `locked`); render again with a new refused `TaskRowData` prepended to `feed` and a matching refused `ScreeningLine`; the outer HTML of `[data-testid="escrow-meter"]` is identical in both renders (`data-state`, `data-progress`, amounts) |
| `seededRowsAlwaysChipped` | for every demo feed row with `seeded: true` the rendered `TaskRow` contains a chip whose text is exactly `seeded`; for every seeded pool row the same; rows with `seeded: false` have none |
| `poolStringExact` | `poolString(1, 20) === '1 real · +20 seeded (demo data)'`; the rendered `WorkerPool` and Supply card contain that string and never the text `21` |
| `demoModeShowsChip` | `dataMode: 'demo'` renders a chip with text `DEMO DATA` in normal and present layouts; `dataMode: 'live'` renders none |
| `presentFloorsDeclared` | in `PresentCanvas`, every chip, the refusal line, the three preflight numerals, the escrow state + amounts carry `data-floor="32"`; task rows, agent id, marks, clock, timer carry `data-floor="24"`; no element inside `.stage` has an inline `px` length |
| `moneyStringsExact` | the released demo render contains `3.45`, `3.00`, `0.45` and no other money figure derived from them (no `2.`-prefixed amount anywhere) |
| `pnpm --filter @legwork/dashboard build` | passes; routes `/`, `/present`, `/opengraph-image` listed |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/dashboard typecheck && pnpm --filter @legwork/dashboard lint
pnpm --filter @legwork/dashboard test
DATA_MODE=demo pnpm --filter @legwork/dashboard build
```
Expected: clean typecheck/lint; 6 named tests green; build lists the three routes.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. Format hours with a space (`1 h 40 min`), never `<n>h`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). Never a deducted figure; never compute `amount − fee`.
- No secrets in code or client bundles; `DATA_MODE` is read on the server; nothing secret under `NEXT_PUBLIC_*`; you may not edit `.env.example`.
- Tests never call a live model or a live chain; no network in tests.
- Nothing copied from `pitch/` or `design-system/` (no token file, markup, SVG): the table below is typed by hand; the footprint glyph is your own drawing.
- Ink tokens (name → value → use): `--ink-950 #070808` canvas · `--ink-900 #0D0F0E` page · `--ink-850 #101211` bezel · `--ink-800 #151816` card · `--ink-700 #202522` tag fill / meter track · `--border-1 #262C28` card border · `--border-2 #2A302C` neutral chip border · `--hairline-1 #1E2320` frame rule · `--hairline-2 #1B201D` row rule · `--fg-1 #F1EFE9` primary type · `--fg-2 #C9CCC7` body · `--fg-3 #8B918D` muted / unverified / seeded · `--fg-4 #5B615D` dim numerals · `--fg-5 #4A504C` faintest · `--verified-500 #35C79A` verified human / released money — **the only accent** · `--verified-border rgba(53,199,154,.5)` · `--verified-tint rgba(53,199,154,.1)` · `--verified-tint-weak rgba(53,199,154,.08)` · `--refusal-500 #E4A33F` refusal amber — refusals are good news, never red · `--refusal-border rgba(228,163,63,.45)`. **Red exists nowhere in the product; do not define a red token.** Type: `--font-display 'Archivo'` 700–800, tracking −0.02em (display) / −0.03em (numerals); `--font-body 'Inter'`; `--font-mono 'JetBrains Mono'` for ids, addresses, hashes, contract names, chips, labels (uppercase, +0.1em). Normal-mode scale: stat-xl 84 · stat 56 · stat-sm 40 · h2 24 · body-md 18 · body-sm 15 · label 16 · chip 15; leading 1.1 tight / 1.5 body. Spacing 4-px base (4, 8, 12, 16, 20, 24, 28, 36, 44, 96). Radii: tag 6 · badge 8 · tile 10 · card 12 · card-lg 14 · pill 999. Flat backgrounds; no gradients, no blur, no shadows on ink, no icon font, no emoji; unicode `✓ · ↗ ●` only.
- Legibility floors (05/09, verbatim): "nothing the narration mentions may render below 24px in the delivered 1080p frame; the honesty chips, the refusal class + reason line, the escrow states and the three preflight numbers are ≥32px at design size." Declared with `data-floor`, enforced by T-39 at 1280×720 (floor × 2/3).
- Honesty chips are brand elements, never fine print: `1 real · +20 seeded (demo data)`, `sandbox World ID` / `sandbox Selfie Check`, `operator-attested`, `relayed claim · gas paid by Legwork`, `testnet USDC — not spendable`, `GPS unavailable in webview — disclosed`, `seeded`, `DEMO DATA`, `ERC-8004 identity`. On-screen lines: "cloud-verified, operator-attested — onchain World ID verification is Orb-only today." · "a refused task moves no money." · `call-confirm` = "self-reported answer + timestamp (unverified)".
- Honesty rules (09-design-prompt, verbatim): (1) Three copy blocks in `08-pitch-deck.md` are verbatim-locked (tagline, claim, trust model incl. the daily-cap clause) — reproduce exactly. (2) Never show escrow releasing without a proof above or beside it; never show a refusal moving the escrow meter ("a refused task moves no money"). (3) The tag is `task-refused` (never "violation"); the name is Legwork (never Witness/Fieldnote unless the collision check renamed it, in which case swap everywhere at once). (4) Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia. (5) "Bot-proof, not fraud-proof"; "bounded, attributable work"; never "trustless". (6) No faces anywhere — the worker is hands and a phone. (7) Locations are Leiria (the real shop once chosen). Never Brooklyn, never "24h". (8) The filmed worker account shows only what it actually earned. (9) Every seeded row — worker or task — carries a "seeded" chip; the pool reads "1 real · +20 seeded (demo data)". (10) Fee figures are 3.45 / 3.00 / 0.45 (agent pays / worker receives / fee) on every surface; no deducted-fee numbers anywhere.
- Rule (2) in the meter: the `released` state renders the line `proof ✓ <captured_at>` beside the amount when `proofPresent`; when `proofPresent` is false the meter stays at `submitted` wording — it never says RELEASED without a proof reference.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed; `dependencies` untouched.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `apps/dashboard/README.md` written.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-10 — Dashboard shell on DESIGN-SPEC
owned-paths:
  - apps/dashboard/**
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR, stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
Known at dispatch: `demo-data.json` may lack `posterStats` and per-row `agent_pays` — use zeros / `priceWithFee` and say so in the PR; do not edit the JSON.

## 14. Reviewer notes
Open `present.css` first (no bare px inside `.stage`, `--u` uses `min()`, no transforms), then `EscrowMeter` (takes only the featured task; `released` requires `proofPresent`), then `TaskRow`/`WorkerPool` (seeded chip, exact pool string, `agent paid 3.45` never a deduction), then the `data-floor` map against §7 step 4. Most likely wrong: components importing `next/navigation` (breaks tests), the 9:16 column maths (centre must be x 680–1240 at design size), the OG image reading `DATA_MODE` on the client.

## 15. Round 2+
—
