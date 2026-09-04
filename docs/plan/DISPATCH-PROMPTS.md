# Dispatch prompts — the exact text to hand each agent

Generated from the briefs' front matter, so branch names, classes and dependencies match
`tasks/README.md` exactly. Work down the slots in order. Index: [`README.md`](README.md) ·
runbook: [`../repo-seed/dispatch.draft.md`](../repo-seed/dispatch.draft.md) · plan:
[`../13-build-plan.md`](../13-build-plan.md).

**Before every dispatch, check the task's `depends_on` are all merged.** A brief written against
an unmerged interface is the one failure mode that wastes a whole agent-hour.

## The two prompt shapes

**Class L — local worktree, has the operator's `.env`, may touch Base Sepolia.** Run the setup
block, then paste the prompt into the `claude` session it opens.

**Class C — cloud session, no secrets, tests run on fakes.** Start a Claude Code cloud session on
`RubenSousaDinis/legwork` and paste the prompt. The GitHub issue body *is* the brief, so the
agent needs nothing else. **Never put a key in a cloud session.**

Every prompt ends with "mark it ready and stop" on purpose: an agent that keeps going picks up a
second task and breaks path ownership.

---

## Day 1 · Fri Sept 4 · 16:00 UTC — the lead, alone

T-00 and T-01 are the interface freeze. Nothing else can start until T-00 merges (~16:45) and T-01a/b merge (~18:00 / ~19:30). Run these yourself in the main checkout, not a worktree.

### T-00 — Repo scaffold and governance (new `legwork` repo, hour one)

`T-00-repo-scaffold.md` · lane lead · size S · class L · depends on nothing · **you run this yourself — there is no repo to branch from yet**

Bootstrap, so no worktree and no `docs/plan/`: the brief still lives in this pack. Start at
**16:00 UTC sharp** — the first commit's timestamp is your Start Fresh evidence.

```bash
mkdir -p ~/code/legwork && cd ~/code/legwork && git init
claude   # then paste the prompt below; keep the brief open in the other window
```

> Read `~/Documents/Code/fafo/hackathon-legwork/tasks/T-00-repo-scaffold.md` and do exactly what it says. The text you transcribe into `AGENTS.md`, `.github/*` and `DESIGN-SPEC.md` is in `~/Documents/Code/fafo/hackathon-legwork/repo-seed/*.draft.md` — copy it verbatim, dropping the `.draft` framing. Do not write any product code: this task creates the skeleton, the guardrails and the empty package stubs only. Stop when CI is green on the scaffold and branch protection is on.

### T-01 — Interface freeze — contracts, schemas, API/MCP contracts, subgraph schema, DB schema

`T-01-interface-freeze.md` · lane lead · size L · class L · depends on T-00 · **two PRs: 01a contracts-side, 01b TypeScript-side** · **you run this yourself**

The single most important task in the plan — every other brief is written against these names.
Read [`LEAD-NOTES.md`](LEAD-NOTES.md) first: it lists what the brief-writers asked for and what is
already folded in. Ship 01a as soon as it is done (it unblocks the four contract agents) rather
than waiting for 01b.

```bash
cd ~/code/legwork && git checkout -b t-01/interface-freeze && claude
```

> Implement `docs/plan/T-01-interface-freeze.md` §2 **T-01a only** — the contracts side: the six Solidity interfaces with every function, event, error and the EIP-712 domain exactly as written; the mocks; `Outcomes.sol`; `abi-gen.sh`; `enums.ts`, `constants.ts`, `addresses.ts`; `demo-data.json`. Read `docs/plan/LEAD-NOTES.md` before you start. Everything you write here is frozen for the rest of the build, so match the brief character for character rather than improving on it. Open the PR titled `T-01a: interface freeze — contracts side` with the `interface-change` label and stop; 01b is a separate PR.

Then, for the second half:

