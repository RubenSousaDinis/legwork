---
id: T-24
title: Mini-app auth — verify → session → payout key → register
lane: D
day: 2
size: M
agent_class: C
must: true
depends_on: [T-05, T-20]
owned_paths:
  - apps/miniapp/app/(auth)/**
  - apps/miniapp/lib/api.ts
  - apps/miniapp/lib/env.ts
  - apps/miniapp/lib/session.ts
  - apps/miniapp/lib/worldid.ts
  - apps/miniapp/lib/workerKey.ts
  - apps/miniapp/lib/area.ts
  - apps/miniapp/lib/probeApi.ts
  - apps/miniapp/mocks/**
  - apps/miniapp/app/api/idkit/**
labels: [area:miniapp, wave:2, size:M, agent:cloud]
branch: t-24/miniapp-auth
---

# T-24 — Mini-app auth flow

## 1. Context
This is the worker's first minute: verify once with World ID, sign in, get a payout address, register — then the task list (T-25) opens. It is also the Selfie Check track's judged surface and the first thing the video shows on the phone (beat 5: "The World ID verification completing on the phone (8 s)"). The API's `/idkit/*`, `/session*` and `/register` routes exist after T-20; you delete T-05's temporary probe routes and point everything at the real API through the same-origin `/api` rewrite. Vercel previews cannot open inside World App, so the operator tests this flow **after merge** on the Portal-registered URL and pastes the log into the PR; keep the PR tiny and test the web IDKit-mode session on the preview.

> 02-architecture: "Flow: IDKit verify (Selfie Check or Orb-level staging) → `walletAuth` session → relayed register (the app generates and stores the worker payout key) …" · "Plain mobile-web IDKit route as the fallback if the World App webview misbehaves." · Honesty lines: "cloud-verified, operator-attested — onchain World ID verification is Orb-only today." · "the worker signs in with World ID and their World App wallet; we relay the claim and pay the gas; the contract records their address." · "the sandbox credential is simulated; the uniqueness code path is the same, the credential is not."

> 09-design-prompt, Screen 2: "Top: the verification state — 'Verified human ✓ · World ID · one account per person' (chip 'sandbox'). … Also design the **unverified-visitor state** (… header chip 'Verify to claim', CLAIM replaced by 'Verify with World ID — about 30 seconds, one account per person', and two copy lines: 'proof: photo + location' / 'paid within the task's window after the poster approves, automatically after that')."

Spike branching (13-build-plan): `WORLD_CREDENTIAL_LEVEL=selfie|orb` selects the preset and the chip text; if the webview's camera/walletAuth is broken, the web IDKit session mode becomes primary, disclosed on screen.

## 2. Exact scope
- `app/(auth)/page.tsx` (`/`): a state machine over `SessionState` — `unverified` landing → `verifying` (IDKit widget) → sign-in (`walletAuth` inside World App, else idkit mode) → payout key screen → register → redirect to `/tasks`. Restores an existing session on load.
- Unverified landing: `VerifiedChip` full banner in the unverified state (chip `Verify to claim`), CTA `Button variant="primary" size="lg"` with the label `Verify with World ID — about 30 seconds, one account per person`, the two copy lines `proof: photo + location` and `paid within the task's window after the poster approves, automatically after that`, and the line "cloud-verified, operator-attested — onchain World ID verification is Orb-only today." No task list here (T-42 adds the real-price list for visitors).
- `lib/worldid.ts`: `requestRpContext()`, `verifyProof(payload)`, `pickPreset(level)` (moved from `lib/probeApi.ts`, which you delete) and `IdkitVerify` (client-only component wrapping `IDKitRequestWidget` with `app_id`, `action = 'legwork-worker'`, `rp_context`, `allow_legacy_proofs = true`, `preset`, `handleVerify` → `verifyProof` as-is, `onSuccess`). A 409 `nullifier_already_registered` shows: "This World ID already has a worker account. Restore it with your payout key below." and opens the import field.
- `lib/session.ts`: real `useSession()`; `createWalletAuthSession()` = `GET /session/nonce` → `MiniKit.walletAuth({ nonce, statement: 'Sign in to Legwork', expirationTime: now + 10 min })` → `POST /session { mode: 'walletAuth', payload: <the walletAuth result's data object {address, message, signature}>, nonce }`; `createIdkitSession(worker_address)` = `POST /session { mode: 'idkit', worker_address }` (used when `MiniKit.isInstalled()` is false; the screen shows the chip `web sign-in — outside World App`); `restoreSession()` = `GET /me/earnings` 200 → verified, 401 → unverified; non-secret mirror of the state in `localStorage['legwork.session.v1']`.
- `lib/workerKey.ts`: `loadOrCreatePayoutKey()` → viem `generatePrivateKey()` + `privateKeyToAccount()`, stored under `localStorage['legwork.payoutKey.v1']`; `exportPrivateKey()`; `importPrivateKey(hex)` (validates `^0x[0-9a-f]{64}$`). The private key is never sent anywhere, never logged, never in React state longer than the reveal.
- Payout key screen: `Your payout address` + mono address + Basescan link (`https://sepolia.basescan.org/address/<addr>`), warning card: "Stored only in this browser. If you clear site data you lose access to unpaid earnings. Legwork never sees this key." · `Reveal and copy private key` (two taps: reveal, then copy) · `Import an existing payout key` (textarea + `Restore`). Continue button `Register as a worker`.
- `lib/area.ts`: `DEFAULT_AREA = 'ez1dp'`; `areaFromPosition(lat, lon)` = `ngeohash.encode(lat, lon, 5)`; `resolveArea(timeoutMs = 5000)` tries `getCurrentPosition` once and falls back to the default.
- Register: `POST /register { worker_address, area, task_types: 15 }` (all four types: `verify-open 1 | photo-of 2 | call-confirm 4 | compare-two 8`; no picker in v0) → `{tx, worker}`; screen shows the `tx` chip (Basescan link) and the chip `operator-attested`; then `registered: true` and redirect to `/tasks`.
- Verified header: `VerifiedState` (T-05) now renders the banner `Verified human ✓ · World ID · one account per person` + chip `sandbox Selfie Check` (level `selfie`) / `sandbox World ID` (level `orb`) from the real session — sticky, above the fold on every route.
- Delete `app/api/idkit/request/route.ts`, `app/api/idkit/verify/route.ts`, `lib/probeApi.ts`; `/probe` keeps working through the rewrite (update its imports to `lib/worldid.ts` only if it imports `probeApi` — that file is T-05's `app/probe/**`; if an edit there is unavoidable, `BLOCKED:`).
- `mocks/handlers.ts` regenerated from `packages/shared/src/api-contract.ts` for **every worker-facing route** with scenario switches in `mocks/scenarios.ts` (T-25/T-33/T-42 cannot edit mocks): `/idkit/request`, `/idkit/verify` (`ok | nullifier_already_registered`), `/session/nonce`, `/session`, `/register`, `GET /tasks` (`two_rows | empty`), `POST /tasks/:id/claim` (`ok | InCooldown | AlreadyClaimed | SeededCannotClaimExternal`), `/release-claim`, `/proofs`, `/tasks/:id/submit` (`submitted | disputed`), `/tasks/:id/report`, `GET /me/earnings` (`zero | one_paid | unauthorized`), `GET /tasks/:id` (`submitted | released`). Fixture bodies validate against the contract's zod schemas in a test.

## 3. Out of scope
- Task list, claim, countdown (T-25). Proof, earnings (T-33). Unverified task list with real prices, `compare-two`, `Report task` (T-42). The API side of any route (T-20, T-17).
- Do not touch: `apps/miniapp/app/layout.tsx`, `components/**`, `app/probe/**`, `next.config.ts`, `vitest.config.ts`, `package.json`; anything outside `apps/miniapp`.

## 4. Owned paths
```
apps/miniapp/app/(auth)/**   apps/miniapp/lib/api.ts   apps/miniapp/lib/env.ts   apps/miniapp/lib/session.ts
apps/miniapp/lib/worldid.ts   apps/miniapp/lib/workerKey.ts   apps/miniapp/lib/area.ts   apps/miniapp/lib/probeApi.ts (delete)
apps/miniapp/mocks/**   apps/miniapp/app/api/idkit/** (delete only)
```
`lib/gps.ts` is T-33's — do not create it.

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `POST /idkit/request` | `api-contract.ts` / `docs/api.md` | public · `{action}` → `rp_context {rp_id, nonce, created_at, expires_at, signature}` |
| `POST /idkit/verify` | same | public · IDKit result payload (forwarded as-is) → `{verified:true, nullifier, level}` + idkit-session cookie; **409** `{error:'nullifier_already_registered'}` |
| `GET /session/nonce` | same | public → `{nonce}` |
| `POST /session` | same | idkit-session · `{mode:'walletAuth', payload, nonce}` (verified with `verifySiweMessage`) or `{mode:'idkit', worker_address}` → worker-session cookie `{worker, nullifier, mode}` |
| `POST /register` | same | idkit-session · `{worker_address, area, task_types}` → `{tx, worker}` |
| `GET /me/earnings` | same | worker-session → `{released_usdc, completed, score, distinct_raters}` (used only as the session probe here) |
| `TASK_TYPE_BIT` | `packages/shared/src/enums.ts` | `verify-open 1, photo-of 2, call-confirm 4, compare-two 8` |
| `SessionState`, `useSession` signature, `VerifiedChip`, `Button`, `Chip`, `useMiniKit`, `apiFetch` | T-05 (`lib/session.ts` type, `components/**`) | keep the type; replace the hook body |
| `viem` (`generatePrivateKey`, `privateKeyToAccount`), `ngeohash`, `@worldcoin/minikit-js`, `@worldcoin/idkit` | `apps/miniapp/package.json` | missing → `DEP REQUEST:` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `useSession(): SessionState`, `signOut()`, `requireVerified()` (redirects to `/` when not verified) | `lib/session.ts` | T-25, T-33, T-42 |
| `loadOrCreatePayoutKey(): { address }`, `getPayoutAddress()` | `lib/workerKey.ts` | T-33 (earnings address) |
| `resolveArea()`, `DEFAULT_AREA`, `lastKnownPosition()` | `lib/area.ts` | T-25 (`GET /tasks?area=&lat=&lon=`) |
| msw handlers + `setScenario({...})` | `mocks/handlers.ts`, `mocks/scenarios.ts` | T-25, T-33, T-42 tests |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-24` — it must print `CLAIMED T-24`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `api-contract.ts` (all worker routes), `docs/api.md`, T-05's `components/ui/*`, `lib/session.ts` stub, `lib/api.ts`.
2. Mocks first (§2 last bullet) with a test that every fixture parses with the contract's response schema.
3. `lib/workerKey.ts`, `lib/area.ts`, `lib/worldid.ts` (move + delete `probeApi.ts`), `lib/session.ts`.
4. `app/(auth)/page.tsx` and its client components (`Landing`, `VerifyStep`, `SignInStep`, `PayoutKeyStep`, `RegisterStep`); every button `data-hit="44"`; every narrated element `data-floor="20"` (banner, CTA, chips).
5. Delete the temporary routes; run `pnpm --filter @legwork/miniapp build` and confirm `/api/idkit/*` no longer appear as routes.
6. Tests, README section "Auth flow + session modes", PR. Ask the operator (in the PR body) for the phone test.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `bothSessionModes` | with `MiniKit.isInstalled()` mocked `true` and `walletAuth` mocked to return `{executedWith, data:{address, message, signature}}`, the flow calls `GET /session/nonce` then `POST /session` with `{mode:'walletAuth', payload: <data>, nonce}` where `nonce` equals the fetched one; with `isInstalled()` `false`, it calls `POST /session` with `{mode:'idkit', worker_address: <payout address>}` and renders the chip `web sign-in — outside World App` |
| `verifiedChipAboveFold` | render layout header + auth page in the `verified` state: the element containing `Verified human ✓ · World ID · one account per person` precedes `main` in DOM order, carries `data-floor="20"`, and its chip text is `sandbox Selfie Check` for level `selfie` and `sandbox World ID` for `orb` |
| `payoutKeyPersists` | two calls to `loadOrCreatePayoutKey()` return the same address; after `localStorage.clear()` a new one; `importPrivateKey()` of a known key yields its known address; a fetch spy over the whole register flow never sees the private key in any URL, header or body |
| `registerBodyExact` | with geolocation unavailable, `POST /register` body is exactly `{worker_address: <payout address>, area: 'ez1dp', task_types: 15}` |
| `nullifierConflictOffersRestore` | scenario `nullifier_already_registered` renders the restore message and the import field |
| `temporaryRoutesDeleted` | `apps/miniapp/app/api/idkit` and `apps/miniapp/lib/probeApi.ts` do not exist on disk |
| `fixturesMatchContract` | every mock response body parses with its route's response schema from `api-contract.ts` |
| `pnpm --filter @legwork/miniapp build` | passes; route list has `/`, `/probe`; no `/api/idkit/*` |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/miniapp typecheck && pnpm --filter @legwork/miniapp lint
pnpm --filter @legwork/miniapp test
pnpm --filter @legwork/miniapp build
```
Expected: clean; 7 named tests green; build without `/api/idkit/*`.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). Never a deducted figure.
- No secrets in code or client bundles; the payout private key lives only in `localStorage` and the reveal box; nothing secret under `NEXT_PUBLIC_*`; you may not edit `.env.example`.
- Tests never call a live model or a live chain; the network is msw only.
- Leiria placeholders only; default area `ez1dp`.
- The verified chip is always above the fold on the phone (sticky header); phone floors 16 px body / 20 px narrated; hit targets ≥ 44 px; no faces, no emoji, no gradients; paper-ground tokens of T-05 only; nothing copied from `pitch/` or `design-system/`.
- Copy, verbatim: `Verified human ✓ · World ID · one account per person` · `Verify to claim` · `Verify with World ID — about 30 seconds, one account per person` · `proof: photo + location` · `paid within the task's window after the poster approves, automatically after that` · chips `sandbox Selfie Check` / `sandbox World ID` · `operator-attested` · `web sign-in — outside World App`. Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia.
- Honesty rules (09-design-prompt, verbatim): (1) Three copy blocks in `08-pitch-deck.md` are verbatim-locked (tagline, claim, trust model incl. the daily-cap clause) — reproduce exactly. (2) Never show escrow releasing without a proof above or beside it; never show a refusal moving the escrow meter ("a refused task moves no money"). (3) The tag is `task-refused` (never "violation"); the name is Legwork (never Witness/Fieldnote unless the collision check renamed it, in which case swap everywhere at once). (4) Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia. (5) "Bot-proof, not fraud-proof"; "bounded, attributable work"; never "trustless". (6) No faces anywhere — the worker is hands and a phone. (7) Locations are Leiria (the real shop once chosen). Never Brooklyn, never "24h". (8) The filmed worker account shows only what it actually earned. (9) Every seeded row — worker or task — carries a "seeded" chip; the pool reads "1 real · +20 seeded (demo data)". (10) Fee figures are 3.45 / 3.00 / 0.45 (agent pays / worker receives / fee) on every surface; no deducted-fee numbers anywhere.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `apps/miniapp/README.md` — you do not own it; put the "Auth flow" notes in `app/(auth)/README.md` instead.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.
- [ ] **Operator phone-test log pasted in the PR after merge** (merge-to-test): device, `MiniKit.isInstalled()`, level string, session mode, register `tx`, timing; then `POST /admin/reset-worker` so the demo nullifier is free for filming. The agent states in the PR that this step is the operator's.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-24 — Mini-app auth flow
owned-paths:
  - apps/miniapp/app/(auth)/**
  - apps/miniapp/lib/{api,env,session,worldid,workerKey,area,probeApi}.ts
  - apps/miniapp/mocks/**
  - apps/miniapp/app/api/idkit/** (deleted)
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
Operator step pending: phone test on the Portal URL; paste log; reset-worker
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it. Frozen interfaces (`packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql`, `apps/api/src/db/schema.ts`): `INTERFACE REQUEST:`. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
Known at dispatch — comment, then continue with the default: `INTERFACE REQUEST: POST /session walletAuth payload shape` — the brief sends the `data` object `{address, message, signature}`; if `api-contract.ts` expects the whole `walletAuth` result, follow the contract. `ENV REQUEST: NEXT_PUBLIC_WORLD_CREDENTIAL_LEVEL` (see T-05). If cookies do not survive the `/api` rewrite on the phone, report `BLOCKED: cookies through rewrite` with the operator's log — do not switch to cross-origin calls yourself (that needs `SameSite=None` + CORS on the API).

## 14. Reviewer notes
Open `lib/session.ts` (both modes; `payload` = `data`; nonce round-trip) and `lib/workerKey.ts` (key never leaves the browser) first, then the auth page states against §2 copy, then the mocks (scenarios cover T-25/T-33 needs). Most likely wrong: `task_types` sent as an array, the chip text not switching on level, `/probe` broken by the deleted `probeApi.ts`, the temporary routes left behind.

## 15. Round 2+
Round 2 (Sept 6, #85 merged): `lib/probeApi.ts` deleted (its survivors live in `lib/worldid.ts`), `VerifiedState` renders the banner and the level chip, `task_types` goes on the wire as the four-name array from `TASK_TYPES`, `DEFAULT_AREA = 'ez1dp'` (Leiria; `ez5ku` was inland Spain), and §4/§12 gained `app/probe/**`, `components/VerifiedState.tsx`, `tests/**`. The device merge-to-test stays the operator's.
