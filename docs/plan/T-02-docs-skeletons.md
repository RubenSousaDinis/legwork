---
id: T-02
title: Docs skeletons — FEEDBACK-WORLD, POSTERS, spike RESULTS, threat-model rows, README stubs
lane: E
day: 1
size: S
agent_class: C
must: true
depends_on: [T-00]
owned_paths:                         # Day 1 ONLY — see §3 for the day-based hand-offs
  - FEEDBACK-WORLD.md
  - POSTERS.md
  - docs/spikes/RESULTS.md
  - docs/threat-model.md
  - README.md
labels: [area:docs, wave:1, size:S, agent:cloud, docs]
branch: t-02/docs-skeletons
---

# T-02 — Docs skeletons

## 1. Context
Three root documents and two `docs/` files are submission deliverables that other people append to for nine days: the World "Selfie Check" track requires "a detailed feedback document" with four headings taken from the track text; the in-window demand test is counted from `POSTERS.md`; the Day-1 spikes are recorded in `docs/spikes/RESULTS.md`; the README's threat model is a table of attacks mapped to named tests. T-00 created these files empty-with-headings. This task gives every one of them its final **structure** so later passes (T-41, T-29, T-37, T-45, T-48, T-49) only fill fields and never restructure. Pack text you must reproduce is pasted below; you cannot read the planning pack.

> Feedback document — `FEEDBACK-WORLD.md`, opened in the first hour after kickoff, with the four headings verbatim from the track text: (1) SelfieCheck docs and integration flow; (2) Developer Portal navigation, search, product discovery, and debugging guidance; (3) Sandbox App states, proof flows, test users, errors, and edge cases; (4) what was confusing, missing, broken, or hard to test. Appended at five fixed moments, screenshotting every error dialog: Portal app + action creation · spike S2' (the exact credential-level string and payload shape) · the IDKit v4 integration on Day 4 · any sandbox error · the Day-4/5 mini-app build.

