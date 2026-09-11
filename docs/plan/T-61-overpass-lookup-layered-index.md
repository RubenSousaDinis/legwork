---
id: T-61
title: Live Overpass lookup and a layered PlaceIndex, so any OSM id can resolve
lane: C
day: 8                               # added Sept 11, when the operator chose to take Legwork beyond Leiria
size: M
agent_class: C                       # every test injects a fake fetch; nothing here opens a socket in CI
must: true                           # T-62 cannot start until this merges
depends_on: []
owned_paths:
  - packages/screening/src/osm/**
  - packages/screening/src/gate/place-index.ts
  - packages/screening/src/gate/reasons.ts
  - packages/screening/src/index.ts
  - packages/screening/test/overpass-lookup.test.ts
  - packages/screening/test/layered-index.test.ts
  - packages/screening/test/osm-placeindex.test.ts
  - packages/screening/README.md
labels: [area:screening, wave:8, size:M, agent:cloud]
branch: t-61/overpass-lookup-layered-index
---

# T-61 — Live Overpass lookup and a layered PlaceIndex, so any OSM id can resolve

## 1. Context

Today the gate resolves a `place_id` against one file: `packages/screening/fixtures/osm/leiria-lisbon.json.gz`,
read through `OsmPlaceIndex` in `packages/screening/src/osm/placeIndex.ts`. That file is a
cached Overpass extract of business POIs in **Leiria and Lisbon only**. An id outside it comes
back `undefined` from `resolve()`, the gate answers `region not covered`, and
`apps/api/src/services/hire.ts` turns that into `400 unresolvable place_id`. On 2026-09-09 a
task at a vet in Leiria could not be posted because the vet was not in the extract; T-59 proved
the gap with a pharmacy in Coimbra (`node/536546148`).

The operator has decided Legwork goes international: **a `place_id` anywhere OpenStreetMap
knows resolves.** The design is packaged-first, live-fallback:

1. the packaged extract answers first, offline, exactly as today;
2. when it has no answer, the API (T-62) makes **one** Overpass request for that single id,
   gets the element's tags and centre, and screens the envelope against a `PlaceIndex` that
   has that one extra POI layered over the packaged one.

`PlaceIndex` (`packages/screening/src/gate/place-index.ts`) is **synchronous** and the gate
in `schema-checks.ts` calls it five times per envelope. It stays synchronous. This task builds
the two pieces the API needs to keep it that way: an async **lookup** that fetches one POI,
and a sync **layered index** that overlays fetched POIs on the packaged index. Wiring them into
`/check` and `/tasks` is T-62's job, not this one's.

`buildExtract.ts` already knows how to turn an Overpass element into a `Poi` — its private
`toPoi`. This task exports that function and reuses it; a second copy of the tag rules would
drift from the extract.

## 2. Exact scope

- **Export `poiFromElement`** from `packages/screening/src/osm/buildExtract.ts`: rename the
  private `toPoi(element: unknown): Poi | undefined` and export it. `buildExtract` keeps calling
  it. Behaviour unchanged.
- **New `packages/screening/src/osm/overpassLookup.ts`** exporting:
  ```ts
  export type LookupResult =
    | { kind: 'found'; poi: Poi }
    | { kind: 'not_found' }                    // 200 with no usable element, or a non-business element
    | { kind: 'unavailable'; status?: number }; // non-200, network error, timeout, unparsable body
  export type OverpassLookup = (placeId: string) => Promise<LookupResult>;
  export interface OverpassLookupOptions {
    endpoint: string;                          // e.g. https://overpass-api.de/api/interpreter
    fetch?: typeof fetch;                      // injected in tests; defaults to globalThis.fetch
    timeoutMs?: number;                        // default 8000
    userAgent?: string;                        // default 'legwork-place-lookup/1.0 (+https://github.com/RubenSousaDinis/legwork)'
    now?: () => number;                        // for cache TTL tests
  }
  export function createOverpassLookup(opts: OverpassLookupOptions): OverpassLookup;
  ```
  Rules:
  - An id that does not match `OSM_PLACE_ID` (`/^(node|way|relation)\/\d+$/` from
    `@legwork/shared`) returns `not_found` **without** a request.
  - The query is exactly `[out:json][timeout:10];<type>(<id>);out center tags;` where `<type>`
    and `<id>` come from the id (`node/536546148` → `node(536546148)`), sent as `POST` with
    `content-type: application/x-www-form-urlencoded`, body `data=<query>`, headers `accept:
    application/json` and `user-agent` — the same shape `scripts/osm-extract.ts` uses.
  - `AbortController` timeout at `timeoutMs`. A timeout is `unavailable`.
  - HTTP status other than 200 → `unavailable` with that `status`. 429 is `unavailable`, not
    `not_found`: rate limiting is not evidence the place does not exist.
  - 200 whose body is not JSON, has no `elements` array, or whose first element does not turn
    into a `Poi` through `poiFromElement` (no business tag, no coordinate) → `not_found`.
  - **Phone rule for looked-up POIs:** after `poiFromElement`, if `poi.phone` exists and does
    not start with `+`, delete it. `normalizePhone` adds `+351` to a bare nine-digit number
    because the packaged extract is Portuguese; a looked-up POI can be anywhere, so only a
    number the mapper wrote in international form is trusted. `call-confirm` on such a place
    is then refused with `phoneMissing`, which is the honest answer.
  - **In-memory cache**, keyed by id: `found` for 86400 s, `not_found` for 600 s, `unavailable`
    never cached. At most 1000 entries; evict the oldest insertion when full. The cache is per
    `createOverpassLookup` call (module-level state is not acceptable — tests create many).
  - **One request per call.** No retry, no loop, no second query. Overpass is a shared community
    service and its usage policy is the reason.
- **New `packages/screening/src/osm/layeredIndex.ts`** exporting
  `class LayeredPlaceIndex implements PlaceIndex` with `constructor(base: PlaceIndex, extra: Poi[])`.
  Every method asks `base` first and, when `base.resolve(id)` is `undefined`, answers from an
  internal `JsonPlaceIndex.fromJson({ region: 'live-lookup', generated_at: <ISO>, attribution:
  ATTRIBUTION, pois: extra })`. Delegation, not re-implementation: `isBusiness`,
  `isResidential`, `fuzzyMatch`, `phoneOf`, `coordinateOf` on the extra layer must be the
  `JsonPlaceIndex` ones, so the extract and a looked-up POI are judged by the same rules.
- **`REASONS.regionNotCovered`** in `packages/screening/src/gate/reasons.ts` becomes
  `'place_id not found in OpenStreetMap'`. The key stays `regionNotCovered` (the corpus test
  `regionNotCoveredRow17` and `apps/api` reference the key). The old string
  `'region not covered'` also appears in: `placeIndex.ts:92–93` (`checkDemoPlace`'s reason
  literal and its type), `packages/screening/test/osm-placeindex.test.ts:62` and `:98` (two
  assertions), `packages/screening/README.md:92`, `packages/screening/src/osm/README.md:14`,
  and the comment at `buildExtract.ts:17`. Update every one of those to the new text. Leave
  `scripts/osm-extract.ts:43`, `packages/shared/src/schemas/refusal.ts:7` and `docs/mcp.md:204`
  alone — they are outside your paths (T-66 and the lead own them).
- **Comments**: `place-index.ts:16` ("There is no live geocoder on any path") and
  `placeIndex.ts:74–77` ("it never reaches the network") describe the packaged index only. Say
  so: "The packaged index never reaches the network. A single-id live lookup exists in
  `overpassLookup.ts`; the API decides whether to use it (T-62)."
- Export the two new modules from `packages/screening/src/index.ts`.
- `packages/screening/README.md`: a short section "Place resolution: packaged first, live
  fallback" naming the two modules, the cache TTLs, the phone rule and the one-request rule.

## 3. Out of scope

- Calling the lookup from the gate, `hire.ts`, `/check` or `/tasks` — **T-62**. This package
  still never opens a socket on its own; the lookup is a function the API chooses to call.
- Widening or regenerating the packaged extract; `scripts/osm-extract.ts`; the bounding boxes.
- Searching by name. The lookup takes an id it is given. Finding an id from a name is what the
  Bazantic Overpass gateway (T-59) is for.
- Any change to `packages/screening/src/gate/schema-checks.ts`, `pipeline.ts`, `person.ts`,
  `rules.ts`, the classifier, `fixtures/**`, `corpus.json`.
- Do not touch: `packages/shared/**`, `apps/**`, `scripts/**`.

## 4. Owned paths

```
packages/screening/src/osm/**
packages/screening/src/gate/place-index.ts
packages/screening/src/gate/reasons.ts
packages/screening/src/index.ts
packages/screening/test/overpass-lookup.test.ts
packages/screening/test/layered-index.test.ts
packages/screening/test/osm-placeindex.test.ts
packages/screening/README.md
```

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| `PlaceIndex`, `Poi`, `JsonPlaceIndex`, `normalizePhone` | `packages/screening/src/gate/place-index.ts` | the sync contract you implement; the JSON index you delegate to |
| `toPoi` (private, becomes `poiFromElement`) | `packages/screening/src/osm/buildExtract.ts` | element → `Poi`, business tags only, `center` for ways/relations |
| `ATTRIBUTION` | `packages/screening/src/osm/buildExtract.ts` | `© OpenStreetMap contributors, ODbL` — imported, never retyped |
| `OSM_PLACE_ID` | `packages/shared/src/schemas/place.ts` | the id shape; anything else is `not_found` without a request |
| Overpass request shape | `scripts/osm-extract.ts:74–83` | POST form body, `user-agent`, `accept` — read it, copy the shape |

## 6. Interfaces produced

| Interface | Where | Consumers |
|---|---|---|
| `createOverpassLookup`, `OverpassLookup`, `LookupResult` | `packages/screening/src/osm/overpassLookup.ts` | T-62 (`apps/api/src/services/hire.ts`) |
| `LayeredPlaceIndex` | `packages/screening/src/osm/layeredIndex.ts` | T-62 |
| `poiFromElement` | `packages/screening/src/osm/buildExtract.ts` | `overpassLookup.ts`, T-63's catalog check script |
| `REASONS.regionNotCovered = 'place_id not found in OpenStreetMap'` | `packages/screening/src/gate/reasons.ts` | dashboard screening log, `apps/api` |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-61` — must print `CLAIMED`. Exit 1 means another agent
holds it: stop.

1. Read `place-index.ts` (the interface and `JsonPlaceIndex`), `buildExtract.ts` (`toPoi`) and
   `scripts/osm-extract.ts:66–101` (`fetchBox`) in full before writing anything.
2. Rename `toPoi` → `poiFromElement`, export it, run the existing suite
   (`pnpm --filter @legwork/screening test`) — `osm-extract.test.ts` must stay green.
3. Write `layeredIndex.ts` first: it is pure and its tests need no fetch. Build the extra layer
   through `JsonPlaceIndex.fromJson`, do not reimplement matching.
4. Write `overpassLookup.ts`. Take `fetch` from options; tests pass a function that returns a
   `Response` built with `new Response(JSON.stringify(body), { status })`. For the timeout test,
   pass a fetch that never resolves and `timeoutMs: 20`.
5. Change `REASONS.regionNotCovered` and the literal in `checkDemoPlace`. Run the corpus test —
   `regionNotCoveredRow17` asserts on the key or the row outcome, not the prose; if it asserts on
   the prose, update the assertion to the new text and say so in the PR.
6. Comments, `index.ts` exports, README section.
7. Run §9. Paste the output into the PR. `gh pr ready`.

## 8. Acceptance tests

All in `packages/screening/test/overpass-lookup.test.ts` unless noted. Every test injects
`fetch`; a test that reaches the network is a failed test.

| Test / command | Asserts |
|---|---|
| `lookupResolvesNodeById` | fake fetch answers 200 `{elements:[{type:'node',id:536546148,lat:40.2104,lon:-8.4192,tags:{amenity:'pharmacy',name:'Farmácia Adriana','addr:street':'Rua …'}}]}`; result is `found` with `poi.id === 'node/536546148'`, `poi.name`, `poi.lat`/`lon` rounded to 7 decimals |
| `lookupResolvesWayByCenter` | element `{type:'way', id: 7, center:{lat,lon}, tags:{shop:'bakery'}}` → `found`, `poi.id === 'way/7'`, coordinate from `center` |
| `lookupSendsExactlyOneRequestWithTheIdQuery` | the fake fetch records calls; one call; body decodes to `data=[out:json][timeout:10];node(536546148);out center tags;`; `user-agent` header present |
| `lookupIsNotFoundOnEmptyElements` | 200 `{elements:[]}` → `not_found` |
| `lookupIsNotFoundForAnElementWithoutABusinessTag` | 200 with `{type:'node', tags:{building:'house'}, lat, lon}` → `not_found` (residential is not resolvable, same as the extract) |
| `lookupIsNotFoundForABadIdWithoutARequest` | `'foo/1'` and `'node/abc'` → `not_found`; fake fetch called zero times |
| `lookupIsUnavailableOn429` | 429 → `{kind:'unavailable', status: 429}` |
| `lookupIsUnavailableOnTimeout` | fetch never resolves, `timeoutMs: 20` → `unavailable` |
| `lookupIsUnavailableOnNetworkError` | fetch rejects → `unavailable` |
| `lookupDropsBareLocalPhone` | tags `{phone:'244 000 000', shop:'x'}` → `found` and `poi.phone === undefined` |
| `lookupKeepsInternationalPhone` | tags `{phone:'+44 20 7946 0000', shop:'x'}` → `poi.phone === '+442079460000'` |
| `lookupCachesAFoundId` | two calls for the same id → one fetch call |
| `lookupDoesNotCacheUnavailable` | fetch answers 503 then 200 → second call is `found`; two fetch calls |
| `lookupExpiresNotFoundAfterTenMinutes` | `now` injected: `not_found` at t=0, advance 601 s, second call fetches again |
| `layeredIndexPrefersBase` (in `layered-index.test.ts`) | base has `node/1`, extra has a different `node/1`; `resolve('node/1')` is the base one |
| `layeredIndexFillsFromExtra` | base lacks `node/2`; extra has it; `resolve`, `isBusiness`, `coordinateOf` answer from extra |
| `layeredIndexFuzzyMatchesExtraPoi` | `fuzzyMatch('node/2', 'Farmacia Adriana', 'Rua X 1')` on an extra POI named `Farmácia Adriana` with street `Rua X` is `ok: true` — the same normalisation the extract gets |
| `layeredIndexResidentialExtraIsResidential` | extra POI `{tags:{building:'house'}}` → `isResidential` true, `isBusiness` false |
| `layeredIndexEmptyExtraIsTheBase` | `new LayeredPlaceIndex(base, [])` answers identically to `base` for a packaged id and an unknown id |
| `pnpm --filter @legwork/screening test` | whole suite green, corpus included |

## 9. Verification commands

```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/screening test
pnpm --filter @legwork/screening typecheck
pnpm --filter @legwork/screening lint
bash scripts/ci/banned-words.sh
rg -n "region not covered" packages/screening   # expect: no matches
```

Expected: suite green with every §8 test present by name; typecheck and lint clean; the old
reason string appears nowhere under `packages/screening`.

## 10. Hard rules

- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`,
  `Brooklyn`, `24h`, `2.55`, `21 workers`. Write the cache TTL as `86400` seconds or "24 hours",
  never the banned token.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives
  **3.00**, fee **0.45**. Nothing here touches money.
- No secrets. The Overpass endpoint is a public URL passed in by the caller.
- **Tests never open a socket.** Every test injects `fetch`. CI has no network guarantee and
  Overpass would rate-limit it anyway.
- **One request per lookup call, no retry.** Overpass's usage policy asks people not to build
  services that hammer the public instances. The API's 503 (T-62) is the retry mechanism — the
  agent retries, not this code.
- **Never trust a bare local phone number from a looked-up POI.** `+`-prefixed only.
- **ODbL attribution is not optional.** The extra layer's `attribution` is `ATTRIBUTION`
  imported from `buildExtract.ts`, never retyped.
- `LayeredPlaceIndex` must delegate to `JsonPlaceIndex` for the extra layer. A second copy of
  the business-tag set or the Levenshtein threshold is a reviewer `BLOCKING:`.
- This package still exports nothing that opens a socket on import or at module load.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`,
      `commit-trailers`, `claim`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `packages/screening/README.md` has the new section.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-61 — Live Overpass lookup and a layered PlaceIndex, so any OSM id can resolve
owned-paths:
  - packages/screening/src/osm/**
  - packages/screening/src/gate/place-index.ts
  - packages/screening/src/gate/reasons.ts
  - packages/screening/src/index.ts
  - packages/screening/test/overpass-lookup.test.ts
  - packages/screening/test/layered-index.test.ts
  - packages/screening/test/osm-placeindex.test.ts
  - packages/screening/README.md
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it.
Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and
`apps/api/src/db/schema.ts` are frozen. Dependencies: `DEP REQUEST:` — you need none; `fetch`
and `AbortController` are Node built-ins. Env vars: none read here; the endpoint is an option.

If a test outside your owned paths asserts the literal `'region not covered'` (for example
under `apps/api/test/`), do **not** edit it: comment `BLOCKED: apps/api/test/<file> asserts the
old reason text` and stop. The lead will decide whether to fold that assertion into T-62.
(As of this brief, no file under `apps/` carries the literal — `rg` found none.)

`packages/screening/test/osm-placeindex.test.ts` is shared with T-59, which may still be open
when you start. If your rebase onto `main` conflicts there, keep both sides: T-59's new tests
and your two updated assertions.

## 14. Reviewer notes

1. `overpass-lookup.test.ts`: every test passes a `fetch`. Grep the test file for
   `globalThis.fetch` or a bare `fetch(` — either one is a live call in CI.
2. The request body: exactly one query, exactly `out center tags;`. A `nwr` or a bbox is the
   extract's query, not a single-id lookup.
3. `layeredIndex.ts` should be under ~60 lines and import `JsonPlaceIndex`. If it contains a
   tag list or a Levenshtein call, it re-implemented the rules.
4. The phone rule: `lookupDropsBareLocalPhone` is the load-bearing test. Without it a bakery
   in Berlin with `phone=030 1234567` would be stored as `+351030…` and `call-confirm` would
   match a wrong number.

## 15. Round 2+

Empty on first dispatch.
