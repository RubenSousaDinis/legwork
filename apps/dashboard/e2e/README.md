# `apps/dashboard/e2e` — the legibility gate

T-10 declared the legibility floors as `data-floor="24|32"` attributes on every
present-mode element the narration names, and sized the stage in design pixels against
`--u`. This directory is the measurement. It writes no UI: it opens the present canvas
in a real browser at the delivered frame size, reads what is actually rendered, and
fails with a list of findings when something is not legible.

A failing floor is reported to T-10 / T-43 as a `BLOCKED:` finding. It is never fixed
here — not by editing a component, not by lowering a floor, not by shrinking the
viewport and not by setting a device scale factor other than 1.

## Running it

```bash
pnpm --filter @legwork/dashboard e2e:install   # once: Chromium + its system libraries
pnpm --filter @legwork/dashboard e2e
```

The first run builds the dashboard and starts it on port 3100 with `DATA_MODE=demo`;
that takes a couple of minutes. Every later run finds the server already up and reuses
it (`reuseExistingServer` is on everywhere except CI), so the second run is seconds.

The only network the gate needs is `fonts.googleapis.com` / `fonts.gstatic.com` for
Archivo, Inter and JetBrains Mono. Without them it stops with

```
fonts did not load — the gate needs fonts.googleapis.com; rerun with network
```

because a floor measured in Helvetica is not the floor the delivered frame has. Set
`E2E_ALLOW_FALLBACK_FONTS=1` to downgrade that to a warning and carry on.

There is no API, no chain and no model behind any of this: `DATA_MODE=demo` reads
`demo-data.json` and nothing else.

## The two tests

### `cropBandMath` (`crop.e2e.ts`)

Pure math, no browser. The vertical cut of the demo video is taken out of the 16:9
footage, so only a centred 9:16 column of the stage survives:

```
nineSixteenBand(1920, 1080) -> { left: 656.25, right: 1263.75, width: 607.5 }
nineSixteenBand(1280,  720) -> { left: 437.5,  right:  842.5,  width: 405   }
```

**607.5 is the band's width, not an edge.** A gate written as "x between 607 and 1313"
is that width mistaken for a coordinate: it spans almost the whole stage and passes
layouts the crop cuts in half. `insideBand` compares against the edges above. T-43
mirrors the same math in `app/(present)/crop.ts` — the numbers have to stay identical.

### `presentModeLegible` (`present.e2e.ts`)

Opens `/?present=1` (the released beat) and then `/?present=1&state=locked`, at
1920 × 1080 with `deviceScaleFactor: 1`. In each beat it asserts:

| Assertion | What it means |
|---|---|
| fonts | `document.fonts.ready`, then `check('700 16px Archivo')` and `check('400 16px "JetBrains Mono"')` — the measurement is of the real faces |
| stage box | `.stage` is 1920 × 1080 (±1) so `--u = 1` and a design pixel is a rendered pixel; `documentElement.scrollWidth ≤ 1920` |
| floors | every `[data-floor]` element's `getComputedStyle().fontSize × 720/1080` clears `floor × 2/3` — 24 needs ≥ 16.00 px, 32 needs ≥ 21.33 px in the delivered 720p frame |
| visible | non-zero box, `opacity !== '0'`, `visibility !== 'hidden'` |
| unclipped | the element's own overflow is not cutting its text off |
| in frame | every box is inside 0–1920 × 0–1080 — nothing hangs off the edge the stage then hides |
| required members | the pool chip, the refusal class, the three preflight numerals, the escrow state word and amounts at floor 32; the agent id, the wall clock and the elapsed timer at floor 24 |
| crop band | the escrow meter and one feed row are both inside x 656.25–1263.75; exactly three task rows on the canvas |
| honesty | `DEMO DATA`, at least two `seeded` chips, `testnet USDC — not spendable` and `proof ✓` inside the meter are on the stage; none of the banned words is anywhere in the body |

