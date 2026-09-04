---
id: T-48
title: docs/submission.md + README prize-qualification table (Day 9, docs only)
lane: E
day: 9                                # code freeze 12:00 UTC — docs and `hotfix` only
size: S
agent_class: C
must: true
depends_on: [T-45]
owned_paths:                         # README.md: the `## Prize qualification` section only, Day 9 (T-37 held README Days 4–8; T-49 Day 10)
  - docs/submission.md
  - README.md
labels: [area:docs, wave:9, size:S, agent:cloud, docs]
branch: t-48/submission-content
---

# T-48 — Submission content

## 1. Context
The ETHGlobal submission form is filled by the operator on Day 10 in a booked 60–90-minute slot; every field is pre-written here so nothing is drafted under deadline pressure. The pack fixes the title, the short description, the long-description structure, the live/deployed/seeded table, the tech tags and four "How it's made" paragraphs. The README's prize-qualification table follows one rule, verbatim: "for each selected track, its verbatim qualification bullets in one column and, beside each, the file, contract address, commit or timestamp that satisfies it. Tick only tracks whose bullets are literally met." Partners selected on Day 10: World (Selfie Check), The Graph (AI From Scratch; Composable only if both Discord answers were yes), Bazantic (both open tracks if both recipes exist). The Start Fresh disclosure travels with the submission.

## 2. Exact scope
- `docs/submission.md` `## Title` — `Legwork — real-world verification for AI agents`.
- `## Short description` — the pack text **verbatim** first: "Live: https://<domain> · `claude mcp add --transport http legwork https://<host>/mcp`. Agents hire verified humans (World ID) for four real-world checks; escrow on Base Sepolia releases on proof; the six documented abuse classes are refused at the API and written to the agent's ERC-8004 record. Testnet; 1 real worker + 20 seeded, disclosed." Measure it with `wc -m` after filling the real domain/host. It is **342 characters with placeholders**, so it will exceed the form's 300-character limit: keep it as `### Full (if the form allows)` and add `### ≤300 (form)` with the pack's compressed variant **verbatim**: "`<live-url>` · `claude mcp add --transport http legwork https://<host>/mcp` · Agents hire verified humans (World ID) for four real-world checks; escrow on Base Sepolia releases on proof; abusive requests refused at the API and written to the agent's ERC-8004 record." (264 characters with placeholders). Record both counts in the file.
- `## Long description` — in this order: the tagline ("Agents hire verified humans for the legwork software can't do. Escrow releases on proof."); the claim **verbatim** (copy from `README.md ## What this is`); the trust model **verbatim**; "what a judge saw in the video" in three sentences covering beats 1, 6, 7 (the door and the listing; the injected `call-confirm` refused as `authentication circumvention`, "a refused task moves no money"; proof → LOCKED 3.45 → RELEASED 3.00 to the worker + 0.45 fee, "testnet USDC"); the four task types with their floors (3.00 / 3.00 / 2.00 / 1.00); the live/deployed/seeded table (below); "`<N>` external posters during the hackathon" from `POSTERS.md` (or "zero — logged in POSTERS.md"); what is out of scope in four lines (Not competence vetting · Not a dispute court · Not KYC or payroll · Not fraud-proof — one sentence each); addresses, subgraph endpoint, `SKILL.md`, `POSTERS.md`, `FEEDBACK-WORLD.md` links; the Start Fresh sentence **verbatim**: "Pre-kickoff artifacts: this planning pack, a pitch deck and a static UI mockup, all dated and public. No code or stylesheet from them is in this repo."
- `## Live / deployed / seeded` — the table `| Live, not ours | Ours, deployed on Base Sepolia | Seeded and disclosed |` with: "World ID (Developer Portal, sandbox) · ERC-8004 registries `0x8004A818…` / `0x8004B663…` · x402 reference facilitator · USDC" | "WorkerRegistry `<addr>` · TaskEscrow `<addr>` · Reputation `<addr>` · AbuseMark `<addr>` · subgraph `<studio url>` · mini-app · Task API + MCP `<host>`" | "20 worker rows via `seedWorker()` (cannot produce a verified registration) · `<N>` seeded task lifecycles · one real registration (the demo phone) · marks operator-attested · relayed claims, gas paid by Legwork · operator powers: seed, reset, resolve". Addresses from `contracts/deployments/base-sepolia.json`; `<N>` from T-14's seed script output.
- `## Tech tags` — `World ID · IDKit · MiniKit · ERC-8004 · x402 · USDC · Base Sepolia · The Graph · Foundry · Next.js · MCP · Claude`.
- `## How it's made` — four paragraphs: (1) the spikes, written from `docs/spikes/RESULTS.md` (what S1, S2, S3, S5 returned and the locked architecture — quote the outcomes); (2) the relayed worker path ("the worker signs in with World ID and their World App wallet; we relay the claim and pay the gas; the contract records their address"; "cloud-verified, operator-attested — onchain World ID verification is Orb-only today"); (3) screening ("the deterministic gate is authoritative; the LLM can add a refusal, never overturn one"; free text never reaches the classifier; the corpus in CI; `claude-opus-5` with a 3 s timeout falling back to the keyword class); (4) AI usage (granular commits with `AI-Usage:` trailers; prompts committed at `examples/prompt.md` and in `packages/screening/src/classifier/`; `docs/AI-USAGE.md` compiled Day 10; the Reputation design "re-implemented from the same threat model, written from a blank file after kickoff").
- `## Prize qualification` (in `docs/submission.md` and copied under `README.md ## Prize qualification`) — table `| Partner · track | Qualification bullet (verbatim) | Evidence (file / address / commit / timestamp) | Met? |`, rows:
  - World — Selfie Check: "Uses Selfie Check or a Selfie Check-compatible World ID credential flow in a meaningful way" → `apps/miniapp` verify flow, `WORLD_CREDENTIAL_LEVEL` value from RESULTS, the `WorkerRegistered` tx of the real registration; "Treats Selfie Check as a risk, eligibility, fairness, continuity, or abuse-prevention signal." → `WorkerRegistry` (one nullifier = one account; only verified workers claim) + `test_Register_DuplicateNullifierReverts`; "Test via the Sandbox App." → RESULTS `## S2`, `FEEDBACK-WORLD.md` entries; "Include a detailed feedback document." → `FEEDBACK-WORLD.md` (entry count); "Show a working app." → the mini-app URL + the video timestamp.
  - The Graph — Best AI Tooling or AI Use Case (From Scratch): "Use The Graph as a load-bearing part" → `preflight_workers` in `packages/mcp` reading `packages/subgraph-client`; `examples/transcript.md` showing the agent acting on `n_real`/`median_source`; "Consume live data from a Graph provider" → `SUBGRAPH_QUERY_URL` (Studio) + RESULTS `## Graph` Discord answer with date; "net-new work started during the hackathon" → first commit timestamp (`git log --reverse --format='%H %cI' | head -1`); "open source with README or SKILL.md" → `LICENSE` (MIT), `SKILL.md`.
  - The Graph — Best Use of Composable or Standardized Graph Products: include **only if** RESULTS `## Graph` records both Discord answers as yes **and** the Subgraph MCP tool shipped; evidence the tool's path; otherwise the row reads `not selected — <reason>`.
  - Bazantic — Agentify a New API: "gateway the Task API, one Recipe, one screen recording, the bazantic username in the form" → gateway URL, recipe name, recording file/URL, username (operator supplies on Day 9); Bazantic — Best Recipe Using Sponsor APIs: "a second Recipe chaining the Task API with the Graph subgraph query" → recipe name **only if it exists**, else `not selected`.
  - `Met?` is `yes` only when every bullet in the row has concrete evidence; anything else is `no — do not select`.
