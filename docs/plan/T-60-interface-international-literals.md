---
id: T-60
title: Interface change — ISO currency, place-lookup env vars, stale geohash comment
lane: lead
day: 8                               # added Sept 11, when the operator chose to take Legwork beyond Leiria
size: S
agent_class: L                       # touches frozen interfaces; the lead's account, the lead's PR
must: true                           # T-62 and T-64 cannot start until this merges
depends_on: []
owned_paths:
  - packages/shared/src/schemas/proofs.ts
  - packages/shared/src/schemas/place.ts
  - packages/shared/src/api-contract.ts
  - packages/shared/test/schemas.test.ts
  - docs/api.md
  - .env.example
  - contracts/src/interfaces/IWorkerRegistry.sol
labels: [area:shared, area:contracts, wave:8, size:S, agent:local, interface-change]
branch: t-60/interface-international-literals
---

# T-60 — Interface change — ISO currency, place-lookup env vars, stale geohash comment

## 1. Context

Legwork was built Leiria-first. Four frozen interfaces still say so, and each one blocks a
downstream task that takes the product international:

- `packages/shared/src/schemas/proofs.ts:50` pins a `call-confirm` price to
  `currency: z.literal('EUR')`. A worker in London who hears "twelve pounds" cannot submit a
  truthful proof. T-64 (mini-app) needs this widened before it can label the amount with the
  place's currency.
- `packages/shared/src/api-contract.ts` is the route contract `apps/api/src/openapi.ts` renders
  and `docs/api.md` is generated from. T-62 adds one answer the contract does not know: **503
  `place_lookup_unavailable`** on `POST /check` when the live Overpass lookup did not answer
  (`POST /tasks` already lists a 503). T-62 also adds two optional public fields, `locality`
  and `country`, to `PublicTaskView`, so the dashboard can say "Berlin · DE" instead of a
  geohash. Both are contract changes and only this lane may make them.
- `.env.example` is the only env file in git and it does not name the two variables T-62
  reads to resolve a place outside the packaged extract: `OVERPASS_URL` and `PLACE_LOOKUP`.
- `contracts/src/interfaces/IWorkerRegistry.sol:6` says Leiria is `"ez5ku"`. It is not: `ez5ku`
  is 300 km inland in Spain, and every deployed surface uses `ez1dp`
  (`ngeohash.encode(39.744, -8.807, 5)`). A comment, but it is in a frozen interface, so only
  this lane may fix it.

This is an `interface-change` PR in the sense `AGENTS.md` uses: small, merged first, and the
downstream tasks rebase on it. It changes **no** runtime behaviour except accepting more
currency codes; the 503 and the two public fields are declared here and produced by T-62.

## 2. Exact scope

- In `packages/shared/src/schemas/proofs.ts`, `CallConfirmProof.price.currency` becomes
  `z.string().regex(/^[A-Z]{3}$/, 'ISO-4217 code')`. `EUR` still parses. Nothing else in the
  file changes.
