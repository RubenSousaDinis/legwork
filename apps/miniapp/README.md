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

## Running the probe (operator, on the demo phone)

Vercel previews cannot open inside World App, so the probe has to be on `main` and served
from the Portal-registered production URL.

1. Open `https://<legwork-miniapp>.vercel.app/probe` **inside World App** on the demo phone.
2. **Run IDKit verify.** The page fetches `rp_context`, mounts the widget with the preset the
   credential level selects, forwards the result as-is to `/api/idkit/verify`, and shows the
   preset name, the nonce and expiry, the raw widget result and the API response. Note whether
   the Sandbox exposes Selfie Check at all.
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

## Design notes

Paper ground, typed by hand from `DESIGN-SPEC.md`: `--paper-50` page, `--paper-0` cards with a
1 px `--paper-border` and a soft shadow, `--ink-text` type, teal `--verified-600` / `-700` as
the only accent, amber `--refusal-on-paper` for refusals. There is no red token in the
product. Archivo for the wordmark and headlines, Inter for body, JetBrains Mono for ids,
hashes and chips. Body text never below 16 px, narrated copy never below 20 px
(`data-floor="20"`), every tappable target at least 44 px (`data-hit="44"`). The worker's
verification state sits in the sticky header, so it is always above the fold.
