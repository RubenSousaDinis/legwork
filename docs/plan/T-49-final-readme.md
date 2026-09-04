---
id: T-49
title: Final README — Basescan links, subgraph endpoint, GIF, dated line; POSTERS final; docs/AI-USAGE.md
lane: lead                            # lane-E paths, executed by the lead on Day 10 morning (class L)
day: 10
size: S
agent_class: L
must: true
depends_on: [T-48, T-45, T-44, T-41, T-46, T-47]   # in practice: every merged PR
owned_paths:                         # Day 10 only; no code
  - README.md
  - POSTERS.md
  - docs/AI-USAGE.md
  - docs/media/**
labels: [area:docs, wave:10, size:S, agent:local, docs]
branch: t-49/final-readme
---

# T-49 — Final README, POSTERS count, AI-usage compilation

## 1. Context
Day 10 is "no code". The README is the artifact a judge opens after the video; the schedule lists what it must carry by the end: "the four contract addresses as Basescan links + the subgraph endpoint, a 40-second GIF of the hire loop at the top, a dated 'state of this repo on 2026-09-13' line, `docs/` with the feedback doc and spike results", plus the `POSTERS.md` section with the final count and the AI-usage documentation. `docs/AI-USAGE.md` is compiled from what CI already enforced: every commit's `AI-Usage:` trailer and every PR's "AI usage" section. Submission is at 13:00 UTC; this PR merges before 11:00 UTC.

## 2. Exact scope
- `README.md` `## Addresses and endpoints`: the four contracts as `[WorkerRegistry](https://sepolia.basescan.org/address/<addr>)`, `[TaskEscrow](…)`, `[Reputation](…)`, `[AbuseMark](…)` with the addresses copied from `contracts/deployments/base-sepolia.json`; the ERC-8004 registries `0x8004A818BFB912233c491871b3d84c89A494BD9e` / `0x8004B663056A597Dffe9eCcC1965A193B7388713` as Basescan links; the subgraph endpoint (the Studio **public** query URL — never a URL that embeds `GRAPH_API_KEY`); the Task API `<host>`, `/mcp`, the dashboard and mini-app URLs; the deploy tx of each contract with its timestamp (Start Fresh evidence). Convert the plain addresses in `## Live · deployed · seeded` and `## Prize qualification` into the same links (no other edit to those sections).
- Top of the README, under the H1 and before the tagline: the 40-second GIF of the hire loop — `docs/media/hire-loop.gif`, cut by the operator from the Day-9 composite (LOCKED 3.45 → claim → proof → RELEASED 3.00 + 0.45), ≤ 10 MB, 960 px wide, ≤ 12 fps, no face, no street number, no key or URL in frame; alt text "An AI agent locks 3.45 USDC in escrow; a verified human claims, walks, submits proof; the contract releases 3.00 to the worker and 0.45 fee — Base Sepolia testnet". Also `docs/media/hero.png` (the hand + phone + door frame) referenced once in `## What this is`.
- Dated line updated to exactly `state of this repo on 2026-09-13` (keep the sentence T-00 wrote around it). Add directly beneath it, **only if the operator confirms the €20 was paid**: "testnet USDC; the worker was paid for real, separately." Otherwise omit the sentence entirely.
- `## External posters`: the final count from `POSTERS.md` applying the counting rule: "`<N>` self-funded external posters during Sept 4–13 (distinct ERC-8004 agent id or payer address not on the operator allowlist); `<M>` sponsored trials logged and not counted." or "zero self-funded external posters — logged in POSTERS.md". Link `POSTERS.md`.
- `POSTERS.md`: `## Count` updated to the final numbers; every row has all seven columns filled (`self-funded? = yes|no`, `would pay real money? = yes|no|unanswered`); rows with `self-funded? = no` are never counted; cross-check the distinct count with the subgraph `PosterStats { distinctExternalBuyers, externalTasks }` and write both numbers ("subgraph: `<n>` distinct external buyers").
- `docs/AI-USAGE.md`: `# AI usage — Legwork — real-world verification for AI agents`; how it was enforced (the `commit-trailers` CI job, the PR template section, `AGENTS.md`); a table `| PR | Title | AI-Usage (from the PR body) |` generated with `gh pr list --state merged --limit 200 --json number,title,body --jq '.[] | [.number, .title, ((.body | capture("## AI usage\\n(?<u>[^\\n]*)").u) // "—")] | @tsv'`; a table of commit trailers `git log --format='%h%x09%s%x09%(trailers:key=AI-Usage,valueonly)' origin/main`; the list of committed prompts (`examples/prompt.md`, `packages/screening/src/classifier/*prompt*`); a paragraph naming the tools and models used (Claude Code local worktrees and cloud sessions; the models named in the trailers — copy them, do not guess); the sentence "The Reputation contract is re-implemented from the same threat model, written from a blank file after kickoff." and the Start Fresh sentence verbatim: "Pre-kickoff artifacts: this planning pack, a pitch deck and a static UI mockup, all dated and public. No code or stylesheet from them is in this repo." Link it from `README.md ## AI usage`.
- `README.md ## Docs`: links to `docs/spikes/RESULTS.md`, `docs/threat-model.md`, `docs/keys.md`, `docs/api.md`, `docs/mcp.md`, `docs/submission.md`, `docs/AI-USAGE.md`, `FEEDBACK-WORLD.md`, `POSTERS.md`, `SKILL.md`, `docs/plan/` ("the disclosed pre-kickoff plan, copied at kickoff"), `examples/`.
- Final banned-words run over the whole repo; final link check over `README.md`; final money-figure grep (`2\.55` must not appear anywhere — the CI job already guards it; confirm exit 0).

## 3. Out of scope
- Any code, config or contract change; any docs file other than §4 (a wrong sentence elsewhere is a `hotfix` PR by its owner, filmed path only); `docs/submission.md` content (T-48 — you only fill `<addr>`/URL placeholders if T-48 left them and the operator asks).
- Do not touch: anything outside §4.

## 4. Owned paths
```
README.md
POSTERS.md
docs/AI-USAGE.md
docs/media/**
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| Four addresses + deploy tx hashes | `contracts/deployments/base-sepolia.json` (T-14) | copied exactly; Basescan `address/` and `tx/` URL forms |
| `PosterStats { distinctExternalBuyers, externalTasks }` | subgraph (T-09/T-23) via `SUBGRAPH_QUERY_URL` | cross-check of the POSTERS count |
| Merged PR bodies with `## AI usage`; commit trailers `AI-Usage:` | GitHub (`gh`), `git log` | source of `docs/AI-USAGE.md` |
| Day-9 composite footage | operator | the GIF and hero still |
| README sections | T-02 order; T-37/T-48 content | you edit only the listed sections and the dated line |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| Final README | `README.md` | judges; the submission form (repo link) |
| Final poster count | `POSTERS.md`, README | the submission long description (`<N>`), the Oct 5 gate |
| `docs/AI-USAGE.md` | `docs/` | the submission "How it's made" paragraph 4 |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-49` — it must print `CLAIMED T-49`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. `git pull`; confirm every Day-9 PR is merged (`gh pr list --state open` should show only `hotfix`-labelled PRs, if any). Read `README.md`, `POSTERS.md`, `docs/submission.md`.
2. Fill `## Addresses and endpoints`; convert addresses to links in the two other sections; verify each link with `curl -sI https://sepolia.basescan.org/address/<addr> | head -1` (200/301).
3. Encode the GIF (`ffmpeg -i composite.mp4 -ss <start> -t 40 -vf "fps=12,scale=960:-1" docs/media/hire-loop.gif`; check `du -h` ≤ 10 MB) and the hero still; place the GIF under the H1.
4. `POSTERS.md`: fill/verify every row; query `PosterStats`; write `## Count`; write `## External posters` in the README.
5. Generate `docs/AI-USAGE.md` with the two commands in §2; read it once for stray secrets (a trailer that pasted a token) and redact.
6. Update the dated line; add the paid-for-real sentence only on the operator's confirmation. Run §9. Open the PR; merge before 11:00 UTC; hand `docs/submission.md` to the operator for the 13:00 UTC form.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `grep -c 'https://sepolia.basescan.org/address/0x' README.md` | ≥ 6 (four contracts + two registries) |
| `grep -Fq 'state of this repo on 2026-09-13' README.md && ! grep -Fq 'state of this repo on 2026-09-0' README.md` | dated line final |
| `grep -Fq 'docs/media/hire-loop.gif' README.md && [ -f docs/media/hire-loop.gif ] && [ $(stat -f%z docs/media/hire-loop.gif 2>/dev/null \|\| stat -c%s docs/media/hire-loop.gif) -le 10485760 ]` | GIF present, ≤ 10 MB, referenced |
| `grep -Eq 'self-funded external posters' README.md` | poster count sentence present |
| `grep -c '^| 2026-09-' POSTERS.md` equals the number of rows with seven filled columns | every row complete |
| `grep -Fq 'Pre-kickoff artifacts: this planning pack' docs/AI-USAGE.md && grep -Fq 're-implemented from the same threat model' docs/AI-USAGE.md` | AI-usage doc sentences |
| `grep -nE 'api_key=|GRAPH_API_KEY|sk-ant|0x[0-9a-fA-F]{64}' README.md docs/AI-USAGE.md POSTERS.md; echo $?` | prints `1` |
| `bash scripts/ci/banned-words.sh` | exit 0 |
| link check (§9) | no `MISSING` |

## 9. Verification commands
```bash
bash scripts/ci/banned-words.sh; echo "banned-words exit=$?"
grep -c 'https://sepolia.basescan.org/address/0x' README.md; grep -Fq 'state of this repo on 2026-09-13' README.md && echo "date ok"
for u in $(grep -oE 'https://sepolia.basescan.org/(address|tx)/0x[0-9a-fA-F]+' README.md | sort -u); do code=$(curl -s -o /dev/null -w '%{http_code}' "$u"); echo "$code $u"; done
grep -oE '\]\([^)]+\)' README.md | sed -E 's/^\]\(//; s/\)$//; s/#.*$//' | grep -Ev '^(https?://|$)' | while read -r l; do [ -e "$l" ] || echo "MISSING $l"; done
grep -nE 'api_key=|GRAPH_API_KEY|sk-ant|0x[0-9a-fA-F]{64}' README.md docs/AI-USAGE.md POSTERS.md; echo "secret grep exit=$?"
du -h docs/media/hire-loop.gif
```
Expected: `banned-words exit=0`; ≥ 6 and `date ok`; every Basescan URL 200 or 301; no `MISSING`; `secret grep exit=1`; GIF ≤ 10M.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. Write "24 hours" or `86400`. This is the last run before submission.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate); the GIF alt text carries them.
- No secrets: the subgraph URL never embeds the API key; trailers pasted into `docs/AI-USAGE.md` are read for tokens before commit.
- Honesty lines verbatim where used: "one real registration, plus twenty seeded rows (demo data)" (never the banned worker count); "testnet USDC; the worker was paid for real, separately" **only if true**; "cloud-verified, operator-attested — onchain World ID verification is Orb-only today"; "a refused task moves no money".
- Counting rule applied literally: only self-funded x402 payments count; sponsored trials never; distinct = ERC-8004 id or payer not on the operator allowlist.
- "Legwork" never stands alone in the H1, the GIF alt text or `docs/AI-USAGE.md`'s title: "Legwork — real-world verification for AI agents".
- No code on Day 10; markdown and media only.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] Merged before 11:00 UTC on 2026-09-13; `docs/submission.md` handed to the operator.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-49 — Final README + POSTERS final + docs/AI-USAGE.md
owned-paths:
  - README.md
  - POSTERS.md
  - docs/AI-USAGE.md
  - docs/media/**
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
Posters: <N> self-funded · <M> sponsored (subgraph distinctExternalBuyers=<n>) · paid-for-real sentence: <added|omitted>
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- Lead-owned: blockers are decisions — record them in `docs/plan/DECISIONS.md` (outside §4; lead exception) with the choice made and the time.
- GIF not ready by 10:00 UTC → ship the hero still in its place with the caption "video: <youtube-url>"; never delay the merge for the GIF.

## 14. Reviewer notes
Self-review (lead): click every Basescan link; read the POSTERS count against the rule (a sponsored row counted is a false claim to a judge); confirm the paid-for-real sentence matches reality; confirm the subgraph URL carries no key; run the banned-words job locally one last time.

## 15. Round 2+
—
