# Seed catalog

26 real errands across ten cities. Each row names a business with a real OpenStreetMap
`place_id` and a spec the screening gate accepts. Rows are inserted by
`POST /admin/seed-demo` as **seeded** demo data: chipped on every surface, backed by no
escrow, claimable by nobody. A seeded row moves no money and cannot be claimed.

## Row shape

See `catalog.json`. Required fields: `id` (kebab-case), `task_type`, `amount_usdc`,
`posted_ago_s`, `why` (reviewer-only — never rendered), `spec` (validated by
`SPEC_BY_TYPE`). Placed rows also carry `city`, `country`, and `exact` (OSM coordinate).
`compare-two` rows omit those and get `area: 'any'`.

## Adding a row

1. Find the OSM id with one Overpass query (name + city bbox), e.g.
   `[out:json][timeout:25];nwr["name"="Curry 36"](52.40,13.20,52.60,13.60);out center tags;`
2. Copy `name`, `addr:street` (+ housenumber) and, for `call-confirm`, the `phone` tag
   **verbatim** into `spec.place` / `spec.phone` (E.164, `+` first).
3. Copy the element's coordinate into `exact`.
4. Keep `subject_detail` ≤ 50 and `claimed_state` ≤ 40 so the 300-character wire limit holds.
5. Run `pnpm --filter @legwork/api seed:check-catalog`. A row the gate refuses is swapped for
   another well-known business of the same kind in the same city — never kept.

## Check script

`pnpm --filter @legwork/api seed:check-catalog` screens every row through `screenEnvelope`
with the live Overpass lookup. It is class L only, never imported by a test, and never run in
CI. Pause is ≥ 1 s between rows.
