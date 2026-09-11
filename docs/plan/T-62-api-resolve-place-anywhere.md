---
id: T-62
title: The API resolves a place anywhere — live fallback in /check and /tasks
lane: B
day: 8                               # added Sept 11, when the operator chose to take Legwork beyond Leiria
size: M
agent_class: C                       # the lookup is injected as a fake in every test; no socket in CI
must: true                           # the product claim "anywhere" rests on this PR
depends_on: [T-60, T-61]             # T-60 declares the 503 and the two public fields; T-61 builds the lookup and the layered index
owned_paths:
  - apps/api/src/services/hire.ts
  - apps/api/src/services/hire.test.ts
  - apps/api/src/config.ts
  - apps/api/src/errors.ts
  - apps/api/test/config.test.ts
  - apps/api/test/unresolvable-place.test.ts
  - apps/api/test/place-lookup.test.ts
  - apps/api/app/check/route.ts
  - apps/api/app/public/_shared.ts
  - apps/api/test/routes/public.test.ts
  - apps/api/src/openapi.ts
  - apps/api/src/openapi.test.ts
  - apps/api/README.md
labels: [area:api, wave:8, size:M, agent:cloud]
branch: t-62/api-resolve-place-anywhere
---

# T-62 — The API resolves a place anywhere — live fallback in /check and /tasks

## 1. Context

`apps/api/src/services/hire.ts` is where a `place_id` lives or dies. `screener()` (line ~680)
binds the screening pipeline to `getPlaceIndex()`, the packaged Leiria+Lisbon extract, and
`screenEnvelope()` (line ~252) runs the gate against it. If the gate says
`spec.place.place_id` is bad and the index cannot `resolve()` it, the outcome is
`{ kind: 'invalid', reason: 'unresolvable place_id <id>' }` → **400**, on both `POST /check`
and the paid `POST /tasks`. The same check happens a second time in `placeOf()` after the gate
passes, to get the coordinate that becomes `tasks.exact_lat/lon` and the geohash-5 `area`.

T-61 gave this package two tools: `createOverpassLookup(...)` (async, one request for one id,
cached, answers `found | not_found | unavailable`) and `LayeredPlaceIndex(base, extra)` (sync,
packaged first, then the looked-up POIs). This task wires them in so that:

- a `place_id` **in** the packaged extract behaves exactly as today and never triggers a
  request;
- a `place_id` **outside** it is looked up **once**, and if Overpass knows a business there, the
  gate screens the envelope against it — same rules, same refusals, same fuzzy match;
- if Overpass says nothing is there, the answer stays **400 `unresolvable place_id`**;
- if Overpass does not answer (timeout, 429, 5xx), the answer is a new **503
  `place_lookup_unavailable`** with `retry_after_s: 30` — never a mark, never a task, nothing
  charged. Lying with a 400 here would tell an agent a real shop does not exist.

Nothing about privacy changes: the looked-up coordinate is private
(`exact_lat/lon`) and the public surface still gets the geohash-5 `area` and the 3-decimal
rounded coordinate. One public addition, declared by T-60: `PublicTaskView.locality` and
`.country`, copied from the agent's own `spec.place` text, so the dashboard can print
"Berlin · DE" beside a row.

On `POST /tasks`, screening runs at step 4 of `hire()`, **after** x402 `verify` and **before**
`post` and `settle` (`hire.ts:370–415`). So a 503 there costs nobody anything: the
authorization was verified, not settled, and `deps.idem.release(nonce)` must run exactly as
it does on the `invalid` path so the same authorization can be sent again.

## 2. Exact scope

- **Config** (`apps/api/src/config.ts`, inside `ConfigEnv` under `// -- API --`):
  ```ts
  /** Where a place_id outside the packaged extract is looked up. Public URL, no key. */
  OVERPASS_URL: z.string().url().default('https://overpass-api.de/api/interpreter'),
  /** `packaged` never opens a socket and covers Leiria+Lisbon only; `overpass` adds the one-request live fallback (T-61). */
  PLACE_LOOKUP: z.enum(['packaged', 'overpass']).default('overpass'),
  ```
