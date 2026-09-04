---
id: T-23
title: Deploy the subgraph to Studio and wire the query URL
lane: C
day: 2
size: S
agent_class: L
must: true
depends_on: [T-09, T-14]
owned_paths:
  - subgraph/subgraph.yaml            # HAND-OFF: T-09 creates this file with placeholders and merges first; you change only the address and startBlock VALUES
  - subgraph/README.md                # HAND-OFF: T-09 leaves it unwritten; you own it from the moment T-09 merges
  - docs/spikes/RESULTS.md            # the #Graph section only
labels: [area:subgraph, wave:2, size:S, agent:local]
branch: t-23/subgraph-deploy
---

# T-23 — Deploy the subgraph to Studio and wire the query URL

**Critical path.** The dashboard and `preflight_workers` are dark until this lands: T-26 has nothing to render and T-27 has nothing to answer with. Day 2 evening, lead-run with the operator's `.env`, one PR.

## 1. Context
T-09 wrote the manifest and the four handlers with placeholder addresses. T-14 deployed the four contracts to Base Sepolia and seeded the demo lifecycles. This task joins them: read the deployed addresses, fill the two placeholder fields per data source, deploy to Subgraph Studio, wait for the index to reach the chain head, and put the query URL in front of the three Vercel projects. It is deliberately the smallest possible task — you change six values in a YAML file and run two commands — because everything downstream is blocked on it.

> **02-architecture.md — Subgraph** "schema and five handlers written on Saturday and deployed to Studio that evening so it indexes while the rest is built. Entities: `Worker` (`seeded`, `area`, `taskTypes`, `completed`, `lastCompletedAt`), `Task` (state, type, `buyer`, amount, `geohash5` only — never a per-task coordinate keyed to a nullifier), `Feedback`, `Mark`, `PosterStats` (distinct buyers not on the operator allowlist — the external-poster counter the W3 gate is judged on). Serves `preflight_workers` (the AI-track qualification: the agent acts on it) and the dashboard."

> **02-architecture.md — MCP server** "Tools: `preflight_workers(taskType, area)` (subgraph: active = completed a task in the last 7 days, returned as a real/seeded split, median from real completions only or labelled `seeded`)"

**Open question you must close in RESULTS.** A testnet subgraph **cannot** be published to the decentralized network — Studio is the end of the line on `base-sepolia`. Whether the Studio query URL satisfies the Graph track's "consume live data from a Graph provider" is therefore an open question for the Graph Discord. Ask it, and record the answer — or the fact that no answer came — in `docs/spikes/RESULTS.md` under `#Graph`. Do not guess in the PR body.

## 2. Exact scope
- Read `contracts/deployments/base-sepolia.json` (written by T-14): `addresses.workerRegistry`, `addresses.taskEscrow`, `addresses.reputation`, `addresses.abuseMark`, and `startBlock`.
- Fill the four `address:` values and the four `startBlock:` values in `subgraph/subgraph.yaml`, replacing the `# T-23` placeholders T-09 left. **Nothing else in that file changes** — not the network, not a handler, not an entity, not an ABI path.
- `graph auth --studio $GRAPH_DEPLOY_KEY`, then `graph deploy --studio $SUBGRAPH_SLUG` with a version label that matches the git short SHA.
- Wait for the Studio indexing status to reach the chain head (`synced: true`, `chainHeadBlock == latestBlock`, `fatalError: null`). Do not proceed on a partially indexed deployment.
- Write `subgraph/README.md`: the deployed slug and version, the Studio query URL, the deploy command, "the query URL is publishable; `GRAPH_DEPLOY_KEY` and `GRAPH_API_KEY` are not", and a two-line "how to redeploy after a contract redeploy" note (bump `startBlock`, redeploy, the old version keeps serving until the new one syncs).
- Set `SUBGRAPH_QUERY_URL` and `GRAPH_API_KEY` in **all three** Vercel projects (API, dashboard, mini-app), plus `NEXT_PUBLIC_SUBGRAPH_QUERY_URL` where a browser reads it. Redeploy each so the values take.
- Add the `#Graph` entry to `docs/spikes/RESULTS.md`: slug, version, Studio deployment URL, sync time, the three query results from §8, and the Discord answer (or "asked <when>, no answer at <time>").

