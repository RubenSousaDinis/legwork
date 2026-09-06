# Present mode

The frame the video films. `/present` is the canvas on its own route; `/?present=1` is
the same canvas on `/`. Nothing else is on it — this is not the nine-card mock.

## Query parameters

| Parameter | Effect |
|---|---|
| `?task=<id>` | Pins the filmed task. Passed to `loadDashboardData` **and** to the canvas, so the server render and T-26's 3-s poll follow the same task. |
| `?hide=agent,supply,screening,row2,row3` | Cuts cards. Unknown names are ignored. The escrow meter and row 1 are not on the list and never will be. |
| `?state=locked\|submitted\|released\|refunded` | Previews a meter beat. Demo mode only, as T-10 set it. |
| `?crop=1` | Draws the 9:16 band the vertical cut keeps. A rehearsal aid — **never in the filmed frame**. |

`/?present=1` accepts `?state=` and `?task=`; the `?hide=` and `?crop=1` cuts are on
`/present`, which is what the operator films when a pin or a cut is needed.

## The one-shot rule

Beat 7 is a single uncut shot: `LOCKED 3.45` becomes `RELEASED 3.00 → worker · +0.45
fee` as **one** movement.

- The numerals are plain text, swapped in the render where the state changes. Nothing
  counts, nothing tweens, and no intermediate figure exists in any frame.
- The fill and the footprint move by CSS `transition` of `var(--meter-ms)` — 700 ms,
  `ease-out`, hard cap 800. `prefers-reduced-motion: reduce` drops it to `0ms`, and the
  meter sets the same variable inline so the class timer agrees with the transition.
- `data-transitions` counts payouts: `locked | submitted → released` and `→ refunded`
  increment it by exactly one. The mount does not count, `locked → submitted` does not
  count (it moves the fill and no number), and re-rendering with an unchanged
  `featured` does nothing at all.
- `is-transitioning` is on the meter's root for `--meter-ms` and then comes off.
- **A refusal never reaches the meter.** `EscrowMeter` takes only the featured *funded*
  task; a refused row has no escrow and no path to it. A refused task moves no money.
- The meter never says `RELEASED` without `proof ✓ <captured_at>` beside it. With
  `proofPresent: false` it stays on the submitted wording.

T-47 confirms one transition on the take by reading `data-transitions` before and after.

## The clock

`serverTime.ts` reads the `Date` header of `/api/healthz` — the API's clock, or the
dashboard host's when the rewrite answers itself. Both are NTP; the viewer's laptop is
never the source, because the phone's `captured_at` is on the API's clock and the two
have to agree across the labeled cut.

```
offsetMs = Date.parse(date) + (t1 − t0) / 2 − t1
```

The round trip is halved rather than ignored. `useServerNow` re-syncs every 60 s and
ticks every 250 ms; a re-sync failure **keeps the last offset** — the clock must not
jump back to the laptop mid-take — and flips `source` to `local`, which puts a `· local`
suffix beside the time. The suffix is a sibling of the floored element, so the wall
clock's own text is `HH:MM:SS` and nothing else in every beat. **If `· local` shows on
Day 8 the API is down**; it is never in the filmed live frame.

`PresentCanvas` drives the clock and `t+mm:ss since posted` from one `useServerNow`, so
the two cannot land a tick apart. A `nowMs` prop freezes both and skips the sync
entirely — that is how the tests and a composited frame pin the canvas.

## The cut order T-47 follows

1. **`row3`** — the third feed row. Costs nothing the narration names.
2. **`row2`** — the refused row. Its class and reason are still in the screening log at
   the same 32-px floor, and the agent card still carries the mark.
3. Anything else — `screening`, `supply`, `agent` — **only with a narration change**.
   Each of those is named in the script, and cutting one without rewriting the line
   leaves the narration talking about something that is not on screen.

A cut card renders nothing at all. Each column is a grid of **fixed** rows with every
card placed explicitly, so the row stays behind and nothing below it rises: the meter,
row 1, the clock and the timer sit at the same y in every take. `.stage` carries
`data-hidden="<comma list>"` — written in the order `agent, supply, screening, row2,
row3` whatever order the query asked for — and it is empty when nothing is cut.

## Geometry

1920 × 1080, scaled by `--u`. Every length inside `.stage` is
`calc(<design px> * var(--u))` — no bare px, no `transform: scale()`, no `zoom`, because
T-39 reads `getComputedStyle().fontSize` and that has to equal what ships.

- Columns 580 / 560 / 580, gaps 40, margins 60. The centre column runs **x 680–1240**,
  inside the 656–1264 band a 9:16 crop keeps (`crop.ts` mirrors T-39's math), so the
  escrow meter and row 1 survive the crop.
- The header is 96 tall and **two rows**: the wordmark and the time group, then the
  honesty chips. One row cannot work — the three chips at their 32-px floor plus the
  time group want about 2075 px of the 1800 available, and a floor is never lowered to
  make a layout fit.
- Below the header each column has 968 px. The right column — the screening log and two
  feed rows — spends 953 of them. The row heights in `present.css` are that
  measurement, not a guess.
- `data-column="left|centre|right"` on the columns and `[data-row="1|2|3"]` on the feed
  row slots are T-39's and T-47's locators. The `data-testid="task-row"` stays on
  `TaskRow`'s own element, where T-10 put it: duplicating it onto the slot would make
  the canvas count six task rows where the gate and the brief both count three.

## What present mode drops

At its floors the canvas holds less than mission control does, and the difference is
declared here rather than discovered in a take:

- The screening log shows **one** entry. The demo refusal's class and reason alone wrap
  to four lines at 32 px — 224 px for a single entry — and a second one ran 771 px past
  the card in T-39's Day-5 measurement. The entry shown is the marked refusal.
- A log line drops its spec hash and its mark reference. Both are mission-control
  detail; the mark itself is on the agent card, as the counter and as
  `task-refused:<class>`.
- The pool chip **wraps**. `1 real · +20 seeded (demo data)` is 625 px at its floor in a
  546 px card, and the string is never shortened and the floor never lowered.

## Files

| File | What it owns |
|---|---|
| `PresentCanvas.tsx` | The canvas, `hideCards`, `data-column` / `data-row`, and the `LiveDashboard` mount in live mode. |
| `Clock.tsx` | `formatClock`, the wall clock, `data-source` and the `· local` suffix. |
| `ElapsedTimer.tsx` | `formatElapsed`, `t+mm:ss` and `t+h:mm:ss since posted`. |
| `serverTime.ts` | `fetchServerOffset`, `useServerNow`. |
| `crop.ts` | `nineSixteenBand`, `insideBand` — T-39's numbers. |
| `CropGuide.tsx` | `?crop=1` only. |
| `present.css` | The stage, the fixed column rows, the meter transition. |
| `present/page.tsx` | `/present` and its query parameters. |

Tests: `test/present-meter.test.tsx`, `test/present-clock.test.tsx`,
`test/present-canvas.test.tsx`. The legibility gate is T-39's
(`pnpm --filter @legwork/dashboard e2e`).
