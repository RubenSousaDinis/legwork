---
id: T-64
title: Mini-app — seeded rows say so, the board is not Leiria, a price in the place's currency
lane: D
day: 8                               # added Sept 11, when the operator chose to take Legwork beyond Leiria
size: M
agent_class: C                       # msw handlers and vitest; no chain, no key
must: true                           # a board full of unclaimable rows with a CLAIM button is a lie
depends_on: [T-60]                   # the shared proof schema accepts any ISO-4217 code only after T-60
owned_paths:
  - apps/miniapp/components/TaskCard.tsx
  - apps/miniapp/app/tasks/TaskList.tsx
  - apps/miniapp/lib/area.ts
  - apps/miniapp/lib/currency.ts
  - apps/miniapp/app/proof/AnswerToggle.tsx
  - apps/miniapp/app/proof/ProofFlow.tsx
  - apps/miniapp/app/(auth)/PayoutKeyStep.tsx
  - apps/miniapp/app/(auth)/README.md
  - apps/miniapp/app/about/page.tsx
  - apps/miniapp/mocks/handlers.ts
  - apps/miniapp/tests/**
labels: [area:miniapp, wave:8, size:M, agent:cloud]
branch: t-64/miniapp-seeded-rows-world-board
---

# T-64 — Mini-app — seeded rows say so, the board is not Leiria, a price in the place's currency

## 1. Context

The worker's phone is where honesty is tested by a stranger. Three things on it still assume
Leiria and a board of real tasks:

1. **A seeded row has a CLAIM button.** `TaskCard.tsx` renders `ClaimButton` for every open
   row and the `seeded` chip beside it. After T-63 the live board carries 26 seeded demo rows
   backed by no escrow; the API answers a claim on one with **409 `{ error: 'SeededDemoRow' }`**
   (T-63) — a string `CLAIM_ERRORS` in `TaskList.tsx` does not know, so the worker would read
   the generic fallback. A worker in Berlin who taps CLAIM on "Curry 36" and is told nothing
   useful has been lied to by a button.
2. **No fix means Leiria.** `lib/area.ts` resolves the worker's cell from GPS and falls back to
   `DEFAULT_AREA = 'ez1dp'` — Leiria — for `/register`. The board itself is already global
   (`TaskList.tsx:134`: "The board is global: `area` is not sent"), so the fallback only decides
   which cell a worker who denied location is **registered** in. The registration screen
   (`PayoutKeyStep.tsx:181`) says "default — this phone gave no location fix" without saying
   the default is a Portuguese town. Say it.
3. **Every price is EUR.** `AnswerToggle.tsx:254,266` labels a `call-confirm` price "amount
   (EUR)" and submits `currency: 'EUR'`. T-60 widened the proof schema to any ISO-4217 code;
   T-63 puts `country` on the worker brief (`row.brief.place.country`). A worker calling Joe's
   Pizza hears dollars.

Also: the About page's one concrete example is "the pharmacy on Rua de Alcobaça". Keep it —
it is a real Leiria street and the product's origin — but add one sentence that names the
wider claim.

## 2. Exact scope

- **Seeded rows are not claimable, and say why.** In `TaskCard.tsx`, when `row.seeded` is
  true, render **no** `ClaimButton`; in its place, inside the same `data-row="claim"` slot:
  ```
  <p className="lw-body" data-claim="seeded" data-floor="20">
    Seeded demo row — shows what an agent asks for. Not claimable; no escrow behind it.
  </p>
  ```
  The `seeded` chip stays where it is (both places it renders, lines ~205 and ~242). The card's
  other content (type, title, distance, map pin, brief) is unchanged.
- **`CLAIM_ERRORS`** in `TaskList.tsx` gains
  `SeededDemoRow: 'This is a seeded demo row. It shows what an agent asks for; nobody can claim it.'`
  Defensive: the button is gone, but a stale card or a direct request must still get words.
- **Registration fallback names the cell.** `PayoutKeyStep.tsx:181–185`: the `'default'` line
  becomes `default cell — Leiria, Portugal (ez1dp). This phone gave no location fix; use "Use
  my location" to register where you are.` Export `DEFAULT_AREA_LABEL = 'Leiria, Portugal'`
  from `lib/area.ts` and build the sentence from `DEFAULT_AREA` and that label — the string
  `ez1dp` is typed once, in `area.ts`, as today. Update the two `area.ts` comments (lines 10,
  66) and `app/(auth)/README.md:60–61` to say the fallback affects registration only; the board
  is global.
- **Currency follows the place.** New `apps/miniapp/lib/currency.ts`:
  ```ts
  /** ISO-3166-1 alpha-2 → ISO-4217. Absent means "ask the worker". */
  export const CURRENCY_BY_COUNTRY: Readonly<Record<string, string>> = {
    PT: 'EUR', ES: 'EUR', FR: 'EUR', DE: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', IE: 'EUR', FI: 'EUR', GR: 'EUR',
    GB: 'GBP', US: 'USD', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK',
    JP: 'JPY', SG: 'SGD', KR: 'KRW', CN: 'CNY', HK: 'HKD', IN: 'INR', BR: 'BRL', AR: 'ARS', MX: 'MXN', ZA: 'ZAR', TR: 'TRY', AE: 'AED',
  };
  export const ISO_4217 = /^[A-Z]{3}$/;
  export function currencyForCountry(country: string | undefined): string | undefined;
  ```
  `AnswerToggle` gains an optional prop `country?: string`. When `currencyForCountry(country)`
  is defined: the label reads `amount (<code>)` and the submitted price is `{ amount,
  currency: <code> }`. When it is **not** defined (no country on the brief, or a country not in
  the map): the label reads `amount` and a second input appears beside it, `data-input="currency"`,
  `maxLength={3}`, uppercase on change, placeholder `EUR`; the price is only set once the code
  matches `ISO_4217`. `ProofFlow.tsx` passes `country={row.brief?.place?.country}` — extend its
  local `WorkerTaskRow.brief.place` type with `country?: string`.
- **About page**: after the Rua de Alcobaça sentence, one more: "The place can be anywhere
  OpenStreetMap knows it — Leiria, Lisbon, Berlin, New York — as long as it is a business, not
  a home."
- **Mocks** (`mocks/handlers.ts`): the `GET /tasks/list` handler gains three seeded rows with
  real-shaped briefs in Berlin (`Curry 36 · Mehringdamm 36`, `country: 'DE'`), New York
  (`Strand Book Store · 828 Broadway`, `country: 'US'`) and Singapore (`Tian Tian Hainanese
  Chicken Rice · 1 Kadayanallur St`, `country: 'SG'`), all `seeded: true`, `state: 'open'`,
  with rounded coordinates inside those cities. The two existing Leiria rows stay. Add
  `country: 'PT'` to their briefs. If `tests/fixturesMatchContract.test.ts` checks these rows
  against the shared contract, the new rows must pass it too.

## 3. Out of scope

- The API. `SeededDemoRow` and `brief.place.country` are T-63's; if they are not on `main`
  when you start, build against the shapes above and the msw handlers — the contract is in
  this brief.
- Sending `area` on the board request, "near me" logic, the map — T-56 shipped those.
- Any change to the `seeded` chip's look, tone or floor.
- Dashboard — T-65. Docs outside the two READMEs above — T-66.
- Making the worker pick a city or an area by hand. Registration still binds a geohash from
  GPS or the default; only the words change.
- Do not touch: `apps/miniapp/lib/api.ts`, `apps/miniapp/lib/session.ts`,
  `apps/miniapp/app/tasks/activeClaim.ts`, `packages/**`, `apps/api/**`.

## 4. Owned paths

```
apps/miniapp/components/TaskCard.tsx
apps/miniapp/app/tasks/TaskList.tsx
apps/miniapp/lib/area.ts
apps/miniapp/lib/currency.ts
apps/miniapp/app/proof/AnswerToggle.tsx
apps/miniapp/app/proof/ProofFlow.tsx
apps/miniapp/app/(auth)/PayoutKeyStep.tsx
apps/miniapp/app/(auth)/README.md
apps/miniapp/app/about/page.tsx
apps/miniapp/mocks/handlers.ts
apps/miniapp/tests/**
```

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| `WorkerTaskRow.seeded`, `.brief.place.country` | `apps/api/src/services/lifecycle.ts` (T-63) | `seeded: true` on every DB-seeded row; ISO-3166 code on the brief |
| `POST /tasks/:id/claim` → 409 `{ error: 'SeededDemoRow' }` | `apps/api/app/tasks/[id]/claim/route.ts` (T-63) | the string you word |
| `CallConfirmProof.price.currency` `/^[A-Z]{3}$/` | `packages/shared/src/schemas/proofs.ts` (T-60) | any code the map or the worker supplies parses |
| `DEFAULT_AREA`, `resolveArea`, `lastAreaSource` | `apps/miniapp/lib/area.ts` | registration fallback |
| `Chip`, `Button`, `data-floor`, `data-hit` conventions | `apps/miniapp/components/ui`, `DESIGN-SPEC.md` | the floors and hit targets `tests/hitTargetsMarked.test.tsx` checks |

## 6. Interfaces produced

| Interface | Where | Consumers |
|---|---|---|
| A seeded card with `data-claim="seeded"` and no CLAIM button | `TaskCard.tsx` | the worker, the reviewer, T-47's PNG check if re-run |
| `currencyForCountry`, `CURRENCY_BY_COUNTRY`, `ISO_4217` | `lib/currency.ts` | `AnswerToggle` |
| `DEFAULT_AREA_LABEL` | `lib/area.ts` | `PayoutKeyStep` |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-64` — must print `CLAIMED`. Exit 1 means another agent
holds it or T-60 has not merged: stop.

1. Read `TaskCard.tsx` (whole file), `TaskList.tsx:50–70` and `:150–200`, `AnswerToggle.tsx:240–275`,
   `ProofFlow.tsx:95–110` and `:165–195`, `PayoutKeyStep.tsx:170–195`, `area.ts` in full.
2. Mocks first: the three international seeded rows. Run the existing suite — `fixturesMatchContract`
   and `tasks/*.test.tsx` tell you immediately if a shape is wrong.
3. `TaskCard`: the seeded branch. Then `tests/tasks/seededRow.test.tsx` (§8).
4. `CLAIM_ERRORS`. Then extend `tests/tasks/claim.test.tsx` with the 409 wording test.
5. `lib/currency.ts` + unit test; `AnswerToggle` prop + branch; `ProofFlow` pass-through.
   Then `tests/proof/currency.test.tsx`.
6. `area.ts` label + comments; `PayoutKeyStep` sentence; `(auth)/README.md`. Then the auth test.
7. About page sentence + test.
8. Run §9. Paste the output into the PR. `gh pr ready`.

## 8. Acceptance tests

| Test / command | Asserts |
|---|---|
| `seededRowHasNoClaimButton` (`tests/tasks/seededRow.test.tsx`) | render `TaskCard` with `seeded: true, state: 'open'`: no button with text `CLAIM`; the `seeded` chip is present |
| `seededRowSaysWhyItCannotBeClaimed` | the same render contains `data-claim="seeded"` whose text includes "Not claimable" and "no escrow" |
| `realRowStillHasTheClaimButton` | `seeded: false` → the `CLAIM` button renders exactly as before (guards against inverting the condition) |
| `seededDemoRowErrorIsWordedForTheWorker` (in `tests/tasks/claim.test.tsx`) | msw answers the claim with 409 `{ error: 'SeededDemoRow' }`; the screen shows the `CLAIM_ERRORS.SeededDemoRow` sentence and not the generic fallback |
| `boardMixesSeededAndRealRowsFromThreeCountries` (`tests/tasks/seededRow.test.tsx`) | with the msw board, the list renders ≥ 5 rows, ≥ 3 with the `seeded` chip, and titles include `Curry 36` and `Strand Book Store` |
| `currencyFollowsThePlaceCountry` (`tests/proof/currency.test.tsx`) | `currencyForCountry('US') === 'USD'`, `('DE') === 'EUR'`, `('GB') === 'GBP'`, `('SG') === 'SGD'`, `('JP') === 'JPY'`, `(undefined) === undefined`, `('XX') === undefined` |
| `answerTogglePriceLabelNamesTheCurrency` | `AnswerToggle` with `taskType: 'call-confirm'`, `country: 'GB'`, `value.answer: 'price'`: label text is `amount (GBP)`; typing `12` calls `onChange` with `price: { amount: 12, currency: 'GBP' }` |
| `unknownCountryAsksForACode` | same with `country: undefined`: label is `amount`; a `data-input="currency"` input exists; typing `12` alone sets no `price`; typing `chf` into the code input uppercases to `CHF` and then `price` is `{ amount: 12, currency: 'CHF' }` |
| `proofFlowPassesTheCountryToTheToggle` (`tests/proof/proofFlow.test.tsx`, extend) | with an msw row whose brief has `country: 'US'`, the price label reads `amount (USD)` |
| `registrationDefaultNamesLeiria` (`tests/authFlow.test.tsx`, extend) | with geolocation denied, the area line contains `Leiria, Portugal` and `ez1dp` and the `Use my location` button |
| `aboutPageNamesTheWiderClaim` (`tests/aboutAndSupportTrustModelFollowTheCredential.test.tsx`, extend or a new test) | the About page contains `anywhere OpenStreetMap knows it` and still contains `Rua de Alcobaça` |
| `pnpm --filter @legwork/miniapp test` | whole suite green, including `hitTargetsMarked` and `fixturesMatchContract` |

## 9. Verification commands

```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/miniapp test
pnpm --filter @legwork/miniapp typecheck
pnpm --filter @legwork/miniapp lint
bash scripts/ci/banned-words.sh
rg -n "'EUR'" apps/miniapp/app apps/miniapp/components apps/miniapp/lib   # expect: only lib/currency.ts
```

Expected: suite green with the §8 names present; typecheck and lint clean; `'EUR'` appears
only in the country map.

## 10. Hard rules

- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`,
  `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives
  **3.00**, fee **0.45**. A seeded row shows its posted amount with the `seeded` chip, as today;
  it never shows an escrow, a release or a tx.
- **Honesty:** every seeded row renders the `seeded` chip (floor 20) and, now, the
  not-claimable line. The verified chip stays above the fold. Nothing on a seeded card may
  read as an invitation to work.
- **Privacy:** nothing new leaves the phone. `country` is the agent's own two letters.
- **Keys:** none in the bundle. `process.env` only through `lib/env.ts` as today.
- **UI floors:** every new text element carries `data-floor="20"` (body) or the meta floor the
  file already uses; every new input carries `data-hit="44"` — `hitTargetsMarked.test.tsx`
  enforces it.
- Tests run on msw and vitest only. No live API.
- The board stays global; do not add an `area` query parameter back.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`,
      `commit-trailers`, `claim`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `apps/miniapp/app/(auth)/README.md` says the default cell affects registration only.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-64 — Mini-app — seeded rows say so, the board is not Leiria, a price in the place's currency
owned-paths:
  - apps/miniapp/components/TaskCard.tsx
  - apps/miniapp/app/tasks/TaskList.tsx
  - apps/miniapp/lib/area.ts
  - apps/miniapp/lib/currency.ts
  - apps/miniapp/app/proof/AnswerToggle.tsx
  - apps/miniapp/app/proof/ProofFlow.tsx
  - apps/miniapp/app/(auth)/PayoutKeyStep.tsx
  - apps/miniapp/app/(auth)/README.md
  - apps/miniapp/app/about/page.tsx
  - apps/miniapp/mocks/handlers.ts
  - apps/miniapp/tests/**
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it.
Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and
`apps/api/src/db/schema.ts` are frozen. Dependencies: `DEP REQUEST:` — you need none.

Specific cases:
- `CallConfirmProof` still says `z.literal('EUR')` on `main` → T-60 has not merged;
  `scripts/claim.sh` should have refused. Stop.
- `tests/fixturesMatchContract.test.ts` rejects `brief.place.country` → T-60 was supposed to
  add `BriefPlace.country?` to `packages/shared/src/api-contract.ts`; check `main`, and if it
  is missing, `BLOCKED: T-60 BriefPlace.country missing from the contract` and stop.
- The API's 409 string differs from `SeededDemoRow` when T-63 lands → `BLOCKED:` with the
  actual string; do not guess.

## 14. Reviewer notes

1. Render a seeded card and a real card side by side in the test output: the seeded one must
   have no `CLAIM`, the real one must. `realRowStillHasTheClaimButton` is the guard.
2. `AnswerToggle`: with `country: 'US'` the submitted proof carries `currency: 'USD'`, not the
   label only. Read the `onChange` payload in the test.
3. `rg "'EUR'" apps/miniapp` — one file.
4. The registration line names Leiria *and* the cell *and* offers the retry. A worker in Tokyo
   who denies location must understand what just happened to them.

## 15. Round 2+

Empty on first dispatch.