## 3. Out of scope
- Any mapping, entity, handler or manifest structure — T-09 owns all of it. If the index shows a mapping bug, comment on T-09's issue; do not fix it here.
- `subgraph/schema.graphql` — frozen (T-01). `packages/subgraph-client/**` — T-09.
- Contract deployment or re-seeding (T-14). The dashboard (T-26), the MCP tool (T-27), the preflight capture (T-46).
- Do not touch: `contracts/**`, `apps/**`, `packages/**`, `subgraph/src/**`, `subgraph/abis/**`, root configs.

## 4. Owned paths
```
subgraph/subgraph.yaml     # the address and startBlock values ONLY
subgraph/README.md
docs/spikes/RESULTS.md     # the #Graph section ONLY
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `contracts/deployments/base-sepolia.json` | T-14 | `addresses{workerRegistry, taskEscrow, reputation, abuseMark}` and `startBlock` |
| `subgraph/subgraph.yaml` placeholders | T-09 | four `address: "0x0000…0000" # T-23` and four `startBlock: 0 # T-23` lines |
| `GRAPH_DEPLOY_KEY`, `SUBGRAPH_SLUG`, `SUBGRAPH_QUERY_URL`, `GRAPH_API_KEY` | `.env` (names from `.env.example`, T-01) | deploy auth and the query endpoint |
| Seeded state | T-14 | 20 seeded workers, 5 released lifecycles, the operator's buyer already allowlisted |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| Studio query URL (`SUBGRAPH_QUERY_URL`) | Vercel env on all three projects | T-26, T-27, T-46 |
| Deployed `subgraph.yaml` values | `subgraph/subgraph.yaml` | T-09 (redeploys), T-46 |
| `#Graph` RESULTS entry | `docs/spikes/RESULTS.md` | the prize write-up, T-46 |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-23` — it must print `CLAIMED T-23`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Confirm T-09 and T-14 are **merged**. Read `contracts/deployments/base-sepolia.json`.
2. Edit the eight values in `subgraph/subgraph.yaml`; `git diff` must show eight changed lines and nothing else.
3. `pnpm graph codegen && pnpm graph build` locally before deploying — a build failure after `graph auth` wastes the window.
4. `graph auth --studio $GRAPH_DEPLOY_KEY` (interactive shell only), then `graph deploy --studio $SUBGRAPH_SLUG`.
5. Poll the Studio indexing status until `synced: true` and `fatalError: null`. If a handler throws, capture the message, revert nothing, and open a T-09 issue.
6. Run the three queries in §8 against the query URL; paste the responses into the PR.
7. Set the env vars in the three Vercel projects and redeploy each; confirm one dashboard route renders live rows.
8. Write `subgraph/README.md`; ask the Graph Discord question; write the `#Graph` RESULTS entry.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `pnpm graph codegen && pnpm graph build` (in `subgraph/`) | the filled manifest still builds before any deploy |
| Studio status query | `synced: true`, `fatalError: null`, `latestBlock == chainHeadBlock` |
| `{ workers(where: {seeded: true}) { id seeded area completed lastCompletedAt } }` | exactly **20** rows, every one `seeded: true` — pasted verbatim into the PR |
| `{ tasks(where: {state: "Released"}) { id state amount fee worker { id seeded } txRelease } }` | exactly **5** rows in state `Released`, each `amount: "3000000"` / `fee: "450000"` — pasted into the PR |
| `{ posterStats(id: "global") { distinctExternalBuyers externalTasks } }` | `distinctExternalBuyers: 0` — only the operator's allowlisted buyer has posted so far, and an allowlisted buyer is never counted |
| PR body | carries the Studio deployment URL and the query URL |
| `docs/spikes/RESULTS.md` `#Graph` | records whether the Graph Discord answered the "Studio query URL as live data" question |

