---
id: T-66
title: Docs — the shipped limit moved; say where it is now
lane: E
day: 8                               # added Sept 11, when the operator chose to take Legwork beyond Leiria
size: S
agent_class: C                       # prose and the tests that pin it; no secrets, no live calls
must: true                           # a doc that says "cannot be posted today" after T-62 is a false limit
depends_on: [T-59, T-62]             # T-59 wrote the sections this task rewrites; T-62 is the behaviour they now describe
owned_paths:
  - docs/bazantic.md
  - docs/mcp.md
  - SKILL.md
  - examples/recipes/place-anywhere-then-quote.md
  - packages/screening/src/osm/README.md
  - packages/screening/test/osm-placeindex.test.ts
labels: [area:docs, wave:8, size:S, agent:cloud]
branch: t-66/docs-place-anywhere
---

# T-66 — Docs — the shipped limit moved; say where it is now

## 1. Context

On Day 7, T-59 wrote the truth down carefully: "The shipped index covers Leiria and Lisbon
only. A `place_id` outside it does not resolve; `placeOf` returns null and the task cannot be
posted. The gateway widens what an agent can resolve and quote. It does not change what the
deployed product accepts." (`docs/bazantic.md` §"The shipped limit"; repeated in
`examples/recipes/place-anywhere-then-quote.md`, pinned by `bazanticRecordStatesThePlaceIndexLimit`
and `packagedIndexDoesNotResolveTheRecipePlace` in `packages/screening/test/osm-placeindex.test.ts`.)

T-61 and T-62 move that limit. After they merge, the recipe's step 2 — `POST /check` with
Farmácia Adriana, Coimbra, `node/536546148` — answers **200 `accepted: true`**, not 400. A
recipe that still tells an agent to "expect 400" is now wrong in the direction that matters:
it says the product cannot do something it does. The limit did not vanish; it moved. The
packaged index still covers Leiria and Lisbon offline; everywhere else costs one live Overpass
request and can answer **503 `place_lookup_unavailable`** when Overpass does not answer. That
is the sentence every one of these documents must now carry instead.

Two more documents say "Leiria only": `SKILL.md:333` (the agent-facing skill file's *Honest
limits*) and `SKILL.md:140` ("A short phone call in Portuguese"). And `docs/mcp.md:204` gives
`region not covered` as the example of a `class: null` refusal — a string T-61 renamed.

**Root `README.md` lines 34 and 181 say the same thing and are not yours.** T-49 owns the root
README on Day 10; the lead has folded the two-line change into that brief. Do not edit
`README.md`. `examples/transcript.md` is a recorded conversation and is not edited either — a
record is not rewritten when the product changes.

## 2. Exact scope

