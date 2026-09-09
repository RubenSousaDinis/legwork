---
id: T-57
title: A worker withdraws without gas, and Legwork keeps 2 %
lane: B
day: 6                               # added Sept 9, after the first real payout on the street
size: L
agent_class: L                       # signs and submits on Base Sepolia; needs the operator's .env
must: false                          # nothing in the demo depends on it
depends_on: []
owned_paths:
  - apps/api/app/me/withdraw/**
  - apps/api/src/services/withdraw.ts
  - apps/api/src/services/withdraw.test.ts
  - apps/miniapp/app/earnings/**
  - apps/miniapp/lib/workerKey.ts
  - apps/miniapp/tests/withdraw/**
  - packages/shared/src/constants.ts
  - packages/shared/src/api-contract.ts
  - apps/api/src/db/schema.ts
  - docs/threat-model.md
labels: [area:api, area:miniapp, wave:6, size:L, agent:local]
branch: t-57/gasless-withdrawal-with-a-fee
---

# T-57 — A worker withdraws without gas, and Legwork keeps 2 %

## 1. Context

A worker finished the first real errand on Sept 9 and was paid 3.00 USDC to the payout address
their phone generated. They then asked how to move it to another wallet, and the answer today is
that they cannot. The address holds `3.00 USDC` and `0.000000 ETH`: every claim they made was
relayed, so Legwork paid the gas and the address has never needed any. It cannot send a
transaction.

Nor can they get the key out. `PayoutKeyStep` — the reveal-and-copy UI — is rendered only inside
`AuthFlow`, so once a worker is registered there is no route to it. `/earnings` exists and shows
what they have earned, and there is nothing on it that lets them do anything with it.

The operator's decision: **Legwork pays the gas and keeps 2 % of the amount withdrawn.** The
worker never needs ETH and never sees a gas price.

The mechanism already exists in this codebase's vocabulary. `POST /tasks` is paid by an
**EIP-3009** authorization: the buyer signs `TransferWithAuthorization` off-chain and the
facilitator submits it, which is why a buyer needs no gas either. The USDC at
`0x036CbD53842c5426634e7929541eC2318f3dCF7e` is Circle's own Base Sepolia deployment, `version()`
is `"2"`, and `authorizationState(address,bytes32)` answers rather than reverting — EIP-3009 is
there. A worker can sign the same kind of authorization with their payout key, and the relayer
can submit it.

## 2. Exact scope

- `WITHDRAW_FEE_BPS = 200n` in `packages/shared/src/constants.ts`, beside `FEE_BPS`, with
  `withdrawFeeOn(amountUnits)` returning `(amountUnits * WITHDRAW_FEE_BPS) / 10_000n`.
- **The worker absorbs no rounding dust.** `fee = floor(amount * 200 / 10_000)`, `payout = amount
  − fee`. Integer division truncates, so the remainder stays with the worker, never with Legwork.
- `signWithdrawal(to, amountUnits, chainId, usdc)` in `apps/miniapp/lib/workerKey.ts`: builds the
  two EIP-712 `TransferWithAuthorization` payloads **locally**, signs both with the stored payout
  key, and returns the signatures plus the fields. The key never leaves the module, is never put
  into React state, and is never sent to the API.
- `POST /me/withdraw` (worker session): takes the two signed authorizations, checks them, and
  submits both `transferWithAuthorization` calls through the relayer, which pays the gas.
- **Leg order is payout first, fee second**, and the reason is written in the route: if the fee leg
  fails after the payout leg landed, Legwork is out 2 % and the worker is whole. The other order
  takes a fee for a withdrawal that did not happen. Legwork carries the risk it created.
- A withdraw UI on `/earnings`: destination address, amount, a line reading the exact split
  (`you receive 2.94 · Legwork keeps 0.06`), and a confirm step naming the destination in full.
- **`MIN_WITHDRAW_USDC = 1.00`.** Below it the fee cannot cover a mainnet gas price and the UI
  refuses with a reason, rather than quietly paying to move dust.
- Replay protection: one row per authorization nonce, in the pattern `idempotency` already uses
  for x402 (`schema.ts:98`, "one authorization nonce, one task"). A resubmitted pair is answered
  from the row, never re-broadcast.
- `docs/threat-model.md` gains a row for the new signing surface (see §10).

## 3. Out of scope

- **Any new contract.** Two sequential `transferWithAuthorization` calls are the shipped design.
  An atomic two-leg helper is §15 and needs a deploy; T-13's lesson is that an immutable
  cross-contract reference turns a one-contract fix into four redeploys.
- Withdrawing to a bank, a card, or off Base Sepolia. This USDC is testnet and the UI must say so.
- Changing `FEE_BPS`, the 15 % task fee, or any money figure on any other surface.
- Restoring an account from a key on a new phone — `importPrivateKey` exists and has no UI; that
  is its own task, not this one.
- Do not touch: `apps/api/src/services/hire.ts`, `apps/api/src/services/lifecycle.ts`,
  `contracts/**`, `subgraph/**`.

## 4. Owned paths

```
apps/api/app/me/withdraw/**
apps/api/src/services/withdraw.ts
apps/api/src/services/withdraw.test.ts
apps/miniapp/app/earnings/**
apps/miniapp/lib/workerKey.ts
apps/miniapp/tests/withdraw/**
packages/shared/src/constants.ts
packages/shared/src/api-contract.ts
apps/api/src/db/schema.ts
docs/threat-model.md
```

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| `loadOrCreatePayoutKey` / `exportPrivateKey` | `apps/miniapp/lib/workerKey.ts` | the key is `localStorage['legwork.payoutKey.v1']`, browser-only, never sent |
| `requireWorkerSession` | `apps/api/src/session.ts` | throws 401; the session carries `worker`, the registered address |
| `getChain()` relayer methods | `apps/api/src/chain.ts` | the relayer signs and pays gas; follow how `releaseClaimFor` is called |
| `idempotency` | `apps/api/src/db/schema.ts` | the existing one-nonce-one-write shape to copy |
| USDC EIP-3009 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `transferWithAuthorization`, `authorizationState`; domain `name: "USDC"`, `version: "2"`, `chainId: 84532` |
| `fromUsdcUnits` / `toUsdcUnits` | `packages/shared` | 6 decimals, bigint units everywhere |

## 6. Interfaces produced

| Interface / signature | Where | Consumers |
|---|---|---|
| `WITHDRAW_FEE_BPS`, `withdrawFeeOn(bigint): bigint`, `MIN_WITHDRAW_USDC` | `packages/shared/src/constants.ts` | miniapp, api |
| `POST /me/withdraw` → `{ payout_tx, fee_tx, payout_usdc, fee_usdc }` | `apps/api/app/me/withdraw/route.ts` | miniapp `/earnings` |
| `signWithdrawal(...)` | `apps/miniapp/lib/workerKey.ts` | `/earnings` |
| `withdrawals` table | `apps/api/src/db/schema.ts` | replay protection |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-57` — must print `CLAIMED`. Exit 1 means another agent
holds it or a dependency is open: stop.

1. Read `apps/api/src/services/hire.ts` first — the x402 settle path is the same primitive from the
   other side, including how a failed leg after a successful one is reported rather than hidden.
2. `packages/shared/src/constants.ts`: `WITHDRAW_FEE_BPS`, `withdrawFeeOn`, `MIN_WITHDRAW_USDC`,
   with the dust rule stated in a comment.
3. `workerKey.ts`: `signWithdrawal`. Build both EIP-712 payloads from arguments the **caller**
   supplies and constants in the module — never from a server response. Random 32-byte nonces.
   `validAfter = 0`, `validBefore = now + 3600`.
4. `apps/api/src/services/withdraw.ts`: verify both signatures recover to the session's worker,
   verify the amounts match `withdrawFeeOn`, verify the fee leg's recipient is `TREASURY_ADDRESS`,
   verify the payout leg's recipient is the address the worker asked for. **A signature that does
   not recover to the session worker is a 403, not a 400** — it is someone else's money.
5. The route: submit payout, then fee. Record both in `withdrawals` keyed by the payout nonce.
6. `/earnings`: the form, the split line, the confirm step, and the testnet disclosure.
7. `docs/threat-model.md`: the row from §10.
8. `pnpm docs:gen` and commit the regenerated `docs/api.md` / `docs/mcp-schema.md`.

## 8. Acceptance tests

| Test / command | Asserts |
|---|---|
| `feeIsTwoPercentAndDustStaysWithTheWorker` | `withdrawFeeOn(3_000_000n) === 60_000n`; for `1_000_001n` the fee is `20_000n` and payout `980_001n` — payout + fee is exactly the input for 1000 random amounts |
| `signWithdrawalNeverReturnsTheKey` | the resolved object, JSON-stringified, does not contain the private key; `localStorage` is unchanged |
| `signWithdrawalBuildsBothLegsLocally` | the two payloads name the caller's destination and `TREASURY_ADDRESS`; passing a server-shaped object cannot redirect either recipient |
| `withdrawRejectsASignatureFromAnotherAddress` | a pair signed by a different key answers **403**, and no chain call is made |
| `withdrawRejectsAMismatchedFee` | a pair whose fee leg is under `withdrawFeeOn` answers 422 and no chain call is made |
| `withdrawRefusesBelowTheMinimum` | `0.99` answers 422 naming `MIN_WITHDRAW_USDC`; nothing is submitted |
| `withdrawIsIdempotentOnTheNonce` | the same pair twice returns the first answer and broadcasts once |
| `withdrawReportsAFailedFeeLegWithoutLosingThePayout` | payout succeeded + fee reverted returns 200 with `fee_tx: null` and a stated `fee_pending`, never a 500 that hides a landed payout |
| `earningsShowsTheSplitBeforeConfirming` | the form renders `you receive 2.94` and `Legwork keeps 0.06` for 3.00 before any signature |
| `earningsNamesTheDestinationInFull` | the confirm step shows all 42 characters, never a truncated address |

## 9. Verification commands

```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/shared test
pnpm --filter @legwork/api test
pnpm --filter @legwork/miniapp test
pnpm --filter @legwork/miniapp typecheck && pnpm --filter @legwork/miniapp lint
pnpm --filter @legwork/api typecheck && pnpm --filter @legwork/api lint
pnpm docs:gen && git diff --exit-code docs/api.md docs/mcp-schema.md
bash scripts/ci/banned-words.sh
```

Expected: every suite green, no docs drift, `banned-words: clean`.

## 10. Hard rules

- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`,
  `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives
  **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). The withdrawal fee is a
  **separate** 2 % of the amount withdrawn and must never be described as part of the 0.45.
- The payout key is never sent to the API, never logged, never placed in React state beyond the
  reveal box, and never included in an error message. Add it to the redaction lists in
  `apps/api/src/log.ts` and `apps/api/src/middleware/redact.ts` if any field could carry it.
- **The mini-app builds the typed data it signs.** Never sign fields the API supplied. A server
  that could choose the recipient of a `TransferWithAuthorization` could take the whole balance,
  and the worker's phone is the only party that should decide where their money goes.
- The UI says this is testnet USDC and not spendable, on the same screen as the amount.
- `docs/threat-model.md` gains: *"The phone signs EIP-3009 authorizations with the payout key. The
  payloads are built on the phone from the worker's own input; the API only relays them and pays
  gas. A compromised API can refuse a withdrawal or delay it, and cannot redirect one."*
- Tests never call a live model or a live chain.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`,
      `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `apps/miniapp/README.md` note if the frozen-file list changes.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-57 — A worker withdraws without gas, and Legwork keeps 2 %
owned-paths:
  - apps/api/app/me/withdraw/**
  - apps/api/src/services/withdraw.ts
  - apps/api/src/services/withdraw.test.ts
  - apps/miniapp/app/earnings/**
  - apps/miniapp/lib/workerKey.ts
  - apps/miniapp/tests/withdraw/**
  - packages/shared/src/constants.ts
  - packages/shared/src/api-contract.ts
  - apps/api/src/db/schema.ts
  - docs/threat-model.md
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it. Interfaces
in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and
`apps/api/src/db/schema.ts` are frozen: `INTERFACE REQUEST:` — note that this brief **owns**
`api-contract.ts`, `constants.ts` and `schema.ts` for the additions in §6, so those are yours to
make, additively, and nothing else in them may move. Dependencies: `DEP REQUEST:`. Env vars:
`ENV REQUEST:`.

## 14. Reviewer notes

Open in this order:

1. **`signWithdrawal`, and specifically where each recipient comes from.** The one failure that
   loses a worker's money is a payload whose `to` came from the server. It must come from the
   worker's input and `TREASURY_ADDRESS` must come from a constant.
2. **The 403-not-400 on a foreign signature**, and that no chain call happens before the recovery
   check. A signature that does not recover to the session worker is an attempt to spend someone
   else's balance.
3. **The failed-fee-leg path.** A 500 after the payout landed would tell a worker their withdrawal
   failed when they have the money. `withdrawReportsAFailedFeeLegWithoutLosingThePayout` is the
   test; check it asserts on the response and not just on a log line.
4. The dust rule: run the property test's failing case by hand once. `payout + fee === amount` must
   hold for every input, or Legwork is skimming a unit somewhere.

## 15. Round 2+

Empty on first dispatch.

**Known follow-on, not in scope here:** the two legs are two transactions, so there is a window in
which the payout landed and the fee has not. A small helper contract calling
`transferWithAuthorization` twice in one call closes it atomically. That is a contract deploy and
a redeploy risk, and this brief takes the two-transaction version with the risk stated in the
route and carried by Legwork rather than the worker.
