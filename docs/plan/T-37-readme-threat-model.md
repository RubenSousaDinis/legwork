---
id: T-37
title: README skeleton + threat model — every Day-10 section, verbatim blocks, test names
lane: E
day: 4
size: M
agent_class: C
must: true
depends_on: [T-14, T-02]
owned_paths:                         # README.md Days 4–8 (T-48 Day 9 prize table only; T-49 Day 10) · docs/threat-model.md Days 4–6 (T-45 Days 7–8)
  - README.md
  - docs/threat-model.md
labels: [area:docs, wave:4, size:M, agent:cloud, docs]
branch: t-37/readme-threat-model
---

# T-37 — README skeleton and threat model

## 1. Context
The Day-10 README is listed in the schedule as: "prize-qualification table …, live / deployed / seeded table, prior-art matrix incl. AgentHands, agentDesk, HumanPing, CYBERDYNE, threat model with the Foundry test names, the AbuseMark design note, out-of-scope, AI-usage documentation, `POSTERS.md` section, the four contract addresses as Basescan links + the subgraph endpoint, a 40-second GIF of the hire loop at the top, a dated 'state of this repo on 2026-09-13' line, `docs/` with the feedback doc and spike results." T-02 created the stub sections; this task writes every section that can be written on Day 4, with the word-locked blocks pasted below. T-48 adds the prize table (Day 9), T-49 the addresses, GIF, final count and date (Day 10). Two words are locked across README, deck and video: the claim and the trust model. One sentence is a Start Fresh disclosure.

