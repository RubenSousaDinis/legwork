# Task briefs — index and dispatch order

One brief per task, written for a less-capable agent that cannot read this planning pack: everything it needs is pasted into the brief. Format: [`_template.md`](_template.md). Plan: [`../13-build-plan.md`](../13-build-plan.md). Operator work: [`OPERATOR.md`](OPERATOR.md). Cross-task requests the briefs could not settle: [`LEAD-NOTES.md`](LEAD-NOTES.md) — **read it before writing T-01**. The exact text to hand each agent, slot by slot: [`DISPATCH-PROMPTS.md`](DISPATCH-PROMPTS.md). At kickoff, T-00 copies this directory to `docs/plan/` in the new repo and opens one GitHub issue per brief (`../repo-seed/dispatch.draft.md`).

Lanes are queues — A contracts/chain · B API/payments/MCP · C screening/subgraph · D frontends · E docs/scripts · lead. Three agents run at once; the lead takes the L-class critical items. Class **L** = local worktree with the operator's `.env`; **C** = cloud, no secrets. ★ critical path · ○ optional (dropped first) · ⇢ substitute (only on a spike failure). Day N = Sept 3 + N.

Status values: `planned` → `dispatched` → `in-review` → `merged` · `dropped`. Update the column each evening.

**The column below is a planning snapshot, not the live state.** Once the repo exists, a task is
claimed by an agent running `scripts/claim.sh T-xx`, which pushes the task branch to `origin`
before any code exists — that push is what stops two agents starting the same brief, since git
accepts one new ref and rejects the rest — and then opens the PR as a **draft**, so the PR list
is also the claim board. `scripts/claims.sh` prints who holds what;
`status:*` labels mirror it for humans. Mechanism and the stale-claim rule:
[`../repo-seed/claim.draft.md`](../repo-seed/claim.draft.md).