`fontSize` is read from `getComputedStyle`, never from the `data-floor` attribute and
never from a CSS variable. A `transform: scale()` or a `zoom` above the element would
make the declared size a fiction, and catching that is the point.

Two shapes worth knowing before changing this file:

- **Measurements are soft assertions.** One run lists every element that fails rather
  than stopping at the first. The test still fails; a gate that reports one finding per
  run is a gate nobody can act on.
- **Artifacts are written before the assertions.** A failing run still leaves the PNGs
  and the `floors.json` that say which card is closest to its floor, which is exactly
  when T-43 needs them.

`checkCropBand` looks for `[data-column="centre"] [data-testid="task-row"]` first and
falls back to the escrow meter's next element sibling. T-10's columns carry no
`data-column` attribute yet, so today it takes the fallback — which in the current
markup resolves to the same row.

## The artifacts

Everything below is per-run and gitignored. CI uploads it; nothing here is committed.

| File | What it is |
|---|---|
| `artifacts/present-1920x1080.png` | the released beat as shot |
| `artifacts/present-1280x720.png` | the canonical delivery frame — the one T-47 reads at arm's length and compares its composite against |
| `artifacts/present-locked-1280x720.png` | the locked beat at delivery size |
| `artifacts/floors.json` | every measured row, both beats |
| `artifacts/test-results/` | Playwright's own output: traces on failure |
| `report/index.html` | the HTML report, with all of the above attached |

The 720p PNGs are the 1920 × 1080 shot resampled on a canvas
(`lib/downscale.ts`, `imageSmoothingQuality: 'high'`). They are deliberately **not** a
second screenshot at a smaller viewport: that re-lays the text out, moves line breaks
and changes hinting, so it would no longer be the frame the floors were measured in.

### Reading `floors.json`

An array of one object per `[data-floor]` element per beat:

```json
{
  "state": "released",
  "floor": 32,
  "fontSize": 32,
  "rendered720": 21.333333333333332,
  "text": "1 real · +20 seeded (demo data)",
  "box": { "left": 81, "top": 894.15, "right": 706.2, "bottom": 942.54, "width": 625.2, "height": 48.39 },
  "visible": true,
  "clipped": false,
  "tag": "span",
  "testid": null
}
```

`floor` is what T-10 declared in design pixels; `fontSize` is what the browser
computed; `rendered720` is the same text in the delivered frame. The floor holds when
`rendered720 ≥ floor × 2/3`.

The margin per floor, smallest first:

```bash
node -e "const r=require('./apps/dashboard/e2e/artifacts/floors.json');for(const f of [24,32]){const m=Math.min(...r.filter(x=>x.floor===f).map(x=>x.rendered720));console.log('floor',f,'min at 720p',m.toFixed(2))}"
```

To find the card closest to its floor, or the widest box in a column, sort the same
array by `rendered720` or by `box.width`.

## CI wiring (the lead adds this after merge)

```yaml
- run: pnpm --filter @legwork/dashboard e2e:install
- run: pnpm --filter @legwork/dashboard e2e
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: dashboard-legibility
    path: |
      apps/dashboard/e2e/artifacts/**
      apps/dashboard/e2e/report/**
```

It belongs in the `ts` job if the browser install step succeeds there; otherwise as a
separate `e2e-dashboard` job, because a Chromium download that cannot run in the `ts`
container should not take the whole `ts` check down with it. Either way the gate still
runs locally, which is where the Day-5 decision is actually made.

`.github/**` is the lead's; nothing in this directory edits it.

## The palette these measurements are about

Referenced, never redeclared — the tokens live in `app/globals.css`:
`--ink-900 #0D0F0E` page · `--ink-800 #151816` card · `--fg-1 #F1EFE9` foreground ·
`--fg-3 #8B918D` seeded · `--verified-500 #35C79A`, the only accent ·
`--refusal-500 #E4A33F`, amber and never red. Type is Archivo for numerals (present
scale: escrow 84, marks and preflight 56, price 40, chips 32, body 24, labels 16),
Inter for body and JetBrains Mono for chips and labels.
