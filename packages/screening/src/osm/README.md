# OSM data

Place data © OpenStreetMap contributors, licensed under the Open Database License (ODbL). https://www.openstreetmap.org/copyright

## Covered region

Two bounding boxes, `S,W,N,E`:

| Region | Bounding box |
| --- | --- |
| Leiria | `39.68,-8.90,39.82,-8.70` |
| Lisbon | `38.68,-9.25,38.83,-9.08` |

Leiria and Lisbon only — an id outside the extract is refused as `region not covered`, never geocoded live.

## Regenerating the extract

```bash
pnpm osm:extract        # or: pnpm tsx scripts/osm-extract.ts
```

`scripts/osm-extract.ts` is the only file in this package's lane that touches the network. It
queries one bounding box at a time, merges the two responses, and writes
`packages/screening/fixtures/osm/leiria-lisbon.json.gz`. Nothing under `src/` or `test/` opens a
socket, and the gate never geocodes at request time: the extract is loaded once at boot.

The output is deterministic — the timestamp comes from the source data rather than the wall
clock, POIs are sorted by type then numeric id, and tag keys are sorted — so re-running the
command against an unchanged region produces an empty `git diff`. The file is refused above
5 MB (5242880 bytes); tighten a bounding box rather than raising the cap.

Set `OSM_EXTRACT_PATH` to point the loader at a different file; unset, it reads the packaged
one.

## Tags that are kept

Only these keys survive into the extract:

`shop`, `amenity`, `office`, `craft`, `healthcare`, `tourism`, `building`, `landuse`, `name`,
`brand`, `opening_hours`, `addr:street`, `addr:housenumber`, `addr:city`, `phone`,
`contact:phone`, `website`

**Every other tag is dropped**, including `operator` and `contact:email`, which carry people's
names. An element is indexed only if it carries one of `shop`, `amenity`, `office`, `craft`,
`healthcare` or `tourism` and has a coordinate: public facts about businesses only, never a
home.
