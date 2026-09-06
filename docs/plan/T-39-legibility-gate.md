---
id: T-39
title: Legibility gate — Playwright measures present-mode floors and the 9:16 column
lane: D
day: 5
size: S
agent_class: C
must: true
depends_on: [T-26]                   # T-10's data-floor markup + T-26's lib/ must be merged
owned_paths:
  - apps/dashboard/e2e/**
  - apps/dashboard/playwright.config.ts
labels: [area:dashboard, wave:5, size:S, agent:cloud]
branch: t-39/legibility-gate
---

# T-39 — Legibility gate

## 1. Context
T-10 declared the legibility floors as `data-floor="24|32"` attributes on every present-mode element the narration names and sized the stage in design pixels (`--u`). Nobody has measured them. This task is the measurement: a Playwright test opens `/?present=1` in `DATA_MODE=demo` at 1920×1080, reads every floored element's computed font size, checks that the escrow meter and one task row sit inside the centre column a 9:16 crop keeps, and saves the 1280×720 downscale that T-47 will read at arm's length. It writes **no UI**: a failing floor is reported to T-10/T-43 with `BLOCKED:`, never patched here. It is the Day-5 gate before T-43 polishes present mode and T-47 composites the final frame.

> 05-demo-video, legibility: "**Size floors, measured in the delivered 1080p frame:** nothing the narration mentions renders below 24px. Honesty chips, the refusal class + reason line, and the three preflight numbers ≥32px at design size. … **Test, don't assume:** on Day 7 export one PNG of the exact composited frame at 1280×720 and read it at arm's length. If '+20 seeded (demo data)' is not legible, cut a card. … Keep the dashboard's escrow meter and one feed row inside a centre column that survives a 9:16 crop (the vertical clip is cut from this footage)."

> T-10, present geometry (what you measure against): "stage 1920×1080 scaled fluidly with `--u`; three columns 580 / 560 / 580 with 40-px gaps and 60-px margins so the centre column (x 680–1240) sits inside the 9:16 crop band (x 656–1264) … every length inside the stage is `calc(<design px> * var(--u))` — never a bare px, never `transform: scale()`, never `zoom` (T-39 reads `getComputedStyle().fontSize`, which must equal the rendered size)."

## 2. Exact scope
- `apps/dashboard/e2e/playwright.config.ts` — the file T-10's `e2e` script already points at (`playwright test --config e2e/playwright.config.ts`): `testDir: '.'`, `testMatch: '**/*.e2e.ts'`, `timeout: 120_000`, `retries: 0`, `workers: 1`, `fullyParallel: false`, `reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]]`, `outputDir: 'artifacts/test-results'`, one project `chromium` with `use: { browserName: 'chromium', baseURL: 'http://localhost:3100', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: 'reduce', screenshot: 'off', trace: 'retain-on-failure' }` (do not spread `devices['Desktop Chrome']` — it resets the viewport to 1280×720), `webServer: { command: 'DATA_MODE=demo pnpm exec next build && DATA_MODE=demo pnpm exec next start -p 3100', url: 'http://localhost:3100/present', reuseExistingServer: !process.env.CI, timeout: 240_000 }`. `apps/dashboard/playwright.config.ts` is a one-line re-export of it so a bare `pnpm exec playwright test` from the package works too.
- `apps/dashboard/e2e/lib/floors.ts` — `collectFloors(page)` runs in the page and returns, for every `[data-floor]` element: `floor` (number), `fontSize` (`parseFloat(getComputedStyle(el).fontSize)`), `rendered720 = fontSize × 720 / 1080`, `text` (`textContent.trim().slice(0, 80)`), `box` (`getBoundingClientRect()`), `visible` (`box.width > 0 && box.height > 0`, `opacity !== '0'`, `visibility !== 'hidden'`), `clipped` (`el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1`), `tag`, `testid`. Also `assertFloors(rows)` → the list of failures with the message `<text> · floor <f> · computed <fontSize>px · at 720p <rendered720>px (needs ≥ <f × 2/3>px)`.
- `apps/dashboard/e2e/lib/crop.ts` — `nineSixteenBand(stageW, stageH) → { left, right, width }` with `width = stageH × 9 / 16` and `left = (stageW − width) / 2`: at 1920×1080 → `{ left: 656.25, right: 1263.75, width: 607.5 }`; at 1280×720 → `{ left: 437.5, right: 842.5, width: 405 }`. `insideBand(box, band)` → `box.left ≥ band.left && box.right ≤ band.right`. (607.5 is the band's **width**; a gate written as "x between 607 and 1313" is the width mistaken for an edge and passes layouts the 9:16 crop cuts — this gate uses the edges above.)
- `apps/dashboard/e2e/lib/downscale.ts` — `downscalePng(context, png: Buffer, w = 1280, h = 720) → Buffer`: opens `about:blank` in a new page, draws the PNG (as a data URL) onto a `<canvas>` of `w × h` with `imageSmoothingQuality = 'high'`, returns `toDataURL('image/png')` decoded to a Buffer, closes the page. No image library, no new dependency.
- `apps/dashboard/e2e/present.e2e.ts` — test `presentModeLegible` (steps in §7): released state at `/?present=1`, then `/?present=1&state=locked`; writes `artifacts/present-1920x1080.png`, `artifacts/present-1280x720.png` (the canonical CI artifact), `artifacts/present-locked-1280x720.png`, `artifacts/floors.json` (the `collectFloors` rows for both states) and attaches each with `testInfo.attach` so they appear in the HTML report.
- `apps/dashboard/e2e/crop.e2e.ts` — test `cropBandMath` (pure: the test function takes no fixtures, so no browser opens).
- `apps/dashboard/e2e/artifacts/.gitignore` (`*`, `!.gitignore`) and `apps/dashboard/e2e/report/.gitignore` (same). Nothing generated is committed.
- `apps/dashboard/e2e/README.md`: how to run locally, what each assertion means, how to read `floors.json`, the CI wiring the lead adds (`pnpm --filter @legwork/dashboard e2e:install` then `pnpm --filter @legwork/dashboard e2e`; upload `apps/dashboard/e2e/artifacts/**` and `apps/dashboard/e2e/report/**`; runs inside the `ts` job only if the browser install step succeeds, otherwise as a separate `e2e-dashboard` job).

## 3. Out of scope
- Any change to markup, CSS, tokens, floors or components (T-10 frozen; T-43 owns `app/(present)/**` and `EscrowMeter.tsx` from Day 6). Lowering a floor to pass. The live-mode composite and the arm's-length read (T-47). CI YAML (`.github/**`, the lead). The mini-app.
- Do not touch: anything under `apps/dashboard/` outside `e2e/**` and `playwright.config.ts`; `apps/dashboard/package.json` (scripts already exist); `demo-data.json`.

## 4. Owned paths
```
apps/dashboard/e2e/**   apps/dashboard/playwright.config.ts
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `data-floor="32"` on every chip, the refusal class + reason line, the three preflight numerals and labels, the escrow state word and amounts, the pool chip; `data-floor="24"` on task-row title/price/badge/meta, agent id, `paid on proof`, marks numeral + label, clock, elapsed timer, PASSED lines, the highlighted worker row | T-10 `PresentCanvas` + components | the attribute set you measure; section labels carry none |
| `[data-testid="escrow-meter"]` with `data-state`, `data-progress` | T-10 `EscrowMeter` | crop-band subject 1 |
| `[data-column="centre"]`, `[data-testid="task-row"]` | T-10 markup (expected; see §13) | crop-band subject 2 — fall back to the meter's next sibling element |
| `/?present=1`, `/present`, `?state=locked\|submitted\|released\|refunded` (default `released`), demo `postedAt` anchored so the timer reads `t+04:12` at load | T-10 `app/page.tsx`, `lib/data/demo.ts` | the two states you shoot |
| `.stage { --u: min(100vw / 1920, 100vh / 1080) }`, every length `calc(<design px> * var(--u))` | T-10 `present.css` | at 1920×1080 `--u = 1`, so computed px = design px |
| `DEMO DATA` chip in demo mode; pool chip text `1 real · +20 seeded (demo data)`; refusal line containing `authentication circumvention`; preflight `4 active · 1 verified · 3 seeded` | T-10, `demo-data.json` via `DemoData` | required members of the floor set |
| `e2e`, `e2e:install` scripts; `@playwright/test` | `apps/dashboard/package.json` (T-10 / T-00 catalog) | missing → `DEP REQUEST:` and stop |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `artifacts/present-1280x720.png`, `artifacts/present-locked-1280x720.png`, `artifacts/floors.json` (per run, uploaded by CI) | `apps/dashboard/e2e/artifacts/` | T-47 (compares its composite), T-43 (reads which card is closest to a floor before cutting) |
| `nineSixteenBand(w, h)`, `insideBand(box, band)` | `apps/dashboard/e2e/lib/crop.ts` | T-43 mirrors the math in `app/(present)/crop.ts` (same numbers: 656.25 / 1263.75 at 1920×1080) |
| `collectFloors(page)`, `assertFloors(rows)` | `apps/dashboard/e2e/lib/floors.ts` | any later e2e (T-47's live re-run) |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-39` — it must print `CLAIMED T-39`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `apps/dashboard/README.md` (present mode, floor attributes), `app/(present)/PresentCanvas.tsx`, `present.css`, `components/EscrowMeter.tsx`, `TaskRow.tsx`.
2. Config + re-export; run `pnpm --filter @legwork/dashboard e2e:install` once; confirm `pnpm --filter @legwork/dashboard e2e` finds zero tests and boots the server.
3. `lib/floors.ts`, `lib/crop.ts`, `lib/downscale.ts` with `cropBandMath` first (fast feedback).
4. `present.e2e.ts` — `presentModeLegible`:
   1. `page.goto('/?present=1')`; `await page.evaluate(() => document.fonts.ready)`; assert `document.fonts.check('700 16px Archivo')` and `check('400 16px "JetBrains Mono"')` are true — otherwise fail with `fonts did not load — the gate needs fonts.googleapis.com; rerun with network` unless `E2E_ALLOW_FALLBACK_FONTS=1` (then log a warning and continue). Wait for `[data-testid="escrow-meter"][data-state="released"]`.
   2. Assert the stage is `1920 × 1080` (`getBoundingClientRect()` of `.stage`, ±1) and `document.documentElement.scrollWidth ≤ 1920` (no horizontal overflow).
   3. `collectFloors` → at least 12 rows; `assertFloors` returns `[]`; every row `visible` and not `clipped`; every box inside the viewport.
   4. Required members: among `floor === 32` rows there is text containing `1 real · +20 seeded (demo data)`, `authentication circumvention`, the numerals `4`, `1`, `3` (three distinct rows), `RELEASED`, `3.00`, `0.45`; among `floor === 24` rows: `#8004-1207`, `/^\d\d:\d\d:\d\d$/`, `/^t\+\d\d:\d\d since posted$/`. The chip `1 real · +20 seeded (demo data)` has `fontSize ≥ 32`.
   5. Crop band: `band = nineSixteenBand(1920, 1080)`; `insideBand(meterBox, band)`; task row = `[data-column="centre"] [data-testid="task-row"]` if it exists, else the meter's next element sibling — `insideBand(rowBox, band)`; exactly 3 `[data-testid="task-row"]` (or, without the testid, exactly 3 occurrences of the mono text `agent paid` inside `.stage`).
   6. Honesty strings present in `.stage`: `DEMO DATA`, `seeded` chip text at least twice, `testnet USDC — not spendable`; absent anywhere in `document.body.innerText`: `21 workers`, `2.55`, `violation`, `trustless`, `Brooklyn`, `24h`.
   7. Screenshot 1920×1080 → `downscalePng` → write the three PNGs and `floors.json`; attach.
   8. `page.goto('/?present=1&state=locked')`; wait for `data-state="locked"`; repeat 3–4 with `LOCKED`, `3.45` as the required escrow members; save `present-locked-1280x720.png`; the meter's `data-progress` differs from the released run.
5. README; run the whole thing twice locally (second run uses `reuseExistingServer`); PR with the two PNGs pasted as images and `floors.json` summarised (min rendered720 per floor).

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `presentModeLegible` | everything in §7 step 4: fonts loaded; stage 1920×1080, no horizontal overflow; every `[data-floor]` element visible, unclipped, `fontSize × 720/1080 ≥ floor × 720/1080` (24 → ≥ 16.0 px; 32 → ≥ 21.33 px at 720p); the required members present with their floors; the pool chip ≥ 32 px; meter and one task row inside x 656.25–1263.75; exactly three task rows; honesty strings present, banned strings absent; both states shot; `artifacts/present-1280x720.png` exists and is 1280×720 |
| `cropBandMath` | `nineSixteenBand(1920, 1080)` → `{left: 656.25, right: 1263.75, width: 607.5}`; `nineSixteenBand(1280, 720)` → `{left: 437.5, right: 842.5, width: 405}`; `insideBand({left: 680, right: 1240}, band1080)` true; `insideBand({left: 607, right: 1313}, band1080)` false |
| `pnpm --filter @legwork/dashboard e2e` | boots the demo server, runs both tests green, leaves `e2e/artifacts/present-1280x720.png`, `present-locked-1280x720.png`, `floors.json` and `e2e/report/index.html`; `git status` shows no new tracked file under `e2e/artifacts` or `e2e/report` |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/dashboard e2e:install
pnpm --filter @legwork/dashboard e2e
file apps/dashboard/e2e/artifacts/present-1280x720.png        # expect: PNG image data, 1280 x 720
node -e "const r=require('./apps/dashboard/e2e/artifacts/floors.json');for(const f of [24,32]){const m=Math.min(...r.filter(x=>x.floor===f).map(x=>x.rendered720));console.log('floor',f,'min at 720p',m.toFixed(2))}"
git status --porcelain apps/dashboard/e2e | grep -v "^??.*\.gitignore" ; echo "expect only source files"
```
Expected: 2 tests passed; `1280 x 720`; both minima ≥ 16.00 and ≥ 21.33 respectively; no generated file staged.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers` — including inside your assertion literals: build them as `['21', 'workers'].join(' ')`-style so the `banned-words` CI job passes while the page is still checked.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45**; the gate asserts these strings are what is legible and never introduces another figure in fixtures or docs.
- No secrets: the gate runs in `DATA_MODE=demo` with no API, no chain, no `NEXT_PUBLIC_*` beyond what `.env.example` names; `webServer.env` sets only `DATA_MODE`. You may not edit `.env.example`.
- Tests never call a live model or a live chain; the only network is fonts.googleapis.com / fonts.gstatic.com for the three families.
- A failing floor or crop is a finding, not a task: comment `BLOCKED: <element text> renders <n>px, floor <f> (T-10 / T-43)` and stop; never edit a component, lower a floor, change the viewport, or set `deviceScaleFactor ≠ 1` to pass.
- Leiria only; no faces, no emoji, no gradients in anything you write (README, fixtures); hit targets ≥ 44 px and the verified chip always above the fold on the phone are T-10's / T-24's to build — you measure text, not targets, and never the phone. Nothing copied from `pitch/` or `design-system/`.
- Legibility floors (verbatim): "Nothing the narration mentions renders below **24 px** in the delivered 1080p frame; the honesty chips, the refusal class + reason line, the escrow states and the three preflight numbers are **≥ 32 px** at design size — mark them `data-floor="32"`, everything narrated `data-floor="24"`. … `?present=1` shows at most: the escrow meter, the agent card with the mark counter, the screening log, the preflight trio, three task rows, the wall clock and `t+mm:ss since posted` — not the nine-card mock. The escrow meter and one feed row sit inside a centre column that survives a 9:16 crop." Measured at 1920×1080 where `--u = 1`; the 720p figure is `× 2/3`.
- Tokens you reference in the README only (no CSS here): `--ink-900 #0D0F0E` page · `--ink-800 #151816` card · `--fg-1 #F1EFE9` · `--fg-3 #8B918D` seeded · `--verified-500 #35C79A` the only accent · `--refusal-500 #E4A33F` amber, never red. Type: Archivo numerals (present scale: escrow 84, marks + preflight 56, price 40, chips 32, body 24, labels 16), Inter body, JetBrains Mono chips/labels.
- The ten hard rules (verbatim): (1) The three locked copy blocks (tagline, claim, trust model) are reproduced exactly. (2) Never show escrow releasing without a proof above or beside it; never show a refusal moving the escrow meter — "a refused task moves no money". (3) The tag is `task-refused` (never "violation"); the name is Legwork. (4) Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia. (5) "Bot-proof, not fraud-proof"; "bounded, attributable work"; never "trustless". (6) No faces anywhere — the worker is hands and a phone. (7) Locations are Leiria. Never Brooklyn, never "24h". (8) The filmed worker account shows only what it actually earned. (9) Every seeded row — worker or task — carries a `seeded` chip; the pool reads "1 real · +20 seeded (demo data)". (10) Fee figures are **3.45 / 3.00 / 0.45** (agent pays / worker receives / fee) on every surface; no deducted-fee numbers anywhere.
- Rules (2) and (9) as assertions here: the released frame shows `proof ✓` text inside the meter (`[data-testid="escrow-meter"]` innerText matches `/proof ✓/`); at least two `seeded` chips and the exact pool string are on the stage.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes locally twice in a row.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm` (the e2e job itself is wired by the lead after merge).
- [ ] Only files under §4 changed; no PNG or report committed.
- [ ] Verification output from §9 and both 1280×720 PNGs pasted into the PR.
- [ ] `apps/dashboard/e2e/README.md` written.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-39 — Legibility gate
owned-paths:
  - apps/dashboard/e2e/**
  - apps/dashboard/playwright.config.ts
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
Floors: min at 720p — floor 24: <n> px · floor 32: <n> px · meter x <l>–<r> · row x <l>–<r>
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it. Frozen interfaces: `INTERFACE REQUEST:`. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
Known at dispatch — comment at start, continue with the written fallback: `BLOCKED: TaskRow root lacks data-testid="task-row" / PresentCanvas columns lack data-column (T-10, one attribute each)` → fallback = the meter's next element sibling and the `agent paid` text count. If Chromium will not install in CI, say so in the PR: the lead adds the `e2e-dashboard` job; the gate still runs locally.

## 14. Reviewer notes
Open `lib/crop.ts` first (edges 656.25 / 1263.75, not 607 / 1313), then `present.e2e.ts` step 3 (`fontSize` read from `getComputedStyle`, never from a CSS variable or an attribute; `clipped` checked), then the config (`deviceScaleFactor: 1`, viewport 1920×1080, `reducedMotion: 'reduce'`, `retries: 0`). Most likely wrong: `devices['Desktop Chrome']` spread after the viewport (resets to 1280×720); fonts measured before `document.fonts.ready`; the downscale done with a second screenshot at `deviceScaleFactor: 2/3` (re-lays out text — not the same frame); a floor "fixed" by editing a component.

## 15. Round 2+
Merged (Sept 6, #96) with `presentModeLegible` **red on `main` by design**: the gate measured four real defects in T-10's `app/(present)/present.css` (the header's clock and elapsed timer wrap and sit 6.5 px above the frame; `.meter-tail` overflows its `line-height: 1.1` box; the pool chip `1 real · +20 seeded (demo data)` runs 66 px past the Supply card; the screening log's refusal line runs 162 px past its card and the two `PASSED` lines never render). Those are T-43's required fixes and the gate passing is T-43's exit criterion; the lead wires the `e2e-dashboard` CI job once T-43 lands. `reducedMotion` lives in `contextOptions` (Playwright 1.62); `report/` is ignored from `e2e/.gitignore`; `[data-column]` arrives with T-43 and the gate's primary selector takes over.