> Implement `docs/plan/T-01-interface-freeze.md` §2 **T-01b only** — the TypeScript side: the zod schemas transcribed from the pack text in the brief, `api-contract.ts` + `docs/api.md`, `mcp-contract.ts` + `docs/mcp.md`, `subgraph/schema.graphql`, `apps/api/src/db/schema.ts` with every table pre-declared, `.env.example`, `docs/keys.md`. Do not change anything 01a merged. Open the PR titled `T-01b: interface freeze — TypeScript side` with the `interface-change` label and stop.

---

## Day 1 · 16:45 — first three agents (after T-00 merges)

The first parallel wave. T-03 and T-04 are L-class spikes on your machine; T-02 is cloud. Dispatch T-02 fifteen minutes before T-04 so `docs/spikes/RESULTS.md` exists before the spikes append to it.

### T-02 — Docs skeletons — FEEDBACK-WORLD, POSTERS, spike RESULTS, threat-model rows, README stubs

`T-02-docs-skeletons.md` · lane E · size S · class C · depends on T-00

> Implement the brief in issue **T-02** (`docs/plan/T-02-docs-skeletons.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-02` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-03 — Spike S3 — x402 seller and buyer round-trip on Base Sepolia

`T-03-spike-x402.md` · lane B · size M · class L · depends on T-00 · **class L — has secrets, local only**

```bash
cd ~/code/legwork && git fetch origin
git worktree add ../legwork-wt/t-03 --detach origin/main   # scripts/claim.sh creates t-03/spike-x402
cp ~/legwork.env ../legwork-wt/t-03/.env      # class L only
cd ../legwork-wt/t-03 && pnpm install --frozen-lockfile && claude
```

> Implement `docs/plan/T-03-spike-x402.md` exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-03` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-04 — Spike S5 + S1 — ERC-8004 round-trip and World ID Router probe

`T-04-spike-erc8004.md` · lane A · size S · class L · depends on T-00 · **class L — has secrets, local only**

```bash
cd ~/code/legwork && git fetch origin
git worktree add ../legwork-wt/t-04 --detach origin/main   # scripts/claim.sh creates t-04/spike-erc8004
cp ~/legwork.env ../legwork-wt/t-04/.env      # class L only
cd ../legwork-wt/t-04 && pnpm install --frozen-lockfile && claude
```

> Implement `docs/plan/T-04-spike-erc8004.md` exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-04` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 1 · ~19:30 — after T-01b merges

Interfaces are frozen; the TypeScript lanes open.

### T-05 — Mini-app scaffold + `/probe` page for the S2' spike

`T-05-miniapp-scaffold-probe.md` · lane D · size M · class C · depends on T-01

> Implement the brief in issue **T-05** (`docs/plan/T-05-miniapp-scaffold-probe.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-05` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-06 — Screening gate, pipeline and the 56-row corpus (no model)

`T-06-screening-gate-corpus.md` · lane C · size M · class C · depends on T-01

> Implement the brief in issue **T-06** (`docs/plan/T-06-screening-gate-corpus.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-06` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-08 — Task API skeleton — config, logging, DB, sessions, middleware, 501 stubs

`T-08-api-skeleton.md` · lane B · size M · class C · depends on T-01

> Implement the brief in issue **T-08** (`docs/plan/T-08-api-skeleton.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-08` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 1 · night — overnight cloud burst

Dispatch all six before you sleep; they run while you do. This is the biggest single lever in the plan — you wake up with six PRs to review.

### T-07 — packages/chain — clients, TxQueue, typed contracts, FakeChain

`T-07-chain-package.md` · lane A · size M · class C · depends on T-01

> Implement the brief in issue **T-07** (`docs/plan/T-07-chain-package.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-07` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-09 — Subgraph mappings + packages/subgraph-client

`T-09-subgraph-mappings.md` · lane C · size M · class C · depends on T-01

> Implement the brief in issue **T-09** (`docs/plan/T-09-subgraph-mappings.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-09` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-10 — Dashboard shell on DESIGN-SPEC — tokens, cards, present mode, data-floor

`T-10-dashboard-shell.md` · lane D · size M · class C · depends on T-01

> Implement the brief in issue **T-10** (`docs/plan/T-10-dashboard-shell.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-10` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-11 — WorkerRegistry — ATTESTED registration, seeding, reset, O(1) views

`T-11-worker-registry.md` · lane A · size M · class C · depends on T-01

> Implement the brief in issue **T-11** (`docs/plan/T-11-worker-registry.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-11` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-12 — TaskEscrow — the money path, in two PRs

`T-12-task-escrow.md` · lane A · size L · class C · depends on T-01 · **two PRs** — the brief says which half is which

> Implement the brief in issue **T-12** (`docs/plan/T-12-task-escrow.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-12` before writing anything — if it exits 1 the task is already taken, so stop and tell me. It ships as two PRs — do the first half only. `claim.sh` has already opened your draft PR; rename it `T-12 (1/2): …`, mark it ready, and stop. I will tell you when to start the second. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-13 — Reputation + AbuseMark — worker feedback, agent-side writer

`T-13-reputation-abusemark.md` · lane A · size M · class C · depends on T-01, T-04

> Implement the brief in issue **T-13** (`docs/plan/T-13-reputation-abusemark.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-13` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 2 · Sat Sept 5 · morning — after reviewing the overnight PRs

### T-15 — packages/payments — PaymentGateway, X402Gateway, idempotency, FakeFacilitator

`T-15-payments-package.md` · lane B · size M · class C · depends on T-03, T-08

> Implement the brief in issue **T-15** (`docs/plan/T-15-payments-package.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-15` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-20 — World ID v4 — /idkit/request, /idkit/verify, /register (EIP-712 attestation), /config/world

`T-20-idkit-register.md` · lane B · size M · class C · depends on T-08, T-07

> Implement the brief in issue **T-20** (`docs/plan/T-20-idkit-register.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-20` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-21 — Anthropic classifier with keyword fallback

`T-21-classifier.md` · lane C · size M · class C · depends on T-06

> Implement the brief in issue **T-21** (`docs/plan/T-21-classifier.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-21` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-22 — OSM extract and the PlaceIndex over it

`T-22-osm-extract.md` · lane C · size M · class C · depends on T-06

> Implement the brief in issue **T-22** (`docs/plan/T-22-osm-extract.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-22` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-24 — Mini-app auth — verify → session → payout key → register

`T-24-miniapp-auth.md` · lane D · size M · class C · depends on T-05, T-20

> Implement the brief in issue **T-24** (`docs/plan/T-24-miniapp-auth.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-24` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 2 · midday — the lead deploys

T-14 is yours: the four contracts go to Base Sepolia and the seed lands. Everything downstream keys off the addresses it writes.

### T-14 — Deploy + seed Base Sepolia — contracts, workers, lifecycles

`T-14-deploy-seed.md` · lane A · size M · class L · depends on T-11, T-12, T-13 · **class L — has secrets, local only**

```bash
cd ~/code/legwork && git fetch origin
git worktree add ../legwork-wt/t-14 --detach origin/main   # scripts/claim.sh creates t-14/deploy-seed
cp ~/legwork.env ../legwork-wt/t-14/.env      # class L only
cd ../legwork-wt/t-14 && pnpm install --frozen-lockfile && claude
```

> Implement `docs/plan/T-14-deploy-seed.md` exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-14` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 2 · afternoon

### T-16 — POST /tasks and POST /check — verify, screen, cap, post, settle

`T-16-post-tasks.md` · lane B · size M · class C · depends on T-15, T-06, T-07

> Implement the brief in issue **T-16** (`docs/plan/T-16-post-tasks.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-16` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-17 — Worker routes — list, claim, submit, earnings; submit-time checks and sweeper

`T-17-worker-routes.md` · lane B · size L · class C · depends on T-08, T-07 · **two PRs** — the brief says which half is which

> Implement the brief in issue **T-17** (`docs/plan/T-17-worker-routes.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-17` before writing anything — if it exits 1 the task is already taken, so stop and tell me. It ships as two PRs — do the first half only. `claim.sh` has already opened your draft PR; rename it `T-17 (1/2): …`, mark it ready, and stop. I will tell you when to start the second. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-18 — POST /proofs — hash raw bytes, strip EXIF, private store, signed URLs, rounding

`T-18-proofs.md` · lane B · size M · class C · depends on T-08

> Implement the brief in issue **T-18** (`docs/plan/T-18-proofs.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-18` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-19 — Buyer, public and admin routes — long-poll status, approve/dispute/refund, /public/*, /admin/*

`T-19-buyer-public-admin-routes.md` · lane B · size M · class C · depends on T-08

> Implement the brief in issue **T-19** (`docs/plan/T-19-buyer-public-admin-routes.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-19` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 2 · evening — the lead deploys the subgraph

T-23 is yours, right after T-09 merges. `preflight_workers` and the dashboard are dark until it indexes.

### T-23 — Deploy the subgraph to Studio and wire the query URL

`T-23-subgraph-deploy.md` · lane C · size S · class L · depends on T-09, T-14 · **class L — has secrets, local only**

```bash
cd ~/code/legwork && git fetch origin
git worktree add ../legwork-wt/t-23 --detach origin/main   # scripts/claim.sh creates t-23/subgraph-deploy
cp ~/legwork.env ../legwork-wt/t-23/.env      # class L only
cd ../legwork-wt/t-23 && pnpm install --frozen-lockfile && claude
```

> Implement `docs/plan/T-23-subgraph-deploy.md` exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-23` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 3 · Sun Sept 6 · morning

### T-25 — Mini-app task list + claim — 3 s poll, countdown, release-claim

`T-25-miniapp-tasks-claim.md` · lane D · size M · class C · depends on T-24, T-17

> Implement the brief in issue **T-25** (`docs/plan/T-25-miniapp-tasks-claim.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-25` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-27 — MCP server core — hosted mount, read tools, preflight

`T-27-mcp-hosted.md` · lane B · size M · class C · depends on T-19, T-09

> Implement the brief in issue **T-27** (`docs/plan/T-27-mcp-hosted.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-27` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-30 — AbuseMark wiring — identity, marks, screening log, posters

`T-30-abusemark-wiring.md` · lane B · size M · class C · depends on T-16, T-13

> Implement the brief in issue **T-30** (`docs/plan/T-30-abusemark-wiring.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-30` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-31 — SKILL.md + docs/mcp.md final — examples, prices, polling, limits, two install modes

`T-31-skill-md.md` · lane E · size S · class C · depends on T-27

> Implement the brief in issue **T-31** (`docs/plan/T-31-skill-md.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-31` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-32 — Register the Task API's ERC-8004 identity + one live write

`T-32-register-identity.md` · lane A · size S · class L · depends on T-14, T-04 · **class L — has secrets, local only**

```bash
cd ~/code/legwork && git fetch origin
git worktree add ../legwork-wt/t-32 --detach origin/main   # scripts/claim.sh creates t-32/register-identity
cp ~/legwork.env ../legwork-wt/t-32/.env      # class L only
cd ../legwork-wt/t-32 && pnpm install --frozen-lockfile && claude
```

> Implement `docs/plan/T-32-register-identity.md` exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-32` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 3 · ~15:00 — the green headless loop (the lead)

T-29 is the one that must go green today. Nothing on the critical path is allowed to be red after it merges.

### T-29 — CLI worker + demo:run + demo:reset — the green headless loop on Base Sepolia

`T-29-headless-loop.md` · lane lead · size M · class L · depends on T-16, T-17, T-19, T-14 · **class L — has secrets, local only**

```bash
cd ~/code/legwork && git fetch origin
git worktree add ../legwork-wt/t-29 --detach origin/main   # scripts/claim.sh creates t-29/headless-loop
cp ~/legwork.env ../legwork-wt/t-29/.env      # class L only
cd ../legwork-wt/t-29 && pnpm install --frozen-lockfile && claude
```

> Implement `docs/plan/T-29-headless-loop.md` exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-29` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 3 · afternoon

### T-26 — Dashboard live data — adapter, receipt, refusals, admin, poster stats

`T-26-dashboard-live.md` · lane D · size M · class C · depends on T-10, T-19, T-09

> Implement the brief in issue **T-26** (`docs/plan/T-26-dashboard-live.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-26` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-28 — MCP local mode — paying hire_human, stdio binary, README

`T-28-mcp-hire-local.md` · lane B · size M · class C · depends on T-27, T-16

> Implement the brief in issue **T-28** (`docs/plan/T-28-mcp-hire-local.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-28` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-33 — Mini-app proof flow + earnings — capture, GPS downgrade, submit, paid state

`T-33-miniapp-proof-earnings.md` · lane D · size M · class C · depends on T-25, T-18

> Implement the brief in issue **T-33** (`docs/plan/T-33-miniapp-proof-earnings.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-33` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 4 · Mon Sept 7 · evening

Round-2 fixes from the phone log come first; dispatch these around them.

### T-34 — examples/agent.ts — Claude loop over the local MCP, prompt + real transcript committed

`T-34-examples-agent.md` · lane E · size M · class L · depends on T-28 · **class L — has secrets, local only**

```bash
cd ~/code/legwork && git fetch origin
git worktree add ../legwork-wt/t-34 --detach origin/main   # scripts/claim.sh creates t-34/examples-agent
cp ~/legwork.env ../legwork-wt/t-34/.env      # class L only
cd ../legwork-wt/t-34 && pnpm install --frozen-lockfile && claude
```

> Implement `docs/plan/T-34-examples-agent.md` exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-34` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-36 — e2e on anvil — deploy, seed, API fakes, worker, asserts

`T-36-e2e-anvil.md` · lane A · size M · class C · depends on T-29 · optional — drop first if behind

> Implement the brief in issue **T-36** (`docs/plan/T-36-e2e-anvil.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-36` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-37 — README skeleton + threat model — every Day-10 section, verbatim blocks, test names

`T-37-readme-threat-model.md` · lane E · size M · class C · depends on T-14, T-02

> Implement the brief in issue **T-37** (`docs/plan/T-37-readme-threat-model.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-37` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 5 · Tue Sept 8 · evening

### T-35 — OpenAPI document from api-contract + Bazantic import

`T-35-openapi.md` · lane B · size S · class C · depends on T-19 · optional — drop first if behind

> Implement the brief in issue **T-35** (`docs/plan/T-35-openapi.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-35` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-38 — API hardening — limits, CORS, admin gate, log redaction

`T-38-api-hardening.md` · lane B · size S · class C · depends on T-19

> Implement the brief in issue **T-38** (`docs/plan/T-38-api-hardening.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-38` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-39 — Legibility gate — Playwright measures present-mode floors and the 9:16 column

`T-39-legibility-gate.md` · lane D · size S · class C · depends on T-26

> Implement the brief in issue **T-39** (`docs/plan/T-39-legibility-gate.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-39` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-40 — Observations — record per completed task + verify-open delta

`T-40-observations.md` · lane B · size S · class C · depends on T-17 · optional — drop first if behind

> Implement the brief in issue **T-40** (`docs/plan/T-40-observations.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-40` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 6 · Wed Sept 9 · evening — after GO/NO-GO

Only dispatch these once the gate is GREEN and the insurance footage is filmed.

### T-42 — Mini-app optional — compare-two screen, Report task, unverified state

`T-42-optional-compare-report.md` · lane D · size M · class C · depends on T-33 · optional — drop first if behind

> Implement the brief in issue **T-42** (`docs/plan/T-42-optional-compare-report.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-42` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-43 — Present-mode polish — server clock, elapsed timer, one-shot meter, card cuts

`T-43-present-mode-polish.md` · lane D · size S · class C · depends on T-26, T-39

> Implement the brief in issue **T-43** (`docs/plan/T-43-present-mode-polish.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-43` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 7 · Thu Sept 10 · evening

### T-41 — FEEDBACK-WORLD.md passes — format operator notes + screenshots at the five moments

`T-41-feedback-world-passes.md` · lane E · size S · class C · depends on T-02

> Implement the brief in issue **T-41** (`docs/plan/T-41-feedback-world-passes.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-41` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-44 — scripts/inserts.ts — the two three-line terminal inserts from real responses

`T-44-terminal-inserts.md` · lane E · size S · class C · depends on T-28, T-34

> Implement the brief in issue **T-44** (`docs/plan/T-44-terminal-inserts.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-44` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 8 · Fri Sept 11 · evening

T-46 and T-47 are yours — they read live data and the composited frame.

### T-45 — Docs final — threat model links, spike RESULTS filled, keys, ODbL, api/mcp re-check

`T-45-docs-final.md` · lane E · size S · class C · depends on T-37, T-29, T-32, T-46

> Implement the brief in issue **T-45** (`docs/plan/T-45-docs-final.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-45` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-46 — Verify preflight_workers against the live subgraph

`T-46-preflight-verify.md` · lane C · size S · class L · depends on T-23, T-27 · **class L — has secrets, local only**

```bash
cd ~/code/legwork && git fetch origin
git worktree add ../legwork-wt/t-46 --detach origin/main   # scripts/claim.sh creates t-46/preflight-verify
cp ~/legwork.env ../legwork-wt/t-46/.env      # class L only
cd ../legwork-wt/t-46 && pnpm install --frozen-lockfile && claude
```

> Implement `docs/plan/T-46-preflight-verify.md` exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-46` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

### T-47 — PNG check — read the composited 1280×720 frame at arm's length, cut cards

`T-47-png-check.md` · lane D · size S · class L · depends on T-43 · **class L — has secrets, local only**

```bash
cd ~/code/legwork && git fetch origin
git worktree add ../legwork-wt/t-47 --detach origin/main   # scripts/claim.sh creates t-47/png-check
cp ~/legwork.env ../legwork-wt/t-47/.env      # class L only
cd ../legwork-wt/t-47 && pnpm install --frozen-lockfile && claude
```

> Implement `docs/plan/T-47-png-check.md` exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-47` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 9 · Sat Sept 12 — code freeze 12:00 UTC

Docs only after the freeze. Everything else today is filming and Bazantic.

### T-48 — docs/submission.md + README prize-qualification table (Day 9, docs only)

`T-48-submission-content.md` · lane E · size S · class C · depends on T-45

> Implement the brief in issue **T-48** (`docs/plan/T-48-submission-content.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-48` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Day 10 · Sun Sept 13 — submission day

### T-49 — Final README — Basescan links, subgraph endpoint, GIF, dated line; POSTERS final; docs/AI-USAGE.md

`T-49-final-readme.md` · lane lead · size S · class L · depends on T-48, T-45, T-44, T-41, T-46, T-47 · **class L — has secrets, local only**

```bash
cd ~/code/legwork && git fetch origin
git worktree add ../legwork-wt/t-49 --detach origin/main   # scripts/claim.sh creates t-49/final-readme
cp ~/legwork.env ../legwork-wt/t-49/.env      # class L only
cd ../legwork-wt/t-49 && pnpm install --frozen-lockfile && claude
```

> Implement `docs/plan/T-49-final-readme.md` exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-49` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

---

## Substitutes — dispatch only if the spike failed

These sit out of the wave table. Each has one trigger; if the trigger does not fire, the task never exists.

**Trigger:** **S5 failed** — the deployed ERC-8004 registries did not accept a round-trip (T-04). Dispatch before T-14 so the deploy writes the self-deployed addresses.

### T-13b — Self-deploy ERC-8004 registries on Base Sepolia (S5 substitute)

`T-13b-self-deploy-erc8004.md` · lane A · size S · class L · depends on T-04 · **substitute — only exists if the trigger above fired** · **class L — has secrets, local only**

```bash
cd ~/code/legwork && git fetch origin
git worktree add ../legwork-wt/t-13b --detach origin/main   # scripts/claim.sh creates t-13b/self-deploy-erc8004
cp ~/legwork.env ../legwork-wt/t-13b/.env      # class L only
cd ../legwork-wt/t-13b && pnpm install --frozen-lockfile && claude
```

> Implement `docs/plan/T-13b-self-deploy-erc8004.md` exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-13b` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

**Trigger:** **S3 failed** — x402 did not complete a `verify → post → settle` round-trip (T-03). Set `PAYMENT_MODE=direct` in Vercel first, then dispatch on Day 6 evening.

### T-16b — Direct funding — signed quote, postAsBuyer, confirm

`T-16b-direct-funding.md` · lane B · size M · class C · depends on T-15 · **substitute — only exists if the trigger above fired**

> Implement the brief in issue **T-16b** (`docs/plan/T-16b-direct-funding.md`) exactly. Read `AGENTS.md` first, then run `scripts/claim.sh T-16b` before writing anything — if it exits 1 the task is already taken, so stop and tell me. Work only inside the `owned_paths` in its front matter. If anything in the brief cannot be done as written, comment `BLOCKED: <what you need>` and stop rather than working around it. When done, run the verification commands in §9, paste their output into the draft PR that `claim.sh` opened, fill every section of its body, then run `gh pr ready` and stop.

## Round 2 — an agent's PR came back needing changes

Append the review's `BLOCKING:` items verbatim to §15 of the brief, then send this to the same
session (or a fresh cloud session on the same branch):

> Round 2 on `docs/plan/<brief>.md` §15. Address each item listed there, reply to each one in the
> PR, and change nothing else. Do not refactor, do not rename, do not touch a file outside the
> `owned_paths`. Re-run the §9 verification commands and paste the new output into the PR.

Two failed rounds means the brief is wrong, not the agent. Take the task yourself or split the
remainder into an S-sized one.

## An agent posted `BLOCKED:`

Read what it needs before answering — the protocol exists so a weak agent stops instead of
inventing an interface.

- `INTERFACE REQUEST:` — you ship the change as a small `interface-change` PR, merge it first,
  then reply: *"Interface change merged in <sha>. Rebase on `main` and continue from where you
  stopped."*
- `DEP REQUEST:` — batch it with the day's other dependency requests into one lead PR to the
  catalog, then the same reply.
- `ENV REQUEST:` — add the name to `.env.example` and set the value in Vercel yourself; reply
  with the variable name only, never the value.
- Anything else — answer in the PR thread. If the answer changes the brief, edit the brief and
  say so, so the next round works from the corrected text.

## Standing rules you are enforcing at dispatch

- **Your review queue is `gh pr list --draft=false`.** Every claimed task shows as a draft PR from minute one, so the PR list doubles as the claim board — but a draft is never reviewed. `gh pr ready` is the agent's finish signal.
- **Claiming is the agent's job, not yours.** Every prompt tells the agent to run `scripts/claim.sh` before it writes anything; that push is what makes the task exclusive. If an agent reports `ALREADY CLAIMED`, check `scripts/claims.sh` (or just the draft PR list) — you have double-dispatched, or a dead agent still holds it. Only you clear a stale claim (`scripts/release.sh T-xx --force`, 90 min with no commit and no PR).

- One task per agent. Never hand a session a second brief; start a fresh one.
- Keep at most eight PRs open. Past that, review before dispatching.
- Class C sessions never receive a key, an RPC URL, or a `.env`.
- Never dispatch a task whose `depends_on` are still open.
- Drop the `optional` tasks before anything on the critical path when the day runs short.
