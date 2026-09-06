---
id: T-22
title: OSM extract and the PlaceIndex over it
lane: C
day: 2
size: M
agent_class: C
must: true
depends_on: [T-06]                    # T-06 must be MERGED: it owns `PlaceIndex`, `Poi`, `JsonPlaceIndex`, the corpus and `leiria-min.json`
owned_paths:
  - packages/screening/src/osm/**
  - packages/screening/fixtures/osm/leiria-lisbon.json.gz
  - scripts/osm-extract.ts
  - packages/screening/test/osm*.test.ts
  - packages/screening/src/osm/README.md   # the ODbL attribution + extract runbook; T-06's package README links to it
labels: [area:screening, wave:2, size:M, agent:cloud]
branch: t-22/osm-extract
---

# T-22 — OSM extract and the PlaceIndex over it

## 1. Context
Every task envelope names a place, and the gate resolves that place against a **cached** OpenStreetMap extract loaded once at boot — no live geocoder on the filmed path, no network call while a demo is running. T-06 froze the `PlaceIndex` interface and shipped a 12-POI hand-written fixture so the gate could be built without waiting for real data. You produce the real thing: a reproducible Overpass extract of Leiria and Lisbon, and the `PlaceIndex` implementation that reads it. Two product doctrines become mechanical here: coverage (outside the two cities, we refuse rather than guess) and "public facts about businesses only; never a home".

> **10-schemas.md §2 — `place` rules**
> - `place_id` must resolve in the **cached OSM extract** for the covered region (Leiria + Lisbon during the event; loaded at boot, no live geocoder on the filmed path). Anything outside → refuse `region not covered` (the coverage doctrine, made mechanical).
> - The resolved OSM object must carry a business tag (`shop=*`, `amenity=*`, `office=*`, `craft=*`, `healthcare=*`, `tourism=*`). Residential (`building=house|residential|apartments` without a business tag, `landuse=residential`) → refuse `automated reconnaissance` (public facts about businesses only; never a home).
> - `name`/`street_address` must fuzzy-match the resolved object (Levenshtein ≤ 3 on name, street match) or the spec is refused as inconsistent.
> - A person's name anywhere in `name`, `street_address` or any note (named-entity regex + a small PT/EN first-name list) → refuse `automated reconnaissance` / `identity impersonation` depending on the field.
>
> **§2 `place` shape:** `{ place_id: "node/2734018563 | way/104598211", google_place_id?: "stored, never redistributed", name, street_address, locality: "Leiria", country: "PT" }`

> **10-schemas.md §9, step 2 (the step you feed):** "JSON schema, field level: the envelope and the per-type spec (place resolution against the cached extract, business tag, template list, denylist, size caps, floors). A schema failure is an ordinary **4xx with the field named — no mark**." Step 6 uses your coordinates: "~150 m geofence against the coordinate geocoded at post time → auto-dispute."

## 2. Exact scope

### 2.1 `src/osm/buildExtract.ts` — the pure, testable half of the extract
- ```ts
  export type OsmExtract = { region: string; generated_at: string; attribution: string; synthetic_ids: boolean; pois: Poi[]; not_indexed: Poi[] };
  export function buildExtract(overpass: { elements: unknown[]; osm3s?: { timestamp_osm_base?: string } }): OsmExtract;
  export function serializeExtract(x: OsmExtract): string;   // stable key order, no whitespace
  ```
  `Poi` is T-06's type, imported from `src/gate/place-index.ts` — never redeclared: `{ id, name?, tags, addr?: { street?, housenumber?, city? }, phone?, lat, lon }`.
- Per element: `id` in `node/<n>` · `way/<n>` · `relation/<n>` form; `name` from `tags.name`; `addr` from `addr:street` / `addr:housenumber` / `addr:city`; `phone` from `phone` ?? `contact:phone`, normalised to E.164 by the same rules T-06 uses (strip spaces, dots, dashes, parentheses; a 9-digit PT number gets `+351`); `lat`/`lon` from the node's own coordinate or the `center` of a way/relation, rounded to 7 decimals; `tags` = only these keys, everything else dropped: `shop`, `amenity`, `office`, `craft`, `healthcare`, `tourism`, `building`, `landuse`, `name`, `brand`, `opening_hours`, `addr:street`, `addr:housenumber`, `addr:city`, `phone`, `contact:phone`, `website`. Keys outside that list are discarded — `operator`, `contact:email` and friends carry people's names and must not be stored.
- Drop any element with no coordinate, with no keep-listed business tag, or with an `id` that is already present. `region = 'leiria+lisbon'`; `attribution = '© OpenStreetMap contributors, ODbL'`; `synthetic_ids = false`; `not_indexed = []`.
- **Determinism.** `generated_at = overpass.osm3s.timestamp_osm_base ?? '1970-01-01T00:00:00Z'` — never `new Date()`, or every run produces a diff. `pois` sorted by `(node < way < relation, then numeric id ascending)`. Each POI's `tags` object written with sorted keys. `serializeExtract` writes keys in the fixed order above. Same input ⇒ byte-identical output, and a shuffled input array ⇒ the same output.

### 2.2 `scripts/osm-extract.ts` — the only file in this task that touches the network
- Two bounding boxes, hard-coded here and nowhere else (`S,W,N,E`): Leiria `39.68,-8.90,39.82,-8.70`; Lisbon `38.68,-9.25,38.83,-9.08`. Nothing else is covered — that is the point.
- One Overpass query per bbox against `process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter'`, `[out:json][timeout:180]`, `nwr["shop"](bbox); nwr["amenity"](bbox); nwr["office"](bbox); nwr["craft"](bbox); nwr["healthcare"](bbox); nwr["tourism"](bbox); out center tags;`. Up to 3 attempts with 5 s / 15 s backoff; 5 s pause between the two boxes; a non-200 or an empty `elements` array exits non-zero with the endpoint and status printed.
- Merge both responses, call `buildExtract`, `serializeExtract`, `gzipSync(json, { level: 9 })`, write `packages/screening/fixtures/osm/leiria-lisbon.json.gz`. Print POI count, uncompressed bytes, gzipped bytes. If the gzip exceeds `MAX_EXTRACT_BYTES = 5 * 1024 * 1024`, **do not write the file**: exit non-zero telling the operator to tighten a bbox.
- The script queries business tags **only**. Never widen it to residential buildings: a copy of every home in Lisbon is not something this project stores, and the extract would blow the 5 MB budget anyway. An id that is not in the extract resolves to nothing and is refused as `region not covered` — refuse-by-default is the correct outcome.

### 2.3 `src/osm/placeIndex.ts` — `PlaceIndex` over the gzipped extract
- ```ts
  export function loadExtract(path: string): OsmExtract;            // gunzipSync + JSON.parse, boot only, sync
  export class OsmPlaceIndex implements PlaceIndex {
    static fromGzip(path: string): OsmPlaceIndex;
    static fromExtract(x: OsmExtract): OsmPlaceIndex;
    resolve(id: string): Poi | undefined;
    isBusiness(id: string): boolean;
    isResidential(id: string): boolean;
    fuzzyMatch(id: string, name: string, street: string): { ok: boolean; nameDistance: number; streetOk: boolean };
    phoneOf(id: string): string | undefined;
    coordinateOf(id: string): { lat: number; lon: number } | undefined;
  }
  export function getPlaceIndex(): PlaceIndex;                      // memoised singleton
  ```
  The signature above is T-06's frozen `PlaceIndex`, character for character — `fuzzyMatch` takes three positional arguments, not an options object. Do not change it; if you believe it should change, `INTERFACE REQUEST:` and stop.
- Semantics, identical to T-06's `JsonPlaceIndex` (delegate to it internally rather than re-implementing normalisation or Levenshtein — one implementation in the repo, or the corpus and the live gate will disagree): `resolve` undefined ⇒ **region not covered** (T-06's `schema-checks.ts` turns that into `field: 'spec.place.place_id'`, reason `region not covered`, no mark). `isBusiness` = any of `shop|amenity|office|craft|healthcare|tourism`. `isResidential` = (`building ∈ {house, residential, apartments}` or `landuse === 'residential'`) **and** not `isBusiness`. `fuzzyMatch` = `nameDistance ≤ 3` on the normalised names (NFD, diacritics stripped, lowercased, whitespace collapsed, trailing house-number token dropped) **and** `streetOk`. `phoneOf` returns the E.164 string or undefined. `coordinateOf` feeds T-17's `GEOFENCE_M = 150` check and is never serialized by this package — no route, log or fixture built here may emit a lat/lon.
- `getPlaceIndex()` loads `process.env.OSM_EXTRACT_PATH ?? <packaged leiria-lisbon.json.gz>` **once** at first call and caches it. It never fetches. If the gzip is absent it throws a plain `Error` naming the path and the command (`pnpm osm:extract`) — a boot-time wiring failure, never a request-time one.
- `DEMO_PLACE_ID` in `demo-data.json` is a placeholder until the operator supplies the real shop's `node/…` id on Day 2. The loader must **tolerate** it: an unresolvable demo id is `resolve() === undefined`, never a throw, never a startup crash. Export `export function checkDemoPlace(index: PlaceIndex, placeId: string): { ok: boolean; reason?: 'region not covered' | 'not a business' | 'no phone' }` so the operator can verify the real id in one command. Do not edit `demo-data.json` (the lead's).

### 2.4 `packages/screening/src/osm/README.md` — the ODbL attribution and extract runbook
T-06 left the heading empty for you. Fill it with: the ODbL line **"Place data © OpenStreetMap contributors, licensed under the Open Database License (ODbL). https://www.openstreetmap.org/copyright"**; the two bounding boxes; how to regenerate (`pnpm osm:extract`); the keep-listed tag keys and the note that all other tags are dropped; and the sentence "Leiria and Lisbon only — an id outside the extract is refused as `region not covered`, never geocoded live." Change no other line of that file. T-37's repo README quotes this attribution; it must exist verbatim.

## 3. Out of scope
- `fixtures/osm/leiria-min.json` — T-06's, and it stays the fixture every test in this package runs against. Never edit it, never regenerate it, never point a test at your gzip.
- `src/gate/**`, `src/pipeline.ts`, `src/classifier/**`, `fixtures/corpus.json`, `test/corpus.test.ts`, `test/gate*.test.ts` — T-06 and T-21. You read them; you do not change them.
- The 150 m geofence check itself, proof-time reuse detection — T-17. Marking and status codes — T-16/T-19. Google Places, any live geocoder, any address autocomplete — not in this product at all.
- Do not touch: `packages/shared/**`, `packages/screening/package.json`, `demo-data.json`, `apps/**`, `contracts/**`, `subgraph/**`, root configs, lockfile.

## 4. Owned paths
```
packages/screening/src/osm/**
packages/screening/fixtures/osm/leiria-lisbon.json.gz
scripts/osm-extract.ts
packages/screening/test/osm*.test.ts
packages/screening/src/osm/README.md
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `PlaceIndex`, `Poi`, `JsonPlaceIndex` | `packages/screening/src/gate/place-index.ts` | the frozen six methods; `JsonPlaceIndex.fromJson(obj)` for delegation; the fixture wrapper shape `{ region, generated_at, attribution, synthetic_ids, pois, not_indexed }` |
| `levenshtein` | `packages/screening/src/gate/levenshtein.ts` | reached through `JsonPlaceIndex`; do not copy it |
| `screen`, `ScreenDeps`, `ScreenResult` | `packages/screening/src/pipeline.ts` | the end-to-end assertions in §8 |
| `fixtures/osm/leiria-min.json`, `fixtures/corpus.json` | `packages/screening/fixtures/` | rows 17 (`node/900000099`, Porto, in `not_indexed`), 18/19 (`way/900000012`, `building=house`), 31 (phone mismatch), and `node/900000001` Farmácia Central, `amenity=pharmacy`, Rua Direita 12, phone `+351 244 000 000` |
| `GEOFENCE_M = 150` | `packages/shared/src/constants.ts` | context for `coordinateOf`; you do not implement the check |
| `node:zlib`, `node:fs` | Node built-ins | `gzipSync` / `gunzipSync`; no new dependency |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `OsmPlaceIndex`, `getPlaceIndex()`, `loadExtract()`, `checkDemoPlace()` | `packages/screening/src/osm/placeIndex.ts` | T-16 (API boot), T-17 (`coordinateOf` for the geofence), T-36 |
| `buildExtract()`, `serializeExtract()`, `OsmExtract` | `packages/screening/src/osm/buildExtract.ts` | `scripts/osm-extract.ts`, `test/osm-extract.test.ts` |
| `fixtures/osm/leiria-lisbon.json.gz` | `packages/screening/fixtures/osm/` | T-16, the operator's Day-2 demo-id check |
| ODbL attribution block | `packages/screening/src/osm/README.md` | T-37 (repo README) |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-22` — it must print `CLAIMED T-22`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, then `docs/plan/T-06-screening-gate-corpus.md` §2.2/§2.3/§2.6 and the merged `src/gate/place-index.ts`. Confirm `Poi`, `PlaceIndex` and `JsonPlaceIndex.fromJson` exist with those exact names and that `fromJson` tolerates the wrapper's extra keys; if not, `INTERFACE REQUEST:`.
2. `buildExtract.ts` first, with an inline 8-element Overpass response literal in the test as your only input. Get determinism right before anything else.
3. `placeIndex.ts` — gunzip, then delegate every matching method to a `JsonPlaceIndex` built from the parsed extract. Add nothing beyond the six frozen methods plus `checkDemoPlace`.
4. `test/osm-placeindex.test.ts` and `test/osm-extract.test.ts` with the five names in §8, all running against `leiria-min.json` and the inline literal. No network, no gzip fixture needed to pass.
5. `scripts/osm-extract.ts` last. Run it if the sandbox has outbound network; otherwise commit everything else and file the BLOCKED line in §13 so the operator runs it.
6. README `## OSM data`; then the §9 commands.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `osm-placeindex.test.ts › placeIndexResolvesDemoShop` | `OsmPlaceIndex.fromExtract(leiria-min)` → `resolve('node/900000001')` is defined, `isBusiness` true, `isResidential` false, `phoneOf` `'+351244000000'`, `coordinateOf` inside the Leiria bbox, `fuzzyMatch('node/900000001', 'Farmacia Central', 'Rua Direita 12')` → `{ ok: true, nameDistance: 0 }` (accents and the house number must not break it — T-06's `normalizeForMatch` strips diacritics before the distance is taken, so the two spellings are one string; settled in #79's review); `checkDemoPlace(index, 'node/000000000')` → `{ ok: false, reason: 'region not covered' }` without throwing |
| `osm-placeindex.test.ts › residentialRefusedAsReconnaissance` | `way/900000012` → `isResidential` true, `isBusiness` false; corpus row 18's envelope through `screen()` with this index → `kind:'refusal'`, `payload.class === 'automated reconnaissance'`, `payload.rule_id === 'place.residential'`; row 19 (`name: "Casa do João Silva"`) → also `automated reconnaissance` — a person's name in a place field is a refusal, not a fuzzy match |
| `osm-placeindex.test.ts › regionNotCoveredRow17` | `node/900000099` (Porto, in `not_indexed`) → `resolve` undefined, `coordinateOf` undefined; corpus row 17 through `screen()` → `kind:'invalid_request'`, `field:'spec.place.place_id'`, reason `region not covered`, and **no** class (a coverage failure never marks); `not_indexed` entries are never loaded into the index |
| `osm-placeindex.test.ts › phoneMismatchRow31` | corpus row 31 through `screen()` → `kind:'invalid_request'`, `field:'spec.phone'`, reason `phone does not match the place`; `phoneOf('node/900000002')` (no phone tag) is undefined; `+351 244 000 000`, `244000000` and `244 000 000` all normalise to `+351244000000` |
| `osm-extract.test.ts › extractReproducible` | `serializeExtract(buildExtract(sample))` called twice → identical strings; the same call on a **shuffled** `sample.elements` → the identical string; `generated_at` equals `sample.osm3s.timestamp_osm_base` (never the wall clock); a `way` with a `center` keeps its centroid; an element with `operator: 'João Ferreira'` keeps `name` and drops `operator`; an element with no business tag and no coordinate is dropped; `attribution === '© OpenStreetMap contributors, ODbL'` and `synthetic_ids === false` |

## 9. Verification commands
```bash
pnpm --filter @legwork/screening typecheck
pnpm --filter @legwork/screening lint
pnpm --filter @legwork/screening test
pnpm --filter @legwork/screening test -- -t placeIndexResolvesDemoShop
grep -rniE "fetch\(|https?://|axios|undici|overpass" packages/screening/src packages/screening/test | grep -v "openstreetmap.org/copyright" ; echo "expect no output above"
# network step — operator or a local box only, never CI:
pnpm osm:extract            # or: pnpm tsx scripts/osm-extract.ts
ls -l packages/screening/fixtures/osm/leiria-lisbon.json.gz    # must be ≤ 5242880 bytes
pnpm osm:extract && git diff --stat packages/screening/fixtures/osm/   # identical once `generated_at` (the source database's timestamp) is masked; the source moves between runs, the extract does not
```
Expected: 0 type errors; the five named tests green; the grep silent (no URL and no `fetch` anywhere under `src/` or `test/`); the gzip under 5 MB; the second `osm:extract` produces an empty diff.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate).
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git. This task needs no key: Overpass is unauthenticated.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted), and **no test in this package opens a socket**. Network access lives in `scripts/osm-extract.ts` and nowhere else — never in `src/`, never in a test, never at request time.
- ODbL attribution is required wherever the data appears: `packages/screening/src/osm/README.md`, the extract's own `attribution` field, and T-37's repo README. Removing it is a licence failure, not a style choice.
- **Leiria and Lisbon only.** The two bboxes in §2.2 are the whole covered region; anything outside is `region not covered` — a plain 4xx with the field named, no mark, no guess. This is the coverage doctrine made mechanical.
- Public facts about businesses only; never a home. The extract carries no residential objects, no `operator`, no `contact:email`. A person's name in `name` or `street_address` is a refusal (`automated reconnaissance`), not a fuzzy match — never loosen `fuzzyMatch` to make such a row pass.
- `coordinateOf` exists for T-17's 150 m geofence. This package never serializes a coordinate into a response, a log or a fixture the public can read.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed; `README.md` changed only under `## OSM data`; `leiria-min.json` untouched.
- [ ] Verification output from §9 pasted into the PR, including the byte size of the gzip and the empty re-run diff (or the BLOCKED note if the operator must run it).
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-22 — OSM extract and the PlaceIndex over it
owned-paths:
  - packages/screening/src/osm/**
  - packages/screening/fixtures/osm/leiria-lisbon.json.gz
  - scripts/osm-extract.ts
  - packages/screening/test/osm*.test.ts
  - packages/screening/src/osm/README.md
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- The package README is T-06's file and you never edit it: your attribution and runbook live in `packages/screening/src/osm/README.md`, inside the tree you own. Ask the lead to add the one-line link from the package README when T-06 merges.
- Known, pre-filed: the root `package.json` script `"osm:extract": "tsx scripts/osm-extract.ts"` is the lead's. If `pnpm osm:extract` is not defined, run `pnpm tsx scripts/osm-extract.ts` and comment `BLOCKED: root package.json needs the osm:extract script`.
- Known, pre-filed: if the sandbox has no outbound network, commit the script, the index, the tests and the README, and comment `BLOCKED: pnpm osm:extract needs Overpass access — operator must run it and commit fixtures/osm/leiria-lisbon.json.gz`. Everything in §8 passes without that file.
- If `JsonPlaceIndex` exposes no `fromJson`, or `fuzzyMatch`'s signature differs from §2.3, `INTERFACE REQUEST:` — never re-implement the matching rules in a second place.

## 14. Reviewer notes
Open `buildExtract.ts` first and look for a wall-clock call or an unsorted array — a non-reproducible extract means a diff on every run and a fixture nobody trusts. Then `placeIndex.ts`: it must delegate to `JsonPlaceIndex`, so grep it for a second Levenshtein or a second normaliser and reject one if it exists. Then confirm `isResidential` requires `!isBusiness` (a café in a residential building is still a café) and that `not_indexed` is loaded nowhere. Then the grep in §9: one stray `https://` in `src/` is the failure this task exists to prevent. Last, the README section — the ODbL line is verbatim or T-37 breaks.

## 15. Round 2+
—
