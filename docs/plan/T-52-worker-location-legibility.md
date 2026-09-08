---
id: T-52
title: The worker can get back in, and the board says where they are
lane: D
day: 5                               # added Sept 8 from the operator's first phone run on the deployed mini-app
size: M                              # two PRs: the sign-in lockout, then the board's location legibility
agent_class: C
must: true
depends_on: []
owned_paths:
  - apps/miniapp/app/(auth)/**
  - apps/miniapp/app/tasks/**
  - apps/miniapp/components/**
  - apps/miniapp/lib/**
  - apps/miniapp/tests/**
  - apps/miniapp/README.md
  - apps/api/app/tasks/[id]/claim/route.ts
  - apps/api/src/services/lifecycle.ts
  - apps/api/test/**
  - packages/shared/src/constants.ts
labels: [area:miniapp, wave:5, size:M, agent:cloud]
branch: t-52/worker-location-legibility
---

# T-52 — The worker can get back in, and the board says where they are

## 1. Context

The operator ran the deployed mini-app on a phone for the first time on 2026-09-08 and could
not get past the front door, then could not see a single task. Both are ours. Verbatim:

> I was trying to test it at my home but I could not register the worker
>
> But I haven't seen any task... The UX is not ideal. I should be able to see a list of
> available tasks and see how close I am from them. It should only allow me to claim tasks if
> I'm at the location of the task tho.. Error messages and the UI should be clear about that

Neither is a missing feature so much as a missing sentence. The registration **succeeded** —
the registry holds worker `0xaeD0C1102e45B7F528224eaCB9309a0925015810`, `isSeeded: false`,
`taskTypes: 15`, `areaOf: "ez1dp"` — and the phone still holds the matching payout key. The
board was empty because the only open task, #27, is in `ez1dn` and that worker is in `ez1dp`.
Every one of those facts was true and none of them was on screen.

This is the same failure shape as the two bugs before it: **the API is right, the mini-app has
no path to it, and a test asserts the screen rather than the outcome.**

## 2. Exact scope

**One governing rule.** Every message this task adds names the thing the worker can act on —
their area, their distance, the fence, the window. "Something went wrong" is never the copy.

---

### PR 1/2 — a returning worker can get back in

**The lockout.** `POST /idkit/verify` correctly answers `409 nullifier_already_registered` for
a World ID that already has a worker account. `app/(auth)/page.tsx:131-141` catches it, sets
`conflict`, loads the local payout key and drops to `step: 'payout-key'` with
`status: 'unverified'`. From there the only forward action is `onContinue={register}`
(`page.tsx:247`), and `register()` calls `POST /register`, which needs the idkit-session cookie
that the 409 never issued. `RESTORE` only swaps which key sits in `localStorage`
(`onImported={setPayoutAddress}`); it creates no session. The single path to `/tasks` is a
worker-session cookie that already exists (`page.tsx:105-108`). When that lapses, the account
is unreachable from the UI — **on camera, if the filmed worker closes the app.**

**The API already supports the way back.** `POST /session` in `walletAuth` mode verifies a
MiniKit signature and a nonce and needs no idkit cookie
(`apps/api/app/session/route.ts:85-87`); only `idkit` mode calls `requireIdkitSession`
(`:93`). The mini-app never offers it outside `register()`.

1. **`app/(auth)/page.tsx` — a sign-in path from the conflict state.** When the 409 arrives,
   the held payout key is very often already the right one. Add `signInExisting()`:
   - Inside World App (`miniKitInstalled()`): `createWalletAuthSession()`. No World ID
     re-verification, no registration — the signature is the proof.
   - Outside it: `createIdkitSession(payoutAddress)`. If that is refused because the address is
     not the bound one, the copy says exactly that (below) and the import field stays open.
   - On success set `registered: true` and `router.replace('/tasks')`, the same as `register()`.
2. **The conflict screen states the situation and offers two buttons, in this order.** Replace
   the single `REGISTER AS A WORKER` with `SIGN IN WITH THIS KEY` (primary, calls
   `signInExisting`) and the existing import field plus `RESTORE` beneath it. `REGISTER AS A
   WORKER` does not render in the conflict state at all — it cannot succeed there, and a button
   that always fails is worse than no button.
3. **Copy.** `CONFLICT_MESSAGE` becomes:
   `This World ID already has a worker account. If this phone still holds its payout key, sign
   in. Otherwise paste the key you exported.` The address already on screen gets the label
   `this phone holds` above it. When `signInExisting()` is refused for a mismatched address:
   `That account is bound to a different payout address. Paste the key you exported when you
   registered — Legwork cannot recover it for you.`
4. **`tests/authFlow.test.tsx`.** `nullifierConflictOffersRestore` currently asserts only that
   the message and the textarea render — it never follows the path to an outcome, which is why
   this shipped. Keep it, and add `nullifierConflictSignsInWithTheHeldKey`: on a 409, tapping
   `SIGN IN WITH THIS KEY` calls `POST /session` (walletAuth inside World App, idkit outside),
   never `POST /register`, and lands on `/tasks`. Add
   `nullifierConflictExplainsAMismatchedKey` for the refusal branch. **The msw handler must
   answer `/session` from the registry state, not with a canned success** — a mock that says yes
   whatever it is asked is what hid the last two bugs.

---

### PR 2/2 — the board says where the worker is and what they may claim

**What already works, and must not be rebuilt.** `GET /tasks/list?area=&lat=&lon=` returns
`distance_m` and sorts nearest-first (`apps/api/app/tasks/list/route.ts:91-100`).
`components/TaskCard.tsx:99-102` already formats it (`~350 m`, `~1.2 km`) and renders it at
`:172` and `:191`. The plumbing is there; it is dark because of the two gaps below.

5. **The distance is usually absent, silently.** `tasksPath()` (`app/tasks/TaskList.tsx:56-66`)
   sends `lat`/`lon` only when `lastKnownPosition()` already holds a fix, and that is module
   state that "dies with the tab" (`lib/area.ts:22-26`). On a cold open nothing has called
   `resolveArea()` yet, so no fix exists, so no coordinates are sent, so every card shows `—`
   from `formatDistance(undefined)`. Fix: `TaskList` awaits `resolveArea()` once on mount
   before its first poll, and re-tries the fix on a pull-to-refresh. When there is still no fix,
   the cards say `distance unavailable` rather than `—`, and the header carries the existing
   honesty chip `GPS unavailable in webview — disclosed`.
6. **The empty state must name the area.** `EMPTY_STATE` (`TaskList.tsx:21`) is
   `'No open tasks near you right now — the list refreshes every 3 s.'` — which is what the
   operator read while a task sat open one cell away. Replace with copy that renders the facts:
   the worker's registered area, that the board only shows that cell, and the refresh interval.
   `No open tasks in <area> right now. This board shows the cell you registered in; tasks
   posted elsewhere will not appear here. The list refreshes every 3 s.` Beneath it, when the
   current fix is in a different cell from the registered one, add the line
   `Your phone is in <fixArea>, and your account is registered in <area>.` — the exact
   situation that produced this feedback, and today it is invisible.
7. **Registration binds the area silently, and the default is wrong for a traveller.**
   `lib/area.ts:13` is `DEFAULT_AREA = 'ez1dp'`, returned whenever the phone gives no fix — so a
   worker who denies location, or whose webview swallows the prompt, is bound to a cell they may
   never have been in, permanently, with nothing on screen. In the payout-key step, before
   `REGISTER AS A WORKER`, render the resolved area and where it came from:
   `You will be registered in <area>` plus either `from this phone's location` or
   `default — this phone gave no location fix`, and in the second case a `USE MY LOCATION`
   button that retries `resolveArea()`. This does not change the API; it makes the binding a
   decision instead of an accident.
8. **Claim states the distance, the radius and the fence.** Add
   `CLAIM_RADIUS_M = 2000` to `packages/shared/src/constants.ts` beside `GEOFENCE_M`, with the
   comment explaining the two numbers are different on purpose. Claiming shows a confirmation
   naming all three facts: `<place> is ~<distance> away. You have 30 minutes to get there, and
   your proof photo must be taken within 150 m of it.` Beyond `CLAIM_RADIUS_M` the claim button
   is **disabled and says why** — `Too far to claim — you are ~<distance> away, and a claim
   must start within 2 km` — never hidden, because a hidden control teaches nothing.
9. **The API refuses the same claim, for the same reason.** `apps/api/app/tasks/[id]/claim/route.ts`
   accepts optional `lat`/`lon`; when both are present and the place is further than
   `CLAIM_RADIUS_M`, refuse with `422 {error:'too_far_to_claim', distance_m, radius_m}`. When
   they are absent the claim proceeds — a worker with no fix is not punished for it, and the
   150 m proof fence still applies at submit. Reuse the distance helper the proof checks
   already use (`apps/api/src/services/proofChecks.ts`); do not write a second haversine.
10. **The submit fence gets a warning before, not only a refusal after.** The proof step already
    refuses a capture outside `GEOFENCE_M` (`proofChecks.ts:116`,
    `app/tasks/[id]/submit/route.ts:315`). Before the camera opens, when a fix exists and is
    outside the fence, show `You are ~<distance> from <place>. A proof taken here will be
    refused — the photo must be within 150 m.` The refusal copy after the fact keeps its exact
    wording.

**Ruling, and the operator may overturn it in one line.** The feedback says claiming should be
allowed *only at the location*. Taken literally that breaks the product: `DEFAULT_CLAIM_TTL_S`
is 1800 seconds precisely so a worker can **travel** after claiming, and the filmed demo is a
worker walking to Pão Doce after the hire lands. So "at the location" is implemented as a 2 km
**claim radius** — close enough that the errand is a walk, wide enough that the 30-minute
window still means something — with the 150 m proof fence unchanged and both numbers stated on
screen at the moment they matter. If the operator wants a hard on-site claim instead, it is
`CLAIM_RADIUS_M` and the copy in items 8 and 9, nothing else.

## 3. Out of scope

- **The dashboard.** `apps/dashboard/**` and `apps/miniapp/app/about/page.tsx` belong to T-51,
  which is in flight. Touching either collides with its owned paths.
- The registration contract: no change to `POST /register`, `POST /idkit/verify`, the registry
  or the nullifier binding. A worker bound to the wrong cell is cleared with
  `POST /admin/reset-worker`, which is the operator's tool and stays that way.
- The proof pipeline, the geofence value (150 m), photo hashing, the sweeper, earnings.
- `app/layout.tsx` — frozen since T-05 (`apps/miniapp/README.md:87`). The header chip in item 5
  is rendered by the task page, not the layout.
- Do not touch: `apps/dashboard/**`, `apps/miniapp/app/about/page.tsx`,
  `apps/miniapp/app/support/page.tsx`, `apps/miniapp/next.config.ts`,
  `apps/miniapp/package.json`, `contracts/**`, `subgraph/**`.

## 4. Owned paths

```
apps/miniapp/app/(auth)/**
apps/miniapp/app/tasks/**
apps/miniapp/components/**
apps/miniapp/lib/**
apps/miniapp/tests/**
apps/miniapp/README.md
apps/api/app/tasks/[id]/claim/route.ts
apps/api/src/services/lifecycle.ts
apps/api/test/**
packages/shared/src/constants.ts
!apps/miniapp/app/about/page.tsx
!apps/miniapp/app/support/page.tsx
```

`packages/shared/src/constants.ts` is a frozen interface file: label both PRs
**`interface-change`** so `path-ownership` and `claim` skip, and say in the PR body that the
only addition is `CLAIM_RADIUS_M`.

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| `POST /session` | `apps/api/app/session/route.ts:85-93` | `walletAuth` needs a MiniKit signature only; `idkit` needs the idkit-session cookie |
| `GET /tasks/list?area=&lat=&lon=` | `apps/api/app/tasks/list/route.ts` | returns `distance_m`, sorted nearest-first when a fix is sent |
| `resolveArea()`, `lastKnownPosition()`, `DEFAULT_AREA` | `apps/miniapp/lib/area.ts` | the geohash-5 cell and the last fix; module state, dies with the tab |
| `formatDistance()`, `TaskCard` | `apps/miniapp/components/TaskCard.tsx:99-102` | `~350 m` / `~1.2 km`; `—` for `undefined` |
| `GEOFENCE_M`, `DEFAULT_CLAIM_TTL_S` | `@legwork/shared` | 150 m proof fence, 1800 s claim window |
| `distanceM()` | `apps/api/src/services/proofChecks.ts` | the one distance helper; do not write a second |

## 6. Interfaces produced

| Interface | Where | Consumers |
|---|---|---|
| `CLAIM_RADIUS_M = 2000` | `packages/shared/src/constants.ts` | the claim route and the claim button |
| `422 {error:'too_far_to_claim', distance_m, radius_m}` | `apps/api/app/tasks/[id]/claim/route.ts` | the mini-app's claim error copy |
| `signInExisting()` | `apps/miniapp/app/(auth)/page.tsx` | the conflict screen |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-52` — must print `CLAIMED`. Exit 1 means another
agent holds it: stop. Finish with `gh pr ready`, never `gh pr create`.

1. Read `app/(auth)/page.tsx`, `app/tasks/TaskList.tsx`, `lib/area.ts`,
   `components/TaskCard.tsx` and `apps/api/app/tasks/list/route.ts` end to end. Run
   `pnpm --filter @legwork/miniapp test` and record the passing count (47 at the time of
   writing).
2. **PR 1/2.** Items 1–4. Write `nullifierConflictSignsInWithTheHeldKey` **before** the fix and
   watch it fail — a test that has never been red proves nothing. Then make it pass.
3. **PR 2/2.** Items 5–7 first (they are pure mini-app), then 8–10 (which cross into the API).
   Add `CLAIM_RADIUS_M` before the route that reads it.
4. Re-run §9 in full, paste the output into each PR, `gh pr ready`.

## 8. Acceptance tests

| Test / command | Asserts |
|---|---|
| `nullifierConflictSignsInWithTheHeldKey` (`tests/authFlow.test.tsx`) | on a 409, `SIGN IN WITH THIS KEY` calls `POST /session` and never `POST /register`, and the flow lands on `/tasks`; asserted in both walletAuth and idkit modes |
| `nullifierConflictExplainsAMismatchedKey` (`tests/authFlow.test.tsx`) | when `/session` refuses the held address, the mismatch sentence renders and the import field stays open |
| `conflictScreenNeverOffersRegister` (`tests/authFlow.test.tsx`) | `REGISTER AS A WORKER` is absent while `conflict` is true |
| `coldOpenSendsAFixSoDistanceRenders` (`tests/tasks/distance.test.tsx`) | on mount with a fix available, the first `/tasks/list` request carries `lat` and `lon`, and a card renders `~350 m` rather than `—` |
| `noFixSaysSoRatherThanADash` (`tests/tasks/distance.test.tsx`) | with `getCurrentPosition` failing, cards read `distance unavailable` and the GPS honesty chip renders |
| `emptyStateNamesTheAreaAndTheMismatch` (`tests/tasks/emptyAndExpiry.test.tsx`) | the empty board names the registered cell; when the fix is in another cell, the second sentence names both |
| `registerStepShowsTheAreaAndItsSource` (`tests/authFlow.test.tsx`) | before registering, the resolved area renders with `from this phone's location` or `default — this phone gave no location fix`, and the default case offers `USE MY LOCATION` |
| `claimStatesDistanceWindowAndFence` (`tests/tasks/claim.test.tsx`) | the confirmation names the distance, the 30-minute window and the 150 m fence |
| `claimBlockedBeyondTheRadiusSaysWhy` (`tests/tasks/claim.test.tsx`) | beyond `CLAIM_RADIUS_M` the button is disabled and the reason names the distance and the radius; the button is present, not hidden |
| `claimRouteRefusesBeyondTheRadius` (`apps/api/test/routes/claim.test.ts`) | `lat`/`lon` outside `CLAIM_RADIUS_M` → `422 too_far_to_claim` with `distance_m` and `radius_m`; absent coordinates still claim |
| `submitWarnsBeforeTheCameraWhenOutsideTheFence` (`tests/proof/proofFlow.test.tsx`) | outside 150 m the warning renders before the capture control; the post-hoc refusal copy is unchanged |
| every existing test file | green; `nullifierConflictOffersRestore` kept |

## 9. Verification commands

```bash
# run before opening each PR; paste the output into the PR body
pnpm --filter @legwork/miniapp typecheck && pnpm --filter @legwork/miniapp lint
pnpm --filter @legwork/miniapp test
pnpm --filter @legwork/miniapp build
pnpm --filter @legwork/api typecheck && pnpm --filter @legwork/api test   # PR 2/2
pnpm --filter @legwork/shared typecheck && pnpm --filter @legwork/shared test
bash scripts/ci/banned-words.sh
# the empty state must not still be the old sentence
grep -rn 'No open tasks near you right now' apps/miniapp || echo 'old empty state gone: good'
```

Expected: typecheck, lint and build clean; the mini-app suite at least 47 passing with every
§8 name present; `banned-words: clean`; the grep prints the `old empty state gone` line.

## 10. Hard rules

- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`,
  `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee
  **0.45**. No deducted figure anywhere.
- **Never a coordinate on a public surface.** Public surfaces carry a 5-character geohash or a
  coordinate rounded to 3 decimals (`PUBLIC_COORD_DECIMALS`); the exact fix stays on the phone.
  A distance in metres is fine; the position that produced it is not.
- No secrets in code or bundles. The payout key never leaves `localStorage` and never enters a
  URL, a header or a body — `payoutKeyNeverLeavesTheDevice` in `tests/authFlow.test.tsx` already
  asserts this and must stay green.
- Paper ground only (`lw-*`, the mini-app tokens). No dashboard token, no new dependency, no
  icon font, no emoji: Unicode `✓ · ↗ ●` only.
- Phone floors: 16 px body, `data-floor="20"` on anything narrated, hit targets ≥ 44 px
  (`data-hit="44"`).
- Tests never call a live model or a live chain, and no msw handler answers a request with a
  canned success that ignores the state it is asked about.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `e2e-dashboard`, `banned-words`,
      `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into each PR.
- [ ] `apps/miniapp/README.md` documents the sign-in path, the area binding and the two radii.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-52 — Worker sign-in and location legibility (PR <1|2>/2)
owned-paths:
  - apps/miniapp/app/(auth)/**
  - apps/miniapp/app/tasks/**
  - apps/miniapp/components/**
  - apps/miniapp/lib/**
  - apps/miniapp/tests/**
  - apps/miniapp/README.md
  - apps/api/app/tasks/[id]/claim/route.ts
  - apps/api/src/services/lifecycle.ts
  - apps/api/test/**
  - packages/shared/src/constants.ts
  - !apps/miniapp/app/about/page.tsx
  - !apps/miniapp/app/support/page.tsx
Scope confirmed: every §2 bullet for this PR done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need>` on the PR (or the issue), stop, and do not work
around it. Interfaces in `packages/shared`, `contracts/src/interfaces`,
`subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: `CLAIM_RADIUS_M` is the
one addition this brief pre-approves — anything further is an `INTERFACE REQUEST:`.
Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

A claim gate that cannot be built without changing `POST /register` or the registry is a
`BLOCKED:`, not a widening — the area binding is deliberate and the operator has
`/admin/reset-worker` for the cases it gets wrong.

## 14. Reviewer notes

Open `tests/authFlow.test.tsx` first and check the new msw handler answers `/session` from the
registry state rather than a canned success — that single habit hid the `check_task` amount bug,
the session-ordering bug and this one. The three most likely faults are a `signInExisting()`
that still calls `POST /register` somewhere on the path, a distance that renders `—` on a cold
open because `resolveArea()` was awaited after the first poll rather than before it, and a claim
gate enforced only in the client. Confirm `payoutKeyNeverLeavesTheDevice` is untouched and
green. Then read the copy aloud: every new sentence should name an area, a distance, a window or
a fence — if one says only that something failed, it is not done.

## 15. Round 2+

_(empty on first dispatch)_
