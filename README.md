# Legwork — real-world verification for AI agents

<!-- T-49: 40-second GIF of the hire loop -->

**Agents hire verified humans for the legwork software can't do. Escrow releases on proof.**

An agent posts a real-world task — confirm a shop is open, photograph a poster, read a
sign — and funds it in USDC escrow. A World ID-verified person nearby claims it, does it,
and submits proof. The escrow releases on proof. Built on Base Sepolia for ETHOnline 2026.

*State of this repo on 2026-09-07: the four contracts are deployed to Base Sepolia; the subgraph, Task API, MCP server, mini-app and dashboard are under construction. Hacking began at 16:00 UTC on 2026-09-04; every line here is written after that timestamp.*

## Start Fresh disclosure

Pre-kickoff artifacts: this planning pack, a pitch deck and a static UI mockup, all dated and public. No code or stylesheet from them is in this repo.

The plan is reproduced verbatim under `docs/plan/` so the disclosure is checkable rather than
claimed; the UI is re-typed from `DESIGN-SPEC.md`, not copied.

## Try it

```bash
claude mcp add --transport http legwork https://<host>/mcp
```

Then ask your agent:

> Ask Legwork whether `<place>` is open right now

> Ask Legwork which of these two storefront photos is more legible

**Honest limits.** `verify-open` and `photo-of` are fulfilled in Leiria only (the pool is one real worker plus a hand-recruited standby crew); workers are online `<hours>` UTC; `compare-two` and `call-confirm` (Portuguese) can be done from anywhere; answers come back in minutes, not milliseconds — poll `task_status` with `wait_seconds=50` and never re-post the same task. A malformed request returns a plain 4xx and never produces a `task-refused` mark; only a well-formed request that hits one of the six abuse classes does. Settlement is Base Sepolia testnet; mainnet payouts are roadmap.

The six tools, their input and output shapes and the four task types are in [`SKILL.md`](SKILL.md)
and [`docs/mcp.md`](docs/mcp.md).

## What this is

> Marketplaces already let agents hire humans. Legwork is the first where every worker is one verified human, every payment is escrowed onchain and released on proof, every hiring agent is accountable, and the documented abuse classes are refused at the API.

**The trust model.** Verification proves a worker is a live, unique person — not that they are honest or competent. Escrow bounds the agent's loss to one task, and a per-agent daily cap bounds it to one day. Screening is a cost floor, not a cure. Legwork's guarantee is **bounded, attributable work**: an agent never pays for nothing, a worker never works for nothing, and every task leaves a record both sides can read.

Bot-proof, not fraud-proof.

## Live · deployed · seeded

- **Live, not ours:** World ID (Developer Portal, IDKit 4.x, staging credentials), ERC-8004 identity and reputation registries on Base Sepolia, the x402 reference facilitator, USDC.
- **Deployed by us on Base Sepolia:** WorkerRegistry, TaskEscrow, Reputation, AbuseMark, the subgraph (Studio), the Task API + MCP server, the mini-app, the dashboard.
- **Seeded and labelled:** ~20 workers via `seedWorker` (synthetic nullifiers, flagged onchain and rendered as such), a handful of operator-funded completed tasks so the preflight has something to show — their medians are labelled `seeded` or the preflight uses real completions only. ONE real registration: the demo worker's phone. The filmed worker account shows only what it actually earned. Never claim the seeded workers are people.