- **Errors** (`apps/api/src/errors.ts`): add `unavailable: 503` to `ERROR_CODES`. (`ApiError`
  cannot carry a header, so the two routes below build the 503 `Response` themselves — see the
  `422` branch in `check/route.ts` for the pattern.)
- **`ScreenEnvelopeDeps`** gains `lookup?: OverpassLookup` (type from `@legwork/screening`).
- **`ScreenOutcome`** gains a fourth member:
  `{ kind: 'unavailable'; spec_hash: Hex; field: 'spec.place.place_id'; retry_after_s: number }`.
- **`screenEnvelope()`**, before `screen()` runs:
  1. `const placeId = placeIdFromBody(body)` (the helper already exists at ~line 317).
  2. If `placeId` is defined, matches `OSM_PLACE_ID`, `taskTypeOf(body) !== 'compare-two'`,
     `deps.places.resolve(placeId) === undefined`, and `deps.lookup` is set → `const result =
     await deps.lookup(placeId)`.
  3. `found` → `places = new LayeredPlaceIndex(deps.places, [result.poi])` and use `places`
     for `screen(...)`, the `unresolvable` check, and `placeOf(...)` — **all three**, or the
     gate will accept a place the coordinate step then cannot find.
  4. `unavailable` → return `{ kind: 'unavailable', spec_hash, field: 'spec.place.place_id', retry_after_s: 30 }` and stop.
  5. `not_found` → carry on with the packaged index; the existing 400 path fires.
  Everything after that is unchanged.
- **`screener()`**: when `getConfig().PLACE_LOOKUP === 'overpass'`, pass
  `lookup: getLookup()` — a module-level singleton from `createOverpassLookup({ endpoint:
  config.OVERPASS_URL, userAgent: 'legwork-api/1.0 (place lookup; +https://github.com/RubenSousaDinis/legwork)' })`,
  created once per process like `cachedClassifier`. When `'packaged'`, pass no lookup.
- **`hire()`** (`POST /tasks`): a new branch beside `verdict.kind === 'invalid'`:
  `await deps.idem.release(nonce)`; `logScreening` with `class: null`, `rule_id:
  'lookup.unavailable'`, `reason: 'place lookup unavailable'`, `marked: false`; `logDecision({
  ...common, decision: 'unavailable' })`; return
  `Response.json({ error: 'place_lookup_unavailable', retry_after_s: 30 }, { status: 503,
  headers: { 'retry-after': '30' } })`. No `post`, no `settle`, no mark.
- **`POST /check`**: the same branch, same body, same header, `payer: null`.
- **`PublicTaskView`** (`apps/api/app/public/_shared.ts`): add `locality?: string; country?:
  string` to the interface, and in `publicTaskView()` copy them from
  `(row.specJson as { place?: { locality?: string; country?: string } }).place` when both are
  strings. Nothing else from `specJson` — the allowlist rule stands.
- **OpenAPI** (`apps/api/src/openapi.ts`): `STATUS_DESCRIPTIONS[503]` becomes `'The chain, the
  relayer or the live place lookup did not answer; the call is worth retrying.'`. The contract
  (`packages/shared/src/api-contract.ts`, T-60) already lists the 503 on `/check`, so the
  rendered document picks it up — assert it (§8).
- **`apps/api/README.md`**: a "Place resolution" section: packaged-first, live-fallback, the
  two env vars, the three outcomes with their status codes, the sentence "a 503 never marks
  and never posts".
- The seeded rows T-63 inserts do not go through this path; nothing here changes for them.

## 3. Out of scope

- Anything in `packages/screening/**` — T-61 built the tools; if one is missing a method, that
  is a `BLOCKED:` on this PR, not a patch there.
- Searching by name, geocoding an address, or any Overpass query other than the one T-61 makes.
- The seed catalog, the worker board, the claim route — T-63.
- Mini-app and dashboard — T-64, T-65. Docs outside `apps/api/README.md` — T-66.
- Changing the 400 wording for a place Overpass confirms does not exist: it stays
  `unresolvable place_id <id>`.
- Do not touch: `apps/api/src/db/schema.ts`, `packages/shared/**`, `apps/api/app/tasks/**`
  (the `/tasks` route file is a one-line mount; the change is in `hire.ts`).