## 2. Exact scope
- `FEEDBACK-WORLD.md`: title line `# World ID feedback — Legwork — real-world verification for AI agents (ETHOnline 2026)`; a two-line preamble ("Kept from the first hour of the hackathon; every error dialog screenshotted; published after the finale."); then exactly four `##` headings, **verbatim**: `## (1) SelfieCheck docs and integration flow` · `## (2) Developer Portal navigation, search, product discovery, and debugging guidance` · `## (3) Sandbox App states, proof flows, test users, errors, and edge cases` · `## (4) what was confusing, missing, broken, or hard to test`. Under heading (1) add the five fixed append moments as sub-bullets, each ending `— _pending_`: `Portal app + action creation` · `spike S2' (the exact credential-level string and payload shape)` · `the IDKit v4 integration on Day 4` · `any sandbox error` · `the Day-4/5 mini-app build`. Add an `### Entry format` block: `**YYYY-MM-DD HH:MM UTC · <moment> · <confusing|missing|broken|hard to test>** — what was tried · what happened (exact error string) · screenshot `docs/feedback-world/<file>.png` · suggestion`. Add the rule line: "Screenshot every error dialog. Redact signing keys and session tokens; never paste an `.env` value."
- `POSTERS.md`: title `# External posters — Legwork — real-world verification for AI agents`; the table header exactly: `| date | who (handle / ERC-8004 id / payer) | channel | task type | self-funded? | would pay real money? | notes |` with one example row of dashes; then a `## Counting rule` section with these sentences verbatim: "Only a builder who funded their own x402 payment counts toward the in-window demand test (≥3 external builders, Sept 4–13). Sponsored trials (test USDC from us) are logged with `self-funded? = no` and never counted." and "Distinct external = distinct ERC-8004 agent id or payer address not on the operator allowlist. The subgraph carries the same count; the live feed shows it." Add `## Count` with `self-funded external posters: 0 · sponsored trials: 0` (T-49 finalizes).
- `docs/spikes/RESULTS.md`: title `# Day-1 spike results`; exactly seven `##` headings, each the bare id so the anchors are `#s1 … #timing` (other briefs link `RESULTS.md#S5`): `## S1`, `## S2`, `## S3`, `## S5`, `## Graph`, `## Preflight`, `## Timing`. Line 1 under each heading is an italic description: _World ID Router on Base Sepolia (feedback-doc value only)_ · _IDKit 4.x verify end to end + webview probe (S2')_ · _x402 exact-EVM verify → post → settle + replay_ · _ERC-8004 ABI confirmation_ · _Discord answers: Studio URL as "live data from a Graph provider"; Subgraph MCP as "composable"_ · _live Studio data, Day 8 (T-46)_ · _Day-3 green loop tx links (T-29); Day-5 fresh install → verify → claim_. For `S1`/`S2`/`S3`/`S5`, line 2 is the spike owner's status line `S<n>: pending` (T-04 writes `S5: PASS` or `S5: FAIL — <reason>` there). Every section then carries three labelled fields on their own lines: `outcome:` (PASS | FAIL | DOWNGRADED | pending) · `evidence:` (tx link, screenshot path or exact string) · `decision:` (what the build does as a result). Then the block `## Locked architecture` with four lines: `credential level: selfie | orb → narration variant: A | B` · `GPS: available | downgraded (photo + server timestamp + tapped confirmation)` · `payment: x402 | direct funding (PAYMENT_MODE)` · `ERC-8004: live registries | self-deployed reference instance` — each ending `— _pending_`.
- `docs/threat-model.md`: title `# Threat model`; intro sentence "One test per row, named after the attack, is the artifact a judge opens. **FIX** rows ship in v0; **DOC** rows are disclosed in the README and the out-of-scope list."; the table `| Attack | v0 response | Named test(s) / where | Link (filled by T-45) |` with the nineteen rows pasted verbatim from §7 step 4; then the line "Not a row: reentrancy. USDC has no transfer hooks; a plain-ERC20 escrow has no callback surface."
- `README.md`: keep T-00's honesty line and its dated "state of this repo on 2026-09-04" line untouched. Add empty stub sections in this order, each with one italic line `_filled by T-xx on Day N_`: `## Try it` (T-37) · `## What this is` (T-37) · `## Live · deployed · seeded` (T-37/T-49) · `## How the loop works` (T-37) · `## Prior art` (T-37) · `## Threat model` (T-37) · `## Negative attestations in ERC-8004: what a hire-a-human API can honestly write about an agent` (T-37) · `## Out of scope` (T-37) · `## Operator powers in v0` (T-37) · `## Prize qualification` (T-48) · `## External posters` (T-49) · `## AI usage` (T-37/T-49) · `## Data sources and licences` (T-37) · `## Addresses and endpoints` (T-49) · `## Docs` (links to `docs/spikes/RESULTS.md`, `docs/threat-model.md`, `FEEDBACK-WORLD.md`, `POSTERS.md`, `docs/plan/`).

## 3. Out of scope
- Any content under the headings (operator findings, spike outcomes, README prose) — T-41, the spike owners, T-37.
- Hand-offs (single writer per root file per day): `FEEDBACK-WORLD.md` → T-41 from Day 2. `POSTERS.md` → the lead appends rows Days 2–9; T-49 on Day 10. `docs/spikes/RESULTS.md` → T-04 fills `## S1` and `## S5` on Day 1 (dispatched with you: merge this PR first — it is the shorter one — and T-04 rebases); the lead pastes S2'/S3; `## Timing` appended by T-29 on Day 3; T-45 finalizes Days 7–8. `docs/threat-model.md` → T-37 Days 4–6, T-45 Days 7–8. `README.md` → T-37 Days 4–8, T-48 Day 9 (prize table only), T-49 Day 10.
- Do not touch: `docs/plan/**`, `docs/api.md`, `docs/mcp.md`, `docs/keys.md`, `LICENSE`, `AGENTS.md`, anything outside §4.

## 4. Owned paths
```
FEEDBACK-WORLD.md
POSTERS.md
docs/spikes/RESULTS.md
docs/threat-model.md
README.md
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| Files created empty-with-headings | T-00 | they exist; you replace their bodies |
| CI `banned-words` | `scripts/ci/banned-words.sh` | whole-word, case-insensitive grep over tracked files |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| Four verbatim headings + entry format | `FEEDBACK-WORLD.md` | T-41 (appends only) |
| POSTERS table header + counting rule | `POSTERS.md` | lead, T-49 |
| Seven RESULTS sections with `outcome/evidence/decision` + Locked architecture block | `docs/spikes/RESULTS.md` | T-29, T-45, T-48 |
| Threat-model table with `Link` column | `docs/threat-model.md` | T-37, T-45 |
| README stub section order | `README.md` | T-37, T-48, T-49 |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-02` — it must print `CLAIMED T-02`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, then the five files as T-00 left them. Keep T-00's two README lines byte-identical.
2. Write `FEEDBACK-WORLD.md` and `POSTERS.md` exactly as §2 (copy the heading strings from this brief; do not paraphrase).
3. Write `docs/spikes/RESULTS.md` with the seven sections and the locked-architecture block.
4. Write `docs/threat-model.md`. The nineteen rows, verbatim (`Attack | v0 response | Named test(s) / where`); leave `Link` empty:
   - **FIX** Agent pays and gets nothing (expiry refund, settle-then-post failure, `resolve`) | `buyer` = x402 payer in `post`; `expire` and `resolve(toBuyer)` pay `buyer`; `/verify → screen → post → /settle` with idempotency | `test_Expire_RefundsBuyer`, `test_Resolve_ToBuyer_NoFee`, API test `settleAfterPost`
   - **FIX** Splitting the loss: an injected agent posts a hundred tasks | `maxOpenTasksPerBuyer` onchain + per-agent daily cap at the API, echoed in the 402 body | `test_Post_RevertsOverOpenCap`
   - **FIX** AbuseMark against an agentId nothing authenticates | agentId resolved from the payer via IdentityRegistry; no identity → log only; schema error → no mark; rate limit per agentId | `test_Mark_Idempotent`, `test_Mark_RateLimited`, API test `markSubjectIsPayer`
   - **FIX** Fake / duplicate workers | One nullifier = one account; attestation domain-bound with a deadline and (nullifier, worker) binding; a known nullifier reverts | `test_Register_DuplicateNullifierReverts`, `test_Register_ReplayedAttestationReverts`
   - **FIX** Seeded workers mint "verified humans" | `seedWorker` is a separate owner-only path emitting `WorkerSeeded`; seeded workers can only claim operator-funded tasks; the flag is indexed and rendered | `test_Seeded_CannotClaimExternalTask`
   - **FIX** Proof replay / gallery upload / GPS far from the place | Raw content hash anchored; reuse for the same place/type and a ~150 m geofence auto-dispute at the API; `capture="environment"` | API tests `reuseAutoDisputes`, `geofenceAutoDisputes`
   - **FIX** Junk proof, nobody watching the dispute window | `approve_task` / `dispute_task` tools; the API auto-disputes on schema/geofence failure; `disputeWindow` per task | `test_AutoRelease_AfterWindow`, `test_Dispute_InsideWindow`
   - **FIX** Claim-and-vanish, stranded task | Lazy expiry inside `claimFor`; cooldown after an expired claim | `test_Claim_LazyExpiry`, `test_Claim_CooldownAfterExpiry`
   - **FIX** Prompt-injected screening | Deterministic gate authoritative; LLM add-only; delimited input; structured output; 300-char cap; timeout falls back to the keyword class | fixture corpus in CI (`packages/screening/fixtures`)
   - **FIX** Worker-authored text injected into the buyer's agent | Answer = enum + ≤120-char escaped note, wrapped as untrusted data in the tool result | MCP contract test
   - **FIX** Proof photos deanonymise the worker | Private store, EXIF stripped, signed URLs, rounded coordinate in every public record, `geohash5` in the subgraph | `/proofs` unit test
   - **FIX** Operator key compromise | Four keys with one job each; `pause` on `post`/`claim` only; single-signer disclosed | `test_Pause_NeverBlocksRelease`
   - **DOC** Photo is a photo of a photo / edited | We anchor, we do not authenticate; loss bounded at one task; reputation keyed to the nullifier; second-worker re-verification is the roadmap; forensics out of scope | README
   - **DOC** GPS spoofing | "GPS is self-reported and spoofable; we anchor it, geofence it, and dispute outside the radius — we do not prove it." | README
   - **DOC** Self-dealing (operator's own worker farms reputation) | Per-nullifier dedup caps it at one voice; the filmed run has the operator on both sides and says so | README, narration
   - **DOC** Dispute / auto-release boundary race | One constant; documented, not built | README
   - **DOC** Worker-directed harm (a lure, a stakeout, 23:00) | Daylight-hours default, max distance and a kill switch **before the first external poster** (pre-W3, not hackathon); `Report task` if built | README
   - **DOC** Worker's approximate location exposed to the poster | Rounded coordinate only; stated | README
   - **DOC** Settle → post custody block | The operator float holds the task's funds between `post` and `settle`; stated | README, narration
5. Add the README stubs in the §2 order. Run §9. Open one PR labelled `docs`.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `grep -c '^## (' FEEDBACK-WORLD.md` | prints `4`; each of the four heading strings matches `grep -Fxq` exactly as written in §2 |
| `grep -Fq '| date | who (handle / ERC-8004 id / payer) | channel | task type | self-funded? | would pay real money? | notes |' POSTERS.md` | table header verbatim |
| `grep -c '^outcome:' docs/spikes/RESULTS.md` | prints `7`; same for `^evidence:` and `^decision:` |
| `grep -cE '^## (S1\|S2\|S3\|S5\|Graph\|Preflight\|Timing)$' docs/spikes/RESULTS.md` | prints `7` (bare-id headings; anchors `#s1`… resolve) |
| `grep -c '^| \*\*FIX\*\*\|^| \*\*DOC\*\*' docs/threat-model.md` | prints `19` |
| `grep -Fq 'state of this repo on 2026-09-04' README.md && grep -Fq 'Pre-kickoff artifacts: this planning pack' README.md` | T-00 lines intact |
| `bash scripts/ci/banned-words.sh` | exit 0 |
| link check (§9) | no `MISSING` line |

## 9. Verification commands
```bash
bash scripts/ci/banned-words.sh; echo "banned-words exit=$?"
grep -c '^## (' FEEDBACK-WORLD.md; grep -c '^outcome:' docs/spikes/RESULTS.md; grep -c '^| \*\*FIX\*\*\|^| \*\*DOC\*\*' docs/threat-model.md
for f in FEEDBACK-WORLD.md POSTERS.md docs/spikes/RESULTS.md docs/threat-model.md README.md; do
  grep -oE '\]\([^)]+\)' "$f" | sed -E 's/^\]\(//; s/\)$//; s/#.*$//' | grep -Ev '^(https?://|$)' | while read -r l; do
    [ -e "$(dirname "$f")/$l" ] || [ -e "$l" ] || echo "MISSING in $f: $l"; done; done
```
Expected: `banned-words exit=0`, then `4`, `7`, `19`, and no `MISSING` lines.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. Write "24 hours" or `86400`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate).
- No secrets in code or client bundles; `.env.example` is the only env file in git.
- The four World headings and the POSTERS header are copied character for character; no re-wording, no re-numbering, no added words inside the heading text.
- "Legwork" never stands alone in a title: always "Legwork — real-world verification for AI agents".
- Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-02 — Docs skeletons
owned-paths:
  - FEEDBACK-WORLD.md
  - POSTERS.md
  - docs/spikes/RESULTS.md
  - docs/threat-model.md
  - README.md
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

## 14. Reviewer notes
Open `FEEDBACK-WORLD.md` first and diff the four headings against §2 character by character (a "Selfie Check" with a space in heading (1) is wrong — the track text writes `SelfieCheck`). Then count the threat-model rows (19) and check the T-00 README lines survived.

## 15. Round 2+
—
