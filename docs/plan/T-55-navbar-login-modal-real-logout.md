---
id: T-55
title: A navbar, a login modal, and a logout that actually logs you out
lane: D
day: 6                               # added Sept 9 from the operator's phone testing
size: M
agent_class: C
must: true
depends_on: []
owned_paths:
  - apps/miniapp/app/layout.tsx
  - apps/miniapp/app/globals.css
  - apps/miniapp/app/(auth)/**
  - apps/miniapp/components/**
  - apps/miniapp/lib/session.ts
  - apps/miniapp/tests/**
  - apps/miniapp/README.md
  - apps/api/app/session/**
  - apps/api/src/session.ts
  - apps/api/test/**
labels: [area:miniapp, wave:6, size:M, agent:cloud]
branch: t-55/navbar-login-modal-logout
---

# T-55 — A navbar, a login modal, and a logout that works

## 1. Context

The operator has been testing the deployed mini-app on a phone and asked for three things about
the shell: **"Verify with World ID" should be "Login with World ID"**, it should live in **a
modal that can be triggered from anywhere**, there should be **a navbar carrying login and
logout**, and **a logged-in worker should stay logged in**.

Underneath that request is a bug worth stating first, because it is the only part of this task
that is broken rather than missing:

**Logout does not log anyone out.** `apps/miniapp/lib/session.ts:211` — `signOut()` clears the
`localStorage` mirror and publishes an unverified state. It has **zero callers**. And it cannot
work as written: `restoreSession()` (`:188`) probes `GET /me/earnings` and treats a 200 as proof
the session is live, so the surviving `lw_worker` cookie logs the worker straight back in on the
next load. `clearCookie()` exists at `apps/api/src/session.ts:77` with **no call sites**, and
`apps/api/app/session/` holds only `route.ts` and `nonce/`. There is no logout route to call.

The rest is missing rather than wrong, and most of it is a refactor of things that are already
pure:

- **No navbar exists.** A repo-wide grep for `<nav`, `role="nav"`, `navbar` returns nothing.
  Navigation is ad-hoc inline links.
- **No modal primitive exists.** Zero hits for `dialog`, `modal`, `aria-modal`, `showModal`,
  `createPortal`, or any scrim class. It is built from scratch.
- **The auth flow is already a self-contained machine.** `app/(auth)/verify/page.tsx` holds a
  five-step `useState` machine over five pure step components. There is no `useSearchParams`, no
  `usePathname`, no dynamic segment and no server component anywhere in the tree. Exactly three
  `router.replace('/tasks')` calls (lines 127, 256, 280) tie it to a route.

## 2. Exact scope

**Two governing rules.**

**The verified chip stays above the fold.** Root `AGENTS.md` under "Honesty" makes it a product
rule, and `tests/verifiedChipAboveFold.test.tsx` asserts the banner precedes `<main>` in DOM
order. A navbar that pushes it down fails the review even if every test passes.

**Everything visual is a class in `globals.css`.** `tests/design/noInlineStyles.test.ts` fails
any `style={{}}` containing `color|fontFamily|fontSize|fontWeight|background|backgroundColor|
border|borderColor|borderRadius|letterSpacing`, with a two-file allowlist that may not grow.
`tests/design/globals.test.ts` additionally requires a `:focus-visible` rule using
`var(--verified-600)`, a `prefers-reduced-motion: reduce` block, and that the word `red` appears
nowhere in the file — including in comments.

---

1. **`components/ui/Modal.tsx` — new, hand-built.** A div-based overlay: a scrim, a panel, a
   close control, focus moved into the panel on open and returned on close, `Escape` closes,
   and the background does not scroll. **Not `<dialog>`** — jsdom 26 does not implement
   `showModal()` and the suite would be untestable. The scrim must sit above `.lw-header`
   (`z-index: 10`, `globals.css:80`) and above the `z-index: 9` at `globals.css:722`. The close
   control carries `data-hit="44"`.
2. **Extract `<AuthFlow onDone={…} />`** from `app/(auth)/verify/page.tsx` into
   `app/(auth)/AuthFlow.tsx`. Move the state machine verbatim; replace the three
   `router.replace('/tasks')` calls with `onDone()`. `Landing`, `VerifyStep`, `SignInStep`,
   `PayoutKeyStep` and `RegisterStep` are already pure props and do not change.
3. **`app/(auth)/verify/page.tsx` becomes a thin wrapper** — `<AuthFlow onDone={() =>
   router.replace('/tasks')} />`. `/verify` keeps working; it is in histories and in
   `tests/verifyRoute.test.tsx`.
4. **`components/SiteNav.tsx` — new**, rendered from `layout.tsx` inside `.lw-header`. It
   carries the app's links plus one auth control: **Login** when unverified (opens the modal
   hosting `AuthFlow`), **Logout** when verified. Every link and button gets `data-hit="44"`,
   and nothing tappable nests inside anything else tappable (`README.md:209`). `.lw-header` is
   a two-row grid whose comment says it stays "one flat list of children" — extend the grid
   deliberately rather than nesting a flex row inside it.
5. **The rename.** `Landing.tsx:15` `VERIFY_BUTTON` and `UnverifiedBanner.tsx:21` `VERIFY_CTA`
   both become **`Login with World ID`**. Three tests hardcode the old string rather than
   importing the constant and must be updated: `tests/verifyRoute.test.tsx:34`,
   `tests/authFlow.test.tsx:53`, `tests/optional/unverifiedBanner.test.tsx:56`.
   **`VERIFY_HEADING = 'Verify to claim'` does not change** — it is the header chip's unverified
   state and the disabled per-row button, and both are about *claiming*, not signing in.
6. **The CTA becomes a modal trigger.** `UnverifiedBanner`'s CTA is an `<a href="/verify">`
   today; it becomes a `<button>` that opens the modal. Two tests assert the opposite and change
   with it: `tests/tasks/root.test.tsx:36,41` (a link whose href is `/verify`, and no button
   with that name) and `tests/verifyRoute.test.tsx:34-35`. Keep the existing single-44px-target
   shape — the comment at `UnverifiedBanner.tsx:49` explains why a `Button` inside a link was
   avoided; a bare `<button>` with the `lw-button` classes is the same trade.
7. **`POST /session/logout` — new, `apps/api/app/session/logout/route.ts`.** Requires a worker
   session, deletes the `sessions` row, and returns the cookie-clearing header from the existing
   `clearCookie()` (`apps/api/src/session.ts:77`, currently uncalled). Add it to
   `packages/shared/src/api-contract.ts`… **no** — see §3: the contract is out of scope, so
   raise `INTERFACE REQUEST:` with the route shape and stop. The lead adds it and the route
   lands in round 2.
8. **`signOut()` calls it.** `lib/session.ts:211` becomes async: `POST /session/logout`, then
   `clearMirror()`, then publish unverified. A failed request still clears locally — a worker
   who taps Logout must never be left looking logged in — but the failure is surfaced, not
   swallowed.
9. **Stay logged in.** `WORKER_TTL_S = 12 * 60 * 60` (`apps/api/src/session.ts`) with no sliding
   refresh, so a daily user re-authenticates daily. Raise it to **30 days** and re-issue the
   cookie on a successful `restoreSession()` probe so an active worker is never logged out
   mid-errand. The cookie is already `HttpOnly; Max-Age; SameSite=None; Secure` in production.
10. **Remove the first-paint flash.** `getSnapshot()` returns `SERVER_SNAPSHOT` until the
    network probe settles, so a verified worker sees `mini app` and `Verify to claim` for one
    round trip — even though the `localStorage` mirror exists, in its own words, "so the header
    can render the right chip on the first paint". Read the mirror synchronously into the
    initial client snapshot; keep `ready` false until the probe confirms, so nothing redirects
    on a stale mirror.

## 3. Out of scope

- **The task list and everything on it** — search, filters, the map, directions, showing all
  tasks. That is T-56, which depends on this task and owns `app/tasks/**` and
  `components/TaskCard.tsx`.
- **`packages/shared/**`.** The API contract is frozen; `POST /session/logout` needs a line in
  `api-contract.ts` and that is an `INTERFACE REQUEST:` (§7 item 7), not an edit.
- The credential level, the chip copy, `credentialLabel`, `verifiedBannerSub` — T-54's, merged.
- The registration flow's behaviour: which address is registered, the area binding, the payout
  key. T-53's, merged. You are moving where the flow renders, not what it does.
- Do not touch: `apps/miniapp/app/tasks/**`, `apps/miniapp/components/TaskCard.tsx`,
  `apps/miniapp/next.config.ts`, `apps/miniapp/package.json`, `packages/**`, `contracts/**`,
  `apps/dashboard/**`.

## 4. Owned paths

```
apps/miniapp/app/layout.tsx
apps/miniapp/app/globals.css
apps/miniapp/app/(auth)/**
apps/miniapp/components/**
apps/miniapp/lib/session.ts
apps/miniapp/tests/**
apps/miniapp/README.md
apps/api/app/session/**
apps/api/src/session.ts
apps/api/test/**
!apps/miniapp/components/TaskCard.tsx
```

`app/layout.tsx`, `app/globals.css`, `components/ui/*` and `components/VerifiedState.tsx` are on
the freeze list at `apps/miniapp/README.md:140`. This brief **unfreezes exactly those four for
this task**; update that README section to say what changed and what stays frozen.

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| `useSession`, `useSessionReady`, `setSessionState`, `signOut` | `apps/miniapp/lib/session.ts` | module store over `useSyncExternalStore`; no provider, so any component may read it |
| `clearCookie()` | `apps/api/src/session.ts:77` | already written, never called — the logout route's body |
| `requireWorkerSession(req)` | `apps/api/src/session.ts:215` | the logout route's auth |
| the five step components | `apps/miniapp/app/(auth)/` | pure props already; they do not change |
| `.lw-header` grid, `[data-hit='44']`, `lw-button*` | `apps/miniapp/app/globals.css` | the chrome the navbar extends |

## 6. Interfaces produced

| Interface | Where | Consumers |
|---|---|---|
| `<Modal>` | `apps/miniapp/components/ui/Modal.tsx` | the login modal; T-56 may reuse it |
| `<AuthFlow onDone>` | `apps/miniapp/app/(auth)/AuthFlow.tsx` | `/verify` and the modal |
| `<SiteNav>` | `apps/miniapp/components/SiteNav.tsx` | `layout.tsx` |
| `POST /session/logout` | `apps/api/app/session/logout/route.ts` | `signOut()` |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-55` — must print `CLAIMED`. Exit 1 means another
agent holds it: stop. Finish with `gh pr ready`, never `gh pr create`.

1. Read `app/layout.tsx`, `lib/session.ts`, `app/(auth)/verify/page.tsx`,
   `components/UnverifiedBanner.tsx` and `tests/verifiedChipAboveFold.test.tsx` end to end. Run
   the mini-app suite and record the count (68 at the time of writing).
2. **Prove the logout bug first.** Write `logoutSurvivesAReload` (§8) against today's
   `signOut()` and watch it **fail** — the mirror clears, the probe still returns 200, the
   worker is logged back in. Do not fix anything until you have seen it red.
3. Raise the `INTERFACE REQUEST:` for `POST /session/logout` in the PR body immediately, so the
   lead can answer while you work on the rest.
4. `Modal.tsx` and its `globals.css` classes. Then `AuthFlow` extraction, then `/verify` as a
   wrapper — re-run the suite after each; the flow's behaviour must not change.
5. `SiteNav` and `layout.tsx`. Update `tests/verifiedChipAboveFold.test.tsx`'s hand-built header
   in the same commit, or it silently stops testing the real one.
6. The rename, the CTA-to-button change and their three tests. Then the session work (items
   8–10), then the README.
7. Run §9 in full, paste into the PR, `gh pr ready`.

## 8. Acceptance tests

| Test / command | Asserts |
|---|---|
| `logoutSurvivesAReload` (`tests/session.test.tsx`) | after `signOut()`, a fresh `restoreSession()` does **not** return a verified state; `POST /session/logout` was called; watched red before the fix |
| `logoutClearsTheCookieServerSide` (`apps/api/test/routes/session.test.ts`) | `POST /session/logout` with a valid session returns a cookie-clearing `Set-Cookie` and removes the `sessions` row; without a session it is 401 |
| `loginModalOpensFromTheBoard` (`tests/tasks/`) | the unverified board's CTA is a `<button>` reading `Login with World ID` with `data-hit="44"`; clicking it renders the auth flow's first step inside the modal, and the URL does not change |
| `loginModalTrapsFocusAndClosesOnEscape` (`tests/design/modal.test.tsx`) | focus moves into the panel on open and returns to the trigger on close; `Escape` closes; the scrim is not a `<dialog>` |
| `verifyRouteStillRendersTheFlow` (`tests/verifyRoute.test.tsx`) | `/verify` renders the same first step as the modal — the URL survives |
| `navCarriesLoginWhenOutAndLogoutWhenIn` (`tests/design/nav.test.tsx`) | one `.lw-nav` in the header; `Login with World ID` when unverified and `Logout` when verified, never both; every link and button carries `data-hit="44"` |
| `verifiedChipAboveFold` (existing) | unchanged behaviour with the navbar present — the banner still precedes `<main>`; the test's hand-built header now mirrors `layout.tsx` |
| `verifiedWorkerSeesNoFlashOnFirstPaint` (`tests/session.test.tsx`) | with a populated mirror, the first client snapshot is already verified; `ready` stays false until the probe settles |
| `sessionOutlastsTwelveHours` (`apps/api/test/routes/session.test.ts`) | the issued cookie's `Max-Age` is the new TTL, and a successful probe re-issues it |
| `noInlineStyles`, `globals.test.ts`, `hitTargetsMarked` (existing) | green — the modal, the scrim and the nav are all classes, the focus ring and reduced-motion blocks survive, and no `red` enters `globals.css` |
| every existing test file | green; the mini-app suite does not lose a test |

## 9. Verification commands

```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/miniapp typecheck && pnpm --filter @legwork/miniapp lint
pnpm --filter @legwork/miniapp test && pnpm --filter @legwork/miniapp build
pnpm --filter @legwork/api typecheck && pnpm --filter @legwork/api test
bash scripts/ci/banned-words.sh
# the old CTA string must be gone from every rendered surface
grep -rn "Verify with World ID" apps/miniapp/app apps/miniapp/components || echo 'renamed: good'
```

Expected: everything clean; the suite at least 68 passing with every §8 name present; the grep
prints the `renamed` line.

## 10. Hard rules

- Banned words: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee
  **0.45**.
- **The verified chip is always above the fold.** A navbar may not push it below `<main>`.
- **A logout that leaves a usable cookie is not a logout.** The server clears it or the feature
  is not done.
- The payout key never leaves the device; `payoutKeyNeverLeavesTheDevice` stays green.
- Paper ground only, `lw-*` classes, every colour a token. No new dependency — `AGENTS.md`:
  *"Dependencies are pre-declared in the pnpm catalog. Never add one."* A modal, a focus trap
  and a nav are hand-written here.
- No icon font, no emoji, no filled icon sets: Unicode `✓ · ↗ ●` only.
- Phone floors: 16 px body, `data-floor="20"` on narrated copy, hit targets ≥ 44 px, and nothing
  tappable nested inside anything else tappable.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `e2e-dashboard`, `banned-words`,
      `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`, `claim`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `apps/miniapp/README.md`'s freeze section says what this task unfroze and what stays.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-55 — Navbar, login modal, real logout
owned-paths:
  - apps/miniapp/app/layout.tsx
  - apps/miniapp/app/globals.css
  - apps/miniapp/app/(auth)/**
  - apps/miniapp/components/**
  - apps/miniapp/lib/session.ts
  - apps/miniapp/tests/**
  - apps/miniapp/README.md
  - apps/api/app/session/**
  - apps/api/src/session.ts
  - apps/api/test/**
  - !apps/miniapp/components/TaskCard.tsx
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need>` and stop. `packages/shared` is frozen: the
`POST /session/logout` contract line is an `INTERFACE REQUEST:` — raise it in step 3 and keep
working, do not edit `api-contract.ts`. A modal that cannot be built without a dependency is a
`DEP REQUEST:` naming the package and why a hand-written one will not do; note that
`fastest-levenshtein` is already in the catalog if fuzzy matching ever comes up, but nothing
here needs it.

## 14. Reviewer notes

Read the logout test first and check it was red: `git log -p` should show
`logoutSurvivesAReload` failing before `signOut()` learned to call the route. A green suite that
was never red is how three bugs reached production in this repo already.

Then open `tests/verifiedChipAboveFold.test.tsx` beside `app/layout.tsx` and confirm the
hand-built header matches the real one — that test passes whether or not it reflects reality,
which makes it the easiest thing here to leave quietly wrong. Check the modal is not `<dialog>`,
that `Escape` and focus return are tested rather than assumed, and that `globals.css` gained no
inline-style escape hatches. Finally, on a phone: log in, reload, still logged in; log out,
reload, **still logged out**.

## 15. Round 2+

_(empty on first dispatch)_