- In `packages/shared/src/schemas/place.ts`, the doc comment on `country` (line 16, "The extract
  still covers Leiria and Lisbon only.") becomes: "Any country. The packaged OSM extract covers
  Leiria and Lisbon offline; every other `place_id` resolves live at `/check` and `/tasks`
  (T-61, T-62)." The `Place` doc comment (lines 6–8) drops "must resolve in the cached OSM
  extract (T-22)" in favour of "must resolve to an OpenStreetMap object with a business tag".
  No schema field changes.
- In `packages/shared/src/api-contract.ts`, four additions and nothing else:
  1. one new `GenericError` variant, placed directly after the `escrow_post_failed` one:
     ```ts
     /** `POST /check` and `POST /tasks`: the live place lookup did not answer (Overpass timeout, 429 or 5xx). Nothing was posted or charged; retry after `retry_after_s`. */
     z.object({ error: z.literal('place_lookup_unavailable'), retry_after_s: z.number().int() }),
     ```
  2. `check.responses` gains `503: GenericError` (so it reads `{ 200: …, 422: RefusalPayload, 400: InvalidRequest, 503: GenericError }`);
  3. `PublicTaskView` gains, directly after `coordinate_rounded`:
     ```ts
     /** The agent's own words for where the place is (`spec.place.locality` / `country`). Text, never a coordinate; absent on a row posted before T-62. */
     locality: z.string().max(80).optional(), country: z.string().regex(/^[A-Z]{2}$/).optional(),
     ```
  4. `BriefPlace` (line ~203, the worker board's place) gains
     `country: z.string().regex(/^[A-Z]{2}$/).optional()` — so the mini-app can label a
     `call-confirm` price in the place's currency (T-63 produces it, T-64 reads it).
- Run `pnpm docs:gen` and commit the regenerated `docs/api.md` (CI job `docs-generated` diffs it).
  If `docs/mcp-schema.md` also changes, `BLOCKED:` — it should not, and a change there means the
  MCP schema picked up something this brief did not intend.
- In `.env.example`, directly under `DATA_MODE=live`, add two lines with comments:
  ```
  OVERPASS_URL=https://overpass-api.de/api/interpreter   # live place lookup for a place_id outside the packaged extract (T-61/T-62)
  PLACE_LOOKUP=overpass              # overpass | packaged  (packaged = Leiria+Lisbon only, never opens a socket)
  ```
- In `contracts/src/interfaces/IWorkerRegistry.sol:6`, `(Leiria is "ez5ku")` becomes
  `(Leiria is "ez1dp")`. Comment only; the ABI does not change and `forge build` output is
  byte-identical for the compiled artefact.
- Five tests added to `packages/shared/test/schemas.test.ts` (§8).

## 3. Out of scope

- `DemoData` (`packages/shared/src/schemas/demo-data.ts`) keeps `locality: 'Leiria'` and
  `country: 'PT'`. `demo-data.json` is the filmed demo and it stays in Leiria.
- Any runtime code that reads `OVERPASS_URL` or `PLACE_LOOKUP`, answers the 503, or fills
  `locality`/`country` — that is T-62. This PR declares; it does not produce.
- Any mini-app or dashboard copy — T-64, T-65.
- `README.md`, `SKILL.md`, `docs/**` other than the generated `docs/api.md` — T-66 and T-49.
- Do not touch: `packages/shared/src/constants.ts`, `packages/shared/src/enums.ts`,
  `packages/shared/src/schemas/specs.ts`, `packages/shared/src/schemas/demo-data.ts`,
  `contracts/src/**` other than the one comment.

## 4. Owned paths

```
packages/shared/src/schemas/proofs.ts
packages/shared/src/schemas/place.ts
packages/shared/src/api-contract.ts
packages/shared/test/schemas.test.ts
docs/api.md
.env.example
contracts/src/interfaces/IWorkerRegistry.sol
```

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| `CallConfirmProof` | `packages/shared/src/schemas/proofs.ts` | the `price` object shape `{ amount, currency }` |
| `GenericError`, `PublicTaskView`, `ROUTES.check` | `packages/shared/src/api-contract.ts` | the shapes you extend; `apps/api/src/openapi.ts` renders them and `openapi.test.ts` (`everyContractRouteDocumented`) checks every route is documented |
| `pnpm docs:gen` | root `package.json` → `packages/shared/scripts/gen-docs.ts` | regenerates `docs/api.md`; CI job `docs-generated` fails if the committed copy differs |
| `ConfigEnv` | `apps/api/src/config.ts` | read-only reference: T-62 adds the two vars there with the same defaults you document |

## 6. Interfaces produced

| Interface | Where | Consumers |
|---|---|---|
| `CallConfirmProof.price.currency: string /^[A-Z]{3}$/` | `packages/shared/src/schemas/proofs.ts` | T-64 (`AnswerToggle`), `apps/api` proof validation (unchanged code, wider input) |
| `GenericError` variant `place_lookup_unavailable` + `check.responses[503]` | `packages/shared/src/api-contract.ts` | T-62 (`/check`, `hire.ts`), `openapi.ts`, T-66 docs |
| `PublicTaskView.locality?`, `.country?` | `packages/shared/src/api-contract.ts` | T-62 (`apps/api/app/public/_shared.ts`), T-65 (dashboard feed rows) |
| `BriefPlace.country?` | `packages/shared/src/api-contract.ts` | T-63 (`lifecycle.ts` `briefPlace`), T-64 (`lib/currency.ts`) |
| `OVERPASS_URL`, `PLACE_LOOKUP` documented | `.env.example` | T-62 (`apps/api/src/config.ts`), the operator |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-60` — must print `CLAIMED`. Exit 1 means another agent
holds it: stop.

1. Open `packages/shared/src/schemas/proofs.ts`. Replace `z.literal('EUR')` on line 50 with
   `z.string().regex(/^[A-Z]{3}$/, 'ISO-4217 code')`. Do not reorder or reformat anything else.
2. Open `packages/shared/test/schemas.test.ts`. Find the `CallConfirmProof` assertions (around
   line 57) and add the two tests in §8 beside them, using the same `template_id: 'price_of'`,
   `answer: 'price'`, `called_at` shape the existing tests use.
3. Edit the two comments in `packages/shared/src/schemas/place.ts` exactly as §2 says.
4. Edit `packages/shared/src/api-contract.ts`: the `GenericError` variant, the `503` on
   `check`, the two `PublicTaskView` fields, the `BriefPlace.country` field. Then `pnpm docs:gen` from the repo root and check
   `git status` shows `docs/api.md` changed and `docs/mcp-schema.md` unchanged.
5. Run `pnpm --filter @legwork/api test -- openapi` — `everyContractRouteDocumented` and
   `openapiValidates` must stay green with the contract change (you are not editing
   `apps/api`; this is a read of the consumer).
6. Edit `.env.example` — two lines, placed under `DATA_MODE=live`, matching the file's column
   alignment for comments.
7. Edit the Solidity comment. Run `forge fmt --check` in `contracts/` — a comment change must
   not trip the formatter.
8. Run §9. Paste the output into the PR. `gh pr ready`.

## 8. Acceptance tests

| Test / command | Asserts |
|---|---|
| `callConfirmPriceAcceptsAnyIsoCurrency` | `CallConfirmProof.parse({ template_id: 'price_of', answer: 'price', price: { amount: 12, currency: 'GBP' }, called_at: '2026-09-11T10:00:00Z' })` succeeds, and the same with `'EUR'`, `'USD'`, `'JPY'` |
| `callConfirmPriceRejectsLowercaseOrLongCode` | `safeParse` with `currency: 'eur'` fails; with `'EURO'` fails; with `''` fails |
| `genericErrorKnowsPlaceLookupUnavailable` | `GenericError.parse({ error: 'place_lookup_unavailable', retry_after_s: 30 })` succeeds; without `retry_after_s` fails |
| `publicTaskViewCarriesOptionalLocality` | a valid `PublicTaskView` object parses with and without `{ locality: 'Berlin', country: 'DE' }`; `country: 'de'` fails |
| `workerBriefPlaceCarriesOptionalCountry` | `WorkerBrief.parse({ place: { name: 'x', street_address: 'y', locality: 'z', country: 'DE' } })` succeeds; without `country` succeeds; `country: 'Germany'` fails |
| `pnpm --filter @legwork/shared test` | the whole suite stays green — `freeze.test.ts` in particular, which guards the frozen surface |
| `pnpm --filter @legwork/api test -- openapi` | `openapiValidates`, `everyContractRouteDocumented`, `openapiDeterministic` green against the new contract |
| `git diff --exit-code docs/api.md` after `pnpm docs:gen` | clean — the committed generated doc matches the generator |
| `forge fmt --check` (in `contracts/`) | clean |
| `bash scripts/ci/banned-words.sh` | clean |

## 9. Verification commands

```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/shared test
pnpm --filter @legwork/shared typecheck
pnpm docs:gen && git diff --exit-code docs/api.md docs/mcp-schema.md && echo docs-generated-clean
pnpm --filter @legwork/api test -- openapi
(cd contracts && forge fmt --check && forge build)
bash scripts/ci/banned-words.sh
git diff --stat origin/main -- . ':!docs/plan'
```

Expected: shared suite green including the five new tests; `docs-generated-clean` printed; the
openapi suite green; `forge fmt --check` silent; the diff touches exactly the seven owned files.

## 10. Hard rules

- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`,
  `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives
  **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). Nothing here touches
  money, and nothing here may start to.
- No secrets in code or client bundles; `.env.example` gets variable names and public defaults
  only — the Overpass URL is public.
- Tests never call a live model or a live chain.
- **This is the one lane allowed to edit frozen interfaces.** Change exactly what §2 lists. A
  wider "while I am here" edit to `packages/shared` is the failure mode this brief exists to
  prevent.
- `EUR` must keep parsing: every existing call-confirm proof in the database and every fixture
  carries it.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`,
      `commit-trailers`, `claim`, `secrets`, `no-live-llm`, `docs-generated`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] PR carries the `interface-change` label.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-60 — Interface change — ISO currency, place-lookup env vars, stale geohash comment
owned-paths:
  - packages/shared/src/schemas/proofs.ts
  - packages/shared/src/schemas/place.ts
  - packages/shared/src/api-contract.ts
  - packages/shared/test/schemas.test.ts
  - docs/api.md
  - .env.example
  - contracts/src/interfaces/IWorkerRegistry.sol
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it. In
particular: if `freeze.test.ts` asserts the literal `'EUR'` shape, that assertion is part of the
frozen surface this PR is allowed to update — update it and say so in the PR body under
"Scope confirmed". If it asserts something you did not expect to change, stop and ask.

## 14. Reviewer notes

1. `git diff origin/main -- packages/shared/src` should be seven hunks: one regex, two comments
   in `place.ts`, and four in `api-contract.ts` (variant, `503`, two public fields, one brief
   field). Any eighth hunk is out of scope.
2. `'EUR'` still parses — check the test covers it, not just `GBP`.
3. `docs/api.md` changed only where `/check` and `PublicTaskView` are rendered. A larger diff
   means the generator was stale before this PR — say so in the PR, do not hide it.
4. The Solidity change is a comment; confirm `forge build` did not change the artefact hash.

## 15. Round 2+

Empty on first dispatch.
