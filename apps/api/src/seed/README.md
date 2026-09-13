# Seed catalog — real errands for a cold database

`catalog.json` holds 26 errands across ten cities, each one a task an AI agent would plausibly
pay a human to do: is the pharmacy the listing says is open actually open, how long is the
queue at Pastéis de Belém, what does the hours sign at Strand say today, does Curry 36 have a
vegan currywurst. `POST /admin/seed-demo` inserts one database row per catalog entry so the
live board and feed have something to show beyond the three legacy Leiria rows.

**A seeded row moves no money and cannot be claimed.** It has no buyer, no payer, no escrow,
no proof and no release. It is `open` and nothing else, carries `seeded: true` on every surface
it reaches, answers a claim with `409 { error: 'SeededDemoRow' }` before any chain call, and is
skipped by the sweeper's chain mirror (a seeded row has no chain twin; mirroring it would write
`none` and hide it).

## Files

| File | Role |
|---|---|
| `catalog.json` | the rows — the source of truth |
| `catalog.ts` | `CITY_BOXES`, the `CatalogRow` zod schema, `loadCatalog()`, `areaOf(row)` |
| `check-catalog.ts` | class-L script: screens every row through the live-fallback gate |

`catalog.ts` validates every `spec` with `SPEC_BY_TYPE[task_type]` from `@legwork/shared` —
the shared spec schemas are the validators, nothing here is a copy of them.

## Row shape

```json
{
  "id": "lisbon-pasteis-de-belem-queue",
  "city": "Lisbon",
  "country": "PT",
  "task_type": "photo-of",
  "amount_usdc": 4.0,
  "posted_ago_s": 5400,
  "exact": { "lat": 38.6974795, "lon": -9.2033202 },
  "why": "A trip-planning agent decides whether to send its user now or later.",
  "spec": {
    "place": {
      "place_id": "node/398922337",
      "name": "Pastéis de Belém",
      "street_address": "Rua de Belém 84-92",
      "locality": "Lisbon",
      "country": "PT"
    },
    "subject": "queue_length",
    "subject_detail": "queue at the takeaway door, whole line",
    "claimed_state": "Google: usually 20 min wait",
    "source": "google"
  }
}
```

- `id` — unique, kebab-case, `<city>-<place>-<what>`.
- `city` — a key of `CITY_BOXES`; `country` — that city's ISO-3166 alpha-2 code. Both are
  absent on a `compare-two` row.
- `task_type` — one of `TASK_TYPES`.
- `amount_usdc` — at least `PRICE_FLOOR_USDC[task_type]`, at most 10. The worker receives this
  figure; `priceUnits` in the database is computed with `priceWithFee`, never typed.
- `posted_ago_s` — integer in `[600, 72000]`; stagger it so the feed has an order and real
  tasks (posted now) stay on top.
- `exact` — the OSM element's coordinate, seven decimals or fewer. It lands in the private
  `exact_lat/lon` columns only; the public surfaces get `area` (geohash-5) and a rounded
  coordinate through the existing code. Absent on a `compare-two` row, whose `area` is `any`.
- `why` — one sentence (≤ 140 chars) for this README and the reviewer. It is **never
  rendered** anywhere.
- `spec` — exactly what an agent would send to `POST /tasks`. `spec.place.place_id`,
  `name`, `street_address` and (call-confirm) `spec.phone` are copied **verbatim** from the
  OSM tags. Keep `subject_detail` ≤ 50 characters and `claimed_state` ≤ 40, or the
  300-character wire limit (`SPEC_MAX_CHARS`) bites.

Rows are inserted at `taskId = 9_000_100 + index + 1`, so reordering the file changes ids; add
new rows at the end.

## Adding a row

1. **Find the OSM id.** One Overpass query by name and city:

   ```
   [out:json][timeout:25];
   nwr["name"="Curry 36"](52.40,13.20,52.60,13.60);
   out center tags;
   ```

   The bbox is the city's `CITY_BOXES` entry. The element must carry a business tag
   (`amenity`, `shop`, `tourism`, …), an `addr:street`, and — for `call-confirm` — a `phone`
   in international form. Never invent an id; if the place has none of these, pick another
   well-known business of the same kind in the same city and say which in the PR.
2. **Copy the tags.** `place_id` is `<type>/<id>`. `street_address` is `addr:street` plus
   `addr:housenumber`. `phone` is the tag verbatim, E.164 with the `+` first. `exact` is the
   element's `lat`/`lon` (or `center` for a way or relation).
3. **Write the row** at the end of `catalog.json`, `city` and `country` matching a
   `CITY_BOXES` entry and `spec.place.locality` equal to `city`.
4. **Run the offline tests**, which parse the whole file:

   ```bash
   pnpm --filter @legwork/api test -- seed-catalog
   ```

5. **Run the check script** with the operator's `.env` (class L — it opens a socket, one
   Overpass request per row with a 1 s pause, never in CI, never imported by a test):

   ```bash
   pnpm --filter @legwork/api seed:check-catalog
   ```

   It prints one line per row — `<id>  accepted | invalid <field> <reason> | refused <class> |
   unavailable | area-mismatch …` — and exits 1 unless every row is `accepted`. It reads
   `OVERPASS_URL` from the environment and nothing else.

## The one rule about refusals

A row the gate does not print `accepted` for is **swapped, never kept**. A seeded errand the
product would refuse if an agent posted it is a lie on the board. The check script's output is
the evidence, and it goes into the PR that adds the row.

## Cities

`CITY_BOXES` (`catalog.ts`) names the ten cities and their bounding boxes, `[S, W, N, E]` in
the order Overpass uses: Leiria, Lisbon, Porto, Madrid, Berlin, London, New York,
San Francisco, Singapore, Tokyo. A row's `exact` must lie inside its city's box. To seed an
eleventh city, add a box first.
