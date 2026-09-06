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
| `/task/[id]` | The receipt an external builder's agent is handed through `dashboard_url`: state, the full proof hash and whether it re-hashes, the coordinate rounded to about 100 m, the tx links, and a thumbnail only a buyer can see. |
| `/task/[id]/opengraph-image` | 1200x630 card for the receipt — state and amounts only. Never the thumbnail, the coordinate or the answer. |
| `/refusals` | The six abuse-class counts and hand-picked examples. **Never a raw live feed**, never a requester identity. |
| `/admin` | Operator controls, behind `NEXT_PUBLIC_ADMIN_UI=1`. 404 otherwise, and `robots: { index: false }`. |

Both `/` and `/present` accept `?state=locked\|submitted\|released\|refunded` to preview a
meter beat without touching the chain.

`?task=<id>` pins one task as the featured row, on `/` and through the live poll, so the
filmed errand stays on the escrow meter while newer rows arrive.

### The receipt token

`/task/<id>?t=<buyer token>` reveals the signed thumbnail URL. The token is read on the
server, forwarded once as the `X-Buyer-Token` header, and then dropped: it is never
rendered, never logged, never put in a link and never handed to the client. The browser
poll that follows carries no token — it is the public read — so a signed `proof.url` the
server already resolved is carried forward while the proof hash is unchanged rather than
blinking out of the page on the next tick.

Without a token the proof block says `thumbnail gated — buyer only`. A `seeded` flag the
subgraph could not answer for renders `seeded status unavailable`, never silence.

## `DATA_MODE`

Read on the server only, never from a `NEXT_PUBLIC_*` var and never in a client bundle.

- `DATA_MODE=demo` (also the default when unset) — `lib/data/demo.ts` reads
  `demo-data.json` from the repo root, validates it with `DemoData` from
  `@legwork/shared`, and maps it to `DashboardData`. Every route and the OG image
  render a visible `DEMO DATA` chip.
- `DATA_MODE=live` — `lib/data/live.ts` reads the deployment and maps it into the same
  `DashboardData`, with no `DEMO DATA` chip anywhere. Nothing else has to change: the
  components take `DashboardData` and nothing else.

## Live mode

| Env | Where it is read | What it does |
|---|---|---|
| `DATA_MODE=live\|demo` | server only | picks the adapter |
| `NEXT_PUBLIC_API_BASE_URL` | server, and `next.config.ts` | the API origin; defaults to `http://localhost:3001` |
| `NEXT_PUBLIC_SUBGRAPH_QUERY_URL` | server and browser | the publishable subgraph query URL |
| `WORLD_CREDENTIAL_LEVEL` | server only | `orb` renders `sandbox World ID`, anything else `sandbox Selfie Check` |
| `NEXT_PUBLIC_ADMIN_UI` | build time | `1` mounts `/admin`; anything else, unset included, 404s |

`apiBase()` is isomorphic: the API's own origin on the server, and the same-origin `/api`
prefix in the browser, which `next.config.ts` rewrites. So the browser never needs a CORS
pre-flight and no origin is baked into the client bundle. Every read is `cache: 'no-store'`.

Sources: `GET /public/feed`, `/public/refusals`, `/public/posters`,
`/public/preflight?task_type=&area=`, plus one subgraph round trip for the worker pool and
one for the agent's paid outcomes. The subgraph goes through
`@legwork/subgraph-client`'s `client.query` — there is no second GraphQL fetcher in this
app — and **no API key is ever passed**, so nothing secret can reach a bundle.

`lib/live/` polls it every 3 s. The poller never overlaps requests, does nothing at all
when the response says `changed: false`, calls `onChange` only when the mapped result
actually differs, waits `max(interval, poll_after_seconds)` when the API asks it to, and
pauses entirely while the tab is hidden. `LiveDashboard` is the render prop over it;
`useLiveTask` is the receipt's version and stops once the task is terminal.

**A source that fails contributes its zero or empty value and names itself** in
`sourceNotes` (`feed unavailable`). It never borrows a demo number: in live mode there are
no demo figures on the page at all.

Two honesty rules are enforced in the mapping rather than the components. Only a *funded*
feed row can become the `FeaturedTask`, so a refusal has no path to the escrow meter; and
`agentPays` is `amount + fee` summed in 6-decimal integer units, never a subtraction.

## Admin

`/admin` is gated on the literal `process.env.NEXT_PUBLIC_ADMIN_UI` — the only form Next
inlines; a dynamic key would read `undefined` in the browser and gate nothing. The check
runs on the server page before `AdminPanel` is ever in the tree, and because the flag is a
build-time constant the route prerenders straight to a 404 when it is off.

The admin key is **pasted at runtime and held in React state only**. It is never an env of
this app, never under `NEXT_PUBLIC_*`, never written to `localStorage`, `sessionStorage`, a
cookie or a query string, and it is gone on reload. The field is deliberately
*uncontrolled*: a controlled password input makes React write the current value into the
`value` attribute, which would put the key into `document.body.innerHTML`.

Buttons are disabled until a key is present. `resolve`, `reset-demo` and `reset-worker`
need a second tap on `Confirm` within 5 seconds, and the arm expires on its own. Every
control is a 44 px target. Results render `ok · tx <hash> ↗` or the API's error (`401`
reads `key rejected`) in the refusal amber — red exists nowhere in this product — and the
panel says out loud that every call is audit-logged by the API.

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
| **T-26** (live data) | Done: `lib/data/live.ts`, `lib/live/**`, `app/task/**`, `app/refusals/**`, `app/admin/**`. `getDashboardData` stays synchronous because `app/page.tsx` and `app/opengraph-image.tsx` call it without `await`; `loadDashboardData(mode, opts)` is the awaited form, and `LiveDashboard` is what T-43 mounts. The component props are the contract and did not change. |
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
