# `@legwork/miniapp` — the worker phone

The phone half of Legwork: a Next.js app that opens inside World App (or in a plain mobile
browser) where a verified human claims a nearby task, photographs the proof and gets paid.

This package currently holds the shell — paper-ground tokens, the primitives every later
screen imports, and the `/probe` page for spike S2'. Auth (T-24), the task list (T-25),
proof and earnings (T-33) and the rest build on top of it.

## Routes

| Route | What it is |
|---|---|
| `/probe` | The S2' spike page: four readouts (IDKit, camera, geolocation, `walletAuth`), an environment readout and a copyable JSON dump. |
| `POST /api/idkit/request` | **Temporary (T-05).** RP-signed `rp_context` for IDKit v4. Deleted by T-24 once the API's `/idkit/*` routes exist. |
| `POST /api/idkit/verify` | **Temporary (T-05).** Forwards the IDKit result, unchanged, to World's v4 verify endpoint. Deleted by T-24. |

There is deliberately **no `/`**. The root route belongs to T-24 (`app/(auth)/page.tsx`); a
second `page.tsx` for `/` would collide with it.

Everything else under `/api/*` is rewritten to the API (`next.config.ts`, `afterFiles`), so
the mini-app is a single origin inside the World App webview. A route handler that exists
wins over the rewrite — that is what keeps the two temporary handlers above reachable.

## Environment

Client (`NEXT_PUBLIC_*`, shipped in the bundle — nothing secret goes here):

| Variable | Default | Used for |
|---|---|---|
| `NEXT_PUBLIC_WORLD_APP_ID` | — (warns) | `app_id` on the IDKit widget. Without it the widget does not mount. |
| `NEXT_PUBLIC_WORLD_CREDENTIAL_LEVEL` | `orb` (warns) | `selfie` picks `selfieCheckLegacy`, anything else picks `orbLegacy`. |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001` | Rewrite target for `/api/:path*`. |

Server only, read in the temporary route handlers and never in a client bundle:

| Variable | Used for |
|---|---|
| `WORLD_RP_ID` | The registered RP. Goes into `rp_context.rp_id` and the verify URL. |
| `WORLD_RP_SIGNING_KEY` | `signRequest` from `@worldcoin/idkit-core/signing`. **Never rendered, never logged, never in the JSON dump.** |
| `WORLD_APP_ID` | Checked against a legacy result's `app_id` on the server; the client's claim is never trusted. |

A missing value warns to the console and falls back. Nothing throws — the probe has to render
on a phone that was handed a half-filled Vercel environment.

## Running it

```bash
pnpm --filter @legwork/miniapp dev        # http://localhost:3000
pnpm --filter @legwork/miniapp typecheck
pnpm --filter @legwork/miniapp lint
pnpm --filter @legwork/miniapp test       # vitest, jsdom, msw — never a live model or chain
pnpm --filter @legwork/miniapp build
```

## Sign-in, area, and the two radii

A World ID that already has a worker account answers `409 nullifier_already_registered` and
does not issue an idkit-session cookie. Inside World App the conflict screen offers **Sign in
with this key** — `POST /session` in `walletAuth` mode; the MiniKit signature is the proof, and
it never calls `POST /register`. Outside World App that button is not offered: there is no
idkit cookie after a 409, so the screen says to open World App or paste the exported key.
If the held address is not the one bound to that World ID, the screen says so and the import
field stays open; Legwork cannot recover a key that left the phone.

Registration binds a geohash-5 cell. The payout-key step shows `You will be registered in
<area>` plus either `from this phone's location` or `default — this phone gave no location
fix`, and in the second case **Use my location** retries the fix. The default cell is
`ez1dp` (Leiria). The board lists that registered cell, names it in the empty state, and
says so when the current fix is in a different cell.

Two distances, both on screen at the moment they matter:

| Constant | Metres | When it applies |
|---|---|---|
| `CLAIM_RADIUS_M` | 2000 | A claim may start within 2 km of the place (30 minutes to walk). |
| `GEOFENCE_M` | 150 | The proof photo must be taken within 150 m. |

Beyond 2 km the claim button stays visible and disabled, and says why. A worker with no GPS
fix is not refused at claim time; the 150 m fence still applies at submit. Outside that
fence the proof screen warns before the camera opens.

## Running the probe (operator, on the demo phone)

Vercel previews cannot open inside World App, so the probe has to be on `main` and served
from the Portal-registered production URL.

1. Open `https://<legwork-miniapp>.vercel.app/probe` **inside World App** on the demo phone.
2. **Run IDKit verify.** The page fetches `rp_context`, mounts the widget with the preset the
   credential level selects, forwards the result as-is to `/api/idkit/verify`, and shows the
   preset name, the nonce and expiry, the raw widget result and the API response. The run of
   Sept 8 settled which preset works: `orbLegacy` verifies end to end, `selfieCheckLegacy`
   completes the check on the device and then returns `verification_disabled`, because Selfie
   Check (Beta) is access-gated and the flag was never granted for this app — see
   `docs/spikes/RESULTS.md` `## S2`.
3. **Take a photo.** A native `<input type="file" accept="image/*" capture="environment">`.
   Tick the checkbox if the camera opened directly rather than the gallery — that is the
   answer the spike wants.
4. **Get a fix.** `getCurrentPosition` with high accuracy, a 10-second timeout and no cached
   position. On success the coordinate is shown rounded to 3 decimals (≈ 100 m); the exact
   coordinate never leaves the phone. On failure the readout names the error code.
5. **Run walletAuth.** MiniKit `walletAuth` with a fresh 16-byte nonce and a 10-minute
   expiry. Outside World App the readout says so instead of failing.
6. **Copy JSON.** If the clipboard is blocked the dump appears in a selectable textarea.

