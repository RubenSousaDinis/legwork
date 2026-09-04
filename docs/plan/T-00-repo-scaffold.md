---
id: T-00
title: Repo scaffold and governance (new `legwork` repo, hour one)
lane: lead
day: 1
size: S
agent_class: L
must: true
depends_on: []
owned_paths:
  - "**"   # bootstrap only; after this PR the ownership map in AGENTS.md applies
labels: [area:root, wave:1, size:S, agent:local]
branch: t-00/scaffold
---

# T-00 — Repo scaffold and governance

Owner: the lead. Starts **Sept 4 16:00 UTC sharp** (nothing before — ETHGlobal Start Fresh). Target: merged by 16:45 UTC so the first three agents can be dispatched. Everything here is transcribed from `fafo/hackathon-legwork/repo-seed/*.draft.md`, which were written pre-kickoff as planning text.

## 1. Context
The `legwork` monorepo hosts four Foundry contracts, five TypeScript packages, three Next.js apps and a subgraph, built by several agents in parallel. This task creates the skeleton, pre-declares **every** dependency (so no agent ever touches a lockfile), installs the guardrails (CI, PR template, labels, branch protection, `AGENTS.md`) and deploys empty shells so the operator can register the mini-app URL in the World Developer Portal once.

## 2. Exact scope
- `gh repo create RubenSousaDinis/legwork --public`; default branch `main`; first commit at or after 16:00 UTC with the README honesty line: *"Pre-kickoff artifacts: this planning pack, a pitch deck and a static UI mockup, all dated and public. No code or stylesheet from them is in this repo."* and a dated *"state of this repo on 2026-09-04"* line.
- `LICENSE` — MIT (only if the employment-contract clause read in 07 cleared it; otherwise open a `needs-operator` issue and continue).
- pnpm workspace (`pnpm-workspace.yaml` with `catalog:`), Node 22 LTS (`.nvmrc`), `tsconfig.base.json` (strict), root ESLint flat config + Prettier, `.gitignore` (`.env*`, `!.env.example`, `node_modules`, `out/`, `cache/`, `.next/`, `broadcast/`, `*.local`).
- Packages with `package.json` + every dependency they will ever need at `catalog:` versions, and an empty `src/index.ts`: `packages/shared`, `packages/chain`, `packages/screening`, `packages/payments`, `packages/mcp`, `packages/subgraph-client`; apps `apps/api`, `apps/miniapp`, `apps/dashboard` (`create-next-app` App Router, TypeScript, Tailwind v4, no `src/` dir); `subgraph/` (`graph init --from-example` skeleton stripped to `subgraph.yaml`, `package.json`); `examples/`, `scripts/`.
- Catalog (pin exact versions on the day): `typescript`, `tsx`, `vitest`, `eslint`, `typescript-eslint`, `prettier`, `zod` (v4), `viem`, `@types/node`, `next`, `react`, `react-dom`, `tailwindcss`, `@worldcoin/idkit`, `@worldcoin/idkit-core`, `@worldcoin/minikit-js`, `@x402/core`, `@x402/evm`, `@x402/fetch`, `mcp-handler`, `@modelcontextprotocol/sdk` (+ the v2 packages `mcp-handler` requires), `@anthropic-ai/sdk`, `drizzle-orm`, `drizzle-kit`, `postgres`, `@electric-sql/pglite`, `@supabase/supabase-js`, `sharp`, `exifr`, `jose`, `ngeohash`, `fastest-levenshtein`, `fast-json-stable-stringify`, `pino`, `msw`, `@playwright/test`, `@graphprotocol/graph-cli`, `@graphprotocol/graph-ts`, `zod-to-openapi` (or `@asteasolutions/zod-to-openapi`).
- Foundry: `forge init --no-git contracts`, `forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts`, `remappings.txt`, `foundry.toml` (`solc 0.8.24`, optimizer on, `fs_permissions = [{ access = "read-write", path = "./deployments" }]`, `[rpc_endpoints] base_sepolia = "${BASE_SEPOLIA_RPC_URL}"`, `[etherscan] base_sepolia = { key = "${BASESCAN_API_KEY}", chain = 84532 }`); `.gitignore` adds `contracts/deployments/anvil.json`.
- `AGENTS.md`, `.github/pull_request_template.md`, `.github/banned-words.txt`, `.github/labels.yml` + `gh label create` loop, `.github/workflows/ci.yml` (jobs `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `claim`, `secrets`, `no-live-llm`), `.github/workflows/sweep.yml` (cron `*/5 * * * *` → `POST $API_BASE_URL/admin/sweep` with `SWEEP_SECRET`), `scripts/ci/{path-ownership.sh, banned-words.sh, commit-trailers.sh, claim.sh}`.
- **Task claiming** (`repo-seed/claim.draft.md`): `scripts/claim.sh`, `scripts/release.sh`, `scripts/claims.sh` (all `chmod +x`) and `scripts/ci/claim.sh`. This is the mutex that stops two agents starting the same brief — a push of the task branch to `origin` before any code exists, which git makes exclusive. Test it before the first dispatch: run `scripts/claim.sh T-02` twice from two clones and confirm the second exits 1. The winner's draft PR must go green on all nine jobs; then `scripts/release.sh T-02 --force` to reset before the real dispatch.
- Branch protection on `main`: required checks = the nine CI jobs; 1 approval; **squash merging disabled**, merge commits enabled; no force-push.
- `docs/plan/` = copy of `fafo/hackathon-legwork/tasks/` (the disclosed plan; the issues link to these files). `docs/spikes/RESULTS.md`, `FEEDBACK-WORLD.md` (four verbatim headings, see T-02), `POSTERS.md` — created empty-with-headings here so T-02 only fills them.
- Vercel: three projects (`legwork-api` root `apps/api`, `legwork-miniapp` root `apps/miniapp`, `legwork-dashboard` root `apps/dashboard`), Hobby, Node 22; env vars from `.env.example` names set by the operator; first deploy of the empty shells. **The operator registers `https://<legwork-miniapp>.vercel.app` in the Developer Portal once.**
- Supabase: `drizzle-kit push` of the T-01 schema is done in T-01b; here only `DATABASE_URL` wiring and a `pnpm db:push` script.
- Root `package.json` scripts declared now so no agent edits a root file later: `db:push`, `abi:gen`, `osm:extract`, `demo:run`, `demo:reset`, `inserts`, `e2e:anvil`, `typecheck`, `lint`, `test`, `build` (each delegating with `pnpm --filter`). The bodies may be `echo "not yet" && exit 1` until their owning task lands.
- Issues: run the `dispatch` loop — `gh issue create` per `docs/plan/T-*.md` with title `T-xx: <title>` and labels from front-matter, plus `status:ready` (skip T-00/T-01). **Tee the id → number map to `docs/plan/ISSUES.txt`** (`T-02 7` one per line, committed): `scripts/claim.sh` reads it to label the issue and to check the task's dependencies are closed.

## 3. Out of scope
- Interfaces (T-01). Any product code.

## 4. Owned paths
```
** (bootstrap PR only)
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `repo-seed/*.draft.md` | fafo (pre-kickoff) | verbatim text for AGENTS.md, PR template, CI, labels, banned words, env example, keys, dispatch, **claim scripts** |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| Workspace + catalog, CI gates, labels, PR template, AGENTS.md | root | every task |
| `scripts/ci/path-ownership.sh` (reads the `owned-paths:` block from the PR body) | `scripts/ci/` | CI |
| `scripts/claim.sh` / `release.sh` / `claims.sh` + `docs/plan/ISSUES.txt` | `scripts/` | every agent (step 0 of every brief); the lead |

## 7. Step list
1. 16:00 UTC: `gh repo create`, `git init`, LICENSE, README stub, first commit + push (the timestamp is the Start Fresh evidence).
2. Workspace, catalog, package stubs, Foundry init; `pnpm install`; `pnpm -r typecheck`; `forge build` — all green on stubs.
3. Transcribe `repo-seed/*` → `AGENTS.md`, `.github/*`, `scripts/ci/*`; push; confirm CI green on the empty repo; set branch protection.
4. Vercel projects + first deploy; hand the mini-app URL to the operator.
5. `docs/plan/` copy; issue + label loop → `docs/plan/ISSUES.txt`; claim scripts in and the two-clone race test green **before** the 16:45 dispatch.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| CI on the scaffold PR | all nine jobs green on an empty repo |
| `scripts/claim.sh T-02` run twice from two clones | first exits 0 and opens one draft PR, second exits 1 with `ALREADY CLAIMED`, overwrites no branch and opens no second PR |
| CI on that draft claim PR | all nine jobs green on an empty claim commit — proves the harness before any agent needs it |
| `pnpm -r typecheck && forge build` | green |
| `gh issue list --label wave:1` | one issue per Day-1 brief |
| `curl https://<legwork-api>.vercel.app/healthz` | 200 (stub) |

## 9. Verification commands
```bash
pnpm install --frozen-lockfile && pnpm -r typecheck && forge build
gh api repos/RubenSousaDinis/legwork/branches/main/protection | jq '.required_status_checks.contexts'
```

## 10. Hard rules
- First commit **at or after Sept 4 16:00 UTC**; nothing generated before.
- No file from `fafo/hackathon-legwork/pitch/` or `design-system/` — the design spec is `repo-seed/DESIGN-SPEC.draft.md` typed in as `DESIGN-SPEC.md`.
- Banned words list installed before the first agent PR.

## 11. Definition of done
- [ ] Repo public, CI green, branch protection on, labels created, issues created with `status:ready`, `ISSUES.txt` committed.
- [ ] `scripts/claim.sh` proven exclusive by the two-clone race test.
- [ ] Three Vercel shells live; mini-app URL registered in the Portal (operator confirms in the PR).

## 12. PR checklist
```
Task: T-00 — Repo scaffold
owned-paths: ** (bootstrap)
AI-Usage: <one line>
```

## 13. If blocked
Lead-owned; record decisions in `docs/plan/DECISIONS.md`.

## 14. Reviewer notes
Check the catalog covers every dependency named in briefs T-02 … T-49 (grep the briefs for `import`/package names); check squash is disabled; check `.env` is ignored and `.env.example` is not; check the claim race test actually failed the second caller (a claim that silently succeeds twice is worse than none).

## 15. Round 2+
—
