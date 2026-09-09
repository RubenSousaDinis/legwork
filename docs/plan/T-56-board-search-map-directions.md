---
id: T-56
title: The board shows every task, searchable, on a map, with directions
lane: D
day: 6                               # added Sept 9 from the operator's phone testing
size: L
agent_class: C
must: true
depends_on: [T-55]                   # both need apps/miniapp/app/globals.css
owned_paths:
  - apps/miniapp/app/tasks/**
  - apps/miniapp/app/globals.css
  - apps/miniapp/components/TaskCard.tsx
  - apps/miniapp/components/TaskMap.tsx
  - apps/miniapp/lib/**
  - apps/miniapp/tests/**
  - apps/miniapp/README.md
  - apps/api/app/public/_shared.ts
  - apps/api/app/tasks/list/route.ts
  - apps/api/src/services/lifecycle.ts
  - apps/api/src/services/hire.ts
  - apps/api/test/**
  - packages/shared/src/schemas/place.ts
  - packages/shared/src/api-contract.ts
  - docs/threat-model.md
labels: [area:miniapp, wave:6, size:L, agent:cloud]
branch: t-56/board-search-map-directions
---

# T-56 — The board shows every task, searchable, on a map

## 1. Context

The operator tested the mini-app on a phone, registered in cell `ez19y`, and saw an empty board
while an open task sat one cell away. Their request, verbatim in part: a **map with pins** for
the tasks and for themselves; a **searchable list — by country, city** — with a checkbox for
**only tasks near me (10 km)**; **seeing all tasks** after logging in; and **get directions**
opening Google Maps.

**Most of this is already in the data and simply not used.**

- **Directions need nothing new.** Every `/tasks/list` row already carries
  `brief.place.{name, street_address, locality}` (`apps/api/src/services/lifecycle.ts:349-353`),
  and `TaskCard.tsx:126` already renders `Rua de Alcobaça 12, Leiria`. The mini-app already
  opens external links with `target="_blank" rel="noreferrer" data-hit="44"` (Basescan).
- **"All tasks" is a deleted query parameter.** `listCandidates(area?)`
  (`lifecycle.ts:522-529`) omits the area predicate entirely when `area` is absent. The
  narrowing is the client's: `TaskList.locate()` sends the *registered* cell, and the registered
  cell beats the current GPS cell.
- **The 10 km filter is a client predicate** — `distance_m` is on every row whenever the phone
  sent a fix.
- **City search already has its field** — `brief.place.locality`.

**One thing genuinely does not exist: a task coordinate.** No endpoint returns one at any
precision. `area` is a geohash-5 (~5 km), so plotting it puts every Leiria task on the same pin.
The operator's decision is to publish a **rounded coordinate at 3 decimals (~100 m)** — the
precision the project already permits on public surfaces (`PUBLIC_COORD_DECIMALS`,
`packages/shared/src/constants.ts:56`, *"Public surfaces round coordinates to 3 decimals (about
100 m). Exact ones stay private."*).

## 2. Exact scope

**The governing rule.** `apps/api/app/public/_shared.ts:3-11` calls its own allowlist *"not a
style preference, it is the privacy control"*, and lists what must never be published: the raw
spec, **the exact coordinate**, the buyer token digest, the payer, the agent id, the payment
nonce. This task adds exactly one field to that allowlist, at exactly one precision, and
touches nothing else on it.

---

### The board

1. **Show every open task.** Stop sending `?area=` from `TaskList.tsx`'s `tasksPath()`; keep
   sending `lat`/`lon` so the API still returns `distance_m` and sorts nearest-first. The API
   already handles the absence.
2. **Rewrite the empty state.** `emptyBoardCopy` currently promises *"This board shows the cell
   you registered in; tasks posted elsewhere will not appear here"* — which stops being true.
   `emptyBoardMismatch` (the *"Your phone is in X, your account is registered in Y"* line) is no
   longer a mismatch worth reporting once the board is global; remove it rather than leave a
   sentence that describes an old rule. A search that returns nothing needs its own sentence,
   distinct from a board with no open tasks at all.
3. **A search box** over `title`, `brief.place.{name, street_address, locality}` and
   `task_type` — client-side, case- and accent-insensitive, no dependency. `TaskList`'s `poll`
   is a `useCallback` with `[]` deps *on purpose* (its comment: a new `poll` "would tear down
   and rebuild the interval on every render"), so the query must reach it through a ref or stay
   out of the fetch path entirely. Filtering the rows already in state is the simpler and
   correct choice.
4. **A *within 10 km* checkbox** — `row.distance_m <= 10_000`, disabled with a reason when the
   phone gave no fix (`distance_m` is then absent on every row). Rows beyond
   `CLAIM_RADIUS_M = 2000` keep the disabled claim button and its existing reason, so the board
   shows work worth travelling toward without pretending it can be claimed from here.
5. **Get directions.** On any row with a `brief.place`, an anchor to
   `https://www.google.com/maps/dir/?api=1&destination=` + `encodeURIComponent(`${name},
   ${street_address}, ${locality}`)`, `target="_blank" rel="noreferrer" data-hit="44"`. Plain
   anchor, no new dependency, no coordinate.

### The map

6. **`components/TaskMap.tsx` — new.** OpenStreetMap raster tiles as plain `<img>` elements in
   a positioned grid, pins absolutely placed over them. **No map library** — `AGENTS.md`:
   *"Dependencies are pre-declared in the pnpm catalog. Never add one."* One pin per task at its
   rounded coordinate, one distinct pin for the worker from `lastKnownPosition()` (already
   exact, already in memory, never sent anywhere). Tapping a pin selects that row.
7. **The ODbL attribution is not optional.** `README.md:169` already commits to *"Place data ©
   OpenStreetMap contributors, available under the Open Database License (ODbL)"*; the map
   renders that line visibly, and it is the tiles' licence as well as the data's.
8. **Degrade honestly.** No fix → no worker pin and a line saying so, reusing the existing
   `GPS unavailable in webview — disclosed` chip. Tiles fail to load → the list still works and
   the map says it could not load, never a blank grey box.

### The API

9. **Add `coordinate_rounded` to the task rows.** `round100m` already exists
   (`apps/api/src/services/geo.ts`) and is already how a proof's coordinate is published. Add
   the field to `PublicTaskView` (`apps/api/app/public/_shared.ts:38-58`) and to `WorkerTaskRow`
   (`lifecycle.ts:461-471`), sourced from the task's private `exact_lat/exact_lon`. Update
   `packages/shared/src/api-contract.ts` — this is an **`interface-change` PR** by its own
   header at lines 9-12 — and run `pnpm docs:gen`.
10. **Record it in the threat model.** `docs/threat-model.md` row 24 reads *"Worker's approximate
    location exposed to the poster | Rounded coordinate only; stated"*. Add the mirror of it: the
    task's approximate location is now exposed to everyone, rounded, deliberately, and say why —
    a worker cannot decide whether to walk somewhere they cannot see.
11. **Open the country schema.** `Place.country` is `z.literal('PT')`
    (`packages/shared/src/schemas/place.ts`); make it an ISO-3166-1 alpha-2 string. Every
    existing `country: 'PT'` fixture stays valid.
12. **And make an unresolvable place a refusal.** This is the part that matters more than the
    schema. `placeOf()` (`apps/api/src/services/hire.ts:295-300`) returns `null` when
    `PlaceIndex.coordinateOf(place_id)` finds nothing, and the index is a cached OSM extract of
    **Leiria and Lisbon business POIs only** (`README.md:169`). A `null` there nulls
    `tasks.exact_lat/lon`, which silently disables the 150 m geofence, the 2 km claim radius and
    `distance_m`. Opening the country without this would let a poster create a task the system
    cannot geolocate, police or pay out correctly. Refuse it at the gate with a plain
    `invalid_request` naming the unresolvable `place_id`.

## 3. Out of scope

- **The shell** — the navbar, the login modal, the rename, logout, session TTL. T-55's, and this
  task depends on it. If `globals.css` needs a class the shell also wants, T-55 wins and you
  wait.
- **Growing the OSM extract.** `scripts/osm-extract.ts` covers two bounding boxes and is the
  only file in the repo that touches the network. Opening the country schema does not extend the
  data, and this task must not pretend otherwise: with the current extract, city search still
  has two cities in it.
- The exact coordinate, on any surface, ever. `apps/api/src/db/schema.ts:42-49` marks
  `exactLat`/`exactLon` private and they stay that way; only `round100m` output leaves.
- `spec.place.place_id` / `google_place_id` on the board. They reach the phone only through
  `GET /tasks/:id/spec`, claimant-only, and that stays true.
- Do not touch: `apps/miniapp/app/layout.tsx`, `apps/miniapp/app/(auth)/**`,
  `apps/miniapp/components/ui/**`, `apps/miniapp/lib/session.ts`, `apps/dashboard/**`,
  `subgraph/**` (its schema comment: *"No coordinate anywhere"* — that stays true too).

## 4. Owned paths

```
apps/miniapp/app/tasks/**
apps/miniapp/app/globals.css
apps/miniapp/components/TaskCard.tsx
apps/miniapp/components/TaskMap.tsx
apps/miniapp/lib/**
apps/miniapp/tests/**
apps/miniapp/README.md
apps/api/app/public/_shared.ts
apps/api/app/tasks/list/route.ts
apps/api/src/services/lifecycle.ts
apps/api/src/services/hire.ts
apps/api/test/**
packages/shared/src/schemas/place.ts
packages/shared/src/api-contract.ts
docs/threat-model.md
!apps/miniapp/lib/session.ts
```

`packages/shared/**` is frozen: label the PR **`interface-change`**, and say in the body that
the additions are `coordinate_rounded` on two row types and a widened `Place.country`.

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| `GET /tasks/list?area=&lat=&lon=` | `apps/api/app/tasks/list/route.ts` | drops the area filter when `area` is absent; `distance_m` needs `lat`/`lon` |
| `WorkerTaskRow`, `BriefPlace` | `apps/api/src/services/lifecycle.ts:349,461` | `brief.place.{name,street_address,locality}` is already on every row |
| `round100m`, `distanceM` | `apps/api/src/services/geo.ts` | the only sanctioned way a coordinate leaves a private row |
| `PlaceIndex.coordinateOf` | `packages/screening` | boot singleton; returns undefined off-extract |
| `lastKnownPosition()` | `apps/miniapp/lib/area.ts:28` | the worker's exact fix, module state, never persisted |
| `CLAIM_RADIUS_M`, `PUBLIC_COORD_DECIMALS` | `@legwork/shared` | 2 km and 3 decimals |
| `<Modal>` | `apps/miniapp/components/ui/Modal.tsx` (T-55) | reuse if the map needs a full-screen view |

## 6. Interfaces produced

| Interface | Where | Consumers |
|---|---|---|
| `coordinate_rounded` on `PublicTaskView` and `WorkerTaskRow` | `api-contract.ts` | the map |
| `Place.country` as ISO-3166-1 alpha-2 | `packages/shared/src/schemas/place.ts` | every task envelope |
| `<TaskMap>` | `apps/miniapp/components/TaskMap.tsx` | the board |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-56` — must print `CLAIMED`. Exit 1 means another
agent holds it or T-55 is not merged: stop.

1. Read `TaskList.tsx`, `TaskCard.tsx`, `lifecycle.ts` (`toWorkerTaskRow`, `listCandidates`,
   `workerBrief`), `public/_shared.ts` and `geo.ts`. Run the mini-app and api suites; record
   both counts.
2. **The API first, in one commit**: `coordinate_rounded`, the widened country, the
   unresolvable-place refusal, `api-contract.ts`, `pnpm docs:gen`, the threat-model row. Land it
   green before any UI exists — a map built against a field that is still moving is wasted work.
3. **Then the list**: all tasks, the empty-state copy, search, the 10 km checkbox, directions.
   Each is independently testable; do them in that order and re-run the suite after each.
4. **Then the map**, last, because it is the only piece that can fail on a phone rather than in
   a test. Build the tile grid, then the pins, then the worker pin, then the degradations.
5. Run §9 in full, paste into the PR, `gh pr ready`.

## 8. Acceptance tests

| Test / command | Asserts |
|---|---|
| `boardShowsTasksBeyondTheRegisteredCell` (`tests/tasks/`) | `/tasks/list` is requested without `area`; a row in a different cell renders |
| `emptyBoardNoLongerPromisesOneCell` (`tests/tasks/`) | the empty copy names neither the registered cell nor the old promise; a search with no matches renders a different sentence than an empty board |
| `searchMatchesPlaceAndType` (`tests/tasks/search.test.tsx`) | typing a locality, a street, a place name or a task type narrows the rows; accents and case are ignored; the 3 s poll interval is not rebuilt per keystroke |
| `nearMeFiltersToTenKilometres` (`tests/tasks/search.test.tsx`) | the checkbox keeps rows with `distance_m <= 10_000` and drops the rest; with no fix it is disabled and says why |
| `rowsBeyondTheClaimRadiusStaySeenButUnclaimable` (`tests/tasks/`) | a row at 4 km renders and its claim button is disabled with the existing reason |
| `directionsLinkOpensTheAddress` (`tests/tasks/`) | one anchor per row with a place, to `maps/dir/?api=1&destination=` + the encoded `name, street_address, locality`, with `target="_blank" rel="noreferrer" data-hit="44"`; no coordinate in the href |
| `mapPinsEveryTaskAndTheWorker` (`tests/tasks/map.test.tsx`) | one pin per row with a `coordinate_rounded`, one distinct worker pin from `lastKnownPosition()`; tapping a pin selects the row |
| `mapDegradesWithoutAFixOrTiles` (`tests/tasks/map.test.tsx`) | no fix → no worker pin and the GPS chip; tiles failing → a stated failure, never a blank box |
| `mapCarriesTheOdblAttribution` (`tests/tasks/map.test.tsx`) | the OpenStreetMap/ODbL line renders whenever the map does |
| `publicFeedPublishesOnlyTheRoundedCoordinate` (`apps/api/test/`) | `coordinate_rounded` is 3 decimals; `exact_lat`/`exact_lon` appear in no response body on any route |
| `unresolvablePlaceIsRefused` (`apps/api/test/`) | a `place_id` the index cannot resolve is refused with `invalid_request` naming it, and no task row is written |
| `countryAcceptsMoreThanPortugal` (`packages/shared` or api test) | a non-`PT` ISO code parses; a three-letter or lowercase code does not; every existing `PT` fixture still parses |
| `pnpm docs:gen && git diff --exit-code docs/api.md docs/mcp-schema.md` | the generated docs are committed, not drifting |
| every existing test file | green |

## 9. Verification commands

```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/shared typecheck && pnpm --filter @legwork/shared test
pnpm --filter @legwork/api typecheck && pnpm --filter @legwork/api test
pnpm --filter @legwork/miniapp typecheck && pnpm --filter @legwork/miniapp lint
pnpm --filter @legwork/miniapp test && pnpm --filter @legwork/miniapp build
pnpm docs:gen && git diff --exit-code docs/api.md docs/mcp-schema.md
bash scripts/ci/banned-words.sh
# the exact coordinate must reach no response and no client
grep -rn "exact_lat\|exactLat" apps/miniapp apps/api/app | grep -v test | grep -v "db/schema"
```

Expected: everything clean; `docs:gen` leaves no diff; the final grep prints only
`_shared.ts`/`lifecycle.ts` lines that *read* the private column to compute the rounded one,
and nothing under `apps/miniapp`.

## 10. Hard rules

- Banned words: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee
  **0.45**.
- **The exact coordinate never leaves the private task record.** One new field, three decimals,
  through `round100m`. The subgraph stays coordinate-free.
- **No new dependency.** No map library, no geocoder, no fuzzy-search package. Tiles are
  `<img>`, search is `String.prototype.normalize` and `includes`.
- **The ODbL attribution renders wherever the tiles do.**
- Paper ground, `lw-*` classes, every colour a token; `noInlineStyles` and `globals.test.ts`
  stay green. No icon font, no emoji — a pin is a drawn shape or a Unicode mark, not an icon set.
- Phone floors: 16 px body, `data-floor="20"` on narrated copy, hit targets ≥ 44 px including
  every pin that can be tapped.
- Tests never call a live model, a live chain or a live tile server.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `e2e-dashboard`, `banned-words`,
      `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] `pnpm docs:gen` output committed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `docs/threat-model.md` records the new published field.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-56 — The board: all tasks, search, map, directions
owned-paths:
  - apps/miniapp/app/tasks/**
  - apps/miniapp/app/globals.css
  - apps/miniapp/components/TaskCard.tsx
  - apps/miniapp/components/TaskMap.tsx
  - apps/miniapp/lib/**
  - apps/miniapp/tests/**
  - apps/miniapp/README.md
  - apps/api/app/public/_shared.ts
  - apps/api/app/tasks/list/route.ts
  - apps/api/src/services/lifecycle.ts
  - apps/api/src/services/hire.ts
  - apps/api/test/**
  - packages/shared/src/schemas/place.ts
  - packages/shared/src/api-contract.ts
  - docs/threat-model.md
  - !apps/miniapp/lib/session.ts
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need>` and stop. `packages/shared` is frozen and this brief
pre-approves exactly two changes there — `coordinate_rounded` on the two row types and the
widened `Place.country`. Anything else is an `INTERFACE REQUEST:`. A map that cannot be built
without a library is a `DEP REQUEST:` naming the package and saying why an `<img>` tile grid
will not do — but read `AGENTS.md` first, because the answer has been no every previous time.

## 14. Reviewer notes

Open the API commit alone first and check three things: `coordinate_rounded` is three decimals
everywhere it appears, `exact_lat`/`exact_lon` reach no response body, and the unresolvable-place
refusal exists — without that last one, opening the country schema lets a poster create a task
with no coordinate, which disables the geofence and the claim radius silently. That is the
sharpest way this task can go wrong, and it will not show up in the UI.

Then the empty-state copy: the old sentence promised one cell and would now be a lie. Then the
map, on a phone, at 390 px — pins in the right places, the attribution visible, and the whole
thing still legible with no GPS fix. Finally confirm the poll interval is not rebuilt on every
keystroke; the comment in `TaskList.tsx` explains why that matters.

## 15. Round 2+

_(empty on first dispatch)_
