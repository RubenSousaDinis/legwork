---
id: T-50
title: Mini-app design polish — the paper screens as the design spec draws them
lane: D
day: 5                                # dispatched Day 4 evening (Sept 7); lands before the Day 8 rehearsal
size: M
agent_class: C
must: true
depends_on: [T-42]
owned_paths:
  - apps/miniapp/app/**
  - apps/miniapp/components/**
  - apps/miniapp/mocks/**
  - apps/miniapp/tests/**
  - apps/miniapp/README.md
labels: [area:miniapp, wave:5, size:M, agent:cloud]
branch: t-50/miniapp-design-polish
---

# T-50 — Mini-app design polish

## 1. Context
The worker phone is one of the three screens the demo video films, and the one a stranger holds. Every mini-app task so far (T-24, T-25, T-33, T-42) shipped behaviour first: the flows work end to end on a real phone inside World App, the honesty chips are there, the tests pin the copy and the `data-*` hooks. What they did not ship is the design. The first live run on Sept 7 shows it: the landing card's black button carries a full sentence in uppercase that overflows its own box, the raw IDKit code `verification_disabled` renders as the only explanation of a failed check, `Verify to claim` appears twice on one screen, lists have no list styling, and most spacing, colour and type is inline `style={{…}}` per component rather than the paper system in `globals.css`.

`DESIGN-SPEC.md` at the repository root is the design system — paper ground, one accent, the type scale, the component table, the floors, the voice. Read it in full before touching a file; every value below comes from it or from the two phone frames of the design prototype, which are not in the repository and are therefore transcribed in §2. This task makes the existing screens look like those frames without changing what they do, what they say, or what the tests hold them to.

> DESIGN-SPEC, "Two grounds": worker phone is **paper** — page `#FAF9F5`, card `#FFFFFF` with 1 px `#E4E2DA` border, radius 14–16 px, shadow `0 2px 10px rgba(20,22,20,.05)`, tag fill `#F0EEE7`, chip border `#D8D6CE`; type `#17191B` primary · `#42564d` secondary · `#6B716D` muted. "Semantic palette — non-negotiable": verified/released teal is **the only accent** (`#1E9E77` fills, `#137a5b` text on paper); refusal is amber (`#B8860B` on paper), never red; seeded/unverified is muted gray; "No gradients, no blur, no elevation games; hierarchy comes from scale plus the one accent; backgrounds are flat."

> DESIGN-SPEC, "Legibility floors": "Phone UI: 16 px body, **20 px floor** for anything narrated; hit targets ≥ 44 px." "Iconography: no icon font, no emoji, no filled icon sets. Unicode only: `✓` verified · `·` separator · `↗` tx link · `●` live dot. The in-UI glyph is the bare footprint, always in the verified teal."

> DESIGN-SPEC, "Voice": "Plain, technical, honest. Short declaratives. No exclamation marks, no superlatives, no emoji."

## 2. Exact scope

Two rules govern everything below. **Presentation changes, contracts do not:** every exported string constant (`VERIFY_HEADING`, `REAL_PRICES_LINE`, `VERIFY_CTA`, `NO_OPEN_TASKS`, `RELAYED_CHIP`, `PAID_FOR_THE_PROOF`, `CLAIM_EXPIRED`, `TTL_LINE`, `NOT_SPENDABLE`, `COMPLETED_LINE`, `EARNED_ONLY`, `BACK_UP_KEY`, `TESTNET_USDC`, the `ProofFlow` labels, the `describe()` error format for API errors) keeps its value, every `data-*` attribute the current components emit keeps its name and value, and every existing test file keeps passing — the one permitted test edit is the `CTA` constant in `tests/authFlow.test.tsx` (item 2). **The design lives in `globals.css`:** the pass moves colour, font, size, spacing and radius out of inline `style={{…}}` objects into named `lw-*` classes; when it is done, no owned `.tsx` file carries an inline style that sets a colour, a font, a font size, a background or a border (the proof photo `img` sizing is the one exception).

The prototype's phone frames are 390 × 844. Their values are the reference proportions; where a prototype value sits under a spec floor, the floor wins: body text is never below 16 px, mono meta and labels never below 15 px, anything carrying `data-floor="20"` never below 20 px, and every tappable element keeps `data-hit="44"` and 44 px.

1. **Header** (`app/layout.tsx`, `components/VerifiedState.tsx`, `components/ui/VerifiedChip.tsx`, `globals.css`). Row 1: the `LEGWORK` wordmark (Archivo 800, 20 px, +0.06 em) followed by the footprint glyph as an inline SVG in `--verified-600` — `<svg width="15" height="15" viewBox="0 0 24 24"><ellipse cx="9" cy="9" rx="4.2" ry="6" transform="rotate(-14 9 9)"/><ellipse cx="15.5" cy="19" rx="2.6" ry="3.4" transform="rotate(-14 15.5 19)"/></svg>` — and, right-aligned, the mono 15 px `--ink-text-3` caption `mini app` while unverified, or the compact pill `Verified human ✓ · sandbox` (`Chip tone="verified"`) once verified. Row 2, verified only: the full banner the header already renders — `.lw-verified-line` with `Verified human ✓ · World ID · one account per person` (`data-floor="20"`) plus the level chip (`sandbox Selfie Check` / `sandbox World ID`) — restyled as the prototype's teal card: `--verified-tint-light` fill, 1 px `--verified-border-light`, radius 14 px, padding 14 × 16, the first line Inter 17/700 in `--verified-700`, the sub-line `World ID · one account per person` Inter 15/500 in `--ink-text-2`. Both rows stay inside the sticky `<header>` (`tests/verifiedChipAboveFold.test.tsx` holds the banner above `main` on every route); the `Verify to claim` chip stays the unverified state of the header and appears **nowhere else** — the landing card and the unverified banner stop repeating it as a chip (the `VERIFY_HEADING` paragraph and the disabled row buttons of `UnverifiedBanner` are pinned by `tests/optional/unverifiedBanner.test.tsx` and stay).
2. **Landing `/`** (`app/(auth)/Landing.tsx`, `app/(auth)/page.tsx`, `tests/authFlow.test.tsx`). One card: section label `WORLD ID`; a title line, Inter 21/700: `Verify once. Claim tasks nearby.`; the primary `Button` (`size="lg"`, `full`) with the label **`Verify with World ID`** and nothing else in it — the rest of today's sentence becomes a mono 15 px `--ink-text-3` caption directly under the button in a `<p data-cta-caption>`: `about 30 seconds · one account per person`. Under the caption, the three facts as a list with `·` bullets, Inter 16/400 `--ink-text-2`, line-height 1.5, no browser bullets: `proof: photo + location` · `paid after the poster approves — automatically when the task's window ends` · `cloud-verified, operator-attested — onchain World ID verification is Orb-only today`. The `data-floor="20"` wrappers stay where they are today. Update the `CTA` constant in `tests/authFlow.test.tsx` to `'Verify with World ID'`; change nothing else in that file.
3. **The failed check** (`app/(auth)/idkitErrors.ts` new, `app/(auth)/page.tsx`, `globals.css`). A failure code from the World ID widget is not a refusal, so it is not amber. Export `describeIdkitError(code: string): { sentence: string; code: string }` mapping the documented IDKit codes to one plain sentence each — at least `user_rejected` / `verification_rejected` → `You closed World ID before finishing. Try again.`; `credential_unavailable` / `world_id_4_not_available` / `world_id_3_not_available` → `This World ID has no credential this app can use yet. Add the Selfie Check in World App, then try again.`; `invalid_network` → `World App and this app are on different World ID environments (staging vs production).`; `inclusion_proof_pending` / `inclusion_proof_failed` → `World ID is still registering that credential. Wait a minute and try again.`; `connection_failed` / `timeout` / `unexpected_response` / `generic_error` → `World ID did not answer. Check the connection and try again.`; `max_verifications_reached` / `nullifier_replayed` → `This World ID already verified for Legwork.`; `invalid_rp_signature` / `rp_signature_expired` / `timestamp_too_old` / `timestamp_too_far_in_future` / `invalid_timestamp` / `duplicate_nonce` / `unknown_rp` / `inactive_rp` / `invalid_rp_id_format` / `malformed_request` → `Legwork's World ID configuration was refused. This is on our side.`; anything else → `World ID could not verify you.`. The page renders `<p data-error="idkit"><span>{sentence}</span> <Chip tone="neutral"><code data-error-code>{code}</code></Chip></p>` — the sentence Inter 16 px in `--ink-text`, the raw code always visible in the chip (the phone log T-41 keeps is written from it). API errors keep today's `describe()` text (`409 nullifier_already_registered`, `api 500`) and render through the same element with the status text in the chip. `.lw-error` stays amber and stays reserved for refusals and for the payout-key import error.
4. **Task list `/tasks`** (`app/tasks/TaskList.tsx`, `components/TaskCard.tsx`, `components/UnverifiedBanner.tsx`, `app/tasks/UnverifiedTasks.tsx`, `globals.css`). Above the list, the section label `NEARBY TASKS` (mono 15/600, +0.08 em, `--ink-text-3`). The expanded card, top to bottom, each row marked `data-row`: `type` — `MonoTag` left, the `TTL_LINE` right in mono 15/600 `--ink-text-3` (**not amber**: the prototype colours it amber, DESIGN-SPEC reserves amber for refusals, the spec wins); `name` — the title Inter 21/700 left, the price right on the same baseline as Archivo 22/800 `3.00` followed by `USDC` in mono 15 `--ink-text-3`, `white-space: nowrap`; `meta` — mono 15/500 `--ink-text-3`: `<street_address>, <locality> · <distance> · you keep the full <price>` when the brief carries a place, else `<distance> · you keep the full <price>`; a 1 px dashed `--paper-border` rule; `question` — the type-derived question Inter 16/600 (copy unchanged); `proof` — the proof requirement as two `·` lines Inter 16/400 `--ink-text-2` (`photo of the door + hours sign` / `location · timestamp` for `verify-open` and `photo-of`; the other two types keep their present lines); `claim` — the CLAIM `Button` (`primary`, `lg`, `full`); `relayed` — the `RELAYED_CHIP` centred as `Chip tone="verified"`. The claimed state keeps its countdown, tx chip, `Go to proof` and `release this claim` actions with `--s-3` gaps. Collapsed rows: one line `<type> · <title>` mono 16/600, a meta line mono 15/500 `--ink-text-3` (`<distance> · claim within 30 min`), the price Archivo 17/800 right; padding 10 × 16, radius 14, the same white card. Seeded rows keep their `seeded` chip; refused rows do not exist on this screen. The unverified list (`UnverifiedBanner`) uses the same card and row classes with its buttons disabled as today.
5. **Earnings bar** (`app/tasks/TaskList.tsx` → new `components/EarningsBar.tsx`, `globals.css`). The `earnings … testnet USDC` link at the bottom of `TaskList` becomes the prototype's bar: fixed to the bottom of the viewport on `/tasks` only, `--paper-0`, 1 px `--paper-border` top, padding 12 × 20 plus the bottom safe-area inset, and `main` gets bottom padding so the last card clears it. Left: `Earnings` Inter 16/600 `--ink-text-3` over the mono 15 line `testnet USDC — not spendable` in `--ink-text-3`; right: the released figure Archivo 22/800 followed by `USDC` mono 15 `--ink-text-3`. The whole bar is one `<a href="/earnings" data-hit="44">` and the figure keeps `data-earnings="released"` and `data-floor="20"`. The figure is `released_usdc` from `GET /me/earnings` exactly as `TaskList` reads it today — earned only, `0.00` for a fresh account, nothing seeded, nothing projected.
6. **Proof screen** (`app/proof/ProofFlow.tsx`, `app/proof/AnswerToggle.tsx`, `app/proof/Downgrade.tsx`, `app/proof/PaidState.tsx`, `globals.css`). The proof card: header row with `MonoTag` `<type> · <title>` left and mono 15 `--ink-text-3` `proof` right; the photo slot 140 px tall, radius 12 (`--r-tile`, new token), the capture control filling it before a photo exists and the photo (with `Retake` under it) after; the GPS and timestamp readouts as a two-column mono 15 list (`GPS` → `<lat>, <lon> · ±<accuracy> m` or the T-33 downgrade line; `timestamp` → `HH:MM`); a dashed rule; the answer row — the question Inter 16/600 left and the segmented control right (`--paper-100` track, radius 10, 3 px padding; segments Inter 16/600, 44 px tall; the selected segment `--verified-600` fill and `--paper-0` text — teal is the confirm accent, and the segments are answers, not refusals); the `PAID_FOR_THE_PROOF` and `NO_PEOPLE` lines Inter 16/400 `--ink-text-3`, line-height 1.45; the SUBMIT `Button`. `call-confirm` and `compare-two` answer fields (`CharacterField`, the A/B control) use the same track and segment classes. Between SUBMIT and the paid state, the waiting line becomes a centred mono 15 caption between two dashed rules: `after approval · or auto-release when the task's window ends`. `PaidState`: the released card gets `data-tone="verified"`, `--verified-tint-light` fill, `--verified-border-light` border, radius 16; inside it, in order — the proof `img` (unchanged: the component renders nothing without it), the `photo · timestamp HH:MM` line, a row with `Released` Inter 16/700 in `--verified-700` left and `NOT_SPENDABLE` as `Chip tone="neutral"` right, the amount as Archivo 38/800 `--verified-700` `3.00` with `USDC` at 16 px (`data-released="usdc"` and `data-floor="20"` stay on the amount node; its text stays `Released · 3.00 USDC` only if a test pins it — check `tests/proof/paidState.test.tsx` before splitting the string and keep whatever it asserts), the tx `Chip tone="verified"` beside `<span data-completed>{COMPLETED_LINE}</span><span> · you kept the full posted rate</span>` mono 15 `--ink-text-2`, and `Back to tasks`.
7. **Payout key, sign-in, verify and register steps** (`app/(auth)/PayoutKeyStep.tsx`, `SignInStep.tsx`, `VerifyStep.tsx`, `RegisterStep.tsx`). The same card grammar: section label, body 16 px, the address in mono 15 with `overflow-wrap: anywhere`, the warning box as a `--paper-100` tile (radius 12, padding 12 × 16) instead of a nested card, actions stacked with `--s-3` gaps and ghost buttons full width, the import `textarea` styled (mono 15, radius 10, 1 px `--paper-border-2`, padding 12, full width), the chips on their own line. No copy changes.
8. **Earnings, compare, report** (`app/earnings/page.tsx`, `app/compare/[id]/*.tsx`, `app/report/[id]/*.tsx`). Move their inline styles to the classes created above (`lw-stat`, `lw-meta`, `lw-list-label`, the segmented control, the tile). No copy or behaviour changes; `tests/optional/**` and `tests/proof/earnings.test.tsx` stay green.
9. **`globals.css`**. New tokens `--r-tile: 12px` and `--r-card-sm: 14px`; a focus ring on every interactive element — `:focus-visible { outline: 2px solid var(--verified-600); outline-offset: 2px }`; `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 0ms !important; animation-duration: 0ms !important } }`; the class inventory this task creates (`lw-list-label`, `lw-task-row`, `lw-task-row--collapsed`, `lw-task-name`, `lw-price`, `lw-price__unit`, `lw-meta`, `lw-rule`, `lw-facts`, `lw-cta-caption`, `lw-segmented`, `lw-segmented__option`, `lw-segmented__option--on`, `lw-tile`, `lw-earnings-bar`, `lw-paid`, `lw-stat`, `lw-error-line`, `lw-textarea`, `lw-footprint`), each with a one-line comment naming the spec row it implements. Tailwind is imported at the top of the file and stays; the components use no utility classes, only `lw-*`.
10. **`apps/miniapp/README.md`**: a "Design" section listing the class inventory, the floor rules as they are enforced (`data-floor`, `data-hit`, the 15/16/20 px minimums), the no-inline-style rule and the test that holds it.

## 3. Out of scope
- Copy: no exported string constant changes value; the locked copy blocks are not on this surface. New copy is limited to the strings quoted in §2.
- Behaviour: session, registration, claim, proof upload, GPS, polling, the payout key, MiniKit and IDKit wiring (`lib/**` is not owned — `BLOCKED:` if a screen cannot be styled without touching it). The World ID failure the lead is chasing (`verification_disabled`) is not yours to fix; you render it.
- `app/probe/**` — T-05's spike page; it stays as it is even though the glob covers it.
- The dashboard (T-10/T-26/T-43), `DESIGN-SPEC.md`, `packages/**`, `apps/api/**`, `apps/miniapp/lib/**`, `apps/miniapp/package.json` (no new dependencies: no UI library, no icon set, no animation library).
- Do not touch: `apps/miniapp/lib/**`, `apps/miniapp/package.json`, `apps/miniapp/next.config.*`, `apps/miniapp/vitest.config.ts`, `demo-data.json`, `packages/**`, `apps/api/**`, `apps/dashboard/**`.

## 4. Owned paths
```
apps/miniapp/app/**
apps/miniapp/components/**
apps/miniapp/mocks/**
apps/miniapp/tests/**
apps/miniapp/README.md
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `DESIGN-SPEC.md` | repository root | every colour, type, radius and spacing value; the component table; the floors; the voice |
| `SessionState` (`status: 'unverified' \| 'verifying' \| 'verified'`, `level`, `mode`, `worker`, `registered`), `useSession`, `useSessionReady`, `setSessionState`, `requireVerified` | `apps/miniapp/lib/session.ts` | which header row and which list to render; unchanged |
| `apiFetch`, `ApiError { status, body }` | `apps/miniapp/lib/api.ts` | the API error text `describe()` builds today |
| `resolveArea`, `lastKnownPosition`, `getPosition`, `loadOrCreatePayoutKey`, `exportPrivateKey`, `importPrivateKey`, `getPayoutAddress` | `apps/miniapp/lib/*.ts` | called exactly as today |
| `IdkitVerify` props (`onFailed(error: unknown)` — a widget code arrives as `Error(code)`, an API failure as `ApiError`) | `apps/miniapp/lib/worldid.ts` | the input of `describeIdkitError` |
| `WorkerTaskRow`, `WorkerBrief`, `TaskView`, `PublicTaskView`, `GET /me/earnings` → `{ released_usdc, completed, score, distinct_raters }` | `packages/shared/src/api-contract.ts` | the fields the rows and the bar print; nothing new is read |
| msw handlers and scenarios (`EARNINGS_ZERO`, `EARNINGS_ONE_PAID`, the task-list and proof scenarios) | `apps/miniapp/mocks/*.ts` | extend scenarios if a new test needs one; never a live API |
| The `data-*` hooks and exported constants the existing tests use | `apps/miniapp/tests/**` | kept verbatim — run the whole suite before the first edit and after every screen |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `describeIdkitError(code) → { sentence, code }` | `apps/miniapp/app/(auth)/idkitErrors.ts` | the auth page; T-41's phone log reads the rendered code |
| `EarningsBar { releasedUsdc: number \| null }` | `apps/miniapp/components/EarningsBar.tsx` | `/tasks` |
| The `lw-*` class inventory in §2.9, documented in `apps/miniapp/README.md` | `apps/miniapp/app/globals.css` | every later mini-app change |
| `data-row`, `data-cta-caption`, `data-error="idkit"`, `data-error-code`, `data-tone` on the paid card | the components above | the §8 tests; T-47's read of the phone frame |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-50` — must print `CLAIMED`. Exit 1 means another agent holds it or a dependency is open: stop. (Every brief starts here; the script pushes the branch — which is what makes the claim exclusive — and opens the draft PR. Finish with `gh pr ready`, never `gh pr create`.)
1. Read `DESIGN-SPEC.md`, then `apps/miniapp/app/globals.css`, then every file under `apps/miniapp/components` and `apps/miniapp/app` except `probe/`. Run `pnpm --filter @legwork/miniapp test` once before editing and keep the count of passing files: that number never goes down.
2. Build the class inventory in `globals.css` first (§2.9), from the spec's values, with the comments. No component changes yet; the suite stays green.
3. Header and landing (§2.1, §2.2), then the failed-check line (§2.3). Run `tests/authFlow.test.tsx`, `tests/verifiedChipAboveFold.test.tsx` and `tests/hitTargetsMarked.test.tsx` after each.
4. Task list and cards (§2.4), then the earnings bar (§2.5). Run `tests/tasks/**` and `tests/optional/**`.
5. Proof, paid state, payout/register steps, earnings/compare/report (§2.6–§2.8). Run `tests/proof/**` and `tests/optional/**`.
6. Write the §8 tests under `tests/design/`; write the README section; run §9; open the PR body with the §9 output and a one-line note per screen of what moved into classes.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `landingCtaIsOneShortLine` (`tests/design/landing.test.tsx`) | on `/` unverified the primary button's accessible name is exactly `Verify with World ID`; a sibling `[data-cta-caption]` reads `about 30 seconds · one account per person`; the three fact lines are present with their exact text |
| `oneVerifyChipOnTheUnverifiedScreen` (`tests/design/landing.test.tsx`) | rendering the header and `/` unverified, the text `Verify to claim` occurs exactly once in the document and inside `header` |
| `idkitErrorIsASentencePlusCode` (`tests/design/idkitErrors.test.tsx`) | `describeIdkitError('user_rejected').sentence === 'You closed World ID before finishing. Try again.'`; `describeIdkitError('verification_disabled')` returns the fallback sentence and `code === 'verification_disabled'`; after `onFailed(new Error('verification_disabled'))` the page shows `[data-error="idkit"]` whose `[data-error-code]` text is `verification_disabled`, and no `.lw-error` element |
| `taskCardRowsInDesignOrder` (`tests/design/taskCard.test.tsx`) | an expanded `TaskCard` for a `verify-open` row with a place brief renders `[data-row]` values in the order `type, name, meta, question, proof, claim, relayed`; `[data-price="usdc"]` reads `3.00` with a following `USDC` unit node; `[data-ttl]` has no amber class and the `TTL_LINE` text; the relayed chip has `data-tone="verified"` |
| `earningsBarShowsReleasedOnly` (`tests/design/earningsBar.test.tsx`) | with scenario `EARNINGS_ONE_PAID` the bar's `[data-earnings="released"]` reads the scenario's `released_usdc.toFixed(2)`; with `EARNINGS_ZERO` it reads `0.00`; the bar is an anchor to `/earnings` with `data-hit="44"` and contains `testnet USDC — not spendable` |
| `paidStateIsTealAndBelowTheProof` (`tests/design/paidState.test.tsx`) | `PaidState` with a thumbnail renders a root with `data-tone="verified"`; the `img` precedes `[data-released="usdc"]` in DOM order; `[data-completed]` text starts with `+1 completed`; without a thumbnail the root is `[data-paid-state="none"]` and empty |
| `noInlineColourOrFontInComponents` (`tests/design/noInlineStyles.test.ts`) | reads every `.tsx` under `app/` (except `probe/`) and `components/` and fails on any `style={{` block containing `color`, `fontFamily`, `fontSize`, `fontWeight`, `background`, `border` or `letterSpacing`, allowing only the proof `img` in `PaidState.tsx` and `ProofFlow.tsx` |
| `cssHasFocusRingAndReducedMotionAndNoRed` (`tests/design/globals.test.ts`) | `globals.css` contains `:focus-visible` with `var(--verified-600)`, a `prefers-reduced-motion: reduce` block, the tokens `--r-tile` and `--r-card-sm`, and no `#e5484d`, `red`, `crimson` or `orangered` |
| every existing test file | unchanged except the `CTA` constant in `tests/authFlow.test.tsx`; all green |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/miniapp typecheck
pnpm --filter @legwork/miniapp lint
pnpm --filter @legwork/miniapp test
pnpm --filter @legwork/miniapp build
bash scripts/ci/banned-words.sh
grep -rnE "style=\{\{[^}]*(color|font|background|border)" apps/miniapp/app apps/miniapp/components | grep -v probe/ ; echo "inline style grep exit $?"
git diff --stat origin/main -- apps/miniapp/tests | tail -1
```
Expected: typecheck, lint and build clean; the suite green with `tests/design/*` present and the pre-existing count intact; banned-words silent; the inline-style grep prints only the two `img` lines (exit 0 with those, or exit 1 with nothing); the tests diff shows the new `tests/design/` files plus one changed line in `authFlow.test.tsx`.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). The phone prints `price_usdc` / `amount_usdc` / `released_usdc` as the API sends them and computes nothing.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted); the mini-app's network is msw and nothing else.
- Palette: teal only for verified/released/confirm states; amber only for refusals; no red token anywhere; seeded and unverified are `--ink-text-3`.
- Floors: `data-floor="20"` elements ≥ 20 px, body ≥ 16 px, mono meta ≥ 15 px, every tappable element `data-hit="44"` and ≥ 44 px; "the verified chip is always above the fold" — the header keeps the full banner.
- Honesty chips stay visible, never fine print: `sandbox Selfie Check` / `sandbox World ID`, `operator-attested`, `relayed claim · gas paid by Legwork`, `testnet USDC — not spendable`, `seeded` on every seeded row.
- No icon font, no emoji, no image assets; unicode `✓ · ↗ ●` and the inline footprint SVG only. Fonts are the three already linked from Google Fonts; no font files.
- "Never show escrow releasing without a proof above or beside it" — `PaidState` keeps its guard.
- No new dependencies; no Tailwind utility classes in JSX; the design is `globals.css` classes.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `apps/miniapp/README.md` gained the Design section.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)
```
Task: T-50 — Mini-app design polish
owned-paths:
  - apps/miniapp/app/**
  - apps/miniapp/components/**
  - apps/miniapp/mocks/**
  - apps/miniapp/tests/**
  - apps/miniapp/README.md
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`. A screen that cannot be styled without editing `apps/miniapp/lib/**` is a `BLOCKED:` naming the file and the line, not an edit.

## 14. Reviewer notes
Open `globals.css` first and check every value against `DESIGN-SPEC.md` — the three most likely faults are an amber that is not a refusal (the TTL line, the earnings caption, the countdown), a prototype size copied under a floor (12–13 px mono lines), and a `data-*` hook renamed while moving markup into classes. Then run the whole suite and read `git diff origin/main -- apps/miniapp/tests`: it should be the `tests/design/` files plus one line. Finally render `/` and `/tasks` in the test harness at 390 px (or in `next dev` against the hosted API) and confirm the button label fits on one line and `Verify to claim` appears once.

## 15. Round 2+
