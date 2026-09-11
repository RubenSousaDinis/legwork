---
id: T-63
title: Seed catalog — 26 real errands in 10 cities, honest on every board
lane: B
day: 8                               # added Sept 11, when the operator chose to take Legwork beyond Leiria
size: M
agent_class: L                       # resolves each place against live Overpass once, by hand; every test runs offline
must: true                           # the international board is empty without it
depends_on: [T-62]                   # the catalog check script screens every row through the live-fallback gate
owned_paths:
  - apps/api/src/seed/**
  - apps/api/app/admin/seed-demo/route.ts
  - apps/api/test/routes/admin.test.ts
  - apps/api/src/services/lifecycle.ts
  - apps/api/src/services/lifecycle.test.ts
  - apps/api/src/services/reconcile.ts
  - apps/api/app/tasks/list/route.ts
  - apps/api/app/tasks/[id]/claim/route.ts
  - apps/api/test/routes/claim.test.ts
  - apps/api/test/seed-catalog.test.ts
  - apps/api/package.json
labels: [area:api, wave:8, size:M, agent:local]
branch: t-63/seed-catalog-world-errands
---

# T-63 — Seed catalog — 26 real errands in 10 cities, honest on every board

## 1. Context

A cold Legwork database shows four rows. `POST /admin/seed-demo`
(`apps/api/app/admin/seed-demo/route.ts`) inserts the three non-refused rows of
`demo-data.json` with `specJson: { seeded: true, locality: 'Leiria' }` — no place, no
subject, no title. The worker board titles a row from `specJson` (`workerBrief()` in
`lifecycle.ts`), so those rows render as blank errands in one Portuguese town. That is what a
hackathon reviewer opening the mini-app sees.

With T-62 merged the product resolves a place anywhere OpenStreetMap knows. This task gives it
something to show: a **catalog of 26 real errands in 10 cities**, each one a task an AI agent
would plausibly pay a human to do — is the pharmacy the listing says is open actually open,
how long is the queue at Pastéis de Belém, what does the hours sign at Strand Books say today,
does Curry 36 have a vegan currywurst. Every row names a real business with a real OSM id and
a spec that the screening gate **accepts** (the check script in §2 proves it). Every row is
inserted as a **seeded** demo row: chipped `seeded` on every surface, backed by no escrow,
claimable by nobody.

Three honesty defects in the current seeding path get fixed on the way, because a catalog of
26 rows would make each of them 26 times worse:

1. **The worker board loses the chip.** `GET /tasks/list` computes `seeded` from
   `isAllowlisted(row.payer)` (`apps/api/app/tasks/list/route.ts:83`). A DB-seeded row has
   `payer = 0x0…0`, so `seeded` is `false` and the row renders as a real task. The row's own
   `tasks.seeded` column is `true` and is ignored.
2. **A claim on a seeded row goes to the chain.** `POST /tasks/:id/claim` calls
   `chain.getTask(taskId)` for a task that was never posted, then `claimFor` — a revert dressed
   up as a 409 at best, a 500 at worst.
3. **The sweeper erases seeded rows.** `reconcileOpen()` (`apps/api/src/services/reconcile.ts`)
   mirrors every non-final row from the chain. `getTask(9000001)` answers state `None` (0),
   `mirrorFromChain` writes `state = 'none'`, and `listCandidates` (open/claimed only) never
   shows the row again. Today's three seeded rows disappear on the first board load; nobody
   noticed because the filmed demo never loaded the board on a cold database.

Money rule reminder for this task: a seeded row **moves no money**. It has no buyer, no
payer, no escrow, no proof, and no release. It may be `open` and nothing else.

## 2. Exact scope

### 2a. The catalog

- **`apps/api/src/seed/catalog.json`** — 26 rows (§2c). Row shape:
  ```json
  {
    "id": "lisbon-pasteis-de-belem-queue",
    "city": "Lisbon",
    "country": "PT",
    "task_type": "photo-of",
    "amount_usdc": 3.0,
    "posted_ago_s": 5400,
    "exact": { "lat": 38.6975, "lon": -9.2033 },
    "why": "A trip-planning agent wants to know whether to send its user now or in an hour.",
    "spec": { "place": { "place_id": "node/…", "name": "…", "street_address": "…", "locality": "Lisbon", "country": "PT" },
              "subject": "queue_length", "subject_detail": "the queue at the takeaway door, whole line in frame",
              "claimed_state": "Google: usually a 20 min wait", "source": "google" }
  }
  ```
  `exact` is the OSM element's coordinate (7 decimals or fewer). `why` is one sentence for
  the README and the reviewer; it is **never rendered** anywhere. `compare-two` rows have no
  `city`, `country` or `exact` and get `area: 'any'`.
- **`apps/api/src/seed/catalog.ts`** exporting:
  - `CITY_BOXES: Record<string, { country: string; bbox: [S, W, N, E] }>` for the ten cities:
    Leiria `39.68,-8.90,39.82,-8.70` · Lisbon `38.68,-9.25,38.83,-9.08` · Porto
    `41.12,-8.70,41.20,-8.55` · Madrid `40.35,-3.80,40.50,-3.60` · Berlin
    `52.40,13.20,52.60,13.60` · London `51.45,-0.25,51.58,0.00` · New York
    `40.68,-74.05,40.83,-73.90` · San Francisco `37.70,-122.52,37.83,-122.35` · Singapore
    `1.22,103.60,1.47,104.05` · Tokyo `35.55,139.55,35.80,139.90`.
  - `CatalogRow` zod schema: `task_type` from `TASK_TYPES`; `spec` validated with
    `SPEC_BY_TYPE[task_type]` from `@legwork/shared` (use a `superRefine` or a discriminated
    union — the shared spec schemas are the validators, not a copy); `amount_usdc` ≥
    `PRICE_FLOOR_USDC[task_type]` and ≤ 10; `posted_ago_s` integer in `[600, 72000]`; `why`
    ≤ 140 chars; `city` a key of `CITY_BOXES` (absent for compare-two); `exact` inside the
    city's bbox.
  - `loadCatalog(): CatalogRow[]` — parses the JSON once, throws on the first invalid row with
    its `id` in the message.
  - `areaOf(row): string` — `ngeohash.encode(exact.lat, exact.lon, 5)` or `'any'`.
- **`apps/api/src/seed/check-catalog.ts`** — a `tsx` script (`pnpm --filter @legwork/api
  seed:check-catalog`, one line added to `apps/api/package.json` `scripts`). For every row it
  builds the envelope `{ task_type, spec, amount_usdc }` and runs `screenEnvelope` from
  `hire.ts` with `places: getPlaceIndex()`, `classifier: new KeywordFallbackClassifier()` and
  `lookup: createOverpassLookup({ endpoint: process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter' })`,
  **one row at a time with a 1 s pause between rows**, and prints one line per row:
  `<id>  accepted | invalid <field> <reason> | refused <class> | unavailable`. Exit 1 if any row
  is not `accepted`. It also checks `areaOf(row)` equals the geohash of the coordinate the
  lookup returned and prints `area-mismatch` otherwise. This script is the only file in this
  task that opens a socket, it is never imported by a test, and it is never run in CI.
- **`apps/api/src/seed/README.md`**: what the catalog is, the row shape, how to add a row (find
  the OSM id with one Overpass query, copy `addr:street` and `phone` from the tags, run the
  check script), the rule that a row the gate refuses is swapped, never kept, and the sentence
  "a seeded row moves no money and cannot be claimed".

### 2b. Seeding and the three fixes

- **`/admin/seed-demo`** keeps the three legacy rows exactly as today (ids `9000001–9000003`)
  and additionally inserts one row per catalog entry at `taskId = 9_000_100 + index + 1`:
  `taskType: TASK_TYPE_BIT[row.task_type]`, `specHash: '0x' + sha256('demo-seed:' + taskId)`
  (same recipe as today), `amountUnits/feeUnits/priceUnits` from `amount_usdc` with the shared
  helpers, `buyer: ZERO_ADDRESS`, `payer: ZERO_ADDRESS`, `area: areaOf(row)`, `exactLat/
  exactLon` from `exact` (null for compare-two), `state: 'open'`, `postedAt: now −
  posted_ago_s`, `claimTtlS/submitTtlS` defaults, `disputeWindowS: config.DEMO_DISPUTE_WINDOW_S`,
  `seeded: true`, `txPost: demo.tx_placeholder`, `specJson: row.spec`, `buyerTokenHash:
  newBuyerToken().hash`. Idempotent by id, as today. Response `{ ok: true, inserted: <n> }`.
- **Board chip** (`lifecycle.ts` `toWorkerTaskRow`): `seeded: options.seeded || row.seeded`.
- **Board brief** (`lifecycle.ts` `briefPlace` and the `BriefPlace` type): add
  `country: str(place.country)` beside `locality`. `spec.place.country` is an ISO-3166 code
  the agent supplied; the mini-app (T-64) uses it to label a `call-confirm` price in the
  place's currency. Nothing else from the spec is added to the brief.
- **Claim** (`apps/api/app/tasks/[id]/claim/route.ts`): immediately after `loadTask(taskId)`
  and before any `chain.*` call: `if (row.seeded && row.buyer === ZERO_ADDRESS) return
  conflict({ error: 'SeededDemoRow' })`. Add `'SeededDemoRow'` to the `ClaimBlock.error` union
  in `lifecycle.ts` and to the route's doc table at the top of `lifecycle.ts`.
- **Sweeper** (`reconcile.ts` `reconcileOpen`): exclude rows where `seeded = true AND buyer =
  ZERO_ADDRESS` from the query (`and(notInArray(...), not(and(eq(tasks.seeded, true),
  eq(tasks.buyer, ZERO_ADDRESS))))`). Comment: "a seeded demo row has no chain twin; mirroring
  it would write `none` and hide it."
- `apps/api/test/routes/admin.test.ts:236–237`: `inserted: 3` becomes `inserted: 29` (3 legacy
  + 26 catalog) and the `seeded` assertion covers all 29.

### 2c. The 26 rows

Every place below is a real, well-known business. You resolve each one to its OSM id
yourself (one Overpass query per place, by name and city — the same shape T-59 recorded), copy
`name`, `addr:street` (+ house number) and, for call-confirm, the `phone` tag **verbatim** into
`spec.place` / `spec.phone` (E.164, `+` first), and copy the element's coordinate into
`exact`. If a place has no OSM object, no business tag, no street, or (call-confirm) no
international phone, **swap it for another well-known business of the same kind in the same
city** and say which in the PR. Never invent an id. Never keep a row the check script does
not print `accepted` for. `subject_detail` ≤ 50 characters and `claimed_state` ≤ 40, or the
300-character wire limit bites.

Amounts: `verify-open` and `photo-of` 3.00 unless stated; `call-confirm` 2.00;
`compare-two` 1.00. `posted_ago_s` staggered between 600 and 72000 so the feed has an order
and real tasks (posted now) stay on top.

| # | id | city | type | place | spec fields (beyond `place`) | why |
|---|---|---|---|---|---|---|
| 1 | `leiria-farmacia-central-open` | Leiria | verify-open | Farmácia Central, Rua Direita 12 (`node/3092370961`, already in the packaged extract) | `claimed_open: true`, `claimed_hours: "Mon–Sat 09:00–19:30"`, `source: "google"` | The listing says open. Is it? |
| 2 | `leiria-junta-parceiros-notice` | Leiria | photo-of | Junta de Freguesia de Parceiros (see `scripts/fixtures/place-junta-parceiros.json`) | `subject: "notice"`, `subject_detail: "the public notice board, whole board"`, `source: "own-list"` | An agent tracking municipal notices needs today's board. |
| 3 | `lisbon-pasteis-de-belem-queue` | Lisbon | photo-of · **4.00** | Pastéis de Belém, Rua de Belém 84–92 | `subject: "queue_length"`, `subject_detail: "queue at the takeaway door, whole line"`, `claimed_state: "Google: usually 20 min wait"`, `source: "google"` | A trip-planning agent decides whether to send its user now or later. |
| 4 | `lisbon-bertrand-chiado-open` | Lisbon | verify-open | Livraria Bertrand, Rua Garrett 73 | `claimed_open: true`, `claimed_hours: "daily 09:00–22:00"`, `source: "website"` | The oldest bookshop in the world lists hours three ways online. |
| 5 | `lisbon-ramiro-reservation` | Lisbon | call-confirm | Cervejaria Ramiro, Av. Almirante Reis 1H | `template_id: "takes_reservation"`, `slots: {}` | A dinner-booking agent cannot book what it cannot confirm. |
| 6 | `lisbon-timeout-market-menu` | Lisbon | photo-of | Time Out Market Lisboa, Av. 24 de Julho 49 | `subject: "menu_board"`, `subject_detail: "one stall's price board, prices legible"`, `source: "none"` | A price-comparison agent found three different menus online. |
| 7 | `porto-lello-hours-sign` | Porto | photo-of | Livraria Lello, Rua das Carmelitas 144 | `subject: "hours_sign"`, `claimed_state: "website: 09:30–19:00"`, `source: "website"` | Ticketed entry; the posted hours decide the itinerary. |
| 8 | `porto-bolhao-open` | Porto | verify-open | Mercado do Bolhão, Rua Formosa 322 | `claimed_open: true`, `claimed_hours: "Mon–Fri 08:00–20:00, Sat 08:00–18:00"`, `source: "google"` | Markets close early on holidays the listing does not know about. |
| 9 | `madrid-san-miguel-queue` | Madrid | photo-of | Mercado de San Miguel, Plaza de San Miguel | `subject: "queue_length"`, `subject_detail: "entrance queue, whole line in frame"`, `source: "none"` | Same question as Belém, different city. |
| 10 | `madrid-san-gines-card` | Madrid | call-confirm | Chocolatería San Ginés, Pasadizo de San Ginés 5 | `template_id: "accepts_payment"`, `slots: { payment_method: "card" }` | A cash-free traveller's agent asks before sending them. |
| 11 | `berlin-dussmann-hours-sign` | Berlin | photo-of | Dussmann das KulturKaufhaus, Friedrichstraße 90 | `subject: "hours_sign"`, `claimed_state: "Google: closes at midnight"`, `source: "google"` | Late-night hours are the ones listings get wrong. |
| 12 | `berlin-konnopke-open` | Berlin | verify-open | Konnopke's Imbiß, Schönhauser Allee 44A | `claimed_open: null`, `claimed_hours: null`, `source: "none"` | No listing at all — the agent has nothing but the address. |
| 13 | `berlin-curry36-vegan` | Berlin | call-confirm | Curry 36, Mehringdamm 36 | `template_id: "have_item"`, `slots: { item: "vegan currywurst" }` | A dietary-preference agent checks before recommending. |
| 14 | `london-dishoom-queue` | London | photo-of · **4.00** | Dishoom Covent Garden, 12 Upper St Martin's Lane | `subject: "queue_length"`, `subject_detail: "the queue outside the door"`, `claimed_state: "no reservations for small tables"`, `source: "website"` | Walk-in only; the queue is the booking. |
| 15 | `london-foyles-open` | London | verify-open | Foyles, 107 Charing Cross Road | `claimed_open: true`, `claimed_hours: "Mon–Sat 09:00–21:00, Sun 11:30–18:00"`, `source: "google"` | Sunday hours differ on every listing. |
| 16 | `london-monmouth-closes` | London | call-confirm | Monmouth Coffee Company, 27 Monmouth Street | `template_id: "closes_at_today"`, `slots: {}` | An agent routing a late errand needs today's closing time, not the usual one. |
| 17 | `nyc-strand-hours-sign` | New York | photo-of | Strand Book Store, 828 Broadway | `subject: "hours_sign"`, `claimed_state: "website: 10:00–20:00"`, `source: "website"` | The sign on the door outranks the website. |
| 18 | `nyc-katz-queue` | New York | photo-of · **4.00** | Katz's Delicatessen, 205 E Houston St | `subject: "queue_length"`, `subject_detail: "line at the entrance, whole line in frame"`, `source: "none"` | Famous for the line; nobody publishes it. |
| 19 | `nyc-joes-pizza-card` | New York | call-confirm | Joe's Pizza, 7 Carmine St | `template_id: "accepts_payment"`, `slots: { payment_method: "card" }` | Cash-only rumours persist for years online. |
| 20 | `sf-city-lights-open` | San Francisco | verify-open | City Lights Booksellers, 261 Columbus Ave | `claimed_open: true`, `claimed_hours: "daily 10:00–22:00"`, `source: "google"` | The listing has not changed in years; the shop may have. |
| 21 | `sf-tartine-storefront` | San Francisco | photo-of | Tartine Bakery, 600 Guerrero St | `subject: "storefront"`, `subject_detail: "storefront with the door state visible"`, `claimed_state: "Google: open"`, `source: "google"` | A delivery agent wants to see the shop before it dispatches. |
| 22 | `singapore-tian-tian-menu` | Singapore | photo-of | Tian Tian Hainanese Chicken Rice, 1 Kadayanallur St (Maxwell Food Centre) | `subject: "menu_board"`, `subject_detail: "the stall's price board, prices legible"`, `source: "none"` | Hawker prices change weekly and never online. |
| 23 | `singapore-kinokuniya-open` | Singapore | verify-open | Books Kinokuniya, 391 Orchard Rd (Ngee Ann City) | `claimed_open: true`, `claimed_hours: "daily 10:00–21:30"`, `source: "website"` | Mall hours and shop hours disagree. |
| 24 | `tokyo-tsutaya-daikanyama-signage` | Tokyo | photo-of | Tsutaya Books, Daikanyama T-Site, 17-5 Sarugakuchō | `subject: "signage"`, `subject_detail: "today's hours sign at the main entrance"`, `source: "website"` | Japanese listings publish hours in a script the agent's user cannot read. |
| 25 | `any-compare-listing-a` | — | compare-two | — | `criterion_id: "matches_reference"`, `reference: { kind: "text", text: "Farmácia Central, Rua Direita 12, Leiria" }`, `a: { kind: "text", text: "Farmacia Central - R. Direita 12, Leiria" }`, `b: { kind: "text", text: "Farmácia Centro, Rua Direita 21, Leiria" }` | Entity resolution: which listing is the same shop? |
| 26 | `any-compare-listing-b` | — | compare-two | — | `criterion_id: "matches_reference"`, `reference: { kind: "text", text: "Curry 36, Mehringdamm 36, Berlin" }`, `a: { kind: "text", text: "Curry 36 - Mehringdamm 36, 10961 Berlin" }`, `b: { kind: "text", text: "Curry 66, Mehringdamm 36, Berlin" }` | Same question, German listing. |

For rows 25–26 every `sha256` is the lowercase hex SHA-256 of the item's exact `text` (UTF-8),
computed with `node:crypto`; a test recomputes it.

## 3. Out of scope

- On-chain anything. No `Seed.s.sol`, no `seed-area.sh`, no escrow, no worker. A seeded row is
  a database row with a placeholder tx hash, as today.
- `demo-data.json`, `DemoData`, the dashboard demo mode (`apps/dashboard/lib/data/demo.ts`).
  The filmed Leiria story is untouched; the catalog is what the **live** board and feed show.
- Rendering. The mini-app's "not claimable" line and the dashboard's locality label are T-64
  and T-65; this task produces the data and the 409 they consume.
- Any `submitted`, `released`, `claimed` or `disputed` seeded row. A release without a proof
  beside it is banned, and a `claimed` seeded row would hit the sweeper's expiry path.
- Do not touch: `apps/api/src/db/schema.ts`, `packages/**`, `apps/api/src/services/hire.ts`,
  `apps/api/app/tasks/route.ts`, `apps/api/src/services/sweeper.ts`.

## 4. Owned paths

```
apps/api/src/seed/**
apps/api/app/admin/seed-demo/route.ts
apps/api/test/routes/admin.test.ts
apps/api/src/services/lifecycle.ts
apps/api/src/services/lifecycle.test.ts
apps/api/src/services/reconcile.ts
apps/api/app/tasks/list/route.ts
apps/api/app/tasks/[id]/claim/route.ts
apps/api/test/routes/claim.test.ts
apps/api/test/seed-catalog.test.ts
apps/api/package.json
```

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| `SPEC_BY_TYPE`, `TASK_TYPES`, `TASK_TYPE_BIT`, `PRICE_FLOOR_USDC`, `SPEC_MAX_CHARS`, `ZERO_ADDRESS`, `toUsdcUnits`, `feeOn`, `priceWithFee`, `DEFAULT_*_TTL_S` | `@legwork/shared` | validators and money helpers; never re-typed |
| `screenEnvelope`, `ScreenEnvelopeDeps.lookup` | `apps/api/src/services/hire.ts` (T-62) | the check script's gate |
| `createOverpassLookup`, `getPlaceIndex`, `KeywordFallbackClassifier` | `@legwork/screening` (T-61) | the check script's deps |
| `workerBrief`, `toWorkerTaskRow`, `listCandidates`, `loadTask`, `ClaimBlock` | `apps/api/src/services/lifecycle.ts` | the board row and the claim gate you edit |
| `reconcileOpen` | `apps/api/src/services/reconcile.ts` | the query you narrow |
| `/admin/seed-demo` bench | `apps/api/test/routes/admin.test.ts:213–248` | pglite fixture, `withKey`, `call()` |
| `ngeohash` | `apps/api` dependency | `encode(lat, lon, 5)` |

## 6. Interfaces produced

| Interface | Where | Consumers |
|---|---|---|
| 26 seeded rows on `/public/feed`, `/public/task/:id`, `GET /tasks/list` with `seeded: true`, real `specJson`, `area` per city, `locality`/`country` (via T-62) | the database | T-64 (mini-app board), T-65 (dashboard feed), the demo |
| `POST /tasks/:id/claim` → 409 `{ error: 'SeededDemoRow' }` | `claim/route.ts` | T-64 (`CLAIM_ERRORS`) |
| `WorkerTaskRow.seeded` is true for a DB-seeded row | `lifecycle.ts` | T-64 |
| `WorkerTaskRow.brief.place.country` (ISO-3166 alpha-2, optional) | `lifecycle.ts` `briefPlace` | T-64 (`lib/currency.ts`) |
| `pnpm --filter @legwork/api seed:check-catalog` | `apps/api/package.json` | the operator, the reviewer |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-63` — must print `CLAIMED`. Exit 1 means another agent
holds it or T-62 has not merged: stop.

1. Read `seed-demo/route.ts`, `lifecycle.ts:400–540` (`workerBrief`, `toWorkerTaskRow`),
   `list/route.ts`, `claim/route.ts:55–90`, `reconcile.ts:30–45` in full.
2. Fixes first (§2b), with their tests (§8 rows 10–13). They are small and they unblock the
   catalog's board test.
3. `catalog.ts` with `CITY_BOXES` and the zod schema; an empty `catalog.json` `[]`; the
   loader test skeleton.
4. Resolve the 26 places. For each: one Overpass query, e.g.
   `[out:json][timeout:25];node["name"="Curry 36"]["addr:city"="Berlin"];out center tags;`
   (try `nwr` if `node` finds nothing). Pause a second between queries. Record `id`,
   coordinate, `addr:street`, `addr:housenumber`, `phone`. Write the row.
5. Run the offline tests (§8 rows 1–9) until the whole file parses.
6. Run `pnpm --filter @legwork/api seed:check-catalog` with the operator's `.env` (class L).
   Every row must print `accepted`. Swap what does not. Paste the full output into the PR.
7. Wire the catalog into `seed-demo/route.ts`; update `admin.test.ts`.
8. `apps/api/src/seed/README.md`. Run §9. Paste. `gh pr ready`.

## 8. Acceptance tests

`apps/api/test/seed-catalog.test.ts` unless noted. All offline.

| Test / command | Asserts |
|---|---|
| `catalogParsesAgainstTheSharedSpecSchemas` | `loadCatalog()` returns 26 rows; every `row.spec` passes `SPEC_BY_TYPE[row.task_type].parse` |
| `catalogSpecsFitTheWireLimit` | `JSON.stringify(row.spec).length <= SPEC_MAX_CHARS` for every row |
| `catalogAmountsMeetTheTypeFloor` | `amount_usdc >= PRICE_FLOOR_USDC[task_type]` and `<= 10` for every row |
| `catalogCoordinatesLieInsideTheirCityBox` | for every placed row, `exact` is inside `CITY_BOXES[city].bbox` and `spec.place.country === CITY_BOXES[city].country` and `spec.place.locality === city` |
| `catalogCoversTenCitiesAndSevenCountries` | distinct `city` count is 10; distinct `country` count ≥ 7 |
| `catalogHasEveryTaskTypeAtLeastTwice` | each of the four `task_type`s appears ≥ 2 times |
| `catalogPlaceIdsAreUniqueAndWellFormed` | every `spec.place.place_id` matches `OSM_PLACE_ID`; no two placed rows share one; every `id` is unique and kebab-case |
| `catalogCompareTwoHashesMatchTheirText` | for rows 25–26, `sha256(text)` recomputed with `node:crypto` equals `item.sha256` for `a`, `b` and `reference` |
| `everyCatalogRowHasAWorkerTitle` | `workerBrief({ taskType: TASK_TYPE_BIT[t], specJson: spec })` yields a non-empty `place.name` for placed rows and a `criterion_id` for compare-two rows |
| `seedDemoInsertsTheCatalogOnce` (in `admin.test.ts`, extend the existing idempotency test) | first call `inserted: 29`, second `inserted: 0`; every row `seeded === true`, `buyer === ZERO_ADDRESS`, `state === 'open'`; a catalog row's `area` equals `ngeohash.encode(exact.lat, exact.lon, 5)`; a compare-two row's `area === 'any'` |
| `seededRowCarriesTheChipOnTheWorkerBoard` (in `lifecycle.test.ts`) | `toWorkerTaskRow(rowWith({ seeded: true, payer: ZERO_ADDRESS }), { seeded: false, ... }).seeded === true` |
| `workerBriefCarriesThePlaceCountry` (in `lifecycle.test.ts`) | `workerBrief` on a `verify-open` spec with `place.country: 'DE'` yields `place.country === 'DE'`; `workerBriefNeverLeaksClaims` (existing) still passes — `claimed_*` and `source` stay out |
| `claimingASeededDemoRowIs409BeforeAnyChainCall` (in `claim.test.ts`) | a seeded row with `buyer = ZERO_ADDRESS` in pglite; `POST /tasks/:id/claim` → 409 `{ error: 'SeededDemoRow' }`; the `FakeChain` spy shows zero `getTask`/`claimFor` calls |
| `seededDemoRowsAreNeverReconciledFromTheChain` (in `lifecycle.test.ts` or a new `describe` in `seed-catalog.test.ts`) | insert one seeded `open` row with `buyer = ZERO_ADDRESS` and one real `open` row; `reconcileOpen()` returns only the real one; after it, the seeded row is still `state = 'open'` |
| `pnpm --filter @legwork/api seed:check-catalog` (class L, by hand, pasted) | 26 × `accepted`, zero `area-mismatch` |

## 9. Verification commands

```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/api test -- seed-catalog admin claim lifecycle
pnpm --filter @legwork/api typecheck
pnpm --filter @legwork/api lint
bash scripts/ci/banned-words.sh
# class L, by hand, with the operator's .env — one Overpass request per row, paced:
pnpm --filter @legwork/api seed:check-catalog
```

Expected: suites green with every §8 name present; typecheck and lint clean; the check script
prints 26 lines ending in `accepted` and exits 0.

## 10. Hard rules

- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`,
  `Brooklyn`, `24h`, `2.55`, `21 workers`. (Row 6's street is "Av. 24 de Julho" — that is
  fine; the banned token is `24h`.) Write hours as "24 hours" if you ever need to.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives
  **3.00**, fee **0.45**. A seeded row's `priceUnits` is computed with `priceWithFee`, never
  typed; and **a seeded row moves no money** — no buyer, no payer, no escrow, no release.
- **Honesty:** every seeded row carries `seeded: true` on every surface it reaches; the pool
  copy stays exactly "1 real · +20 seeded (demo data)"; a seeded row is `open` and nothing
  else; a claim on one is a 409, never a chain call.
- **Privacy:** `exact` lives in `exact_lat/lon` only. Public surfaces get `area` and the
  rounded coordinate through the existing code. `why` is never rendered.
- **Real places only.** Every `place_id` came back from an Overpass query you ran; the query
  and the response id are in the PR body for at least rows 3, 13 and 24 (one per continent).
  An invented id is fabricated evidence.
- **Every row passes the gate.** The check script is the proof; its output is in the PR. A
  seeded errand the product would refuse if an agent posted it is a lie on the board.
- **Tests never open a socket.** `check-catalog.ts` is a script, not a test, and no test
  imports it.
- **Keys:** none. The check script reads `OVERPASS_URL` from `process.env` and nothing else.
- Overpass fair use: the check script pauses ≥ 1 s between rows and never retries.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`,
      `commit-trailers`, `claim`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR, including the 26 `accepted` lines.
- [ ] Three Overpass queries and their returned ids in the PR body (rows 3, 13, 24).
- [ ] `apps/api/src/seed/README.md` exists.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-63 — Seed catalog — 26 real errands in 10 cities, honest on every board
owned-paths:
  - apps/api/src/seed/**
  - apps/api/app/admin/seed-demo/route.ts
  - apps/api/test/routes/admin.test.ts
  - apps/api/src/services/lifecycle.ts
  - apps/api/src/services/lifecycle.test.ts
  - apps/api/src/services/reconcile.ts
  - apps/api/app/tasks/list/route.ts
  - apps/api/app/tasks/[id]/claim/route.ts
  - apps/api/test/routes/claim.test.ts
  - apps/api/test/seed-catalog.test.ts
  - apps/api/package.json
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
Swapped places: <none | row N: <original> → <replacement>, reason>
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it.
Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and
`apps/api/src/db/schema.ts` are frozen. Dependencies: `DEP REQUEST:` — you need none
(`ngeohash`, `tsx`, `zod` are present). Env vars: `OVERPASS_URL` is T-60's.

Specific cases:
- **Overpass rate-limits you (429) or times out.** Wait five minutes and continue where you
  stopped; never loop. If it stays down for an hour, `BLOCKED: Overpass unavailable` with the
  rows you have.
- **A well-known place has no OSM object with a business tag.** Swap it (§2c) and record the
  swap in the PR. Three swaps in one city is a signal to ask the lead for a different city.
- **`screenEnvelope` has no `lookup` in `ScreenEnvelopeDeps`.** T-62 did not land as briefed:
  `BLOCKED: T-62 lookup seam missing`.
- **`admin.test.ts` asserts something about seeded rows you did not expect** (for example a
  `specJson` shape). Update the assertion to the new shape and say so; the legacy three rows
  keep their old `specJson`.

## 14. Reviewer notes

1. **The check script output is the evidence.** 26 `accepted` lines, pasted, dated. Then
   spot-check one id per continent with your own `curl` — rows 3, 13, 24 are in the PR body.
2. `seededDemoRowsAreNeverReconciledFromTheChain` is the fix nobody asked for and the one that
   matters most: without it every seeded row becomes `state = 'none'` on the first board load.
   Confirm the test inserts a real row too, so it proves the filter is narrow.
3. `claim/route.ts`: the `SeededDemoRow` return must be above the first `chain.` call. Read the
   diff top to bottom.
4. `catalog.json`: scan `subject_detail` and `claimed_state` for anything that reads as an
   instruction to a person rather than a description of a thing ("ask the staff…" is a
   different task type and the gate should have caught it).
5. No `claimed`, `submitted`, `released` row. `grep -c '"state"' catalog.json` should be 0 —
   the state is not in the catalog at all.

## 15. Round 2+

Empty on first dispatch.