| ID | Brief | Lane | Day | Size / Class | Depends on | Status |
|---|---|---|---|---|---|---|
| T-00 ★ | [Repo scaffold + governance](T-00-repo-scaffold.md) | lead | 1 | S / L | — | planned |
| T-01 ★ | [Interface freeze (a contracts · b TypeScript)](T-01-interface-freeze.md) | lead | 1 | L / L | T-00 | planned |
| T-02 | [Docs skeletons](T-02-docs-skeletons.md) | E | 1 | S / C | T-00 | planned |
| T-03 ★ | [Spike S3 — x402 verify → post → settle](T-03-spike-x402.md) | B | 1 | M / L | T-00 | planned |
| T-04 | [Spike S5 + S1 — ERC-8004 ABI, Router probe](T-04-spike-erc8004.md) | A | 1 | S / L | T-00 | planned |
| T-05 | [Mini-app scaffold + `/probe`](T-05-miniapp-scaffold-probe.md) | D | 1 | M / C | T-01b | planned |
| T-06 ★ | [Screening deterministic gate + 56-row corpus](T-06-screening-gate-corpus.md) | C | 1→2 | M / C | T-01b | planned |
| T-07 | [`packages/chain` — TxQueue, clients, FakeChain](T-07-chain-package.md) | A | 1→2 | M / C | T-01a | planned |
| T-08 ★ | [API skeleton](T-08-api-skeleton.md) | B | 1→2 | M / C | T-01b | planned |
| T-09 | [Subgraph mappings + client](T-09-subgraph-mappings.md) | C | 1→2 | M / C | T-01 | planned |
| T-10 | [Dashboard shell](T-10-dashboard-shell.md) | D | 1→2 | M / C | T-01b | planned |
| T-11 ★ | [WorkerRegistry](T-11-worker-registry.md) | A | 1→2 | M / C | T-01a | planned |
| T-12 ★ | [TaskEscrow (two PRs)](T-12-task-escrow.md) | A | 1→2 | L / C | T-01a | planned |
| T-13 ★ | [Reputation + AbuseMark](T-13-reputation-abusemark.md) | A | 1→2 | M / C | T-01a, T-04 | planned |
| T-14 ★ | [Deploy + Seed](T-14-deploy-seed.md) | lead | 2 midday | M / L | T-11, T-12, T-13 | planned |
| T-15 ★ | [`packages/payments`](T-15-payments-package.md) | B | 2 | M / C | T-03, T-08 | planned |
| T-16 ★ | [`POST /tasks` + `/check`](T-16-post-tasks.md) | B | 2 | M / C | T-15, T-06, T-07 | planned |
| T-17 ★ | [Worker routes + proof checks + sweeper (two PRs)](T-17-worker-routes.md) | B | 2→3 | L / C | T-08, T-07 | planned |
| T-18 | [`/proofs`](T-18-proofs.md) | B | 2 | M / C | T-08 | planned |
| T-19 ★ | [Buyer / public / admin routes + long-poll](T-19-buyer-public-admin-routes.md) | B | 2→3 | M / C | T-08 | planned |
| T-20 ★ | [IDKit v4 verify + attestation + `/register`](T-20-idkit-register.md) | B | 2 | M / C | T-08, T-07 | planned |
| T-21 | [Classifier](T-21-classifier.md) | C | 2 | M / C | T-06 | planned |
| T-22 | [OSM extract + PlaceIndex](T-22-osm-extract.md) | C | 2 | M / C | T-06 | planned |
| T-23 ★ | [Subgraph deploy to Studio](T-23-subgraph-deploy.md) | lead | 2 eve | S / L | T-09, T-14 | planned |
| T-24 ★ | [Mini-app auth flow](T-24-miniapp-auth.md) | D | 2→3 | M / C | T-05, T-20 | planned |
| T-25 ★ | [Mini-app task list + claim](T-25-miniapp-tasks-claim.md) | D | 3 | M / C | T-24, T-17 | planned |
| T-26 | [Dashboard live wiring](T-26-dashboard-live.md) | D | 3→4 | M / C | T-10, T-19, T-09 | planned |
| T-27 ★ | [MCP hosted core](T-27-mcp-hosted.md) | B | 3 | M / C | T-19, T-09 | planned |
| T-28 ★ | [`hire_human` + local wallet mode](T-28-mcp-hire-local.md) | B | 3 | M / C | T-27, T-16 | planned |
| T-29 ★ | [CLI worker + demo scripts → green headless loop](T-29-headless-loop.md) | lead | 3 (15:00) | M / L | T-16, T-17, T-19, T-14 | planned |
| T-30 | [AbuseMark API wiring + identity verification](T-30-abusemark-wiring.md) | B | 3 | M / C | T-16, T-13 | planned |
| T-31 | [`SKILL.md` + `docs/mcp.md`](T-31-skill-md.md) | E | 3 | S / C | T-27 | planned |
| T-32 | [Register the ERC-8004 identity; first `paid-on-proof`](T-32-register-identity.md) | A | 3 | S / L | T-14, T-04 | planned |
| T-33 ★ | [Mini-app proof flow + earnings](T-33-miniapp-proof-earnings.md) | D | 3→4 | M / C | T-25, T-18 | planned |
| T-34 | [`examples/agent.ts`](T-34-examples-agent.md) | E | 4 | M / L | T-28 | planned |
| T-35 ○ | [OpenAPI](T-35-openapi.md) | B | 4 | S / C | T-19 | planned |
| T-36 ○ | [e2e anvil harness](T-36-e2e-anvil.md) | A | 4 | M / C | T-29 | planned |
| T-37 | [README skeleton + threat model](T-37-readme-threat-model.md) | E | 4 | M / C | T-14 | planned |
| T-38 | [API hardening](T-38-api-hardening.md) | B | 5 | S / C | T-19 | planned |
| T-39 | [Legibility gate](T-39-legibility-gate.md) | D | 5 | S / C | T-26 | planned |
| T-40 ○ | [Observation records](T-40-observations.md) | B | 5 | S / C | T-17 | planned |
| T-41 | [FEEDBACK-WORLD passes](T-41-feedback-world-passes.md) | E | 2/4/5/7 | S / C | T-02 | planned |
| T-42 ○ | [`compare-two` screen + Report task + unverified state](T-42-optional-compare-report.md) | D | 5–6 | M / C | T-33 | planned |
| T-43 | [Present-mode polish](T-43-present-mode-polish.md) | D | 6–7 | S / C | T-26, T-39 | planned |
| T-44 | [Terminal inserts script](T-44-terminal-inserts.md) | E | 7 | S / C | T-28 | planned |
| T-45 | [Docs final](T-45-docs-final.md) | E | 7–8 | S / C | T-37 | planned |
| T-46 | [Preflight verification on live data](T-46-preflight-verify.md) | C | 8 | S / L | T-23, T-27 | planned |
| T-47 | [PNG arm's-length check](T-47-png-check.md) | D | 8 | S / L | T-43 | planned |
| T-48 | [Submission content + prize table](T-48-submission-content.md) | E | 9 | S / C | T-45 | planned |
| T-49 | [Final README + POSTERS](T-49-final-readme.md) | lead | 10 | S / L | all | planned |
| T-13b ⇢ | [Self-deploy ERC-8004 registries (S5 FAIL)](T-13b-self-deploy-erc8004.md) | A | 2 | S / L | T-04 | substitute |
| T-16b ⇢ | [Direct funding gateway (S3 FAIL)](T-16b-direct-funding.md) | B | 6 | M / C | T-15 | substitute |

## Dispatch order (what to hand out when)

- **Day 1, 16:45** (after T-00): T-02 (C), T-03 (L), T-04 (L). **After T-01b (~19:30)**: T-05, T-06, T-08 (C, evening); then overnight cloud burst: T-07, T-09, T-10, T-11, T-12, T-13.
- **Day 2 am** (after reviewing the overnight PRs): T-15, T-20, T-21, T-22, T-24; lead runs T-14 at midday. **pm**: T-16, T-17 (1/2), T-18, T-19; lead runs T-23 in the evening.
- **Day 3 am**: T-17 (2/2), T-27, T-30, T-25, T-31, T-32 (L); lead runs **T-29 at ~15:00**. **pm**: T-28, T-33, T-26.
- **Day 4 eve**: T-34 (L), T-36 ○, T-37, round-2 fixes from the phone log. **Day 5 eve**: T-35 ○, T-38, T-39, T-40 ○, T-41. **Day 6 eve**: T-42 ○, T-43, hotfixes; T-16b if S3 pivoted. **Day 7 eve**: T-44, T-45. **Day 8 eve**: T-46 (L), T-47 (L). **Day 9** (freeze 12:00 UTC): T-48. **Day 10**: T-49.
- Keep ≤ 8 PRs *ready for review* (drafts are claims, not review load); dispatch the next task in a lane only when its `depends_on` are merged (`claim.sh` re-checks this and refuses); check `scripts/claims.sh` for stale claims each evening; drop ○ tasks first when behind; never drop anything on the ★ path.