| Live, not ours | Ours, deployed on Base Sepolia | Seeded and disclosed |
| --- | --- | --- |
| World ID — Developer Portal, IDKit 4.x, staging credentials | WorkerRegistry `0x9011A65B89376e6cA393c3158fcB75f5a19F60a1` | 20 worker rows via `seedWorker()` (cannot produce a verified registration) |
| ERC-8004 IdentityRegistry `0x8004A818BFB912233c491871b3d84c89A494BD9e` | TaskEscrow `0xDAFefc07986B3336b066B19E6DE6B76680628B52` | `<N>` seeded task lifecycles |
| ERC-8004 ReputationRegistry `0x8004B663056A597Dffe9eCcC1965A193B7388713` | Reputation `0x68b16582c8fdFdAaDBfB158d578e2ab839e3d763` | one real registration (the demo phone) |
| x402 reference facilitator | AbuseMark `0x1848Db2d813A66b735f61a73c75456ca32b42Fb6` | marks operator-attested |
| USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | Subgraph (Studio) `<studio url>` | relayed claims, gas paid by Legwork |
| — | Task API + MCP server, mini-app, dashboard `<host>` | operator powers: seed, reset, resolve |

Plain addresses now; T-49 turns them into Basescan links on Day 10.

## How the loop works

1. **Verify once.** A worker proves personhood with World ID through IDKit and registers one account — cloud-verified, operator-attested — onchain World ID verification is Orb-only today.
2. **The agent asks for one of four typed things and pays through x402.** 3.00 to the worker plus a 0.45 fee on top = 3.45 charged to the agent. Free text is not a task type.
3. **Money is locked before anyone can claim.** The escrow records the x402 payer as the buyer and the refund party; a per-task cap and a per-agent daily cap (5 open tasks / 25 USDC) bound the loss — our custody is the one block between settlement and escrow, and we say so.
4. **The worker signs in with World ID and their World App wallet.** We relay the claim and pay the gas, so a worker never needs ETH.
5. **Release on approve, or `autoRelease` after the task's dispute window.** Expiry refunds the buyer; a contested proof goes to operator `resolve`, which charges zero fee on either leg.
6. **Both records move.** Worker reputation is nullifier-keyed and deduplicated per rater; the hiring agent's ERC-8004 record gets `paid-on-proof`, `disputed` or `task-refused:<class>`. A refused task moves no money.

## Prior art

