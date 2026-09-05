# `@legwork/dashboard`

Public, read-only mission control — and the canvas the demo video is filmed on. Ink
ground, one accent, no red anywhere.

## Routes

| Route | What it is |
|---|---|
| `/` | Mission control: feed left, escrow + agent centre, pool / screening / preflight / posters right. Min-width 1280, single column below. |
| `/?present=1` | The sparse present canvas on the same route, for filming. |
| `/present` | The same canvas with no query to remember on set. |
| `/opengraph-image` | 1200x630 card so every link unfurls with the escrow meter. |

Both `/` and `/present` accept `?state=locked\|submitted\|released\|refunded` to preview a
meter beat without touching the chain.

T-26 adds `/task/[id]`, `/refusals` and `/admin`.

## `DATA_MODE`

Read on the server only, never from a `NEXT_PUBLIC_*` var and never in a client bundle.

- `DATA_MODE=demo` (also the default when unset) — `lib/data/demo.ts` reads
  `demo-data.json` from the repo root, validates it with `DemoData` from
  `@legwork/shared`, and maps it to `DashboardData`. Every route and the OG image
  render a visible `DEMO DATA` chip.
- `DATA_MODE=live` — `getDashboardData` returns an empty `DashboardData` with
  `dataMode: 'live'` and no `DEMO DATA` chip. **T-26 replaces this branch** with the
  real adapter over `/public/*` and the subgraph. Nothing else has to change: the
  components take `DashboardData` and nothing else.

Two fields are absent from `demo-data.json` and are filled with defaults rather than
invented: there is no `posterStats` block (zeros) and no per-row `agent_pays`
(`priceWithFee` in 6-decimal integer units). The featured row takes its four figures
from the `money` block verbatim. The file is a read-only import.

## Present mode

`app/(present)/present.css` defines a fixed 1920x1080 stage:

```css
.stage { --u: min(100vw / 1920, 100vh / 1080); width: calc(1920 * var(--u)); ... }
```

**Every length inside `.stage` is `calc(<design px> * var(--u))`.** No bare px, no
`transform: scale()`, no `zoom` — T-39 reads `getComputedStyle().fontSize`, and that
has to equal the size actually rendered.

Columns are 580 / 560 / 580 with 40-px gaps and 60-px margins:
`60 + 580 + 40 + 560 + 40 + 580 + 60 = 1920`. The centre column runs **x 680 to 1240**,
inside the 656–1264 band a 9:16 crop keeps, so the escrow meter and the first feed row
survive the crop.

| Column | Content |
|---|---|
| left | `AgentCard`, then the Supply card (`PreflightTrio present` = trio + highlighted worker + pool chip) |
| centre | `EscrowMeter`, then task row 1 |
| right | `ScreeningLog`, then task rows 2–3 |

The 96-tall header carries the wordmark, the wall clock, the elapsed timer and the
chips. Nothing else is on the canvas — this is not the nine-card mock.

## Floor attributes

Sizes are declared with `data-floor` in design px and enforced by T-39 at 1280x720
(floor x 2/3).

- **`data-floor="32"`** — every chip (the `Chip` default, so nested chips cannot be
  missed), the refusal class + reason line, the three preflight numerals and their
  labels, the escrow state word and its amounts, the pool chip.
- **`data-floor="24"`** — task-row title / price / badge / meta, the agent id,
  `paid on proof`, the marks numeral and label, the wall clock, the elapsed timer, the
  PASSED lines, the highlighted worker row.
- Section labels are structure, not narration, and carry no floor.

## Honesty behaviour, built into the components

- `EscrowMeter` receives **only the featured funded task**. A refused row has no escrow
  and no path to this component, so a refusal cannot move the meter.
- The meter never says `RELEASED` without a proof reference beside it: with
  `proofPresent: false` it stays on the submitted wording.
- A refused `TaskRow` renders **no money at all** — no price, no `agent paid` — and says
  `no money moved` instead. A refused task never funded an escrow, so there is no figure
  to show.
- Every seeded row, worker or task, carries a `seeded` chip.
- The pool headline is `poolString(real, seeded)` and is the only total on the card.
- Money is 3.45 / 3.00 / 0.45 on every surface. Fee is on top; nothing subtracts it.
- `call-confirm` rows always carry `self-reported answer + timestamp (unverified)`.
- `ScreeningLine` has no spec-text field and no requester identity, so neither can leak.

## How the later tasks plug in

| Task | Where it works |
|---|---|
| **T-26** (live data) | Replaces the `live` branch of `getDashboardData` in `lib/data/index.ts` and adds `app/task/**`, `app/refusals/**`, `app/admin/**`. It calls the API through the same-origin `/api` prefix that `next.config.ts` rewrites to `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:3001`). The component props are the contract and do not change. |
| **T-39** (Playwright) | Adds `e2e/playwright.config.ts` and measures the `data-floor` attributes at 1280x720. The `e2e` and `e2e:install` scripts are already declared here. |
| **T-43** (present polish) | Owns `app/(present)/**` and `components/EscrowMeter.tsx` from Day 6: the clock sync, the one-shot LOCKED to RELEASED animation and the card cuts. `PresentCanvas` takes `nowMs` so the clock and the timer can be driven deterministically. |
| **T-47** (frame read) | Reads the composited PNG of the canvas. |

## Commands

```bash
pnpm --filter @legwork/dashboard dev        # DATA_MODE defaults to demo
pnpm --filter @legwork/dashboard typecheck
pnpm --filter @legwork/dashboard lint
pnpm --filter @legwork/dashboard test       # vitest + jsdom, no network
pnpm --filter @legwork/dashboard build
```

Tests never call a live model, a live chain or a live facilitator, and the build makes
no network request: the OG card is drawn with glyphs the bundled font already covers,
so `@vercel/og` never downloads one.
