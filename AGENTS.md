# AGENTS.md — how to work in this repo

You are one of several agents building Legwork in parallel. You own **one task**, described in one brief under `docs/plan/T-xx-*.md` (mirrored as a GitHub issue). Read your brief in full before anything else. Then read this file. Then start.

## Before anything else: claim the task

```bash
scripts/claim.sh T-12      # the id in your brief's front matter
```

It exits **0** — the task is yours, start work — or **1** — another agent already holds it, or a
dependency has not merged, in which case **stop**, write one line saying so, and do not begin.

On success it has already **opened your pull request as a draft**, before any code exists, with
the `owned-paths:` block copied out of your brief. You never run `gh pr create`. Push to that
branch as you go; CI runs on every push, so a break shows up in minutes rather than at the end. Never skip it and never work
on a task you did not claim: two agents on one brief means two branches over the same
`owned_paths`, both green in CI, and whichever merges second silently reverts the first.

The claim is a push of your branch to `origin` before any code exists. That push is what makes
it exclusive — git accepts the first one and rejects every later one — so the claim is real
the moment the script exits 0, not when a label changes. CI re-checks it: your branch's first
commit must be the claim commit (`scripts/ci/claim.sh`).

If you stop on `BLOCKED:`, run `scripts/release.sh T-12` so the task returns to the queue.
Never release a task you do not hold; a claim that looks abandoned is the lead's call, not yours.

## The one rule
**The brief is the contract.** Implement exactly its "Exact scope", nothing in its "Out of scope", touching only its "Owned paths". If the brief and the code disagree, the brief wins — say so in the PR. If the brief cannot be done as written, stop and write `BLOCKED: <exactly what you need>` on the PR; never work around an interface.

## Ownership (enforced by CI)
- Your PR may change only the globs listed under `owned-paths:` in your brief. The PR body repeats them; `scripts/ci/path-ownership.sh` fails anything else.
- **Never edited by task agents:** root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.github/**`, `.env.example`, `demo-data.json`, `packages/shared/**`, `contracts/src/interfaces/**`, `contracts/test/mocks/**`, `subgraph/schema.graphql`, `apps/api/src/db/schema.ts`. These are frozen interfaces. To change one, comment `INTERFACE REQUEST: <what and why>` and stop; the lead ships a small `interface-change` PR, merged first, and tells you to rebase.
- Dependencies are pre-declared in the pnpm catalog. Never add one. Need one? `DEP REQUEST: <package> <why>`. Env var? `ENV REQUEST:`.
- Root `*.md` files belong to the docs lane, one agent at a time. Document your package inside its own `README.md`.

## Branch, commits, PR
- Branch `t-XX/<slug>` from `origin/main` — `scripts/claim.sh` creates and pushes it for you; local agents work in `../legwork-wt/t-XX` (a git worktree). One task = one PR (two when the brief says `(1/2)`/`(2/2)`).
- Commit small and often, imperative mood. Every commit message ends with the trailer
  `AI-Usage: <tool + model> drafted <what>; human <reviewed|edited> <what>` — CI checks it.
- The PR is opened for you as a draft by `scripts/claim.sh`, titled `T-XX: <brief title>`. Fill **every** section of its body and paste the output of the brief's "Verification commands" in before `gh pr ready`.
- Never force-push a branch once it is ready for review (a draft is yours to rewrite). **One exception:** when the reviewer tells you to rebase on `main`, that instruction requires rewriting pushed commits — use `--force-with-lease` pinned to the tip you fetched, and say so in the PR. No other force-push is allowed. Never push to `main`. Merges are merge commits (squash is disabled) — your granular history is part of the submission.

## Tests and CI
- Required checks: `contracts` (forge fmt/build/test), `ts` (typecheck, lint, test, build — includes the screening corpus), `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `claim`, `secrets`, `no-live-llm`.
- Tests never call a live model, a live chain or a live facilitator. Use `FakeChain`, `FakeFacilitator`, `FakeClassifier`, pglite, msw, anvil. Files named `*.live.test.ts` run only with `LIVE_LLM=1` / `LIVE_CHAIN=1` and never in CI.
- Cloud agents have no secrets and no RPC. If your brief is class **C**, nothing you write may depend on live state.

## Hard rules (fail the review)
- **Banned words** anywhere (code, comments, docs, UI): `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. Write "24 hours" / `86400`; say "re-implemented"; the tag is `task-refused`.
- **Money:** agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top). Never a deducted figure. Onchain math is 6-decimal integers.
- **Honesty:** every seeded worker or task renders a `seeded` chip; the pool reads "1 real · +20 seeded (demo data)"; a refused task moves no money and never moves the escrow meter; escrow never shows a release without the proof beside it; the worker's verified chip is always above the fold; "sandbox" and "operator-attested" are visible chips, never fine print; never "trustless".
- **Privacy:** exact coordinates never leave the private task record; public surfaces carry `geohash5` or a coordinate rounded to 3 decimals; proof photos live in a private bucket behind signed URLs; the subgraph never stores a coordinate; the dashboard never shows raw spec text or a requester identity.
- **Payments:** the agent id is verified against the ERC-8004 IdentityRegistry, never trusted from the request; a schema error is a plain 4xx and never marks; only refusals in one of the six abuse classes mark.
- **Keys:** read only from `process.env`; never in a client bundle; every chain write goes through `TxQueue`.
- **Start Fresh:** nothing from the pre-kickoff planning pack's `pitch/` or `design-system/` is copied here. UI is re-typed from `DESIGN-SPEC.md`.

## When you finish
Run the verification commands, paste the output into your draft PR, fill every section of its
body, then mark it ready:

```bash
gh pr ready
```

That is the finish signal — a draft is never reviewed. Then stop. Do not pick up another task — and do not claim one; the lead dispatches. The reviewer replies with `DECISION: merge | round-2 | reassign | split`; on `round-2`, address exactly the `BLOCKING:` items, reply to each in the PR, change nothing else.
