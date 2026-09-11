---
id: T-65
title: Dashboard — international copy, and the city on every live row
lane: D
day: 8                               # added Sept 11, when the operator chose to take Legwork beyond Leiria
size: S
agent_class: C                       # recorded fixtures and vitest; no live API
must: true                           # the landing page still says "in Leiria" after the product stopped being Leiria
depends_on: [T-62]                   # the wire carries `locality` / `country` only after T-62
owned_paths:
  - apps/dashboard/app/copy.ts
  - apps/dashboard/app/agents/page.tsx
  - apps/dashboard/lib/data/live.ts
  - apps/dashboard/lib/data/types.ts
  - apps/dashboard/lib/data/fixtures/live/**
  - apps/dashboard/components/TaskRow.tsx
  - apps/dashboard/test/**
labels: [area:dashboard, wave:8, size:S, agent:cloud]
branch: t-65/dashboard-international-copy-locality
---

# T-65 — Dashboard — international copy, and the city on every live row

## 1. Context

The dashboard is what a reviewer reads first. Three of its sentences were true on Day 5 and
stop being true when T-62 merges:

- `apps/dashboard/app/copy.ts:37` — `LANDING_HERO` opens "An agent posts a real-world task in
  Leiria".
- `apps/dashboard/app/agents/page.tsx:39` — `call-confirm` is "A short phone call in
  Portuguese from a closed template."
- `apps/dashboard/app/agents/page.tsx:160` — "Honest limits: `verify-open` and `photo-of` are
  Leiria-only during the event; `call-confirm` (Portuguese) and `compare-two` can be done from
  anywhere".

The section is called *Honest limits*, so it has to be rewritten rather than deleted: the new
limit is that the packaged index covers Leiria and Lisbon offline and everything else resolves
live, one Overpass request at a time, and that a `call-confirm` is in whatever language the
place answers the phone in.

And the live feed row: `live.ts:341` prints `posted 14:02 · ez1dp`. A geohash is honest and
unreadable. T-62 adds `locality` and `country` to `PublicTaskView` — the agent's own words for
where the place is, never a coordinate — so a row can read `posted 14:02 · Berlin · DE` and
fall back to the geohash when an older row has neither. With T-63's catalog on the live
database, the feed becomes a list of cities, which is the point.

Demo mode (`lib/data/demo.ts`, `demo-data.json`) is the filmed Leiria story and is **not**
touched.

## 2. Exact scope

- **`LANDING_HERO`** (`copy.ts`), ≤ 320 characters, no city named as the product's home:
  > An agent posts a real-world task — is this shop in Lisbon open, how long is the queue in New York, what does the sign in Berlin say — and funds it in USDC escrow. A World ID-verified person nearby claims it, does it, and submits proof. The escrow releases on proof.
  Update the comment above it ("rewritten Leiria-first") to say "rewritten for a product that
  resolves a place anywhere OpenStreetMap knows it".
- **`TYPE_LINES['call-confirm']`** (`agents/page.tsx:39`): `'A short phone call in the place's
  own language, from a closed template.'`
- **Honest limits** paragraph (`agents/page.tsx:157–163`) becomes, keeping the `mono` spans:
  > `verify-open`, `photo-of` and `call-confirm` need a real business with an OpenStreetMap id:
  > Leiria and Lisbon resolve from a packaged index, anywhere else resolves live — one request to
  > Overpass, and a 503 rather than a guess when it does not answer. `compare-two` needs no
  > place. A `call-confirm` is in whatever language the place answers the phone in. Answers come
  > back in minutes, not milliseconds; settlement is Base Sepolia testnet.
- **`TaskRowData.locality?: string`** (`types.ts`, beside `meta`): the human label, already
  joined: `Berlin · DE`.
- **`WireFeedRow`** (`live.ts:102`) gains `locality?: string; country?: string`.
  `toFeedRow()` sets `locality` to `${row.locality} · ${row.country}` when both are present,
  `row.locality` alone when only it is, and leaves it unset otherwise. `meta` becomes
  `posted HH:MM · <locality>` when `locality` is set, and stays `posted HH:MM · <area>` when it
  is not. `composeTitle()` is unchanged — the title never carries a place name from the public
  wire.
- **`TaskRow.tsx`**: no new element; `meta` already renders. (If `meta` is built anywhere else
  than `toFeedRow`, leave it.)
- **`LEIRIA_AREA`** (`live.ts:257`) is renamed `FALLBACK_AREA`, same value `'ez1dp'`, comment:
  "The cell the preflight reads when no featured row names one. Leiria — the operator's own
  cell, not a claim about where the product works."
- **Recorded fixtures** (`lib/data/fixtures/live/**`): add `locality: 'Leiria', country: 'PT'`
  to the feed rows that have `area: 'ez1dp'` (they are Leiria rows and the wire will now say
  so), and add **one** new seeded feed row with `area` a Berlin geohash (`u33db`), `locality:
  'Berlin'`, `country: 'DE'`, `seeded: true`, `state: 'open'`, `task_type: 'photo-of'`, 3.00 /
  0.45, no tx. `recordedFixturesAreLeiriaAndCarryNothingPublicSurfacesMayNot`
  (`test/live-mapping.test.tsx:199`) asserts every row's area is `ez1dp` — change that
  assertion to "every row has `area` **and** every non-Berlin row is `ez1dp`", and rename the
  test `recordedFixturesCarryNothingPublicSurfacesMayNot`.

## 3. Out of scope

- Demo mode: `lib/data/demo.ts`, `demo-data.json`, the `DEMO DATA` chip, `PLACE_LABEL`,
  `ROW_TITLES`. The filmed story stays in Leiria.
- The pool's `area: 'Leiria'` label on worker rows (demo) and the subgraph worker areas (live)
  — workers are where they are.
- Any map, any coordinate, any place *name* on a feed row. `locality`/`country` are the agent's
  two words for a city and a country and nothing more.
- `README.md`, `docs/**`, `DESIGN-SPEC.md` — T-66 and T-49.
- Do not touch: `apps/dashboard/lib/data/demo.ts`, `apps/dashboard/app/Landing.tsx`
  (it renders `LANDING_HERO`; the change is in `copy.ts`), `apps/dashboard/components/**`
  other than `TaskRow.tsx`.

## 4. Owned paths

```
apps/dashboard/app/copy.ts
apps/dashboard/app/agents/page.tsx
apps/dashboard/lib/data/live.ts
apps/dashboard/lib/data/types.ts
apps/dashboard/lib/data/fixtures/live/**
apps/dashboard/components/TaskRow.tsx
apps/dashboard/test/**
```

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| `PublicTaskView.locality?`, `.country?` | `packages/shared/src/api-contract.ts` (T-60), produced by `apps/api/app/public/_shared.ts` (T-62) | optional strings on `/public/feed` and `/public/task/:id` |
| `WireFeedRow`, `toFeedRow`, `composeTitle` | `apps/dashboard/lib/data/live.ts` | the adapter you extend |
| `TaskRowData` | `apps/dashboard/lib/data/types.ts` | the row shape `TaskRow.tsx` renders |
| `metaWithDisclosure` | `apps/dashboard/components/TaskRow.tsx:20` | the call-confirm disclosure is appended to `meta` — your locality must come **before** it, which it does if you only change `toFeedRow` |
| Landing hero length rule | `DESIGN-SPEC.md` (≤ 320 characters, one paragraph) | the ceiling `test/landing.test.tsx` may already check |

## 6. Interfaces produced

| Interface | Where | Consumers |
|---|---|---|
| `TaskRowData.locality?` | `types.ts` | `TaskRow.tsx` via `meta`; T-43/T-47 present-mode if re-run |
| Landing and Agents copy without a home city | `copy.ts`, `agents/page.tsx` | reviewers, T-66's docs (which quote the product claim the same way) |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-65` — must print `CLAIMED`. Exit 1 means another agent
holds it or T-62 has not merged: stop.

1. Read `copy.ts`, `agents/page.tsx:30–45` and `:150–170`, `live.ts:95–120`, `:250–290`,
   `:325–350`, `TaskRow.tsx:1–30`, and the fixture files under `lib/data/fixtures/live/`.
2. Copy first (`copy.ts`, `agents/page.tsx`) with the two copy tests; run `pnpm --filter
   @legwork/dashboard test -- landing agents`.
3. `types.ts`, `live.ts` (`WireFeedRow`, `toFeedRow`, `FALLBACK_AREA`), then the two mapping
   tests.
4. Fixtures: the Leiria rows gain `locality`/`country`; one Berlin row added; the fixture test
   renamed and its area assertion widened.
5. Run §9. Paste the output into the PR. `gh pr ready`.

## 8. Acceptance tests

| Test / command | Asserts |
|---|---|
| `landingHeroNamesNoSingleCityAsHome` (`test/landing.test.tsx`) | `LANDING_HERO` does not match `/in Leiria/`; its length is ≤ 320; it contains `escrow releases on proof` (case-insensitive) |
| `agentsPageStatesTheNewLimitNotTheOldOne` (`test/agents.test.tsx`) | the rendered Agents page contains `resolves live`, `Overpass`, `503` and `packaged index`; does **not** contain `Leiria-only` or `(Portuguese)` |
| `feedRowShowsLocalityWhenTheWireCarriesIt` (`test/live-mapping.test.tsx`) | a wire row with `locality: 'Berlin', country: 'DE', area: 'u33db'` → `TaskRowData.locality === 'Berlin · DE'` and `meta` ends with `· Berlin · DE` and does not contain `u33db` |
| `feedRowFallsBackToTheAreaWithoutLocality` | a wire row with only `area: 'ez1dp'` → `locality` undefined, `meta` ends with `· ez1dp` |
| `feedRowLocalityAloneWhenCountryIsMissing` | `locality: 'Porto'` without `country` → `locality === 'Porto'` |
| `callConfirmDisclosureStillFollowsTheLocality` | a `call-confirm` wire row with locality: `metaWithDisclosure(row)` ends with the disclosure and contains `· Berlin · DE ·` before it |
| `recordedFixturesCarryNothingPublicSurfacesMayNot` (renamed) | as before, plus: every feed row has an `area`; every row whose `locality` is not `Berlin` has `area === 'ez1dp'`; the Berlin row is `seeded: true` |
| `pnpm --filter @legwork/dashboard test` | whole suite green |

## 9. Verification commands

```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/dashboard test
pnpm --filter @legwork/dashboard typecheck
pnpm --filter @legwork/dashboard lint
bash scripts/ci/banned-words.sh
rg -n "Leiria" apps/dashboard/app apps/dashboard/lib/data/live.ts   # expect: only the FALLBACK_AREA comment
```

Expected: suite green with the §8 names present; typecheck and lint clean; `Leiria` in the
live adapter and the app pages appears only in the `FALLBACK_AREA` comment (demo.ts is not in
the grep on purpose).

## 10. Hard rules

- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`,
  `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives
  **3.00**, fee **0.45**. The new fixture row is `3.00` + `0.45`; nothing else about money moves.
- **Honesty:** the seeded fixture row renders the `seeded` chip like every other; the pool copy
  stays "1 real · +20 seeded (demo data)"; the Honest-limits section stays a section about
  limits — it names the 503.
- **Privacy:** the dashboard never shows raw spec text or a requester identity. `locality` and
  `country` are the only two new strings read from the wire, and neither is a coordinate or a
  place name. If `PublicTaskView` ever carried `name`, this adapter would still not read it.
- **Copy floors:** landing prose `data-floor="24"` as in the file; nothing smaller.
- Tests run on recorded fixtures and vitest; no live API, no subgraph.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`,
      `commit-trailers`, `claim`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-65 — Dashboard — international copy, and the city on every live row
owned-paths:
  - apps/dashboard/app/copy.ts
  - apps/dashboard/app/agents/page.tsx
  - apps/dashboard/lib/data/live.ts
  - apps/dashboard/lib/data/types.ts
  - apps/dashboard/lib/data/fixtures/live/**
  - apps/dashboard/components/TaskRow.tsx
  - apps/dashboard/test/**
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it.
Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and
`apps/api/src/db/schema.ts` are frozen. Dependencies: `DEP REQUEST:` — you need none.

- A landing test asserts the old hero text verbatim → update the assertion; that test is yours
  (`apps/dashboard/test/**`).
- A present-mode or deck test (`present-*.test.tsx`, `deck.test.tsx`) quotes "in Leiria" → the
  deck is the filmed story; if the quoted string comes from `copy.ts`, it changes with the
  hero and the test follows; if it is the deck's own text, leave the deck and say so in the PR.

## 14. Reviewer notes

1. Read the Honest-limits paragraph as a stranger. It must still be a list of limits. If it
   reads as marketing, it is wrong.
2. `feedRowShowsLocalityWhenTheWireCarriesIt`: `meta` must not contain the geohash once a
   locality exists — two location labels on one row is noise.
3. `grep -n Leiria apps/dashboard/lib/data/demo.ts` should be unchanged from `main`. Demo mode
   is out of scope, and a diff there is the easiest mistake to make.

## 15. Round 2+

Empty on first dispatch.