- `## Form fields` — a checklist of what the operator pastes where (title, short, long, video URL, live URL, repo, addresses, the three partners and their tracks), with the sentence "Select 3 partners and every track each one qualifies for."

## 3. Out of scope
- Any code, any `hotfix`; the video, the GIF, the final addresses-as-links, `POSTERS.md` count, `docs/AI-USAGE.md` (T-49); every README section other than `## Prize qualification`; `docs/spikes/RESULTS.md` (T-45 — if it is not quotable, `BLOCKED:`).
- Do not touch: anything outside §4; inside `README.md`, nothing outside `## Prize qualification`.

## 4. Owned paths
```
docs/submission.md
README.md
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| Claim, trust model, honesty sentence, live/deployed/seeded bullets | `README.md` (T-37) | copied verbatim into the submission |
| Spike outcomes, `## Graph` Discord answers, locked architecture | `docs/spikes/RESULTS.md` (T-45) | paragraph 1 and the Graph rows |
| Threat-model test links | `docs/threat-model.md` (T-45) | evidence cells |
| Addresses | `contracts/deployments/base-sepolia.json` | copied exactly |
| Poster count | `POSTERS.md ## Count` | `<N>` external posters |
| Bazantic gateway/recipe/recording/username | T-48 issue comment from the operator (Day 9 morning) | Bazantic rows |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| Every form field pre-written | `docs/submission.md` | the operator's Day-10 form slot; T-49 links it |
| `## Prize qualification` table | `README.md` | T-49 (converts addresses to links only) |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-48` — it must print `CLAIMED T-48`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `README.md`, `docs/spikes/RESULTS.md`, `docs/threat-model.md`, `POSTERS.md`, `FEEDBACK-WORLD.md`, `SKILL.md`, the T-48 issue.
2. Write `docs/submission.md` in the §2 order; paste, do not paraphrase, the verbatim blocks; fill every `<…>` you can from the repo and leave the rest as `<…>` with a `TODO(operator)` list at the end of the file.
3. Build the prize table; for each evidence cell open the file and confirm the claim is literally true (e.g. the mini-app really calls the verify flow; the transcript really shows the agent reading preflight numbers). Mark `Met?` honestly.
4. Copy the table under `README.md ## Prize qualification`, replacing T-02's placeholder line only.
5. Run §9; open one PR labelled `docs`.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `grep -Fq 'Testnet; 1 real worker + 20 seeded, disclosed.' docs/submission.md` | full short description verbatim |
| `grep -Fq 'abusive requests refused at the API and written to the agent' docs/submission.md` | ≤300 variant present |
| `sed -n '/### ≤300/,/^###/p' docs/submission.md \| grep -v '^#' \| tr -d '\n' \| wc -m` | ≤ 300 once real URLs are in (report the number) |
| `grep -Fq 'Pre-kickoff artifacts: this planning pack, a pitch deck and a static UI mockup, all dated and public. No code or stylesheet from them is in this repo.' docs/submission.md` | Start Fresh sentence |
| `grep -Fq 'Uses Selfie Check or a Selfie Check-compatible World ID credential flow in a meaningful way' README.md && grep -Fq 'Use The Graph as a load-bearing part' README.md && grep -Fq 'Consume live data from a Graph provider' README.md` | verbatim bullets in the README table |
| `grep -c 'Met?' README.md` | `1` (one table) |
| `grep -Eq 'Composable.*(not selected|yes)' README.md` | Composable row decided, not blank |
| `git diff origin/main -- README.md \| grep '^[-+]' \| grep -v '^[-+][-+]' \| grep -vc 'Prize\|^[-+]|' ` | README changes confined to the prize section (manual read in review) |
| `bash scripts/ci/banned-words.sh` | exit 0 |