## 4. Owned paths

```
apps/api/src/services/hire.ts
apps/api/src/services/hire.test.ts
apps/api/src/config.ts
apps/api/src/errors.ts
apps/api/test/config.test.ts
apps/api/test/unresolvable-place.test.ts
apps/api/test/place-lookup.test.ts
apps/api/app/check/route.ts
apps/api/app/public/_shared.ts
apps/api/test/routes/public.test.ts
apps/api/src/openapi.ts
apps/api/src/openapi.test.ts
apps/api/README.md
```

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| `createOverpassLookup`, `OverpassLookup`, `LookupResult` | `packages/screening/src/osm/overpassLookup.ts` (T-61) | one async call per id; `found \| not_found \| unavailable` |
| `LayeredPlaceIndex` | `packages/screening/src/osm/layeredIndex.ts` (T-61) | sync `PlaceIndex` over packaged + looked-up POIs |
| `getPlaceIndex`, `screen`, `PlaceIndex` | `@legwork/screening` | unchanged |
| `OSM_PLACE_ID` | `packages/shared/src/schemas/place.ts` | the id shape gate |
| `GenericError` variant `place_lookup_unavailable`, `check.responses[503]`, `PublicTaskView.locality/country` | `packages/shared/src/api-contract.ts` (T-60) | the wire shapes you produce |
| `hire()` step order | `apps/api/src/services/hire.ts:370–415` | verify → **screen** → post → settle; `idem.release(nonce)` on any non-post exit |
| `ApiError`, `ERROR_CODES` | `apps/api/src/errors.ts` | the vocabulary; you add one code |
| Test bench | `apps/api/test/unresolvable-place.test.ts:60–130` | how `hire()` is driven with `FakeChain`, `FakeFacilitator`, pglite — copy this bench for `place-lookup.test.ts` |

## 6. Interfaces produced

