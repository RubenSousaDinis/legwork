# Build plan — parallel agents, one reviewer (Sept 4–13)

Written Sept 3, after the pack review. The solo plan in `03-schedule.md` is replaced by this
one for execution: several AI coding agents (Claude Code, local worktrees and cloud sessions)
each own one task, in isolation, and open a PR; the lead reviews every PR; at least three
agents ship in parallel. The schedule's dates, gates, cuts and honesty rules still hold —
this document says *who does what, against which frozen interfaces, in which order*.

Briefs live in [`tasks/`](tasks/README.md); the repo conventions the bootstrap task types into
the new repo live in [`repo-seed/`](repo-seed/). Operator-only work is in
[`tasks/OPERATOR.md`](tasks/OPERATOR.md). All of it is pre-kickoff planning (allowed and
disclosed); **no code exists before Sept 4 16:00 UTC**, and nothing from `pitch/` or
`design-system/` is copied into the submission repo.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | One monorepo `RubenSousaDinis/legwork`, public from the first commit, pnpm workspace + Foundry, strict per-path ownership enforced by CI | agents never touch the same file; ownership is checked, not hoped for |
| 2 | Each agent works in its own git worktree/branch (`t-XX/<slug>`), one task per PR, merge commits (**never squash**) | granular commits with AI-usage notes are a submission requirement |
| 3 | Two agent classes: **L** (local worktree with the operator's `.env`, may touch Base Sepolia) and **C** (cloud; mocks, fixtures, pglite, anvil; never a secret) | cloud sessions cannot hold keys; most tasks do not need them |
| 4 | Hosting: three **Vercel Hobby** projects (`apps/api` incl. `/mcp`, `apps/miniapp`, `apps/dashboard`); persistence **Supabase Postgres** (Drizzle) + **Supabase Storage** private bucket for proofs; tests on `@electric-sql/pglite` | the pack's Vercel-in-hour-one story, per-PR preview URLs, no volumes to snapshot. Railway stays the documented fallback for the long-poll if limits bite |
| 5 | Serverless-safe ops: one `TxQueue` (Postgres advisory lock + viem nonce resync) is the only relayer-key writer; `autoRelease`/`expire` run lazily inside long-polls and list calls plus `POST /admin/sweep` from a GitHub Actions cron every 5 min; MCP stateless; long-poll `maxDuration = 60`, `wait ≤ 50`, `poll_after_seconds` on timeout | many function invocations, one key; Vercel Hobby cron is daily-only |
| 6 | x402 handled **in the route handler** with `@x402/core` + `@x402/evm` primitives (facilitator `verify` → screen → `post` → `settle`), not as middleware | the pack's order needs settle *after* post |
| 7 | MCP in **two modes**: hosted at `/mcp` (read/status/approve/dispute tools; `hire_human` returns `payment_required` + install line) and local `npx @legwork/mcp` with the buyer key (all six tools, pays via `@x402/fetch`) | an MCP client cannot answer an x402 challenge; the payer must hold a key |
| 8 | `POST /tasks` returns a **`buyer_token`**; approve/dispute/refund require it | task ids are public (events, subgraph, `/task/<id>`) |
| 9 | Agent id is **verified**, never looked up: optional `agent_id` accepted only if `ownerOf(id) == payer \|\| getAgentWallet(id) == payer` | ERC-8004 IdentityRegistry has no address→id reverse lookup |
| 10 | Contract deltas frozen in T-01: `post(PostParams)` with `area` + `buyerAgentId`; `postAsBuyer`; `allowlistedBuyer`; `WorkerReset`; `releaseClaimFor`; `AbuseMark.markCooldown` owner-settable (86400 default, 120 s filmed) | subgraph needs no coordinate; TaskEscrow can write feedback without a lookup; the S3 pivot needs no redeploy; a rehearsal mark must not burn the filmed 0 → 1 beat |
| 11 | CLI worker is a **seeded** worker on the relayed API routes | no fake "verified" registration to reset; submit-time checks are not bypassed |
| 12 | Classifier: `claude-opus-5`, `output_config.effort: "low"`, structured output (`messages.parse` + `zodOutputFormat`), 3 s abort → keyword class labelled "keyword class — classifier timeout"; a `refusal` stop reason or any error → same fallback; SDK mocked in tests; live calls only behind `LIVE_LLM=1` | the deterministic gate is authoritative; the $40 cap is the product key |
| 13 | `DATA_MODE=live` on the filmed URL; `demo-data.json` drives dev/CI screenshots only and renders a visible "DEMO DATA" chip | a static number can never be mistaken for a live one |
| 14 | Design tokens and hard rules are re-typed into `DESIGN-SPEC.md` from the written spec; no token file, markup or SVG copied | Start Fresh names "designs"; the pack already treats `pitch/` this way |
| 15 | Cadence: **3 agents at once; review + merge + dispatch every evening** (two cycles on weekend days); WIP ≤ 8 open PRs; optional tasks (○) dropped first | review is the bottleneck, not agent hours |

## Repo layout and ownership

```
legwork/
  package.json  pnpm-workspace.yaml (catalog:)  pnpm-lock.yaml  tsconfig.base.json  .nvmrc         LEAD ONLY
  .github/{workflows/ci.yml, workflows/sweep.yml, pull_request_template.md, banned-words.txt, labels.yml}   LEAD ONLY
  AGENTS.md  LICENSE  README.md  SKILL.md  FEEDBACK-WORLD.md  POSTERS.md  DESIGN-SPEC.md  docs/            lane E (one agent at a time)
  demo-data.json  .env.example                                                                      LEAD ONLY
  contracts/            foundry.toml, lib/ (LEAD) · src/interfaces/*.sol + test/mocks/* (LEAD; interface-change only)
                        src/{WorkerRegistry,TaskEscrow,Reputation,AbuseMark}.sol + test/<C>.t.sol (one task per pair)
                        script/{Deploy,Seed}.s.sol  deployments/base-sepolia.json (T-14)
  packages/shared/      zod schemas, enums, constants, addresses, ABIs, api-contract.ts, mcp-contract.ts (LEAD; frozen)
  packages/chain/       viem clients, TxQueue, typed contract clients, FakeChain (T-07)
  packages/screening/   gate/ (T-06) · classifier/ (T-21) · osm/ (T-22) · fixtures/ · pipeline.ts
  packages/payments/    PaymentGateway, X402Gateway, DirectFundingGateway, IdempotencyStore, FakeFacilitator (T-15 / T-16b)
  packages/mcp/         server, tools/, bin/legwork-mcp.ts — hosted + local (T-27 / T-28)
  packages/subgraph-client/  typed GraphQL queries (T-09)
  apps/api/             Next.js route handlers; src/db/schema.ts (LEAD) · one stub file per later task (T-08)
  apps/miniapp/         Next.js worker mini-app, paper ground (lane D)
  apps/dashboard/       Next.js mission control, ink ground (lane D)
  subgraph/             schema.graphql (LEAD) · subgraph.yaml + src/mappings (T-09) · addresses (T-23)
  examples/{agent.ts,prompt.md,transcript.md}   scripts/{cli-worker,demo-run,demo-reset,register-identity,osm-extract,inserts}.ts   scripts/ci/*.sh
```

Rules, enforced by CI: every brief lists `owned-paths:`; the PR body repeats them; `scripts/ci/path-ownership.sh` fails a PR that touches anything else. **Never edited by task agents:** root configs, `.github/**`, `.env.example`, `demo-data.json`, `packages/shared/**`, `contracts/src/interfaces/**`, `subgraph/schema.graphql`, `apps/api/src/db/schema.ts`. A needed change is a comment — `INTERFACE REQUEST:` / `DEP REQUEST:` / `ENV REQUEST:` — and a stop; the lead ships a small `interface-change` PR, merged first and announced in every open PR. Every dependency is pre-declared in the pnpm catalog at T-00, so no agent edits a `package.json` or the lockfile; DEP requests are batched twice a day.

## Wave 0 — the interface freeze (lead, ~3–3.5 h on Day 1)

`T-00` (repo scaffold, governance, Vercel shells, issues; merged by ~16:45 UTC) then `T-01` in two PRs — `01a` contracts side (interfaces, errors, events, EIP-712 domain, mocks, generated ABIs, enums/constants/addresses, `demo-data.json`), `01b` TypeScript side (zod schemas from `10-schemas.md`, `api-contract.ts` + `docs/api.md`, `mcp-contract.ts` + `docs/mcp.md`, `subgraph/schema.graphql`, `apps/api/src/db/schema.ts`, `.env.example`, `docs/keys.md`). Merged by ~19:30 UTC. The full interface text is in [`tasks/T-01-interface-freeze.md`](tasks/T-01-interface-freeze.md); every other brief quotes it.

## Task graph

Lanes are queues (A contracts/chain · B API/payments/MCP · C screening/subgraph · D frontends · E docs/scripts); three agents run at once; the lead takes the L-class critical items. Size S ≤ 1.5 h · M 2–3 h · L ≈ 4 h (two PRs). ★ critical path · ○ optional (dropped first) · ⇢ substitute (only on a spike failure). Day N = Sept 3 + N.

| ID | Title | Lane | Day | Size/Class | Depends |
|---|---|---|---|---|---|
| T-00 ★ | Repo scaffold + governance | lead | 1 | S/L | — |
| T-01 ★ | Interface freeze (a contracts, b TypeScript) | lead | 1 | L/L | T-00 |
| T-02 | Docs skeletons (`FEEDBACK-WORLD.md`, `POSTERS.md`, RESULTS, threat-model rows) | E | 1 | S/C | T-00 |
| T-03 ★ | Spike S3: x402 `verify → post → settle` + replay; sets `PAYMENT_MODE` | B | 1 | M/L | T-00 |
| T-04 | Spike S5 + S1: ERC-8004 ABI vendoring + round-trip; Router probe | A | 1 | S/L | T-00 |
| T-05 | Mini-app scaffold + `/probe` page for S2' | D | 1 | M/C | T-01b |
| T-06 ★ | Screening deterministic gate + pipeline + 56-row corpus runner | C | 1→2 | M/C | T-01b |
| T-07 | `packages/chain`: TxQueue, typed clients, FakeChain | A | 1→2 | M/C | T-01a |
| T-08 ★ | API skeleton: Next app, Drizzle + pglite, config, `/session`, middleware, stubs | B | 1→2 | M/C | T-01b |
| T-09 | Subgraph mappings + `PosterStats` + `subgraph-client` | C | 1→2 | M/C | T-01 |
| T-10 | Dashboard shell on `DESIGN-SPEC.md` (meter, cards, present mode, `data-floor`) | D | 1→2 | M/C | T-01b |
| T-11 ★ | WorkerRegistry + named tests | A | 1→2 | M/C | T-01a |
| T-12 ★ | TaskEscrow (two PRs) + the nine security-table tests + TTL edges | A | 1→2 | L/C | T-01a |
| T-13 ★ | Reputation + AbuseMark + named tests | A | 1→2 | M/C | T-01a, T-04 |
| T-14 ★ | Deploy + Seed (20 seeded workers, 5 lifecycles) + `deployments/` + `abi:gen` | lead | 2 midday | M/L | T-11–13 |
| T-15 ★ | `packages/payments`: gateway interface, X402Gateway, idempotency, FakeFacilitator | B | 2 | M/C | T-03, T-08 |
| T-16 ★ | `POST /tasks` + `/check` orchestration (`settleAfterPost`, caps, no-mark rules) | B | 2 | M/C | T-15, T-06, T-07 |
| T-17 ★ | Worker routes (two PRs) + proof checks + lazy sweeper + reconcile | B | 2→3 | L/C | T-08, T-07 |
| T-18 | `/proofs` service + unit test | B | 2 | M/C | T-08 |
| T-19 ★ | Buyer / public / admin routes + long-poll | B | 2→3 | M/C | T-08 |
| T-20 ★ | IDKit v4 verify + EIP-712 attestation + `/register` | B | 2 | M/C | T-08, T-07 |
| T-21 | Classifier (Anthropic SDK, structured output, timeout fallback) | C | 2 | M/C | T-06 |
| T-22 | OSM extract (Leiria + Lisbon) + `PlaceIndex` | C | 2 | M/C | T-06 |
| T-23 ★ | Subgraph deploy to Studio | lead | 2 eve | S/L | T-09, T-14 |
| T-24 ★ | Mini-app auth flow (verify → session → payout key → register) | D | 2→3 | M/C | T-05, T-20 |
| T-25 ★ | Mini-app task list + claim | D | 3 | M/C | T-24, T-17 |
| T-26 | Dashboard live wiring (`/task/<id>`, `/refusals`, admin, PosterStats) | D | 3→4 | M/C | T-10, T-19, T-09 |
| T-27 ★ | MCP hosted core + contract test | B | 3 | M/C | T-19, T-09 |
| T-28 ★ | `hire_human` + local wallet mode + `bin/legwork-mcp` | B | 3 | M/C | T-27, T-16 |
| T-29 ★ | CLI worker + `demo:run` + `demo:reset` → **green headless loop** | lead | 3 (15:00 UTC) | M/L | T-16, T-17, T-19, T-14 |
| T-30 | AbuseMark API wiring + identity verification | B | 3 | M/C | T-16, T-13 |
| T-31 | `SKILL.md` + `docs/mcp.md` final | E | 3 | S/C | T-27 |
| T-32 | Register the API's ERC-8004 identity via AbuseMark; first `paid-on-proof` | A | 3 | S/L | T-14, T-04 |
| T-33 ★ | Mini-app proof flow + earnings | D | 3→4 | M/C | T-25, T-18 |
| T-34 | `examples/agent.ts` (prompt + real transcript committed) | E | 4 | M/L | T-28 |
| T-35 ○ | OpenAPI from `api-contract.ts` | B | 4 | S/C | T-19 |
| T-36 ○ | e2e anvil harness on `main` pushes | A | 4 | M/C | T-29 |
| T-37 | README skeleton + threat model | E | 4 | M/C | T-14 |
| T-38 | API hardening | B | 5 | S/C | T-19 |
| T-39 | Legibility gate (Playwright 1280×720, `data-floor`) | D | 5 | S/C | T-26 |
| T-40 ○ | Observation records | B | 5 | S/C | T-17 |
| T-41 | FEEDBACK-WORLD passes | E | 2/4/5/7 | S/C | T-02 |
| T-42 ○ | `compare-two` screen + `Report task` + unverified state | D | 5–6 | M/C | T-33 |
| T-43 | Present-mode polish | D | 6–7 | S/C | T-26, T-39 |
| T-44 | Terminal inserts script | E | 7 | S/C | T-28 |
| T-45 | Docs final (threat model, RESULTS, keys, ODbL) | E | 7–8 | S/C | T-37 |
| T-46 | Preflight verification on live Studio data | C | 8 | S/L | T-23, T-27 |
| T-47 | PNG arm's-length check + card cuts | D | 8 | S/L | T-43 |
| T-48 | Submission content + prize-qualification table | E | 9 | S/C | T-45 |
| T-49 | Final README (addresses, GIF, dated line) + POSTERS final | lead | 10 | S/L | all |
| T-13b ⇢ | (S5 FAIL) self-deploy ERC-8004 reference registries | A | 2 | S/L | T-04 |
| T-16b ⇢ | (S3 FAIL) `DirectFundingGateway` | B | 6 | M/C | T-15 |

**Critical path:** T-00 → T-01 → {T-11, T-12, T-13} → T-14 → {T-16, T-17, T-19} → T-29 (green loop, Sun ~15:00 UTC) → T-24/T-25/T-33 (phone) → GO/NO-GO Day 6. Cloud agents run overnight Day 1 so contracts and the API skeleton are reviewable Sat 09:00; deploy Sat ~13:00; API routes Sat evening/Sun morning.

## Wave table

| Day (UTC) | Agent lanes (3 running; queue order) | Lead | Operator (see `tasks/OPERATOR.md`) |
|---|---|---|---|
| **1 Fri 4** 16:00–23:00 | 16:45 T-02, T-03 (L), T-04 (L) → after T-01: T-05, T-06, T-08 → overnight cloud: T-07, T-09, T-10, T-11, T-12, T-13 (burst above three only overnight) | T-00, T-01a, T-01b | repo/labels/protection; Supabase + 3 Vercel projects; env; Portal URL + `rp_id`; S2' via `/probe`; 19:00 Sauton; 22:00 circuit breaker; post #1 |
| **2 Sat 5** | am: review overnight PRs; T-15, T-20, T-21, T-22, T-24 · pm: T-16, T-17 (1/2), T-18, T-19 | T-14 midday; T-23 evening; interface-change PRs | fund float/relayer/buyer/CLI worker; Studio slot + deploy key; Basescan; phone auth test after T-24 |
| **3 Sun 6** | am: T-17 (2/2), T-27, T-30, T-25, T-31, T-32 (L) · pm: T-28, T-33, T-26 | **T-29 green loop ~15:00** | record the two inserts; post #2; phone claim test |
| **4 Mon 7** eve | T-34 (L), T-36 ○, T-37 + round-2 fixes from the phone log | review | full phone run with the *backup* World ID; check-in #1 |
| **5 Tue 8** eve | T-35 ○, T-38, T-39, T-40 ○, T-41 | review | fresh-install timing → RESULTS; 19:30 Bazantic |
| **6 Wed 9** eve | T-42 ○, T-43, hotfixes only | **GO/NO-GO**; T-16b if S3 pivoted | film insurance footage; poster hunt #1; post #3 |
| **7 Thu 10** eve | T-44, T-45, FEEDBACK pass | review | draft narration vs the live dashboard; check-in #2 |
| **8 Fri 11** eve | T-46 (L), T-47 (L), README drafts | review | PNG read; poster hunt #2; post #4 |
| **9 Sat 12** | **code freeze 12:00 UTC** (docs + `hotfix` label only): T-48 | review | Bazantic 2–3 h; worker hour + filming; composite; poster hunt #3 |
| **10 Sun 13** | T-49; no code | final review | narration, export, submit by 13:00 UTC, thread 14:00 |

## Spike-dependent branching

| Spike | Outcome | Mechanism | Affected |
|---|---|---|---|
| S3 x402 | FAIL | `PAYMENT_MODE=direct`; `postAsBuyer` already deployed; dispatch T-16b; local `hire_human` sends `approve` + `postAsBuyer`; inserts show `approve + post`; SKILL/README swap the wire-format adjective; Bazantic Discord question | T-16 (via `PaymentGateway`), T-28, T-34, T-44, T-31, T-48 |
| S2' | Selfie Check / Orb-level | `WORLD_CREDENTIAL_LEVEL=selfie\|orb`, `narrationVariant A\|B` — env + JSON only | T-24 chip text, docs |
| S2' | GPS unavailable | the downgrade path is mandatory in T-33 (`gps_unavailable: true`, tapped confirmation, chip, confidence 0.6) | T-33, T-26 |
| S2' | webview camera / walletAuth broken | web IDKit session mode (T-20/T-24) becomes primary, disclosed on screen | T-24 |
| S5 | FAIL | T-13b self-deploys the reference registries; consumers read `addresses.ts` only; "self-deployed" chip | T-13, T-30, T-32, T-37 |
| circuit breaker | no credential by 22:00 UTC Day 1 | T-00 survives (pack-agnostic); everything else stops; the operator switches packs | all |

## Agent workflow and guardrails

Transcribed into the repo by T-00 from `repo-seed/`.

- **Claiming (the mutex).** Step 0 of every brief is `scripts/claim.sh T-xx`. It checks the task's `depends_on` issues are closed, then creates the branch, puts one empty claim commit on it and **pushes it to `origin` before any code exists** — and that push is the lock: git accepts the first agent's new ref and rejects every later one, so a race has exactly one winner. Only then does it **open the PR as a draft** (with the `owned-paths:` block copied out of the brief rather than retyped, and CI running from the first commit), label the issue `status:claimed` and comment who holds it. Agents never run `gh pr create`; `gh pr ready` is the finish signal, and `gh pr list --draft=false` is the review queue. A ninth CI job (`claim`) asserts the branch's first commit is the claim commit, so an agent cannot skip the script. `scripts/claims.sh` prints who holds what; `scripts/release.sh` gives a task back on `BLOCKED:`. **A claim ≥ 90 min old with no further commit and no PR is dead** (rate limit, closed session) — only the lead clears it, with `release.sh T-xx --force`. Labels are a view; the branch list on `origin` is the truth. Shapes in [`repo-seed/claim.draft.md`](repo-seed/claim.draft.md).
- **Naming.** Branch `t-XX/<slug>` (created by `claim.sh`, not by hand); worktree `../legwork-wt/t-XX`; PR title `T-XX: <title>` (`(1/2)` when two PRs); labels `area:*`, `wave:<day>`, `size:*`, `agent:local|cloud`, plus `interface-change`, `hotfix`, `docs`, `blocked`, `needs-operator`. One task per PR.
- **Dispatch.** Local: `git worktree add ../legwork-wt/t-12 --detach origin/main && cp ~/legwork.env ../legwork-wt/t-12/.env && cd ../legwork-wt/t-12 && claude` → "Implement `docs/plan/T-12-task-escrow.md` exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-12`." The exact text per task is in [`tasks/DISPATCH-PROMPTS.md`](tasks/DISPATCH-PROMPTS.md). Cloud: the GitHub issue *is* the brief; same opening sentence; **no secrets, ever**.
- **Commits.** Small, imperative; trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>` (checked by CI). Squash disabled; merge commits; no force-push to `main`.
- **CI gates (all required):** `contracts` (`forge fmt --check`, `forge build --sizes`, `forge test`) · `ts` (`pnpm i --frozen-lockfile`, `pnpm -r typecheck lint test build`, corpus included) · `subgraph-build` · `banned-words` (`trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`; fixtures excluded) · `path-ownership` · `commit-trailers` · `claim` · `secrets` (gitleaks; `ANTHROPIC_API_KEY` read only in `classifier/live.ts` and `scripts/**`) · `no-live-llm`. `e2e.yml` (anvil) on `main` pushes only; `sweep.yml` cron every 5 min.
- **Standing rules for agents.** Claim before writing anything, and never work on a task you did not claim; never edit lead-only files; never add a dependency; never call a live model or chain from tests; keys only from `process.env`, never in client bundles; every money string is 3.45 / 3.00 / 0.45; every seeded thing renders a "seeded" chip; never widen scope — if blocked, comment `BLOCKED: <need>` and stop; the brief beats the code — say so in the PR; paste verification output.
- **Brief format.** [`tasks/_template.md`](tasks/_template.md): front-matter + 15 sections (context with pack text pasted in, exact scope, out of scope, owned paths, interfaces consumed/produced, steps, acceptance tests by name, verification commands, hard rules, definition of done, PR checklist, blocked protocol, reviewer notes, round 2+).

## Reviewer protocol

- **Throughput.** S ≈ 10 min, M ≈ 20, L ≈ 35 → ~6 PRs Day 1, 12–14 on Days 2–3, 5–6 per weekday evening, 5 on Day 9, 3 on Day 10 (~60 slots; the graph is ~55 PRs). Run `/code-review` before reading; review in lane batches; `docs` S PRs by rendered diff.
- **Feedback.** Inline `BLOCKING:` / `NIT:` / `QUESTION:`; one summary ending `DECISION: merge | round-2 | reassign | split`. Round 2 = same brief with §15 filled ("address each item, reply to each in the PR, change nothing else"). Two failed rounds → the lead takes or splits the task. An interface change found in review → the lead ships the `interface-change` PR first.
- **Merge.** CI green + approval + ownership green + PR body complete + verification output pasted. `hotfix` only after the Day-9 freeze and only for the filmed path.
- **Per-package checklists.** Contracts: named tests exist and assert the attack, roles exact, 6-decimal math, fee on release only / zero on resolve, pause asymmetry, an event on every transition, checks-effects-interactions, `seeded ⇒ allowlistedBuyer` on both claim paths. API: handler order visible in one function, idempotency keyed on the auth nonce, refusal shape, **no mark on schema/type/cap/region**, `buyer_token`, long-poll bounded, `/public/*` leaks no spec text / exact coordinate / token, every chain write through `TxQueue`. MCP: schemas equal `mcp-contract.ts`, worker text only inside the `_untrusted` wrapper, `dashboard_url` everywhere, hosted `hire_human` never pretends to pay. Screening: fixture 1 accepts, gate authoritative (a classifier `none` cannot flip a gate refusal), timeout label exact, no live path in tests. Subgraph: `seeded` from `WorkerSeeded` only, no coordinate, `PosterStats` excludes allowlisted buyers. Mini-app: verified chip above the fold, earned-only balance, paid state only with the proof above it, downgrade disclosed, 44 px targets. Dashboard: a refusal never moves the meter, seeded chips on worker **and** task rows, floors via `data-floor`, `DATA_MODE=demo` chip, `/task/<id>` re-hashes, no raw spec text on `/refusals`. Docs: honesty lines verbatim, banned words, prize table ticks only bullets literally met.

## Corrections to the pack that the briefs assume

1. Subgraph deploys **Day 2 evening** (06/02 over 03).
2. `preflight_workers` is built Day 3 (T-27) against the frozen schema and verified on live data Day 8 (T-46); it is no longer a Day-8 build.
3. Dashboard shell Day 2, live Day 3–4 (was Day 8); every "Day 7/8 dashboard" reference in 03/05/11 is superseded.
4. Script drafting Sept 10 → lock timings Sept 11–12 against the Day-6 footage → scratch take Sept 12.
5. `post()` becomes `post(PostParams)` with `area` and `buyerAgentId`; `postAsBuyer`, `allowlistedBuyer`, `WorkerReset`, `releaseClaimFor`, `markCooldown` added (T-01).
6. `buyer_token` replaces "possession of the taskId authorizes approve/dispute".
7. The agent id is verified against the IdentityRegistry, not resolved by reverse lookup.
8. `call-confirm.phone` must match the resolved OSM `phone`/`contact:phone` tag only — no "buyer-supplied listing" (free text by another name).
9. The Task API's ERC-8004 identity is held by the **AbuseMark contract** (`registerIdentity`), not by an EOA.
10. The MCP server has two modes; the video's install line and `SKILL.md` name both.
11. The fixture corpus runs in CI from **Day 2** (T-06), not Day 5.
12. The CLI worker is seeded and uses the relayed routes; direct `claim()`/`submit()` remain for the roadmap.
13. `design-system/readme.md` carried deducted-fee figures (2.55); corrected to 3.45 / 3.00 / 0.45 and the chip "1 real · +20 seeded (demo data)". `09-design-prompt.md` is authoritative.
14. New pre-kickoff operator items: an `rp_id` + RP signing key in the Developer Portal, a Supabase project, three Vercel projects, a Graph deploy key, a `SWEEP_SECRET` for the cron (appended to `07-pre-kickoff.md`).

## Hazards specific to parallel work

- **The same task started twice is the expensive failure.** Two branches over one brief's `owned_paths` both pass `path-ownership`, and the second merge silently reverts the first. `scripts/claim.sh` is the guard, and it is a branch push rather than a label write because a label write is read-modify-write and races. The realistic trigger is not a rogue agent — it is the lead double-dispatching at 02:00 with eight PRs open.
- **A dead agent still holds its claim.** Rate limits and closed sessions killed several agents while this pack was being written; each would have left a branch nobody is working on. Hence the 90-minute stale rule and `release.sh --force`, and hence `claims.sh` in the evening review — an untouched claim is the cheapest thing to miss and the most expensive to leave.
- **Review is the bottleneck.** Keep PRs S/M, ≤ 8 *ready* (drafts are the claim set, capped by the agent count, and cost no review time), let CI and `/code-review` take the first pass.
- **One relayer key.** Only `TxQueue` sends; scripts use the owner key for owner-only calls and the admin routes for anything relayed.
- **Wave 0 will have mistakes.** Budget one `interface-change` PR per day; every brief says "the interface is the contract — report, do not patch around".
- **Vercel previews cannot open inside World App.** Only the Portal-registered stable URL works; mini-app phone testing is merge-to-test — keep those PRs tiny and test the web IDKit route on previews.
- **Cloud agents have no keys and no RPC.** Nothing in a C-class task may depend on live chain state; FakeChain, pglite, msw and fixtures are the test substrate.
- **Overnight cloud runs are the biggest lever.** Dispatch Days 1, 2, 3 in the evening so mornings start with PRs to review.