## 9. Verification commands
```bash
bash scripts/ci/banned-words.sh; echo "banned-words exit=$?"
sed -n '/### ≤300/,/^###/p' docs/submission.md | grep -v '^#' | tr -d '\n' | wc -m
for b in "Uses Selfie Check or a Selfie Check-compatible World ID credential flow in a meaningful way" "Treats Selfie Check as a risk, eligibility, fairness, continuity, or abuse-prevention signal." "Use The Graph as a load-bearing part" "Consume live data from a Graph provider"; do grep -Fq "$b" README.md || echo "MISSING $b"; done
grep -c 'TODO(operator)' docs/submission.md
git diff --stat origin/main -- README.md docs/submission.md
```
Expected: `banned-words exit=0`; a number ≤ 300; no `MISSING`; the TODO count listed in the PR; the diff touches only the two files.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. Write "24 hours" or `86400`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate).
- No secrets; public URLs and addresses only; the Bazantic username is public.
- "Tick only tracks whose bullets are literally met." A `yes` with a soft evidence cell is a false statement to a judge.
- Honesty lines verbatim where used: "a refused task moves no money"; "cloud-verified, operator-attested — onchain World ID verification is Orb-only today"; "testnet USDC"; "the worker was paid for real, separately" **only** if the operator confirmed the €20 payment in the T-48 issue.
- Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia, The Graph. The title always pairs the name: "Legwork — real-world verification for AI agents".
- Day-9 freeze: this PR changes markdown only.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed; in `README.md` only the prize section.
- [ ] Verification output from §9 pasted into the PR.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-48 — Submission content + prize-qualification table
owned-paths:
  - docs/submission.md
  - README.md   (## Prize qualification only)
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
Tracks marked yes: <list> · not selected: <list with reasons> · ≤300 count: <n>
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- Bazantic details absent by Day 9 12:00 UTC → both Bazantic rows `not selected — no gateway by freeze`; say so; do not wait.
- RESULTS `## Graph` unanswered → Composable row `not selected — Discord unanswered`; the AI From Scratch row cites the Studio URL and the open question honestly.

## 14. Reviewer notes
Read the prize table row by row with the evidence file open; every `yes` must be literally true. Then check the two short-description variants and the character count. Then confirm the README diff is confined to `## Prize qualification`.

## 15. Round 2+
—