## 9. Verification commands
```bash
cd subgraph && pnpm graph codegen && pnpm graph build
git diff --stat -- subgraph/subgraph.yaml          # expect: 1 file changed, 8 insertions(+), 8 deletions(-)
graph auth --studio "$GRAPH_DEPLOY_KEY"            # never echo the key; never paste this line's output
graph deploy --studio "$SUBGRAPH_SLUG"
curl -s -H "Authorization: Bearer $GRAPH_API_KEY" -H 'content-type: application/json' \
  -d '{"query":"{ posterStats(id:\"global\"){ distinctExternalBuyers externalTasks } }"}' \
  "$SUBGRAPH_QUERY_URL" | tee /tmp/posterstats.json
grep -RniE 'graph_deploy_key|graph_api_key' subgraph/README.md docs/spikes/RESULTS.md && echo FAIL || echo OK
```
Expected: a green build; eight changed lines; a Studio URL printed by `graph deploy`; `distinctExternalBuyers: 0`; the grep prints `OK`.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate).
- **The deploy key never appears in a log, a PR body or a screenshot.** `GRAPH_DEPLOY_KEY` is typed into `graph auth` and nowhere else; scrub any terminal capture before pasting. The **query URL is safe to publish; the API key is not** — `GRAPH_API_KEY` goes into Vercel's env UI, never into a file, a README or a query string.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted). **This task is L-class and does touch the live subgraph and Base Sepolia by design** — that is scoped to the manual steps in §7 and the queries in §8, run by hand from the operator's shell. It adds no automated test that hits the network, and nothing here runs in CI.
- The 20 seeded workers are demo data. Anywhere the numbers from §8 are repeated — PR, RESULTS, a slide — they carry the label "seeded (demo data)". Never claim the seeded workers are people.
- `PosterStats` excludes allowlisted buyers by design; `distinctExternalBuyers: 0` is the honest answer on Day 2 and is reported as such, not hidden.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes (queries pasted verbatim).
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed; `subgraph/subgraph.yaml` shows eight changed lines and nothing structural.
- [ ] Verification output from §9 pasted into the PR, key-scrubbed.
- [ ] `subgraph/README.md` written; `SUBGRAPH_QUERY_URL` + `GRAPH_API_KEY` set in all three Vercel projects and each redeployed.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-23 — Deploy the subgraph to Studio and wire the query URL
owned-paths:
  - subgraph/subgraph.yaml   (address + startBlock values only)
  - docs/spikes/RESULTS.md   (#Graph section only)
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 queries pasted · §9 output pasted below
Studio deployment URL: <url>   Query URL: <url>   (no keys in this body)
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- If a handler throws during indexing, the fix belongs to T-09. File the failing entity and message, redeploy after T-09's patch merges, and bump the version label — do not edit `subgraph/src/**` here.
- If `contracts/deployments/base-sepolia.json` is missing a `startBlock`, `BLOCKED: T-14 startBlock` — do not deploy with `startBlock: 0` on a public network.

## 14. Reviewer notes
Open the `subgraph.yaml` diff first: eight lines, four addresses matching `contracts/deployments/base-sepolia.json` character for character, four identical `startBlock` values, and the `# T-23` comments gone. Then check the three pasted queries actually came back from the query URL (20 / 5 / 0) rather than from a fixture. Then scan the PR body and the RESULTS entry for anything key-shaped. Last, read the `#Graph` entry: it must say what the Discord answered or that it did not answer — an empty confident claim that Studio counts as "live data from a Graph provider" is the failure mode.

## 15. Round 2+
—
