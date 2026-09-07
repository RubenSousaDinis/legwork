# `scripts/fixtures` — the demo place, and the three commands that use it

## The three commands

| Command | What it does |
|---|---|
| `pnpm demo:reset` | `POST /admin/reset-demo`, then `WorkerRegistry.resetWorker` for an explicitly named binding, then the mark count off `GET /public/refusals`. Prints `RESET OK`. |
| `pnpm demo:run` | The whole money loop: post (x402, 3.45 USDC) → claim → submit → release, against Base Sepolia. Last line is `RELEASED`; exit 0. |
| `pnpm cli-worker -- --area ez1dp --place scripts/fixtures/demo-place.json` | The worker half on its own, against a task somebody else posted. |

All three read every key from `process.env` and print none of them. The operator supplies the
environment; `node --env-file=.env` is the usual way.

`demo:run` takes `--agent-id <id>` (the ERC-8004 id the API verifies against the
IdentityRegistry), `--auto-release` (wait out `DEMO_DISPUTE_WINDOW_S` instead of approving),
and `--place <path>`. `demo:reset` takes `--nullifier <uint256>` or `--worker <address>`;
without one it resets nothing on the chain, which is deliberate — see below.

## `demo-place.json`

The one place the demo task is about. It is typed by the operator from a real OpenStreetMap
node, and it carries one field the `Place` schema does not:

- `lat` / `lon` — the CLI worker jitters its capture coordinate within 50 m of this point, so
  the proof lands inside the 150 m geofence. The API never receives this coordinate as part of
  the spec; it geocodes `place_id` against the cached OSM extract itself.

The node must resolve in `packages/screening/fixtures/osm/leiria-lisbon.json.gz`, must carry a
business tag, and its `name` and `street_address` must match the OSM object closely enough for
the gate's fuzzy match (Levenshtein ≤ 3 on the name; the street is a prefix match). An id that
does not resolve is a `422` from `POST /tasks`, not a failed loop.

The committed values are the operator's Day-3 choice:

```
node/2143259076   Farmácia Antunes, Rua Vale de Lobos, Leiria, PT   39.7341702, -8.7995142
```

geohash-5 `ez1dp`, which is the same area `demo-data.json`'s seeded rows use. To film somewhere
else, replace all seven fields and re-check the coordinate: **if the API's geocode of
`place_id` is more than 150 m from the `lat`/`lon` here, every submit auto-disputes.** Fix the
fixture, never the fence.

## Why the proof photo is not in this directory

`cli-worker.ts` renders it at runtime from an in-memory SVG — a coloured rectangle and the line
`LEGWORK CLI FIXTURE <ISO instant> <task_id>`. The instant and the colour change on every run,
so the JPEG bytes and therefore `keccak256` of them change too. That matters: the same content
hash handed in twice for the same place and type is a replay, and the API auto-disputes it. A
committed fixture would make the second rehearsal fail.

`.gitignore` here ignores `*.jpg` so a stray render never lands in the repository.

## Why `demo:reset` resets nothing by default

`WorkerRegistry.resetWorker(nullifier)` deletes the binding in both directions, so the address
stops being a worker at all. Run against the seeded CLI worker it would break the next
`demo:run` rather than prepare it. The flag is for the demo human's World ID binding, which is
the one thing a rehearsal genuinely needs to free.

Onchain abuse marks are a different matter: nothing deletes them. If the refusal wall still
shows marks after a reset, register a fresh demo agent id before filming
(`scripts/register-identity.ts`, T-32) — `demo:reset` says so when it sees them.