## 2. Exact scope
- H1 `# Legwork — real-world verification for AI agents`; a GIF placeholder line `<!-- T-49: 40-second GIF of the hire loop -->`; the tagline: "Agents hire verified humans for the legwork software can't do. Escrow releases on proof."
- `## Try it` — the install line `claude mcp add --transport http legwork https://<host>/mcp`, the two prompts from `SKILL.md` (*"Ask Legwork whether `<place>` is open right now"* / *"Ask Legwork which of these two storefront photos is more legible"*), and the honest limits paragraph: "`verify-open` and `photo-of` are fulfilled in Leiria only (the pool is one real worker plus a hand-recruited standby crew); workers are online `<hours>` UTC; `compare-two` and `call-confirm` (Portuguese) can be done from anywhere; answers come back in minutes, not milliseconds — poll `task_status` with `wait_seconds=50` and never re-post the same task. A malformed request returns a plain 4xx and never produces a `task-refused` mark; only a well-formed request that hits one of the six abuse classes does. Settlement is Base Sepolia testnet; mainnet payouts are roadmap."
- `## What this is` — the claim, **verbatim**, as a blockquote: "Marketplaces already let agents hire humans. Legwork is the first where every worker is one verified human, every payment is escrowed onchain and released on proof, every hiring agent is accountable, and the documented abuse classes are refused at the API." Then the trust model, **verbatim**: "Verification proves a worker is a live, unique person — not that they are honest or competent. Escrow bounds the agent's loss to one task, and a per-agent daily cap bounds it to one day. Screening is a cost floor, not a cure. Legwork's guarantee is **bounded, attributable work**: an agent never pays for nothing, a worker never works for nothing, and every task leaves a record both sides can read."
- `## Live · deployed · seeded` — the three bullets **verbatim**: "Live, not ours: World ID (Developer Portal, IDKit 4.x, staging credentials), ERC-8004 identity and reputation registries on Base Sepolia, the x402 reference facilitator, USDC." · "Deployed by us on Base Sepolia: WorkerRegistry, TaskEscrow, Reputation, AbuseMark, the subgraph (Studio), the Task API + MCP server, the mini-app, the dashboard." · "Seeded and labelled: ~20 workers via `seedWorker` (synthetic nullifiers, flagged onchain and rendered as such), a handful of operator-funded completed tasks so the preflight has something to show — their medians are labelled `seeded` or the preflight uses real completions only. ONE real registration: the demo worker's phone. The filmed worker account shows only what it actually earned. Never claim the seeded workers are people." Then the three-column table `| Live, not ours | Ours, deployed on Base Sepolia | Seeded and disclosed |` with the four contract addresses read from `contracts/deployments/base-sepolia.json` (plain addresses now; T-49 turns them into Basescan links), ERC-8004 `0x8004A818…` / `0x8004B663…`, `<studio url>`, `<host>`, and "20 worker rows via `seedWorker()` (cannot produce a verified registration) · `<N>` seeded task lifecycles · one real registration (the demo phone) · marks operator-attested · relayed claims, gas paid by Legwork · operator powers: seed, reset, resolve".
- `## How the loop works` — six lines: verify once (World ID, IDKit; "cloud-verified, operator-attested — onchain World ID verification is Orb-only today") · the agent asks for one of four typed things and pays through x402 (3.00 + 0.45 = 3.45) · money locked before anyone can claim (buyer address recorded; per-task cap; 5 open / 25 USDC per day) · the worker signs in with World ID and their World App wallet; we relay the claim and pay the gas · release on approve or `autoRelease` after the task's dispute window; expiry refunds the buyer; zero fee on any `resolve` · both records move (worker reputation nullifier-keyed and deduplicated per rater; the agent's ERC-8004 record: `paid-on-proof`, `disputed`, `task-refused:<class>`). Include: "our custody is the one block between settlement and escrow, and we say so." and "a refused task moves no money."
- `## Prior art` — the matrix `| Project | Worker verification | Payment / escrow | Agent accountability | Abuse screening | Reputation source |` with these rows pasted **verbatim** from §7 step 3: RentAHuman, MeatLayer, AgentHands, agentDesk, HumanPing, CYBERDYNE, World AgentKit, Prolific API / Rapidata, Human API, **Legwork**. Cells the pack marks `[check]` are rendered `unverified`. Closing sentence: "We cite neighbours by name and claim only the empty cell: none refuses the documented abuse classes at the API or writes the refusal to the agent's record."
- `## Threat model` — a two-column summary `| Attack | Test |` derived from `docs/threat-model.md` (every FIX row → its named test(s); DOC rows → "documented below") and a link to `docs/threat-model.md`. In `docs/threat-model.md` add, per FIX row, the file the test lives in (`contracts/test/<Contract>.t.sol` or `apps/api/src/**/*.test.ts`) in the `Link` column when it already exists on `main`; leave `pending` otherwise (T-45 finishes).
- `## Negative attestations in ERC-8004: what a hire-a-human API can honestly write about an agent` — the AbuseMark design note (6–10 sentences): AbuseMark holds the Task API's registered ERC-8004 identity and is the only writer of agent-side feedback; tags `paid-on-proof` / `disputed` / `task-refused:<class>` with the six labels verbatim (credential fraud · identity impersonation · automated reconnaissance · social media manipulation · authentication circumvention · referral fraud — Mehta, arXiv:2602.19514); the agent id is verified against the payer through the IdentityRegistry (`ownerOf` or `getAgentWallet`), never read from the body; no identity → log only, no mark; a schema error → a plain 4xx, no mark; idempotent per (agentId, specHash); rate-limited by `markCooldown` (default 86400 s; the filmed run uses 120 s, disclosed); operator-attested in v0; "an abuser can re-register an agent; the mark follows the identity, not the operator — a cost floor, documented."
- `## Out of scope` — the ten bullets **verbatim** from §7 step 4.
- `## Operator powers in v0` — `seedWorker`, `resetWorker`, `resolve`, `pause`, `setAllowlistedBuyer`, `setMarkCooldown`; one line each on what it does and why it exists; "all disclosed, all single-signer; multisig is roadmap"; "today I am on both sides of this: my agent, my phone, my key resolves disputes. The contract doesn't know that, and that's the point of putting it in a contract."
- `## AI usage` — how AI use is documented: every commit carries `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`; every PR has an "AI usage" section; `examples/prompt.md` and the classifier prompt in `packages/screening/src/classifier/` are committed; `docs/AI-USAGE.md` is compiled on Day 10 (T-49). The Reputation contract is "re-implemented from the same threat model, written from a blank file after kickoff".
- `## Data sources and licences` — "Place data © OpenStreetMap contributors, available under the Open Database License (ODbL): https://www.openstreetmap.org/copyright. The cached extract covers Leiria and Lisbon business POIs only." MIT for the repo.
- Honesty sentence kept **verbatim** (from T-00): "Pre-kickoff artifacts: this planning pack, a pitch deck and a static UI mockup, all dated and public. No code or stylesheet from them is in this repo." Update the dated line to `state of this repo on 2026-09-0X` for the PR's day. Do not write "the worker was paid for real, separately" — only T-49 may, after the Day-9 shoot, if true.

## 3. Out of scope
- Prize-qualification table (T-48, Day 9), Basescan links / GIF / final date / POSTERS count / `docs/AI-USAGE.md` (T-49, Day 10), `docs/keys.md`, `docs/api.md`, `docs/mcp.md`, RESULTS (T-45), `FEEDBACK-WORLD.md` (T-41), `SKILL.md` (T-31).
- Do not touch: anything outside §4.