Then paste:

- the payload shape and the **exact `level` string** into `docs/spikes/RESULTS.md` §S2;
- the pain points — what the webview refused, what needed a second tap — into
  `FEEDBACK-WORLD.md` §3.

The JSON dump carries no secret and no environment value other than the credential level.

## What is frozen here

After T-05 merges, `app/layout.tsx`, `app/globals.css`, `components/ui/*`,
`components/VerifiedState.tsx`, `next.config.ts`, `vitest.config.ts` and `package.json` are
frozen; later tasks ask for changes with `BLOCKED:` rather than editing them. `lib/*`,
`mocks/**` and `app/api/idkit/**` pass to T-24.

## Design

Paper ground, typed by hand from `DESIGN-SPEC.md`: `--paper-50` page, `--paper-0` cards with a
1 px `--paper-border` and a soft shadow, `--ink-text` type, teal `--verified-600` / `-700` as
the only accent, amber `--refusal-on-paper` for refusals and nothing else. The status-quo
colour of the pitch deck appears nowhere in the product. Archivo for the wordmark and
numerals, Inter for body, JetBrains Mono for ids, hashes, chips and meta.

### The design lives in `app/globals.css`

**No `.tsx` file under `app/` or `components/` carries an inline style that sets a colour, a
font, a font size, a background or a border.** Every one of those values is a named `lw-*`
class, so a value can be checked against `DESIGN-SPEC.md` in one file rather than hunted
through forty style objects. `tests/design/noInlineStyles.test.ts` enforces it and names the
three exceptions it keeps: the two proof `img` boxes (an object URL for a blob the phone
holds in memory, which `next/image` cannot size) and the claim-error line in `TaskCard.tsx`,
whose inline `var(--ink-text)` is read by `tests/tasks/claim.test.tsx`.

`tests/design/globals.test.ts` holds the three things a component diff never shows: the
`:focus-visible` ring in the accent, the `prefers-reduced-motion` block, and the absence of
any red keyword or hex in the file.

### The class inventory

| Class | The spec row it implements |
|---|---|
| `lw-list-label` | Section label over a list: mono 15/600, UPPERCASE, tracked. |
| `lw-task-row`, `lw-task-row--collapsed` | One row of the open task card; the collapsed summary. |
| `lw-task-line`, `lw-task-title`, `lw-task-name` | `type · title` in mono 16/600; the title node; the open card's Inter 21/700 title. |
| `lw-price`, `lw-price__figure`, `lw-price__unit` | Archivo price numeral and its mono `USDC`, on one baseline that never wraps. |
| `lw-meta` | Mono 15/500 meta in `--ink-text-3`. Never amber. |
| `lw-rule` | The route motif as a divider: 1 px dashed `--paper-border`. |
| `lw-facts` | The landing's three facts, `·` markers, Inter 16/400, leading 1.5. |
| `lw-cta-caption` | The mono line under the primary button. |
| `lw-segmented`, `lw-segmented__option`, `lw-segmented__option--on` | The `--paper-100` track, its 44 px segments, and the chosen one in the verified teal. |
| `lw-tile` | A flat `--paper-100` tile at `--r-tile`, never a card inside a card. |
| `lw-earnings-bar` | The bar fixed to the bottom of `/tasks`. |
| `lw-paid` | The released receipt: tint fill, accent border, radius 16. |
| `lw-stat` | Archivo numerals, tracked −0.03 em, sized by `--xl` / `--md` / `--lg`. |
| `lw-error-line` | A failure that is not a refusal — ink, not amber. `.lw-error` stays amber and stays for refusals and the payout-key import error. |
| `lw-textarea` | Every free-text field: mono 15, radius 10, 1 px `--paper-border-2`. |
| `lw-footprint` | The in-UI glyph, inline SVG, always `--verified-600`. |

Supporting classes carry the same rules where a screen needs them: `lw-card--tight`,
`lw-card--top`, `lw-card--verified`, `lw-landing-title`, `lw-banner-heading`, `lw-question`,
`lw-fact`, `lw-note`, `lw-body`, `lw-address`, `lw-actions`, `lw-chips`, `lw-row`,
`lw-count`, `lw-input`, `lw-field`, `lw-field-row`, `lw-answer-group`, `lw-answer-row`,
`lw-answer-question`, `lw-waiting-caption`, `lw-photo-slot`, `lw-thumb`, `lw-proof-header`,
`lw-proof-head`, `lw-pair`, `lw-picker`, `lw-plain-button`, `lw-quiet-link`, `lw-list`,
`lw-countdown`, `lw-header__brand`, `lw-header__caption`, `lw-header__banner`.

### The floors, as they are enforced

- **16 px** is the body floor. No Inter text renders below it.
- **15 px** is the floor for mono meta, labels, chips and captions.
- **20 px** is the floor for anything narrated. It is marked `data-floor="20"`, and
  `[data-floor='20']` sets `font-size: 20px` in the stylesheet, so the marker is the size —
  a class on the same element may raise it but never lower it. Where the prototype gave a
  value under a floor (the verified banner at 17/15, the collapsed price at 17), the floor
  wins.
- **44 px** is the hit-target floor. Every tappable element is marked `data-hit="44"` and
  `[data-hit='44']` sets `min-height` and `min-width`. `tests/hitTargetsMarked.test.tsx` and
  `tests/tasks/hitTargets.test.tsx` check that every `button`, `a` and file input carries it.
- Nothing tappable is nested inside another tappable element: an anchor that looks like a
  button wears the `lw-button` classes rather than wrapping one.

The worker's verification state sits in the sticky header on every route — the compact pill
beside the wordmark and the full `Verified human ✓ · World ID · one account per person`
banner under it — so it is always above the fold.
