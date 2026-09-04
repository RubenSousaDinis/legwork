---
id: T-05
title: Mini-app scaffold + `/probe` page for the S2' spike
lane: D
day: 1
size: M
agent_class: C
must: true
depends_on: [T-01b]            # T-01b (TypeScript side) must be merged
owned_paths:
  - apps/miniapp/**
labels: [area:miniapp, wave:1, size:M, agent:cloud]
branch: t-05/miniapp-scaffold-probe
---

# T-05 — Mini-app scaffold + `/probe` page for the S2' spike

## 1. Context
The worker mini-app (`apps/miniapp`) is the phone half of Legwork: a Next.js app that opens inside World App (or in a plain mobile browser) where a verified human claims a task, photographs the proof and gets paid. This task builds the shell on the **paper ground** (light) and a `/probe` page the operator uses on Day 1 evening for spike S2' on the Portal-registered Vercel URL. Vercel previews cannot open inside World App, so the probe must ship on `main` today; the operator opens it on the demo phone and pastes the JSON readout into `docs/spikes/RESULTS.md` §S2 and `FEEDBACK-WORLD.md` §3. T-24 (auth), T-25 (tasks/claim), T-33 (proof/earnings) and T-42 build on this shell and import the primitives you create here, so their props must be exactly as written in §6.

> 02-architecture, worker mini-app: "Next.js + `@worldcoin/idkit` 4.x + `@worldcoin/minikit-js` (for `walletAuth` only). Flow: IDKit verify (Selfie Check or Orb-level staging) → `walletAuth` session → relayed register (the app generates and stores the worker payout key) → task list on a 3-second poll … → capture via `<input type="file" accept="image/*" capture="environment">` (native camera, no stream permission, survives the webview) → GPS via `getCurrentPosition` with a 10 s timeout and the pre-decided downgrade … World App exposes no camera or location permission request (only notifications, contacts, microphone), which is why the file input is the primary path."

> 04-spike-gates, S2 test: "1. `IDKitRequestWidget` for action `legwork-worker` at `selfieCheckLegacy()` if access was granted, else `orbLegacy()`; complete it in the simulator / Sandbox; receive the proof; verify it through the backend route; record the exact level string and payload shape. 2. On the same page load: `<input type="file" accept="image/*" capture="environment">` returns a File; `navigator.geolocation.getCurrentPosition` returns a coordinate within 10 s …; MiniKit `walletAuth` returns a SIWE payload … 3. Note whether the Sandbox exposes Selfie Check at all."

Tech facts (verified Sept 3, 2026): `@worldcoin/idkit` v4 React exposes `IDKitRequestWidget` with props `open`, `onOpenChange`, `app_id`, `action`, `rp_context`, `allow_legacy_proofs`, `preset`, `handleVerify`, `onSuccess`; presets `selfieCheckLegacy({signal})` and `orbLegacy({signal})`; `rp_context` comes from the API `POST /idkit/request`; the widget result is forwarded **as-is** to `POST /idkit/verify`. MiniKit: `MiniKit.isInstalled()`; `MiniKit.walletAuth({nonce, statement?, expirationTime?})` returns `{executedWith, data: {address, message, signature}}`.

## 2. Exact scope
- App shell: root layout on the paper ground with the tokens of §10 typed as CSS custom properties in `app/globals.css`; Google Fonts `Archivo` (400–900), `Inter` (400–700), `JetBrains Mono` (400–700) via one stylesheet `<link>` + `preconnect`; viewport `width=device-width, initial-scale=1, viewport-fit=cover`; header with the wordmark `LEGWORK` (Archivo 800, +0.08em tracking, 20 px) and, right of it, `VerifiedState` (below). Body text 16 px Inter; every interactive element carries `data-hit="44"` and the CSS rule `[data-hit="44"] { min-height: 44px; min-width: 44px }`.
- `MiniKitProvider` (client component): calls `MiniKit.install()` once on mount; exposes `useMiniKit()` → `{ installed: boolean }` (from `MiniKit.isInstalled()`), `installed = false` during SSR.
- Primitives in `components/ui/` with the props of §6: `Button`, `Chip`, `MonoTag`, `StatusBadge`, `VerifiedChip`; plus `components/VerifiedState.tsx` (reads `useSession()` and renders `VerifiedChip`).
- `lib/session.ts` **stub**: exports the `SessionState` type of §6 and `useSession()` returning `{ status: 'unverified' }`. T-24 replaces the body, not the type.
- `lib/env.ts`: reads `NEXT_PUBLIC_WORLD_APP_ID`, `NEXT_PUBLIC_WORLD_CREDENTIAL_LEVEL` (`'selfie' | 'orb'`, default `'orb'` with a `console.warn`), `NEXT_PUBLIC_API_BASE_URL`; exports `WORLD_ACTION = 'legwork-worker'`. Missing values warn, never throw.
- `lib/api.ts`: `apiFetch<T>(path, init?)` → same-origin `/api${path}`, JSON in/out, `credentials: 'same-origin'`, non-2xx → `ApiError { status, body }`. Absolute URL built from `window.location.origin` (tests: `http://localhost:3000`).
- `next.config.ts`: `rewrites()` returns `{ afterFiles: [{ source: '/api/:path*', destination: `${NEXT_PUBLIC_API_BASE_URL}/:path*` }] }` (default `http://localhost:3001` when unset). Existing route handlers win over `afterFiles` rewrites — the temporary routes below rely on that.
- `/probe` page (`app/probe/page.tsx` + `app/probe/ProbeReadouts.tsx` + `lib/probeApi.ts`) with four readouts, an environment readout, and a copyable JSON dump (details in §7).
- **Temporary** route handlers `app/api/idkit/request/route.ts` and `app/api/idkit/verify/route.ts` (first line comment `// TEMPORARY (T-05) — deleted by T-24 once the API's /idkit/* routes exist`), mirroring the API contract exactly (§5), reading `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, `WORLD_APP_ID` from `process.env` on the server only.
- Test setup: `vitest.config.ts` (environment `jsdom`, `environmentOptions.jsdom.url = 'http://localhost:3000'`, setup file starting `mocks/server.ts`), `mocks/handlers.ts` (msw handlers for `POST */api/idkit/request` and `POST */api/idkit/verify`, incl. a 409 scenario), `mocks/server.ts` (`setupServer` from `msw/node`). Scripts in `apps/miniapp/package.json`: `dev`, `build`, `start`, `typecheck`, `lint`, `test` (`vitest run`). You may edit `scripts` only — never `dependencies`.
- `apps/miniapp/README.md`: routes, env vars, how to run the probe, what the operator pastes where.

## 3. Out of scope
- Real sessions, payout key, `/register`, the verified banner logic (T-24). Task list/claim (T-25). Proof/earnings (T-33). `compare-two`, `Report task`, unverified list (T-42).
- Any API implementation beyond the two temporary probe routes; no database, no cookies, no attestation.
- Do not touch: `packages/**`, `apps/api/**`, `apps/dashboard/**`, `demo-data.json`, `.env.example`, root configs, `.github/**`.

## 4. Owned paths
```
apps/miniapp/**
```
After this PR merges the ownership of `apps/miniapp` splits and you may not return to it: `app/(auth)/**`, `lib/*`, `mocks/**`, `app/api/idkit/**` → T-24; `app/tasks/**`, `components/TaskCard.tsx`, `components/Countdown.tsx` → T-25; `app/proof/**`, `app/earnings/**`, `lib/gps.ts` → T-33; `app/compare/**`, `app/report/**` → T-42. Everything else you create here (layout, `globals.css`, `components/ui/*`, `components/VerifiedState.tsx`, `next.config.ts`, `vitest.config.ts`, `package.json`) is frozen after merge — later tasks request changes with `BLOCKED:`.

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `POST /idkit/request` | `packages/shared/src/api-contract.ts`, `docs/api.md` | public · `{action}` → `rp_context {rp_id, nonce, created_at, expires_at, signature}` — copy the exact response wrapper from `api-contract.ts` |
| `POST /idkit/verify` | same | public · IDKit result payload (forwarded as-is to `POST https://developer.world.org/api/v4/verify/{rp_id}`) → `{verified:true, nullifier, level}` + idkit-session cookie; **409** `{error:'nullifier_already_registered'}` |
| `PUBLIC_COORD_DECIMALS = 3` | `packages/shared/src/constants.ts` | coordinates are displayed rounded to 3 decimals (≈ 100 m) |
| `@worldcoin/idkit` v4, `@worldcoin/idkit-core`, `@worldcoin/minikit-js`, `msw`, `vitest`, `jsdom`, `@testing-library/react` | `apps/miniapp/package.json` (catalog, T-00) | if any is missing from the package's dependencies: `DEP REQUEST:` and stop |
| Env | `.env.example` (T-01) | `NEXT_PUBLIC_WORLD_APP_ID`, `NEXT_PUBLIC_API_BASE_URL`; server: `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, `WORLD_APP_ID`. `NEXT_PUBLIC_WORLD_CREDENTIAL_LEVEL` is **not** in T-01's list — see §13 |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `Button { variant: 'primary' \| 'ghost' \| 'verified'; size?: 'md' (44) \| 'lg' (56); full?: boolean; disabled?; onClick?; type?; children }` — uppercase label, radius 10, `data-hit="44"` | `components/ui/Button.tsx` | T-24, T-25, T-33, T-42 |
| `Chip { tone: 'neutral' \| 'verified' \| 'refusal' \| 'seeded' \| 'demo'; floor?: 20; children }` — mono, pill 999, 1 px border in the semantic colour at .45 alpha, tint .1; `seeded` = muted gray; `demo` = ink-text at .6 | `components/ui/Chip.tsx` | same |
| `MonoTag { children }` — task-type tag, mono, `--paper-100` fill, radius 6 | `components/ui/MonoTag.tsx` | same |
| `StatusBadge { status: 'open' \| 'claimed' \| 'submitted' \| 'released' \| 'refunded' \| 'disputed' \| 'resolved' \| 'refused' \| 'locked'; size?: 'md' \| 'sm' }` — uppercase mono; released teal, refused amber, locked ink outline, submitted filled `--paper-100`, others outline muted | `components/ui/StatusBadge.tsx` | same |
| `VerifiedChip { state: SessionState; compact?: boolean; level: 'selfie' \| 'orb' }` — verified: "Verified human ✓ · World ID · one account per person" + chip `sandbox Selfie Check` (level `selfie`) or `sandbox World ID` (level `orb`); unverified: chip "Verify to claim"; full banner is a paper card, compact is one line for the header | `components/ui/VerifiedChip.tsx` | T-24, T-25, T-33 |
| `SessionState = { status: 'unverified' } \| { status: 'verifying' } \| { status: 'verified'; nullifier: string; level: string; mode: 'walletAuth' \| 'idkit'; worker: string; registered: boolean }`; `useSession(): SessionState` (stub) | `lib/session.ts` | T-24 implements; T-25/T-33 read |
| `apiFetch`, `ApiError` | `lib/api.ts` | T-24 (owner after merge), T-25, T-33, T-42 |
| `useMiniKit()` | `components/MiniKitProvider.tsx` | T-24 |
| `[data-hit="44"]`, `[data-floor="20"]` marker attributes + CSS | `app/globals.css` | T-25 tests, T-33, review |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-05` — it must print `CLAIMED T-05`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `DESIGN-SPEC.md`, `packages/shared/src/api-contract.ts` (the two `/idkit/*` routes), `.env.example`. Confirm the dependencies of §5 are present.
2. Tokens: type the paper-ground table of §10 into `app/globals.css` as `:root` custom properties; add the fonts `<link>`; body `background: var(--paper-50); color: var(--ink-text); font: 16px/1.5 Inter`.
3. Primitives (`components/ui/*`) exactly per §6; a tiny `/styleguide` route is **not** wanted — keep the surface small.
4. `MiniKitProvider`, `lib/env.ts`, `lib/api.ts`, `lib/session.ts` stub, `components/VerifiedState.tsx`; mount provider + header in `app/layout.tsx`. Do **not** create `app/page.tsx` — the root route belongs to T-24's `app/(auth)/page.tsx` (a second `page.tsx` for `/` would conflict).
5. `/probe`. State: `ProbeResults = { ran_at, level_env, idkit, camera, geolocation, walletAuth, env }`, each section `null` until run. Readouts (each a paper card with `data-readout="idkit|camera|geolocation|walletAuth"` and a "not run yet" placeholder):
   - **IDKit**: button "Run IDKit verify" → `requestRpContext()` (`POST /api/idkit/request` with `{action: WORLD_ACTION}`) → mount the widget (browser only) with `open`, `onOpenChange`, `app_id = NEXT_PUBLIC_WORLD_APP_ID`, `action = WORLD_ACTION`, `rp_context` from the response, `allow_legacy_proofs = true`, `preset = pickPreset(level)` where `'selfie'` → `selfieCheckLegacy({signal: ''})`, otherwise `orbLegacy({signal: ''})`, `handleVerify` = forward the result as-is to `verifyProof()` (`POST /api/idkit/verify`; throw on non-2xx so the widget shows the failure), `onSuccess` = store the API response. Readout shows: preset name, `rp_context.nonce` + `expires_at`, the raw widget result (keys + values; strings over 64 chars truncated to 24 + `…` with a "show full" toggle), the API response (`verified`, `nullifier`, `level`) and any error text.
   - **Camera**: `<input type="file" accept="image/*" capture="environment">` styled as a 56 px primary button "Take a photo"; readout `name, size, type, lastModified` and a checkbox the operator ticks "the camera opened directly (not the gallery)".
   - **Geolocation**: button → `navigator.geolocation.getCurrentPosition(ok, err, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })`; readout: lat/lon rounded to 3 decimals, `accuracy_m`, time-to-fix in ms; on error the code name (`PERMISSION_DENIED` / `POSITION_UNAVAILABLE` / `TIMEOUT`) and message; `unsupported` when the API is absent.
   - **walletAuth**: button → if `MiniKit.isInstalled()`: `MiniKit.walletAuth({ nonce: <16 random bytes hex>, statement: 'Legwork probe', expirationTime: <now + 10 min> })`; readout `executedWith`, `data.address`, `data.message` in full (it is the SIWE text), `data.signature` first 10 + last 6 chars. Not installed → "MiniKit not installed — open this URL inside World App". No server verification in the probe.
   - **Environment**: `MiniKit.isInstalled()`, `navigator.userAgent`, `innerWidth × innerHeight`, `level_env`.
   - **JSON dump**: `<pre>` (mono, 14 px, scrollable) of `ProbeResults` + button "Copy JSON" (`navigator.clipboard.writeText`, fallback: a selected textarea). Caption above it, verbatim: "Paste into docs/spikes/RESULTS.md §S2 and FEEDBACK-WORLD.md §3 (payload shape + exact level string)."
6. Temporary routes. `POST /api/idkit/request`: validate `{action}`; build the RP context with the signing helper exported by `@worldcoin/idkit-core/signing` (`signRequest` in the v4 docs) from `WORLD_RP_ID` + `WORLD_RP_SIGNING_KEY`; respond with the contract's response shape. `POST /api/idkit/verify`: forward the JSON body unchanged to `https://developer.world.org/api/v4/verify/${WORLD_RP_ID}`; on 2xx respond `{verified: true, nullifier, level, world_response}` (`world_response` = World's raw body; **probe-only field**, gone with the route in T-24); on failure respond World's status and body. No cookie, no database.
7. Tests (§8) with msw; `pnpm --filter @legwork/miniapp build`; README; PR.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `probeRendersFourReadouts` | with msw running, `requestRpContext()` then `verifyProof(fixture)` resolve to the contract shapes; rendering `ProbeReadouts` with those results shows four `[data-readout]` cards (`idkit`, `camera`, `geolocation`, `walletAuth`) plus the JSON `<pre>` containing `"nullifier"` |
| `probeIdkitFlowAgainstMsw` | the 409 scenario surfaces as `ApiError` with `body.error === 'nullifier_already_registered'`; request bodies are forwarded byte-for-byte (`verifyProof` sends exactly the object it received) |
| `presetFollowsCredentialLevel` | `pickPreset('selfie')` uses `selfieCheckLegacy`, `pickPreset('orb')` and `pickPreset(undefined)` use `orbLegacy` (spy on the imported preset functions) |
| `hitTargetsMarked` | every `button`, `a` and `input[type=file]` label rendered by the primitives carries `data-hit="44"` |
| `pnpm --filter @legwork/miniapp build` | passes; the route list printed by Next includes `/probe`, `/api/idkit/request`, `/api/idkit/verify` and no `/` |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/miniapp typecheck && pnpm --filter @legwork/miniapp lint
pnpm --filter @legwork/miniapp test
pnpm --filter @legwork/miniapp build
```
Expected: typecheck/lint clean; 4 test files green; build lists the three routes above.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). Never a deducted figure.
- No secrets in code or client bundles; read keys only from `process.env` on the server; nothing secret under `NEXT_PUBLIC_*`; the JSON dump never contains `WORLD_RP_SIGNING_KEY` or any env value other than the level string.
- Tests never call a live model or a live chain; the network is msw only.
- Nothing copied from `pitch/` or `design-system/` — the tokens below are typed by hand; draw no SVG assets in this task (the wordmark is live type).
- Paper-ground tokens (name → value → use): `--paper-50 #FAF9F5` page · `--paper-100 #F0EEE7` tag fill · `--paper-0 #FFFFFF` card · `--paper-border #E4E2DA` card border · `--paper-border-2 #D8D6CE` strong border · `--ink-text #17191B` primary type · `--ink-text-2 #42564D` secondary · `--ink-text-3 #6B716D` muted/seeded · `--verified-600 #1E9E77` teal fills · `--verified-700 #137A5B` teal text · `--verified-border-light rgba(30,158,119,.45)` · `--verified-tint-light rgba(30,158,119,.1)` · `--refusal-on-paper #B8860B` amber text. **No red token exists in the product.** Radii: tag 6 · badge 8 · tile/button 10 · card 14–16 · pill 999. Spacing 4-px base (4, 8, 12, 16, 20, 24, 28, 36, 44). Paper cards: white, 1 px `--paper-border`, shadow `0 2px 10px rgba(20,22,20,.05)`. Type: Archivo 700–800 for headlines/numerals (tracking −0.02em / −0.03em); Inter body; JetBrains Mono for ids, addresses, hashes, chips, labels (labels uppercase, +0.1em). No gradients, no blur, no elevation games, no icon font, no emoji; unicode `✓ · ↗ ●` only.
- Phone floors: 16 px body, 20 px for anything narrated (`data-floor="20"`); hit targets ≥ 44 px; the verified state (`VerifiedState`) lives in the sticky header so it is always above the fold.
- Honesty rules (09-design-prompt, verbatim, all ten apply to every D task): (1) Three copy blocks in `08-pitch-deck.md` are verbatim-locked (tagline, claim, trust model incl. the daily-cap clause) — reproduce exactly. (2) Never show escrow releasing without a proof above or beside it; never show a refusal moving the escrow meter ("a refused task moves no money"). (3) The tag is `task-refused` (never "violation"); the name is Legwork (never Witness/Fieldnote unless the collision check renamed it, in which case swap everywhere at once). (4) Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia. (5) "Bot-proof, not fraud-proof"; "bounded, attributable work"; never "trustless". (6) No faces anywhere — the worker is hands and a phone. (7) Locations are Leiria (the real shop once chosen). Never Brooklyn, never "24h". (8) The filmed worker account shows only what it actually earned. (9) Every seeded row — worker or task — carries a "seeded" chip; the pool reads "1 real · +20 seeded (demo data)". (10) Fee figures are 3.45 / 3.00 / 0.45 (agent pays / worker receives / fee) on every surface; no deducted-fee numbers anywhere.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed; `dependencies` untouched.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `apps/miniapp/README.md` written (routes, env, probe instructions).
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.
- [ ] **Operator, not the agent:** after merge, open `https://<legwork-miniapp>.vercel.app/probe` inside World App on the demo phone, run the four readouts, copy the JSON, paste the payload shape and the exact `level` string into `docs/spikes/RESULTS.md` §S2 and the pain points into `FEEDBACK-WORLD.md` §3. Say in the PR that this step is the operator's.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-05 — Mini-app scaffold + /probe page for the S2' spike
owned-paths:
  - apps/miniapp/**
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
Operator step pending: run /probe on the demo phone; paste JSON into RESULTS.md §S2 + FEEDBACK-WORLD.md §3
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: `INTERFACE REQUEST:`, never a patch. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
Known at dispatch — file these as comments on the PR immediately, then continue with the defaults given:
- `ENV REQUEST: NEXT_PUBLIC_WORLD_CREDENTIAL_LEVEL=selfie|orb` (client-side mirror of `WORLD_CREDENTIAL_LEVEL`; absent from `.env.example`). Default `'orb'` until added.
- `INTERFACE REQUEST:` if `api-contract.ts` wraps the `/idkit/request` response differently from the brief's `rp_context {…}` line, follow `api-contract.ts` and say so.
- The IDKit `signal` is not part of the contract; use `''` in both presets.

## 14. Reviewer notes
Open `next.config.ts` first (rewrite must be `afterFiles`, destination from env with a localhost default), then the two temporary routes (server env only, `TEMPORARY` comment, no cookie), then `ProbeReadouts` (four `data-readout` cards degrade gracefully outside World App; coordinates rounded to 3 decimals; signing key never rendered). Check `pickPreset` default and that `app/page.tsx` does not exist. Most likely wrong: the widget mounted during SSR (must be browser-only), `capture="environment"` missing, the primitives' prop names drifting from §6.

## 15. Round 2+
—