## 4. Owned paths
```
README.md
docs/threat-model.md
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| Deployed addresses | `contracts/deployments/base-sepolia.json` (T-14) | four addresses copied exactly |
| Threat-model rows (19) | `docs/threat-model.md` (T-02) | rows unchanged; you fill `Link` where the test exists |
| Named tests | `contracts/test/*.t.sol`, `apps/api/**/*.test.ts`, `packages/mcp/**/*.test.ts` | `grep -rn "function test_…"` / `it('…'` |
| README stub order | `README.md` (T-02) | keep the order; replace the italic placeholders |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| README sections and their headings | `README.md` | T-48 (adds under `## Prize qualification`), T-49 |
| Threat-model `Link` column convention (`<path>` · `pending`) | `docs/threat-model.md` | T-45 |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-37` — it must print `CLAIMED T-37`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `README.md`, `docs/threat-model.md`, `SKILL.md`, `contracts/deployments/base-sepolia.json`, `docs/keys.md`.
2. Write the sections in the §2 order, pasting the verbatim blocks from this brief (do not re-type from memory).
3. Prior-art rows to paste (pipe-separated, in this column order; `[check]` → `unverified`):
   - RentAHuman (YC, Feb 2026; 787,000+ registered) | Signup form; bot-inflated supply | Escrow advertised via MCP; payouts reported failing (Trustpilot) | None (API keys) | None documented (six classes bought for a median $25) | Own
   - MeatLayer (UK) | ID + background check + GPS | Stripe escrow, released on proof; fee 15% on top, worker keeps 100% | MCP server, REST API, per-agent profiles; no onchain identity other services can read | No documented screening | Own
   - AgentHands (Synthesis Hackathon, 2026) | Self Protocol passport ZK | USDC escrow on Base Sepolia, released on IPFS photo proof; x402 | ERC-8004 identity | — | —
   - agentDesk (ETHGlobal Cannes 2026) | World ID | x402-gated access between agents and humans, World Chain | — | — | —
   - HumanPing | World ID among four verification layers | Escrow locked at task creation; 18% fee | API keys | — | Own  *(all cells `unverified` marker appended)*
   - CYBERDYNE (live, Base mainnet) | Verified-X humans | Non-custodial x402 auth-capture escrow, 2.5% fee; MCP server | — | — (task catalogue is social-media engagement, the paper's fourth class) | Own
   - World AgentKit | Proof-of-human for the *agent's* owner | x402 (payments), no marketplace | Yes (AgentBook) | — | —
   - Prolific API / Rapidata | Panel vetting / ad-sourced | Platform-billed | — | Research-ethics review | Own
   - Human API (Apr 2026, $65M) | Reviewed work; verification unspecified | Platform payout rails after approval | API keys | Review before payout | Own
   - **Legwork** | **One World ID nullifier = one worker (Selfie Check-compatible; cloud-verified, operator-attested; claims relayed, gas paid by Legwork)** | **Onchain escrow released on proof; the hiring agent is the refund party; 15% on top** | **ERC-8004 identity + worker feedback + `task-refused` marks, written by the Task API against the identity that paid** | **Six classes refused at the API through field-level task schemas; free text never reaches the classifier** | **Worker: nullifier-keyed, deduped per hiring agent, O(1) onchain · Agent: ERC-8004**
4. Out-of-scope bullets to paste verbatim: "Competence vetting, background checks, physical-safety tasks (MeatLayer's lane)." · "Dispute arbitration beyond the window: v0 has agent-approve / auto-release / expiry-refund plus operator `resolve` for a contested proof, disclosed." · "Worker KYC, tax reporting, employment classification (workers are paid per task in testnet USDC in the demo; mainnet payouts are roadmap and would go through a provider such as Privy/Bridge or Stripe)." · "Proving a photo is unedited, or catching a re-shot near-duplicate. The same file cannot settle two tasks; forensics and near-duplicate detection are roadmap." · "The settle→post custody block: for one block, the Task API's operator wallet holds the agent's payment before the escrow does. Our custody is the one block between settlement and escrow, and we say so." · "Photo retention: proof photos are stored privately, served through signed URLs to the buyer, and retained for the dispute window; retention is stated, not enforced by contract." · "Worker location: only a coarse area is indexed publicly, but the poster of a task learns roughly where its worker stood. Documented, not solved." · "Worker safety at scale: daylight-hours default, maximum distance, a kill switch — required before the first external poster, absent from the demo." · "Operator powers in v0: seed workers, reset a registration for rehearsal, resolve a dispute — all disclosed, all single-signer; multisig is roadmap." · "Collusion between a hiring agent's operator and a worker (self-dealing to farm reputation): per-human dedup caps the benefit at one voice; not solved. In the demo the operator is on every side of the transaction, and the video says so."
5. Fill `docs/threat-model.md` `Link` cells for tests already on `main` (`grep -rn "function test_Expire_RefundsBuyer" contracts/test` etc.). Run §9. Open one PR labelled `docs`.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `grep -Fq 'Marketplaces already let agents hire humans. Legwork is the first where every worker is one verified human' README.md` | claim verbatim |
| `grep -Fq 'bounded, attributable work' README.md && grep -Fq 'a per-agent daily cap bounds it to one day' README.md` | trust model verbatim incl. the daily-cap clause |
| `grep -Fq 'Pre-kickoff artifacts: this planning pack, a pitch deck and a static UI mockup, all dated and public. No code or stylesheet from them is in this repo.' README.md` | honesty sentence intact |
| `for n in RentAHuman MeatLayer AgentHands agentDesk HumanPing CYBERDYNE "World AgentKit" Prolific Rapidata "Human API"; do grep -Fq "$n" README.md || echo "MISSING $n"; done` | no output |
| `grep -Fq 're-implemented from the same threat model' README.md` | Start Fresh wording |
| `grep -Fq 'OpenStreetMap contributors' README.md && grep -Fq 'ODbL' README.md` | attribution |
| `for p in seedWorker resetWorker resolve pause setAllowlistedBuyer setMarkCooldown; do grep -Fq "$p" README.md || echo "MISSING $p"; done` | operator powers listed |
| `grep -c '^| \*\*FIX\*\*\|^| \*\*DOC\*\*' docs/threat-model.md` | still `19` |
| `bash scripts/ci/banned-words.sh` | exit 0 |
| link check (§9) | no `MISSING` |

## 9. Verification commands
```bash
bash scripts/ci/banned-words.sh; echo "banned-words exit=$?"
grep -c '^| \*\*FIX\*\*\|^| \*\*DOC\*\*' docs/threat-model.md
for n in RentAHuman MeatLayer AgentHands agentDesk HumanPing CYBERDYNE "World AgentKit" Prolific Rapidata "Human API"; do grep -Fq "$n" README.md || echo "MISSING $n"; done
grep -Fq '3.45' README.md && grep -Fq '0.45' README.md && grep -Fq '3.00' README.md && echo "money ok"
for f in README.md docs/threat-model.md; do grep -oE '\]\([^)]+\)' "$f" | sed -E 's/^\]\(//; s/\)$//; s/#.*$//' | grep -Ev '^(https?://|$)' | while read -r l; do [ -e "$(dirname "$f")/$l" ] || [ -e "$l" ] || echo "MISSING in $f: $l"; done; done
```
Expected: `banned-words exit=0`, `19`, no `MISSING`, `money ok`.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. Write "24 hours" or `86400`; the Reputation design is "re-implemented from the same threat model, written from a blank file after kickoff".
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate).
- No secrets; addresses and public URLs only.
- Honesty lines used verbatim where they appear: "cloud-verified, operator-attested — onchain World ID verification is Orb-only today"; "a refused task moves no money"; "our custody is the one block between settlement and escrow, and we say so"; "Bot-proof, not fraud-proof."; "one real registration, plus twenty seeded rows (demo data)"; "GPS is self-reported and spoofable; we anchor it, geofence it, dispute outside the radius — we do not prove it."
- Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia. "Legwork" never stands alone in the H1.
- The word-locked claim and trust model are pasted, never paraphrased or "improved".

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-37 — README skeleton + threat model
owned-paths:
  - README.md
  - docs/threat-model.md
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- If `deployments/base-sepolia.json` is missing an address, write `<addr>` and `BLOCKED:`-mention it; never invent one.
- If S5 failed (T-13b), the ERC-8004 cell reads "ERC-8004 v1.x-compliant instance (self-deployed)".

## 14. Reviewer notes
Diff the claim, trust model and honesty sentence against §2 character by character. Check the prior-art table did not gain a claim the pack does not make (only the empty cell). Check the threat-model summary names a test for every FIX row and none for DOC rows.

## 15. Round 2+
—
