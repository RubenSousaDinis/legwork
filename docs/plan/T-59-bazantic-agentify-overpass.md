---
id: T-59
title: Agentify Overpass on Bazantic, so a place resolves outside two cities
lane: E
day: 7                               # added Sept 10 with T-58, when the operator chose the Bazantic tracks
size: M
agent_class: L                       # queries the live Overpass API and the deployed Task API
must: false                          # an optional prize; the demo does not depend on it
depends_on: [T-58]                   # same bazantic account, same gateway record, same docs/bazantic.md
owned_paths:
  - docs/bazantic.md
  - examples/recipes/**
  - packages/screening/test/osm-placeindex.test.ts
labels: [area:docs, area:screening, wave:7, size:M, agent:local]
branch: t-59/bazantic-agentify-overpass
---

# T-59 — Agentify Overpass on Bazantic, so a place resolves outside two cities

## 1. Context

This is the **"Agentify a new API"** prize ($1,000, split 500/300/200). Read off the live prize
page on 2026-09-10, its qualification requirements are:

> - Create an account on bazantic.com
> - Create an x402/MPP Gateway in Bazantic for your project.
> - Add a service that was not available through Bazantic AND is not an API available via the
>   other sponsors when the event began.
> - Create a working Gateway for that service on Bazantic.
> - Create a recipe that uses both services in one working flow within your hackathon project
> - Explain how other builders and agents could use the new service by demonstrating what the
>   recipe does in a screen recording.
> - Provide the bazantic account username in your submission.

The prize wants a genuinely new service brought into Bazantic and something demonstrated that
agents could not do before. **Legwork has an unusually honest example of that.**

`scripts/osm-extract.ts` calls the live Overpass API at
`https://overpass-api.de/api/interpreter` — but only at build time. At runtime,
`packages/screening/src/osm/placeIndex.ts` reads a frozen file that ships with the package,
`packages/screening/fixtures/osm/leiria-lisbon.json.gz`, and it covers **Leiria and Lisbon only**. A `place_id`
outside that extract does not resolve: `placeOf` in `apps/api/src/services/hire.ts` returns null,
and the task cannot be posted.

That is not a hypothetical limit. On 2026-09-09 the operator asked for a task at a vet in Leiria
and it could not be posted, because the vet was not in the extract.

So the demonstration is true and it is ours: **gateway Overpass on Bazantic and place resolution
stops being a two-city fixture.** An agent that could previously only name a place in Leiria or
Lisbon can name one anywhere, resolve its OSM id and coordinate, and get a screened quote back.

OpenStreetMap is not a sponsor of this hackathon — the sponsor list is The Graph, Hedera, Arc,
World, 1inch, ENS, Uniswap Foundation, Ledger, Privy, Chainlink and Bazantic itself.

## 2. Exact scope

- **`docs/bazantic.md`** (extends T-58's file, does not replace it): a second section for the
  Overpass gateway — its URL, the recipe name, and a plain statement of why Overpass qualifies as
  a new service, naming the sponsor list it is absent from.
- **State the shipped limit plainly** in that file: the packaged index is Leiria and Lisbon only,
  a place outside it does not resolve today, and the gateway is what widens that. Cite the file
  (`packages/screening/fixtures/osm/leiria-lisbon.json.gz`) rather than describing it.
- **`examples/recipes/place-anywhere-then-quote.md`** (new): the second recipe, committed as text.
  It must name, in order:
  1. an Overpass query resolving a place by name and locality to an OSM id and coordinate;
  2. `postCheck` on the Legwork Task API with that resolved `place_id`;
  3. `postTasks` unpaid, and the 402 quote it returns.
- **The worked example must use a place outside the packaged extract** — that is the whole claim.
  Record the place, its resolved OSM id, and the fact that `OsmPlaceIndex` does not contain it.
- **A test that proves the gap is real** (see §8): assert the packaged index does not resolve the
  worked example's place id. If that assertion ever fails, the story is no longer true and the
  recipe needs a different place.
- Same payment boundary as T-58, verbatim, in everything written here.

## 3. Out of scope

- **Changing how the product resolves places.** This task does not make the runtime call Overpass
  live, does not widen the packaged extract, and does not touch
  `packages/screening/src/osm/placeIndex.ts` or `apps/api/src/services/hire.ts`. The gateway is a
  Bazantic-side demonstration; rewiring the product's own place resolution is a much larger change
  and is not this prize's requirement.
- `README.md` and `docs/submission.md` — the prize rows are the lead's, and only against real
  evidence.
- The Graph recipe — that is T-58, and this task depends on it having landed.
- Do not touch: `packages/shared/**`, `apps/miniapp/**`, `apps/dashboard/**`, `contracts/**`,
  `packages/screening/fixtures/osm/**`.

## 4. Owned paths

```
docs/bazantic.md
examples/recipes/**
packages/screening/test/osm-placeindex.test.ts
```

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| Overpass API | `https://overpass-api.de/api/interpreter` | live place lookup; the same endpoint `scripts/osm-extract.ts:21` already uses at build time |
| `OsmPlaceIndex` | `packages/screening/src/osm/placeIndex.ts` | `coordinateOf(place_id)`; reads the packaged gzip, returns undefined outside it |
| `OSM_PLACE_ID` | `packages/shared/src/schemas/place.ts` | `node/…`, `way/…` or `relation/…` — the id shape a resolved place must have |
| `POST /check` | `apps/api/app/check/route.ts` | screening dry run against a resolved `place_id` |
| `docs/bazantic.md` | T-58 | the gateway record this task extends |

## 6. Interfaces produced

| Interface | Where | Consumers |
|---|---|---|
| `examples/recipes/place-anywhere-then-quote.md` | `examples/recipes/` | the submission, the screen recording |
| The Overpass gateway section | `docs/bazantic.md` | the lead flipping the prize rows |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-59` — must print `CLAIMED`. Exit 1 means another agent
holds it or T-58 is still open: stop.

1. Read T-58's `docs/bazantic.md` and `examples/recipes/worker-pool-then-quote.md`. This task
   extends both conventions rather than inventing new ones.
2. Pick the worked example: a real place **outside** Leiria and Lisbon. Resolve it against live
   Overpass yourself and keep the query and the response.
3. Prove the gap: check the resolved id against `OsmPlaceIndex` and confirm it does not resolve.
   That check becomes the §8 test.
4. Creating the Bazantic account, the Overpass gateway and the recipe in Bazantic's UI, and making
   the recording, are **operator-only** (see §14). Ask for the gateway URL and the recording link.
5. Write the recipe file and the `docs/bazantic.md` section from what came back, with
   `TODO(operator)` for anything unsupplied.

## 8. Acceptance tests

| Test / command | Asserts |
|---|---|
| `packagedIndexDoesNotResolveTheRecipePlace` | `OsmPlaceIndex` built from the packaged gzip returns no coordinate for the worked example's `place_id` — the gap the recipe exists to close is real |
| `packagedIndexStillResolvesLeiria` | a known Leiria id still resolves, so the test above is measuring coverage and not a broken index |
| `recipeChainsOverpassAndLegwork` | `examples/recipes/place-anywhere-then-quote.md` names an Overpass query **and** a Legwork operation id; fails if either is absent |
| `bazanticRecordStatesThePlaceIndexLimit` | `docs/bazantic.md` names `packages/screening/fixtures/osm/leiria-lisbon.json.gz` and says the shipped index covers Leiria and Lisbon only |
| `overpassIsNotASponsorApi` | `docs/bazantic.md` lists the hackathon sponsors and states that OpenStreetMap is not among them |

## 9. Verification commands

```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/screening test -- placeIndex
pnpm --filter @legwork/api test -- openapi
bash scripts/ci/banned-words.sh
# the live resolution the recipe claims, run once by hand and pasted:
curl -s -G https://overpass-api.de/api/interpreter --data-urlencode 'data=[out:json];node["name"="<place>"](area);out 1;'
```

Expected: both suites green, `banned-words: clean`, and an Overpass response carrying the OSM id
the recipe names.

## 10. Hard rules

- Banned words anywhere: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`,
  `21 workers`.
- Money figures: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee
  **0.45**.
- **The gateway does not pay for anything.** Same rule and same sentence as T-58: *the gateway
  lists the API; paying is still the agent's own x402 call.*
- **Do not overstate what the gateway changes.** It widens what an agent can *resolve and quote*.
  It does not change what the deployed product accepts: a task whose `place_id` is outside the
  packaged extract still cannot be posted today, and the recipe must say so rather than implying
  the limitation is gone.
- Overpass is a free, shared, community-run service. Do not hammer it: one query per run, and no
  loop in any committed script.
- Tests never call a live model or a live chain. The §8 tests read the packaged fixture; they do
  not call Overpass.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`,
      `commit-trailers`, `secrets`, `no-live-llm`, `docs-generated`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] The worked example's place, OSM id and Overpass query are all in the PR body.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-59 — Agentify Overpass on Bazantic, so a place resolves outside two cities
owned-paths:
  - docs/bazantic.md
  - examples/recipes/**
  - packages/screening/test/osm-placeindex.test.ts
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it. In
particular:

- **T-58 has not merged.** `scripts/claim.sh` enforces `depends_on` and will refuse. Do not create
  the branch by hand.
- **The operator has not supplied the Overpass gateway URL or the recording.** Write everything
  else, mark those `TODO(operator)`, and say so.
- **Overpass is rate-limiting or down.** It is a shared community service and this is a real
  possibility. Say so and stop; do not retry in a loop and do not substitute a different
  geocoder without asking — the prize is about the service you actually gatewayed.

Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and
`apps/api/src/db/schema.ts` are frozen. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

## 14. Reviewer notes

Open in this order:

1. **Is the gap real?** `packagedIndexDoesNotResolveTheRecipePlace` is the load-bearing test. If
   the worked example's place happens to be inside the extract, the entire claim collapses — and
   `packagedIndexStillResolvesLeiria` is what stops that test passing for the wrong reason.
2. **Does the recipe overstate the fix?** The gateway widens what an agent can resolve and quote;
   the deployed product still refuses a place outside its packaged index. A recipe implying you
   can now post a task anywhere is claiming something the API does not do.
3. **Provenance of the gateway URL and recording.** Same as T-58: these come from the operator, in
   a UI no owned path covers. An agent writing a URL it never saw has fabricated evidence.
4. Check the Overpass query in the PR body actually returns the id the recipe names. It is one
   `curl` and it is the difference between a demonstration and a description.

## 15. Round 2+

Empty on first dispatch.