| Interface | Where | Consumers |
|---|---|---|
| `POST /check` and `POST /tasks` → 503 `{ error: 'place_lookup_unavailable', retry_after_s: 30 }` + `retry-after: 30` | `check/route.ts`, `hire.ts` | agents, T-66 docs, the MCP `hire_human` (reads the body as-is) |
| A `place_id` outside the packaged extract is accepted when Overpass knows a business there | `hire.ts` | every agent; T-63's catalog check script; T-65/T-66 copy |
| `PublicTaskView.locality`, `.country` on `/public/feed` and `/public/task/:id` | `app/public/_shared.ts` | T-65 |
| `OVERPASS_URL`, `PLACE_LOOKUP` | `config.ts` | the operator; `.env.example` (T-60) |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-62` — must print `CLAIMED`. Exit 1 means another agent
holds it or T-60/T-61 has not merged: stop.

1. Read `hire.ts` lines 130–330 (types, `screenEnvelope`, `placeOf`, `placeIdFromBody`) and
   360–420 (the `hire()` screening step) before changing anything. Read T-61's two modules.
2. Config and errors first; run `pnpm --filter @legwork/api test -- config` — the existing
   tests must stay green (one asserts the config never echoes a secret; a `.url()` default is
   not a secret).
3. `screenEnvelope`: implement the four-step pre-lookup from §2. Keep it in one small helper,
   `resolvePlaces(body, deps): Promise<{ places: PlaceIndex } | { unavailable: true }>`, so
   the function body stays readable.
4. `hire()` and `check/route.ts`: the `unavailable` branch. Mirror the `invalid` branch line for
   line — release the nonce, log screening, log the decision — then the 503 response.
5. `screener()` + `getLookup()` singleton.
6. `_shared.ts`: the two fields. Then `public.test.ts`'s forbidden-string list
   (`publicNeverLeaksSpecOrExactCoordinate`, ~line 147) still passes: `locality` is not on it,
   and nothing else from `spec_json` may leak.
7. Tests in §8. Build `apps/api/test/place-lookup.test.ts` on the bench in
   `unresolvable-place.test.ts`; the fake lookup is a function you pass as `deps.lookup` that
   records its calls and returns whatever the test says.
8. OpenAPI description + assertion. README section.
9. Run §9. Paste the output into the PR. `gh pr ready`.

## 8. Acceptance tests

`apps/api/test/place-lookup.test.ts` unless noted. `COIMBRA = 'node/536546148'` with the POI
`{ id: COIMBRA, name: 'Farmácia Adriana', tags: { amenity: 'pharmacy', name: 'Farmácia Adriana', 'addr:street': 'Rua …' }, addr: { street: 'Rua …' }, lat: 40.2104, lon: -8.4192 }`
(the street you put in the POI and the one in the spec must fuzzy-match; pick any).

| Test / command | Asserts |
|---|---|
| `checkResolvesAPlaceOutsideThePackagedExtract` | fake lookup → `found` COIMBRA; `POST /check` with a `verify-open` spec for it → **200** `{ accepted: true, price_usdc: 3.45 }` at `amount_usdc: 3.00` |
| `postTasksResolvesAPlaceOutsideThePackagedExtract` | same envelope, paid path through the bench → **201**; the stored row has `area === 'ez4hb'` (that is `ngeohash.encode(40.2104, -8.4192, 5)`; assert the literal), `exactLat/exactLon` equal to the POI, and `/public/task/:id` shows `coordinate_rounded` at 3 decimals and no exact value |
| `checkIs400WhenTheLookupFindsNothing` | fake lookup → `not_found`; **400** `invalid_request`, `field: 'spec.place.place_id'`, `reason` contains `unresolvable place_id` |
| `checkIs503WhenTheLookupIsUnavailable` | fake lookup → `unavailable`; **503** `{ error: 'place_lookup_unavailable', retry_after_s: 30 }`, header `retry-after: 30`; the screening log row has `class: null`, `marked: false`, `rule_id: 'lookup.unavailable'` |
| `postTasksIs503AndChargesNothingWhenTheLookupIsUnavailable` | paid path, fake lookup → `unavailable`; **503**; `bench.posts` empty; `bench.facilitator.settleCalls === 0`; zero rows in `tasks`; a second send of the **same** signed header is not answered `409 in_progress` (the nonce was released) |
| `theLookupIsNotCalledForAPackagedId` | `verify-open` for the Leiria demo pharmacy in the packaged extract → 200; fake lookup call count **0** |
| `theLookupIsNotCalledForCompareTwo` | a valid `compare-two` envelope → 200; fake lookup call count 0 |
| `theLookupIsNotCalledForAMalformedId` | `place_id: 'shop/12'` → 400 from the schema; call count 0 |
| `packagedModeNeverBuildsALookup` | `resetConfigForTests({ PLACE_LOOKUP: 'packaged' })`; `screener()`'s deps carry no `lookup` (export a small `screenerDepsForTests()` or assert through a spy on `createOverpassLookup`) |
| `aResidentialLookedUpPlaceIsStillRefused` | fake lookup → `found` with `tags: { building: 'house' }` → the same `422` `automated reconnaissance` / `place.residential` the packaged path gives |
| `aLookedUpPlaceWithoutAnInternationalPhoneCannotBeCalled` | `call-confirm` on a `found` POI with no `phone` → 400 `spec.phone` `place has no verified phone` |
| `publicTaskViewCarriesLocalityAndCountry` (in `public.test.ts`) | a posted row's `/public/task/:id` and `/public/feed` entries carry `locality: 'Coimbra', country: 'PT'` and still nothing from the forbidden list |
| `configDefaultsToOverpassLookup` (in `config.test.ts`) | with neither var set, `PLACE_LOOKUP === 'overpass'` and `OVERPASS_URL` is the public endpoint; `PLACE_LOOKUP=bogus` fails to parse |
| `openapiListsThe503OnCheck` (in `openapi.test.ts`) | the rendered document has `paths['/check'].post.responses['503']` and its description mentions the place lookup |
| `unresolvablePlaceIsRefused` (existing, `unresolvable-place.test.ts`) | still passes — run it with `deps.lookup` returning `not_found` so it now exercises the fallback's negative path too |

## 9. Verification commands

```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/api test -- place-lookup unresolvable-place public config openapi hire
pnpm --filter @legwork/api typecheck
pnpm --filter @legwork/api lint
bash scripts/ci/banned-words.sh
rg -n "fetch\(" apps/api/test/place-lookup.test.ts   # expect: no matches — the lookup is a fake
```

Expected: every suite green with the §8 names present; typecheck and lint clean; no `fetch(` in
the new test.

## 10. Hard rules

- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`,
  `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives
  **3.00**, fee **0.45**. A 503 moves **no** money: verified is not settled.
- **A 503 never marks.** `class: null`, `marked: false`, and the `abuseMark` dependency is never
  called on that path. Only refusals in one of the six abuse classes mark; a network failure is
  not the agent's fault.
- **A schema error is still a plain 4xx.** Nothing here changes the `invalid` path's status.
- **Privacy:** the looked-up exact coordinate lives in `tasks.exact_lat/lon` only. Public
  surfaces carry `area` (geohash-5), `coordinate_rounded` (3 decimals) and now the agent's own
  `locality`/`country` text. Never the POI's name, phone or tags.
- **Keys:** none involved. `OVERPASS_URL` is a public URL and must never be treated as a secret
  in `config.ts`'s redaction logic.
- **Tests never open a socket.** `deps.lookup` is always a fake in tests; `PLACE_LOOKUP` in the
  test config may stay `overpass` only if `screener()` is not what the test calls.
- **Every chain write goes through `TxQueue`** — unchanged; this task adds no write.
- The `LayeredPlaceIndex` must be used for **all three** reads (`screen`, the `unresolvable`
  check, `placeOf`). A test where the gate passes and `placeOf` returns null is the bug.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`,
      `commit-trailers`, `claim`, `secrets`, `no-live-llm`, `docs-generated`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `apps/api/README.md` has the "Place resolution" section.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-62 — The API resolves a place anywhere — live fallback in /check and /tasks
owned-paths:
  - apps/api/src/services/hire.ts
  - apps/api/src/services/hire.test.ts
  - apps/api/src/config.ts
  - apps/api/src/errors.ts
  - apps/api/test/config.test.ts
  - apps/api/test/unresolvable-place.test.ts
  - apps/api/test/place-lookup.test.ts
  - apps/api/app/check/route.ts
  - apps/api/app/public/_shared.ts
  - apps/api/test/routes/public.test.ts
  - apps/api/src/openapi.ts
  - apps/api/src/openapi.test.ts
  - apps/api/README.md
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it.
Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and
`apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never
patch them. Dependencies: `DEP REQUEST:` — you need none (`ngeohash` is already a dependency
of `apps/api`). Env vars: both are declared by T-60 in `.env.example`; if they are not there,
`BLOCKED: T-60 did not land OVERPASS_URL / PLACE_LOOKUP`.

Specific cases:
- `LayeredPlaceIndex` or `createOverpassLookup` is not exported from `@legwork/screening` →
  `BLOCKED: T-61 export missing: <name>`.
- The contract (`api-contract.ts`) has no `503` on `check` or no `place_lookup_unavailable`
  variant → `BLOCKED: T-60 contract change missing: <which>`; `everyContractRouteDocumented`
  would otherwise fail on your document.
- The MCP package (`packages/mcp`) has a typed error union that rejects the new error string →
  `INTERFACE REQUEST:` with the file and line; do not edit `packages/mcp`.

## 14. Reviewer notes

1. `postTasksIs503AndChargesNothingWhenTheLookupIsUnavailable` is the load-bearing test. Check
   it asserts `settleCalls === 0` **and** the nonce release (second send is not `409
   in_progress`). A 503 that leaves the authorization reserved strands the agent's money for
   the reservation TTL.
2. `screenEnvelope`: find the three reads of the place index after the lookup and confirm all
   three use the layered one. The second `unresolvable` check (the `!verdict.ok` branch) is the
   easy one to miss.
3. `_shared.ts`: `locality`/`country` are the only two keys read from `specJson.place`. If
   `name` or `street_address` sneaks onto the public view, that is raw spec text on a public
   surface.
4. `theLookupIsNotCalledForAPackagedId` — call count must be zero, not "at most one". The
   product promise is that the packaged path never changed.

## 15. Round 2+

Empty on first dispatch.
