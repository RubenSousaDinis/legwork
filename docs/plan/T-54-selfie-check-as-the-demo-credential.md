---
id: T-54
title: Selfie Check as the demo credential, with the claims that credential supports
lane: D
day: 5                               # added Sept 8, the evening World granted Sandbox access
size: M
agent_class: C
must: true
depends_on: []
owned_paths:
  - packages/shared/src/constants.ts
  - apps/miniapp/app/(auth)/Landing.tsx
  - apps/miniapp/app/about/page.tsx
  - apps/miniapp/app/support/page.tsx
  - apps/miniapp/components/ui/VerifiedChip.tsx
  - apps/miniapp/tests/**
  - apps/dashboard/app/copy.ts
  - apps/dashboard/app/about/page.tsx
  - apps/dashboard/app/deck/page.tsx
  - apps/dashboard/test/**
  - apps/miniapp/README.md
labels: [area:miniapp, wave:5, size:M, agent:cloud]
branch: t-54/selfie-check-credential
---

# T-54 — Selfie Check as the demo credential

## 1. Context

World granted Sandbox access on the evening of 2026-09-08, by Firebase App Distribution invite
to the `org.world.id.sandbox` Android build, from `murph.finnicum@toolsforhumanity.com` — the
answer to the request the operator sent that morning. The credential the plan was built on is
finally exercisable.

**The operator's decision: the filmed demo uses Selfie Check**, because the World prize track is
Selfie Check and demonstrating the credential itself is stronger than qualifying under the
track's "or a Selfie Check-compatible World ID credential flow" clause. Orb returns afterwards.

The code path already exists and has never been reachable: `pickPreset` sends
`selfieCheckLegacy` at `level === 'selfie'` (`apps/miniapp/lib/worldid.ts:68`), and the whole
switch is two environment values. **This task changes no verification code.**

What it changes is what the product is allowed to say. From `FEEDBACK-WORLD.md` entry E9, which
quotes World's own credential page:

> Selfie Check (Beta) is "a medium-assurance biometric credential using the device camera for
> liveness and facial similarity" and explicitly does not guarantee "strict one-person-one-account
> uniqueness like Orb verification".

Six surfaces currently claim uniqueness. Under Selfie Check every one of them is false:

| Surface | Today |
|---|---|
| `apps/miniapp/components/ui/VerifiedChip.tsx:45` | `· World ID · one account per person` |
| `apps/miniapp/app/(auth)/Landing.tsx:13` | `about 30 seconds · one account per person` |
| `apps/miniapp/app/about/page.tsx:13` | `One verified human per account, checked with World ID.` |
| `apps/dashboard/app/copy.ts` `CLAIM` | `every worker is one verified human` |
| `apps/dashboard/app/copy.ts` `TRUST_MODEL` | `a live, unique person` |
| `apps/miniapp/app/about|support` | the same trust-model sentence |

**The governing idea, and the reason this is safe:** the claim **follows the credential**. Every
sentence above becomes a function of `CredentialLevel`, so setting the level back to `orb`
restores the stronger wording with no code change and no second review. Removing Selfie Check
afterwards is one environment value in each project, exactly as adding it is.

## 2. Exact scope

**Nothing here hard-codes `selfie`.** Every string this task touches is selected by
`CredentialLevel`. A grep for a literal `'selfie'` outside `@legwork/shared` should find only
type unions and test fixtures.

1. **`packages/shared/src/constants.ts` — the claims, beside `credentialLabel`.** Add, with a
   comment carrying World's own sentence so nobody has to look it up:

   - `uniquenessClause(level)` — `orb` → `one account per person`; `selfie` →
     `a live person, camera-checked`.
   - `verifiedBannerSub(level)` — `orb` → `· World ID · one account per person`; `selfie` →
     `· World ID · a live person, camera-checked`.
   - `claimSentence(level)` — the locked CLAIM with its fourth clause swapped: `orb` keeps
     `every worker is one verified human`; `selfie` reads `every worker is a camera-checked live
     human`. Every other word identical.
   - `trustModelSentence(level)` — the locked TRUST_MODEL with its opening swapped: `orb` keeps
     `a live, unique person`; `selfie` reads `a live person`. The rest — escrow bounds, daily
     cap, cost floor, bounded attributable work — is unchanged at both levels, because none of
     it depends on the credential.

   `TRUST_MODEL_CLOSER` (`Bot-proof, not fraud-proof.`) is already true at both levels and does
   not move.

2. **`apps/dashboard/app/copy.ts`** — `CLAIM` and `TRUST_MODEL` become the two functions above,
   read at the credential level the server resolved. Keep the file's existing header comment and
   add one line: these are locked in wording and selected by credential, never edited per page.

3. **The mini-app surfaces.** `VerifiedChip.tsx:45` renders `verifiedBannerSub(level)` in the
   existing `.lw-verified-line__sub` span — **one text node, unchanged classes and
   `data-floor="20"`**, because `verifiedChipAboveFold` reads it with `getNodeText` and a split
   across spans breaks it. `Landing.tsx:13`'s `VERIFY_CAPTION` becomes
   `` `about 30 seconds · ${uniquenessClause(level)}` ``. `about/page.tsx:13`'s first FACTS entry
   becomes `orb` → unchanged; `selfie` → `A live human behind every account, camera-checked with
   World ID.` The trust-model paragraph on `about` and `support` renders
   `trustModelSentence(level)`.

4. **The dashboard surfaces.** `/about` and `/deck` board 4 render `claimSentence(level)` and
   `trustModelSentence(level)` from `copy.ts`. No other board changes: board 5's "one nullifier =
   one worker account" line is a statement about `WorkerRegistry`, which is true at every
   credential level, and board 7's headline is about RentAHuman's signup count, not ours.

5. **Tests that pin the old strings.** `verifiedChipAboveFold` pins `BANNER`; make it
   level-aware and assert both levels. The dashboard's `lockedCopyIsVerbatim` likewise. Add the
   two new tests in §8. **No test may assert a literal `one account per person` without naming
   the level it belongs to** — that is the assertion this task exists to make conditional.

6. **`apps/miniapp/README.md`** — a short section: which credential the deployment is on, which
   sentences follow it, and that reverting is `WORLD_CREDENTIAL_LEVEL` plus
   `NEXT_PUBLIC_WORLD_CREDENTIAL_LEVEL` and a redeploy, nothing else.

### What this task does **not** do, and who does it

- **The environment flip is the operator's**, and it happens **after** a Selfie Check
  verification has succeeded end to end against the Sandbox build — not before. Merging this PR
  changes nothing on the deployed site: at `orb` every string is what it is today, byte for byte.
  That property is the point, and §8 asserts it.
- The README and `SKILL.md` carry the same claim in prose that no environment reads. They belong
  to T-45 and T-49; the lead updates them when the flip happens.
- `FEEDBACK-WORLD.md` gets the entry recording that access arrived, how, and when. That is
  T-41's file and the lead's to write — it is the resolution of E5 through E8 and the strongest
  ending that document can have.

## 3. Out of scope

- `apps/miniapp/lib/worldid.ts`, `pickPreset`, `presetName`, IDKit, the verify routes, the API,
  the registry. **No verification code changes.** If the Sandbox build needs a code change to
  reach Selfie Check, that is a `BLOCKED:` and a separate task.
- The credential chip itself — `credentialLabel` already renders `World ID · Selfie Check` at
  `selfie` (landed 2026-09-08). Do not touch it.
- `DESIGN-SPEC.md`. Its hard rule 1 names three locked copy blocks and this task makes two of
  them credential-dependent; the lead records that, not you.
- The dashboard beyond `copy.ts`, `/about` and `/deck` board 4 — `apps/dashboard/**` is T-51's,
  and PR #174 is open against it.
- Do not touch: `apps/api/**`, `contracts/**`, `subgraph/**`, `README.md`, `SKILL.md`,
  `DESIGN-SPEC.md`, `FEEDBACK-WORLD.md`, `apps/dashboard/app/Landing.tsx`,
  `apps/dashboard/components/**`.

## 4. Owned paths

```
packages/shared/src/constants.ts
apps/miniapp/app/(auth)/Landing.tsx
apps/miniapp/app/about/page.tsx
apps/miniapp/app/support/page.tsx
apps/miniapp/components/ui/VerifiedChip.tsx
apps/miniapp/tests/**
apps/dashboard/app/copy.ts
apps/dashboard/app/about/page.tsx
apps/dashboard/app/deck/page.tsx
apps/dashboard/test/**
apps/miniapp/README.md
```

`packages/shared/src/constants.ts` is frozen: label the PR **`interface-change`**, which also
skips `path-ownership` and `claim`. Note in the body that the only additions are the four
credential-selected copy functions.

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| `CredentialLevel`, `credentialLabel` | `@legwork/shared` | the level union and the chip string, added 2026-09-08 |
| `CREDENTIAL_LEVEL` | `apps/miniapp/lib/env.ts` | the level the mini-app bundle was built with |
| `WORLD_CREDENTIAL_LEVEL` | dashboard server env | the level the dashboard resolves server-side |
| `pickPreset(level)` | `apps/miniapp/lib/worldid.ts:68` | already sends `selfieCheckLegacy` at `selfie`; unchanged |

## 6. Interfaces produced

| Interface | Where | Consumers |
|---|---|---|
| `uniquenessClause`, `verifiedBannerSub`, `claimSentence`, `trustModelSentence` | `packages/shared/src/constants.ts` | the mini-app banner and landing caption, the dashboard `/about` and `/deck` |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-54` — must print `CLAIMED`. Exit 1 means another
agent holds it: stop. Finish with `gh pr ready`, never `gh pr create`.

1. Read `packages/shared/src/constants.ts` (the `credentialLabel` block at the end),
   `apps/dashboard/app/copy.ts`, and the six surfaces in §1's table. Run both suites and record
   the counts — mini-app 58, dashboard 54 at the time of writing.
2. Write `orbCopyIsByteIdenticalToToday` (§8) **first**, against the current strings, and watch
   it pass. It is the guard for the whole task: every later edit must keep it green.
3. Add the four functions in `@legwork/shared`, then repoint the surfaces one file at a time,
   re-running the suite after each.
4. Make the pinning tests level-aware and add the rest of §8.
5. The README section. Then §9 in full, pasted into the PR, `gh pr ready`.

## 8. Acceptance tests

| Test / command | Asserts |
|---|---|
| `orbCopyIsByteIdenticalToToday` (`packages/shared/test/copy.test.ts`) | at `orb`, all four functions return exactly the strings in the repo today, character for character — the locked wording is unchanged when the demo goes back |
| `selfieCopyNeverClaimsUniqueness` (`packages/shared/test/copy.test.ts`) | at `selfie`, none of the four contains `one account per person`, `one verified human`, or the word `unique`; each contains the live/camera wording |
| `verifiedChipAboveFold` (existing, `tests/verifiedChipAboveFold.test.tsx`) | level-aware: at `orb` the banner reads `Verified human ✓ · World ID · one account per person`; at `selfie` the uniqueness clause is absent. Still one text node, still `data-floor="20"`, still above the fold |
| `landingCaptionFollowsTheCredential` (`tests/`) | `VERIFY_CAPTION` carries `one account per person` at `orb` and the camera wording at `selfie`, on one line |
| `aboutAndSupportTrustModelFollowTheCredential` (`tests/`) | the trust-model paragraph says `a live, unique person` at `orb` and `a live person` at `selfie`; the escrow, cap, cost-floor and bounded-work clauses are identical at both |
| `dashboardLockedCopyFollowsTheCredential` (`apps/dashboard/test/`) | `/about` and `/deck` board 4 render `claimSentence` / `trustModelSentence`; at `orb` both match `copy.ts`'s current constants exactly |
| `noHardCodedSelfieOutsideShared` (`packages/shared/test/copy.test.ts` or a dashboard test) | greps the mini-app and dashboard sources for a literal `'selfie'`: only type unions and test fixtures match, never a rendered string |
| every existing test file | green; mini-app ≥ 58, dashboard ≥ 54 |

## 9. Verification commands

```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/shared typecheck && pnpm --filter @legwork/shared test
pnpm --filter @legwork/miniapp typecheck && pnpm --filter @legwork/miniapp lint
pnpm --filter @legwork/miniapp test && pnpm --filter @legwork/miniapp build
pnpm --filter @legwork/dashboard typecheck && pnpm --filter @legwork/dashboard lint
pnpm --filter @legwork/dashboard test && pnpm --filter @legwork/dashboard build
DATA_MODE=demo pnpm --filter @legwork/dashboard e2e
bash scripts/ci/banned-words.sh
# nothing rendered may hard-code the level
grep -rn "'selfie'" apps/miniapp/app apps/miniapp/components apps/dashboard/app | grep -v test
```

Expected: everything clean; the e2e gate 2/2; the final grep prints only type unions
(`'selfie' | 'orb'`), never a sentence.

## 10. Hard rules

- Banned words: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee
  **0.45**.
- **At `orb`, every string is byte-identical to today.** This is the revert path and §8 guards
  it. A "tidy-up" of the locked wording while you are in the file fails the review.
- **Never claim uniqueness at `selfie`.** Not "one account", not "one person", not "unique".
  World's own page says the credential does not support it, and the honesty of this product is
  the thing being judged.
- The banner sub-line stays one text node with its classes and `data-floor="20"`; `getNodeText`
  reads direct text children only.
- Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia.
- Paper ground for the mini-app, ink for the dashboard; no token crosses between them.
- No new dependency. No verification-code change.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `e2e-dashboard`, `banned-words`,
      `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `apps/miniapp/README.md` says how to switch the credential back.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-54 — Selfie Check as the demo credential
owned-paths:
  - packages/shared/src/constants.ts
  - apps/miniapp/app/(auth)/Landing.tsx
  - apps/miniapp/app/about/page.tsx
  - apps/miniapp/app/support/page.tsx
  - apps/miniapp/components/ui/VerifiedChip.tsx
  - apps/miniapp/tests/**
  - apps/dashboard/app/copy.ts
  - apps/dashboard/app/about/page.tsx
  - apps/dashboard/app/deck/page.tsx
  - apps/dashboard/test/**
  - apps/miniapp/README.md
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need>` and stop. `packages/shared/src/constants.ts` is the
one frozen file this brief pre-approves, and only for the four copy functions; anything else
there is an `INTERFACE REQUEST:`. If a surface cannot render a credential-selected sentence
without reading an env the browser cannot see, say so with the file and the line rather than
inlining a level — the mini-app has `CREDENTIAL_LEVEL` and the dashboard resolves the level
server-side and passes it down, which is the pattern `credentialLabel` already follows.

## 14. Reviewer notes

Read `orbCopyIsByteIdenticalToToday` first and check it compares against literals, not against
the functions it is testing — a tautology here would let the revert path rot silently. Then
`git diff origin/main` on the six surfaces: every one should be a substitution of a function
call for a literal, with no other edit. The three most likely faults are the banner sub-line
split across spans (which breaks `getNodeText`), a hard-coded `'selfie'` in a rendered string,
and a "while I was here" rewording of the locked blocks. Finally, confirm the deployed
behaviour cannot change on merge: at `orb`, `git diff` of the rendered strings is empty.

## 15. Round 2+

_(empty on first dispatch)_
