> **Draft — claimed at <utc> by <agent>, not yet started.** Not ready for review until
> `gh pr ready`. Do not review a draft. (Banner written by `scripts/claim.sh`; delete it
> when you mark the PR ready.)

## Task
T-xx — <title>  ·  brief: `docs/plan/T-xx-<slug>.md`  ·  issue: #<n>  ·  PR <1/1 | 1/2 | 2/2>

## owned-paths:
```
<the globs from the brief, one per line — CI compares changed files against this block>
```

## Scope
- [ ] Every bullet of the brief's "Exact scope" is done
- [ ] Nothing from "Out of scope" was touched
- [ ] Every acceptance test exists **with the exact name** in the brief and passes

## Verification output
<paste the output of the brief's "Verification commands">

## Interfaces
- [ ] No file under `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql`, `apps/api/src/db/schema.ts` changed (or this PR carries the `interface-change` label and was opened by the lead)
- Requests raised: <none | INTERFACE REQUEST / DEP REQUEST / ENV REQUEST text>

## Honesty and safety
- [ ] No banned word (`trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`)
- [ ] Money figures 3.45 / 3.00 / 0.45 wherever money is shown
- [ ] No secret, no `.env`, no live network call in tests
- [ ] Seeded things render a `seeded` chip (UI tasks)

## AI usage
<one line: which tool/model drafted what; what a human reviewed or edited — mirrors the commit trailers>

## Reviewer decision (filled by the reviewer)
DECISION: merge | round-2 | reassign | split
