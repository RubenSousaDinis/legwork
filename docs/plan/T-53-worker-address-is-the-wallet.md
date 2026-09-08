---
id: T-53
title: Inside World App the worker's address is the wallet, so walletAuth can sign in
lane: D
day: 5                               # added Sept 8; confirmed against the deployed API the same evening
size: S
agent_class: C
must: true
depends_on: [T-52]
owned_paths:
  - apps/miniapp/app/(auth)/**
  - apps/miniapp/lib/session.ts
  - apps/miniapp/lib/workerKey.ts
  - apps/miniapp/mocks/**
  - apps/miniapp/tests/**
  - apps/miniapp/README.md
  - apps/miniapp/app/support/page.tsx
labels: [area:miniapp, wave:5, size:S, agent:cloud]
branch: t-53/worker-address-is-the-wallet
---

# T-53 — Inside World App the worker's address is the wallet

## 1. Context

**A worker who registers inside World App can never get a session.** Registration binds the
browser-generated payout address; `walletAuth` then presents the World App wallet address; the
API asks the chain whether *that* address is a worker, and it is not.

Confirmed against the deployed API on 2026-09-08, with a signed SIWE payload from an address
the registry does not know:

```
wallet address : 0xf370520b9b094aF20aDCd6a10Bf9CeA32068D4eF
POST /session  : 403 {"error":"forbidden","reason":"not_registered"}
```

The signature was **accepted** — the request reached `requireRegisteredWorker` — so this is not
a signing problem. The chain is asked `isWorker(payload.address)` and answers no.

The three lines that make it certain:

- `apps/miniapp/lib/workerKey.ts:29` — `loadOrCreatePayoutKey()` is `generatePrivateKey()` in
  `localStorage`. It is never the World App wallet, which is a smart-contract wallet on World
  Chain (see the EIP-1271 note in `apps/api/test/siwe.ts`).
- `apps/miniapp/app/(auth)/page.tsx:183` — `registerWorker(payoutAddress, area)` binds that
  generated address, in every mode.
- `apps/api/app/session/route.ts:88,101` — walletAuth sets
  `worker = getAddress(body.payload.address)` and then `requireRegisteredWorker(worker)`, which
  is `chain.isWorker(...)` (`:70-73`).

**This is what the operator hit on Sept 8**, and it is not what was fixed that morning. That run
reported `403 forbidden {reason: 'not_registered'}` "in walletAuth mode and idkit mode alike".
Reordering the flow to verify → payout key → register → session fixed **idkit**, because
registration creates the binding that idkit mode looks up. It cannot fix walletAuth: the wallet
address is still not the registered address, and no ordering changes that.

T-52 could not see it because its mock signs walletAuth *as the held payout key*
(`mockWalletAuth()` in `tests/authFlow.test.tsx`), which makes the two addresses equal — an
assumption production never satisfies. That was ruled out of scope there and is the whole of
this task.

**The demo runs inside World App.** Until this lands, the filmed worker cannot claim.

## 2. Exact scope

**The ruling.** Inside World App, the worker's address **is** the walletAuth address. That is
the address `POST /register` binds, the address the escrow pays, and the address every session
presents. The generated payout key stays exactly as it is for the plain-web path, where there
is no wallet to speak for the worker.

This is the honest shape rather than a workaround. A World App worker already has a wallet they
control and can be paid in; making them keep a second key in `localStorage` — one the support
page has to warn them they can permanently lose — was never a service to them.

1. **`lib/session.ts` — expose the wallet address before the session.** `createWalletAuthSession()`
   already receives `result.data.address` from MiniKit. Add
   `walletAddress(): Promise<string | null>` that returns `MiniKit.walletAuth`'s address when
   MiniKit is installed and `null` otherwise, or return the address from the existing call so the
   caller can read it — whichever needs fewer round trips. Do not add a second `walletAuth` call
   to the registration path if one already happens: one signature per sign-in.
2. **`app/(auth)/page.tsx` — the registered address follows the mode.**
   - Inside World App: the address shown on the payout step and passed to
     `registerWorker(address, area)` is the **wallet address**. The step's copy becomes
     `Your World App wallet is your payout address` with the address beneath it, and the
     reveal/import/export controls are **not rendered** — there is no key to lose, so the
     warning about losing it must not appear either.
   - Outside World App: unchanged. `loadOrCreatePayoutKey()`, the reveal, the import, the
     existing warning.
3. **The conflict screen follows the same rule.** T-52 made `Sign in with this key` World App
   only. Inside World App the button no longer refers to a key the worker does not hold: the
   copy is `Sign in with your World App wallet`, and `signInExisting()` is unchanged underneath
   — it was always walletAuth.
4. **`app/support/page.tsx`** — the two payout-key answers become mode-honest. `I lost my payout
   key` keeps its current answer for the web path and gains one sentence: inside World App the
   payout address is the World App wallet, so there is no separate key to lose. Do not delete the
   existing answer; a web worker still has a key.
5. **`mocks/handlers.ts` and `tests/authFlow.test.tsx` — stop asserting the false premise.**
   `mockWalletAuth()` must sign as an address that is **not** the generated payout key — that is
   the whole point. The registry must then be bound by `/register` with the wallet address for
   the flow to succeed, which is exactly what production does. A test that has to make the two
   addresses equal to pass is testing the mock.

## 3. Out of scope

- The API, the contracts and the registry. `POST /register` already takes whatever address it is
  given, and `POST /session` already checks the chain. Nothing there changes; if you believe it
  must, that is a `BLOCKED:`.
- Migrating the operator's existing registration. `0xaeD0C1102e45B7F528224eaCB9309a0925015810` is
  bound to their nullifier and in the wrong cell besides; the operator clears it with
  `POST /admin/reset-worker` and registers again. Do not write a migration.
- The area binding, the distance rendering, the claim radius, the empty state — all T-52, merged.
- The dashboard. `apps/dashboard/**` is T-51's.
- Do not touch: `apps/api/**`, `packages/**`, `contracts/**`,
  `apps/miniapp/app/about/page.tsx`, `apps/miniapp/app/tasks/**`.

## 4. Owned paths

```
apps/miniapp/app/(auth)/**
apps/miniapp/lib/session.ts
apps/miniapp/lib/workerKey.ts
apps/miniapp/mocks/**
apps/miniapp/tests/**
apps/miniapp/README.md
apps/miniapp/app/support/page.tsx
```

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| `POST /session` walletAuth | `apps/api/app/session/route.ts:85-101` | the signing address must already be a registered worker on chain |
| `POST /register` | `apps/api/app/register/route.ts:88` | binds whatever `worker_address` it is given |
| `MiniKit.walletAuth` | `apps/miniapp/lib/session.ts:127` | returns `data.address` — the World App wallet |
| `loadOrCreatePayoutKey()` | `apps/miniapp/lib/workerKey.ts` | the web path's address; unchanged |
| `miniKitInstalled()` | `apps/miniapp/app/(auth)/page.tsx` | read at click time, not at mount |

## 6. Interfaces produced

| Interface | Where | Consumers |
|---|---|---|
| the registered address = the wallet address inside World App | `app/(auth)/page.tsx` | every session the filmed worker creates |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-53` — must print `CLAIMED`. Exit 1 means another agent
holds it or T-52 is not merged: stop. Finish with `gh pr ready`, never `gh pr create`.

1. Read `app/(auth)/page.tsx`, `lib/session.ts`, `lib/workerKey.ts` and
   `apps/api/app/session/route.ts:60-105` end to end. Run the mini-app suite and record the count
   (58 at the time of writing).
2. **Change the test first.** Make `mockWalletAuth()` sign as an address distinct from the payout
   key and watch `bothSessionModes` go **red** with `403 not_registered`. That red is the bug,
   reproduced in the suite. Do not proceed until you have seen it.
3. Then items 1–3 of §2 until it is green for the right reason: `/register` bound the wallet
   address, so `/session` finds it.
4. Items 4–5, then the README.
5. Run §9 in full, paste it into the PR, `gh pr ready`.

## 8. Acceptance tests

| Test / command | Asserts |
|---|---|
| `walletAuthAddressIsTheRegisteredAddress` (`tests/authFlow.test.tsx`) | inside World App, the body of `POST /register` carries the walletAuth address, **not** `loadOrCreatePayoutKey().address`; the two are different in the test |
| `bothSessionModes` (existing) | still green, now with a walletAuth address distinct from the payout key — the session succeeds because registration bound the wallet |
| `webPathStillUsesTheGeneratedKey` (`tests/authFlow.test.tsx`) | outside World App, `POST /register` carries the generated payout address and the reveal/import controls render |
| `worldAppShowsNoPayoutKeyToLose` (`tests/authFlow.test.tsx`) | inside World App the payout step renders the wallet address, and neither the reveal control nor the losing-your-key warning appears |
| `nullifierConflictSignsInWithTheHeldKey` (existing, renamed copy allowed) | still green; inside World App the button copy names the wallet, not a key |
| `payoutKeyNeverLeavesTheDevice` (existing) | untouched and green — the web path still never transmits the secret |
| every existing test file | green; the mini-app suite does not lose a test |

## 9. Verification commands

```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/miniapp typecheck && pnpm --filter @legwork/miniapp lint
pnpm --filter @legwork/miniapp test
pnpm --filter @legwork/miniapp build
bash scripts/ci/banned-words.sh
# the mock must not sign as the payout key any more
grep -n "getPayoutAddress" apps/miniapp/tests/authFlow.test.tsx || echo 'mock no longer signs as the payout key: good'
```

Expected: typecheck, lint and build clean; the suite at least 58 passing with every §8 name
present; `banned-words: clean`; the grep prints the `good` line.

## 10. Hard rules

- Banned words: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee
  **0.45**.
- **The payout key still never leaves the device** on the web path — no key in a URL, a header or
  a body, ever. `payoutKeyNeverLeavesTheDevice` stays green.
- Never show a worker a warning about losing a key they do not have, and never imply World App
  workers hold one.
- One signature per sign-in: do not call `MiniKit.walletAuth` twice in one flow.
- Paper ground only (`lw-*`); no new dependency; phone floors 16 px body, `data-floor="20"` on
  narrated copy, hit targets ≥ 44 px.
- No mock may answer a request with a success that ignores the state it was asked about — the
  rule T-52 established and this task exists because of.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `e2e-dashboard`, `banned-words`,
      `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `apps/miniapp/README.md` says which address is registered in which mode, and why.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-53 — Inside World App the worker's address is the wallet
owned-paths:
  - apps/miniapp/app/(auth)/**
  - apps/miniapp/lib/session.ts
  - apps/miniapp/lib/workerKey.ts
  - apps/miniapp/mocks/**
  - apps/miniapp/tests/**
  - apps/miniapp/README.md
  - apps/miniapp/app/support/page.tsx
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need>` on the PR (or the issue), stop, and do not work around
it. If the fix appears to need an API or registry change, that is a `BLOCKED:` and not an edit —
the API already accepts any address and already checks the chain, so a change there would mean
the ruling in §2 is wrong and the lead must re-rule it.

## 14. Reviewer notes

Check step 2 actually happened: `git log -p` should show a commit where `mockWalletAuth()` signs
as a distinct address and `bothSessionModes` is red, before the fix that makes it green. A green
suite that was never red proves nothing here, which is precisely how this bug survived T-52.
Then confirm `POST /register`'s body in the World App path carries the wallet address, that the
web path is untouched, and that no losing-your-key warning renders inside World App. Finally, the
real check is a phone: registration inside World App followed by a session that is not a 403.

## 15. Round 2+

_(empty on first dispatch)_