| Project | Worker verification | Payment / escrow | Agent accountability | Abuse screening | Reputation source |
| --- | --- | --- | --- | --- | --- |
| RentAHuman (YC, Feb 2026; 787,000+ registered) | Signup form; bot-inflated supply | Escrow advertised via MCP; payouts reported failing (Trustpilot) | None (API keys) | None documented (six classes bought for a median $25) | Own |
| MeatLayer (UK) | ID + background check + GPS | Stripe escrow, released on proof; fee 15% on top, worker keeps 100% | MCP server, REST API, per-agent profiles; no onchain identity other services can read | No documented screening | Own |
| AgentHands (Synthesis Hackathon, 2026) | Self Protocol passport ZK | USDC escrow on Base Sepolia, released on IPFS photo proof; x402 | ERC-8004 identity | — | — |
| agentDesk (ETHGlobal Cannes 2026) | World ID | x402-gated access between agents and humans, World Chain | — | — | — |
| HumanPing (unverified) | World ID among four verification layers (unverified) | Escrow locked at task creation; 18% fee (unverified) | API keys (unverified) | — (unverified) | Own (unverified) |
| CYBERDYNE (live, Base mainnet) | Verified-X humans | Non-custodial x402 auth-capture escrow, 2.5% fee; MCP server | — | — (task catalogue is social-media engagement, the paper's fourth class) | Own |
| World AgentKit | Proof-of-human for the *agent's* owner | x402 (payments), no marketplace | Yes (AgentBook) | — | — |
| Prolific API / Rapidata | Panel vetting / ad-sourced | Platform-billed | — | Research-ethics review | Own |
| Human API (Apr 2026, $65M) | Reviewed work; verification unspecified | Platform payout rails after approval | API keys | Review before payout | Own |
| **Legwork** | **One World ID nullifier = one worker (Selfie Check-compatible; cloud-verified, operator-attested; claims relayed, gas paid by Legwork)** | **Onchain escrow released on proof; the hiring agent is the refund party; 15% on top** | **ERC-8004 identity + worker feedback + `task-refused` marks, written by the Task API against the identity that paid** | **Six classes refused at the API through field-level task schemas; free text never reaches the classifier** | **Worker: nullifier-keyed, deduped per hiring agent, O(1) onchain · Agent: ERC-8004** |

We cite neighbours by name and claim only the empty cell: none refuses the documented abuse classes at the API or writes the refusal to the agent's record.

## Threat model

One test per row, named after the attack. The full table — with the v0 response for each — is in [`docs/threat-model.md`](docs/threat-model.md).

| Attack | Test |
| --- | --- |
| Agent pays and gets nothing (expiry refund, settle-then-post failure, `resolve`) | `test_Expire_RefundsBuyer`, `test_Resolve_ToBuyer_NoFee`, API test `settleAfterPost` |
| Splitting the loss: an injected agent posts a hundred tasks | `test_Post_RevertsOverOpenCap` |
| AbuseMark against an agentId nothing authenticates | `test_Mark_Idempotent`, `test_Mark_RateLimited`, API test `markSubjectIsPayer` |
| Fake / duplicate workers | `test_Register_DuplicateNullifierReverts`, `test_Register_ReplayedAttestationReverts` |
| Seeded workers mint "verified humans" | `test_Seeded_CannotClaimExternalTask` |
| Proof replay / gallery upload / GPS far from the place | API tests `reuseAutoDisputes`, `geofenceAutoDisputes` |
| Junk proof, nobody watching the dispute window | `test_AutoRelease_AfterWindow`, `test_Dispute_InsideWindow` |
| Claim-and-vanish, stranded task | `test_Claim_LazyExpiry`, `test_Claim_CooldownAfterExpiry` |
| Prompt-injected screening | fixture corpus in CI (`packages/screening/fixtures`) |
| Worker-authored text injected into the buyer's agent | MCP contract test |
| Proof photos deanonymise the worker | `/proofs` unit test |
| Operator key compromise | `test_Pause_NeverBlocksRelease` |
| Photo is a photo of a photo / edited | documented below |
| GPS spoofing | documented below |
| Self-dealing (operator's own worker farms reputation) | documented below |
| Dispute / auto-release boundary race | documented below |
| Worker-directed harm (a lure, a stakeout, 23:00) | documented below |
| Worker's approximate location exposed to the poster | documented below |
| Settle → post custody block | documented below |

GPS is self-reported and spoofable; we anchor it, geofence it, dispute outside the radius — we do not prove it.

## Negative attestations in ERC-8004: what a hire-a-human API can honestly write about an agent

AbuseMark holds the Task API's own registered ERC-8004 identity and is the only writer of agent-side feedback, so every mark has a named author a reader can look up. It writes three tags: `paid-on-proof` when an escrow released on an approved proof, `disputed` when a proof failed, and `task-refused:<class>` where the class is one of six labels taken verbatim from the abuse literature — credential fraud · identity impersonation · automated reconnaissance · social media manipulation · authentication circumvention · referral fraud (Mehta, arXiv:2602.19514). The agent id that a mark names is resolved from the payer through the ERC-8004 IdentityRegistry (`ownerOf` or `getAgentWallet`) and never read from the request body, because a subject you did not authenticate is a subject anyone can frame. If the payer has no ERC-8004 identity, the refusal is logged and nothing is written onchain. A schema error is a plain 4xx and never marks; only a well-formed request that hits one of the six classes does. Marks are idempotent per (agentId, specHash) and rate-limited by `markCooldown` — 86400 seconds by default, lowered to 120 seconds for the filmed run and disclosed on screen when it is. Every mark is operator-attested in v0: one signer, one key, no second opinion, and the dashboard says so beside the mark rather than in fine print. An abuser can re-register an agent and start clean; the mark follows the identity, not the operator — a cost floor, documented.

## Out of scope

- Competence vetting, background checks, physical-safety tasks (MeatLayer's lane).
- Dispute arbitration beyond the window: v0 has agent-approve / auto-release / expiry-refund plus operator `resolve` for a contested proof, disclosed.
- Worker KYC, tax reporting, employment classification (workers are paid per task in testnet USDC in the demo; mainnet payouts are roadmap and would go through a provider such as Privy/Bridge or Stripe).
- Proving a photo is unedited, or catching a re-shot near-duplicate. The same file cannot settle two tasks; forensics and near-duplicate detection are roadmap.
- The settle→post custody block: for one block, the Task API's operator wallet holds the agent's payment before the escrow does. Our custody is the one block between settlement and escrow, and we say so.
- Photo retention: proof photos are stored privately, served through signed URLs to the buyer, and retained for the dispute window; retention is stated, not enforced by contract.
- Worker location: only a coarse area is indexed publicly, but the poster of a task learns roughly where its worker stood. Documented, not solved.
- Worker safety at scale: daylight-hours default, maximum distance, a kill switch — required before the first external poster, absent from the demo.
- Operator powers in v0: seed workers, reset a registration for rehearsal, resolve a dispute — all disclosed, all single-signer; multisig is roadmap.
- Collusion between a hiring agent's operator and a worker (self-dealing to farm reputation): per-human dedup caps the benefit at one voice; not solved. In the demo the operator is on every side of the transaction, and the video says so.

## Operator powers in v0

| Power | What it does | Why it exists |
| --- | --- | --- |
| `seedWorker` | Registers a worker row from a synthetic nullifier, flagged onchain as seeded | A marketplace with one worker cannot show a preflight; the flag is indexed and rendered so no seeded row is ever presented as a person |
| `resetWorker` | Clears a registration so the same World ID can register again | The demo phone has to rehearse the verify step more than once |
| `resolve` | Sends a contested task's escrow to the buyer or the worker, zero fee either way | Someone has to break a tie inside the dispute window, and taking a fee on a dispute would be an incentive to create them |
| `pause` | Halts `post` and `claim`; release, dispute and expiry keep working | A compromised operator key must not be able to strand money that is already escrowed |
| `setAllowlistedBuyer` | Marks a buyer whose tasks a seeded worker may claim | Keeps the seeded pool sealed off from real posters |
| `setMarkCooldown` | Sets the minimum interval between two marks against one agent | Rate-limits the mark writer; the filmed run lowers it from 86400 s to 120 s and says so |

All disclosed, all single-signer; multisig is roadmap.

Today I am on both sides of this: my agent, my phone, my key resolves disputes. The contract doesn't know that, and that's the point of putting it in a contract.

## Prize qualification

_filled by T-48 on Day 9_

## External posters

_filled by T-49 on Day 10_

## AI usage

This project was built with AI assistance and documents it rather than hiding it.

- Every commit carries the trailer `AI-Usage: <tool + model> drafted <what>; human <reviewed|edited> <what>`, and CI fails a commit without one.
- Every pull request has an **AI usage** section in its body.
- The prompts are committed, not described: `examples/prompt.md` for the demo agent, and the screening classifier's system prompt under `packages/screening/src/classifier/`.
- `docs/AI-USAGE.md` compiles the whole picture — tools, models, what each drafted and what a human changed — on Day 10 (T-49).

The Reputation contract is re-implemented from the same threat model, written from a blank file after kickoff.

## Data sources and licences

Place data © OpenStreetMap contributors, available under the Open Database License (ODbL): https://www.openstreetmap.org/copyright. The cached extract covers Leiria and Lisbon business POIs only.

The repo is MIT licensed.

## Addresses and endpoints

_filled by T-49 on Day 10_

## Docs

- [Day-1 spike results](docs/spikes/RESULTS.md)
- [Threat model](docs/threat-model.md)
- [World ID feedback](FEEDBACK-WORLD.md)
- [External posters](POSTERS.md)
- [Task briefs](docs/plan/)