- **`docs/bazantic.md` §"The shipped limit"** (retitle it **"The shipped limit — and where it
  moved on Day 8"**). Keep the first four sentences (through "…the task cannot be posted.") as
  history, prefixed "Until Day 8:"; delete the last two ("The gateway widens… It does not
  change what the deployed product accepts."); then add a paragraph beginning "From Day 8
  (T-61, T-62):" that says, in this order: the packaged
  extract still answers first and offline for Leiria and Lisbon; a `place_id` outside it is
  looked up live — one Overpass request for that id, no search, no loop; if Overpass knows a
  business there the gate screens it by the same rules; if Overpass says nothing is there the
  answer is still 400 `unresolvable place_id`; if Overpass does not answer the API returns
  **503 `place_lookup_unavailable`** with `retry_after_s: 30` and nothing is posted, charged or
  marked. Then one sentence: "The gateway is still how an agent *finds* an id from a name; the
  product now *accepts* the id it finds." Keep `© OpenStreetMap contributors, ODbL.` Keep the
  sentence `the gateway lists the API; paying is still the agent's own x402 call` somewhere in
  the file — an `apps/api` test greps for it. Keep every table cell non-empty and every TODO
  as `TODO(operator)` — the same suite checks both.
- **`docs/bazantic.md` §"Worked example"**: leave the 2026-09-10 record exactly as it is (it is
  dated, and it was true). Below it add **"Worked example — re-run after T-62"** with a
  `TODO(operator)` cell for the date and for the live `POST /check` status, and the expected
  values written out: `200`, `accepted: true`, `price_usdc: 3.45`. Do not fabricate a run.
- **`examples/recipes/place-anywhere-then-quote.md`**:
  - The paragraph "This recipe widens what an agent can **resolve and quote**… Say that; do not
    imply the limitation is gone." becomes: "This recipe resolves a place the packaged index
    does not know and gets it screened and quoted. Since Day 8 the Task API looks such an id
    up live (one Overpass request, T-61/T-62); before Day 8 it answered 400. If the live
    lookup does not answer, `postCheck` returns 503 `place_lookup_unavailable` — wait
    `retry_after_s` and send the same request once more; never loop."
  - Worked-example table row `Live POST /check`: `**200** {accepted: true, spec_hash, price_usdc: 3.45}` and
    a new row `Before Day 8` carrying the old `400` line, so the history is visible.
  - Step 2 "Expect **400**…" becomes "Expect **200** `{ accepted: true, spec_hash, price_usdc:
    3.45 }`. A **400** `unresolvable place_id` now means Overpass has no business at that id;
    a **503** `place_lookup_unavailable` means Overpass did not answer — retry once after
    `retry_after_s`."
  - Step 3: "The 402 is a quote, not a posted task, and not a promise that paying would create
    one — `postCheck` already said this `place_id` does not resolve." becomes "The 402 is a
    quote, not a posted task. `postCheck` already said the spec screens; paying is the step
    this recipe stops before."
  - Keep: the ODbL line, the fair-use paragraph, `the gateway lists the API; paying is still
    the agent's own x402 call`, the exact Overpass query, `postCheck`, `postTasks`. Tests pin
    all of them.
- **`SKILL.md:140`**: "A short phone call in the place's own language, asking one question from
  a closed template list." **`SKILL.md:333`** *Honest limits*: "`verify-open`, `photo-of` and
  `call-confirm` need a real business with an OpenStreetMap id — Leiria and Lisbon resolve
  offline, anywhere else resolves live with one Overpass request (a 503
  `place_lookup_unavailable` means retry once after `retry_after_s`); `compare-two` needs no
  place; a `call-confirm` is in whatever language the place answers the phone in; workers are
  online `<hours>` UTC."
- **`docs/mcp.md:204`**: `(for example, region not covered)` → `(for example, a place the
  live lookup could not find)`. Add one row to the `hire_human` **errors** (or the nearest
  table of non-refusal outcomes; if there is none, add a short "Other outcomes" list under
  `hire_human`): `503 place_lookup_unavailable` — "the live place lookup did not answer;
  nothing posted, charged or marked; retry once after `retry_after_s`".
- **`packages/screening/src/osm/README.md:14`**: "Leiria and Lisbon only — an id outside the
  extract is refused as `region not covered`, never geocoded live." → "Leiria and Lisbon in
  this file. An id outside it is looked up live by the API (T-61 `overpassLookup.ts`, one
  request, cached) — the extract itself never opens a socket."
- **`packages/screening/test/osm-placeindex.test.ts`**: rename
  `bazanticRecordStatesThePlaceIndexLimit` → `bazanticRecordStatesWhereThePlaceIndexLimitMoved`
  and assert the record contains `leiria-lisbon.json.gz`, `place_lookup_unavailable`, `503`,
  `ATTRIBUTION`, and **no longer** matches `/does not change what the deployed product accepts/`. Keep
  `packagedIndexDoesNotResolveTheRecipePlace` exactly as it is — the packaged index still does
  not resolve Coimbra; that is the whole point of the fallback. In `recipeChainsOverpassAndLegwork`
  add `expect(recipeMd).toMatch(/place_lookup_unavailable/)` and
  `expect(recipeMd).not.toMatch(/still cannot be posted today/)`.

## 3. Out of scope

- Root `README.md` (T-49), `docs/submission.md`, `docs/api.md` and `docs/mcp-schema.md`
  (generated — T-60 regenerated `docs/api.md`), `DESIGN-SPEC.md`, `docs/threat-model.md`.
- `examples/transcript.md` — a record.
- `examples/recipes/worker-pool-then-quote.md` — it names Leiria as the *worker pool's*
  location, which is still true.
- Any code. If a document describes behaviour you cannot find in `apps/api/src/services/hire.ts`
  on `main`, that is a `BLOCKED:`, not a doc fix.
- The Bazantic UI, gateway URLs, screen recordings — `TODO(operator)` as T-58/T-59 did.
- Do not touch: `packages/screening/src/**` other than `osm/README.md`, `apps/**`,
  `packages/mcp/**`.

## 4. Owned paths

```
docs/bazantic.md
docs/mcp.md
SKILL.md
examples/recipes/place-anywhere-then-quote.md
packages/screening/src/osm/README.md
packages/screening/test/osm-placeindex.test.ts
```

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| The lookup behaviour you describe | `apps/api/src/services/hire.ts` `screenEnvelope` (T-62), `packages/screening/src/osm/overpassLookup.ts` (T-61) | read them before writing a sentence about them; quote status codes and field names from the code, not from this brief |
| `503 { error: 'place_lookup_unavailable', retry_after_s: 30 }` | `packages/shared/src/api-contract.ts` (T-60) | the wire shape |
| `REASONS.regionNotCovered = 'place_id not found in OpenStreetMap'` | `packages/screening/src/gate/reasons.ts` (T-61) | the renamed reason |
| `ATTRIBUTION` | `packages/screening/src/osm/buildExtract.ts` | imported by the test, never retyped |
| Tests that grep these files | `apps/api/src/openapi.test.ts:243–276` (`recipeNeverClaimsTheGatewayPays`, `bazanticRecordNamesItsGaps`), `packages/screening/test/osm-placeindex.test.ts` (T-59's five) | sentences and table rules you must not break |

## 6. Interfaces produced

| Interface | Where | Consumers |
|---|---|---|
| The one-paragraph statement of the current limit | `docs/bazantic.md`, `SKILL.md`, the recipe | T-49 (root README, same wording), reviewers, agents reading `SKILL.md` |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-66` — must print `CLAIMED`. Exit 1 means another agent
holds it or T-59/T-62 has not merged: stop.

1. Read `hire.ts` `screenEnvelope` and `overpassLookup.ts` on `main`. Write down the three
   outcomes and their codes from the code. If they differ from §2, the code wins — say so in
   the PR and use the code's values.
2. `docs/bazantic.md` — the retitled section and the re-run table. Run
   `pnpm --filter @legwork/api test -- openapi` (read-only use of a suite you do not own; it
   greps this file).
3. The recipe. Run `pnpm --filter @legwork/screening test -- osm-placeindex`.
4. `SKILL.md`, `docs/mcp.md`, `osm/README.md`.
5. Test edits in `osm-placeindex.test.ts`.
6. Run §9. Paste the output into the PR. `gh pr ready`.

## 8. Acceptance tests

| Test / command | Asserts |
|---|---|
| `bazanticRecordStatesWhereThePlaceIndexLimitMoved` (renamed) | `docs/bazantic.md` contains `leiria-lisbon.json.gz`, `place_lookup_unavailable`, `503`, `ATTRIBUTION`; does not match `/does not change what the deployed product accepts/` |
| `packagedIndexDoesNotResolveTheRecipePlace` (unchanged) | still passes — the packaged index still lacks Coimbra |
| `recipeChainsOverpassAndLegwork` (extended) | as before, plus `place_lookup_unavailable` present and `still cannot be posted today` absent |
| `recipeNeverClaimsTheGatewayPays` (`apps/api/src/openapi.test.ts`, unchanged) | still passes — the sentence is still there and none of the four banned phrases appeared |
| `bazanticRecordNamesItsGaps` (unchanged) | still passes — no empty table cell, every TODO is `TODO(operator)` |
| `rg -n "Leiria only|Leiria-only" SKILL.md docs/mcp.md examples/recipes/place-anywhere-then-quote.md` | no matches |
| `rg -n "region not covered" docs/mcp.md packages/screening/src/osm/README.md` | no matches |
| `bash scripts/ci/banned-words.sh` | clean |

## 9. Verification commands

```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/screening test -- osm-placeindex
pnpm --filter @legwork/api test -- openapi
bash scripts/ci/banned-words.sh
rg -n "Leiria only|Leiria-only|cannot be posted today|does not change what the deployed product accepts" SKILL.md docs/mcp.md docs/bazantic.md examples/recipes/place-anywhere-then-quote.md
rg -n "region not covered" docs/mcp.md packages/screening/src/osm/README.md
git diff --stat origin/main -- README.md examples/transcript.md   # expect: empty
```

Expected: both suites green; both `rg` calls print nothing; the last diff is empty.

## 10. Hard rules

- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`,
  `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives
  **3.00**, fee **0.45**. The recipe's quote stays `price_usdc: 3.45` for a 3.00 task.
- **Honesty:** a dated record is never rewritten; a re-run you did not do is `TODO(operator)`,
  not a number. "Since Day 8" and "before Day 8" are both written down, so a reader can tell
  which claim was true when.
- **Never overstate.** The product resolves an id Overpass knows; it does not geocode an
  address, search by name, or accept a place with no business tag. The 503 exists and is named.
- **Fair use:** every mention of the live lookup says one request, no loop, and the retry is
  the agent's, once, after `retry_after_s`.
- **ODbL attribution** stays in every file that had it; in the test it is the imported
  `ATTRIBUTION` constant.
- No code changes. The one test file you own asserts prose; it does not touch fixtures or
  `src/`.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`,
      `commit-trailers`, `claim`, `secrets`, `no-live-llm`, `docs-generated`.
- [ ] Only files under §4 changed; `README.md` and `examples/transcript.md` untouched.
- [ ] Verification output from §9 pasted into the PR.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-66 — Docs — the shipped limit moved; say where it is now
owned-paths:
  - docs/bazantic.md
  - docs/mcp.md
  - SKILL.md
  - examples/recipes/place-anywhere-then-quote.md
  - packages/screening/src/osm/README.md
  - packages/screening/test/osm-placeindex.test.ts
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
Code read: hire.ts screenEnvelope outcomes = <list the codes you found>
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it.
Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and
`apps/api/src/db/schema.ts` are frozen. Dependencies: none. Env vars: none.

- `hire.ts` on `main` has no `unavailable` outcome or no 503 → T-62 did not land as briefed;
  `BLOCKED: T-62 behaviour differs: <what you found>`. Do not document a behaviour that is not
  in the code.
- `docs/mcp.md` has no table where a 503 fits → add the two-line "Other outcomes" list under
  `hire_human` as §2 says; do not restructure the file.
- A sentence in §2 would make an `apps/api` test fail (for example the four banned gateway
  phrases) → reword; the test is right.

## 14. Reviewer notes

1. Diff `docs/bazantic.md`: the 2026-09-10 worked example must be byte-identical. History is
   not edited.
2. The recipe must not say the limit is gone. Read step 2 as an agent: it names 200, 400 and
   503 and what each means.
3. `SKILL.md` *Honest limits* is still a list of limits and still ends with the `<hours>` UTC
   placeholder the operator fills.
4. `git diff origin/main -- README.md` is empty. T-49 owns it.

## 15. Round 2+

Empty on first dispatch.
