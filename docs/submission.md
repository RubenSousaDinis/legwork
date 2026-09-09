# ETHGlobal submission pack — Legwork — real-world verification for AI agents

Pre-written for the operator's Day-10 form slot. Paste; do not draft under the deadline.
Tick only tracks whose qualification bullets are literally met.

## Title

Legwork — real-world verification for AI agents

## Short description

### Full (if the form allows)

Live: https://legwork-dashboard.vercel.app · `claude mcp add --transport http legwork https://legwork-api.vercel.app/mcp`. Agents hire verified humans (World ID) for four real-world checks; escrow on Base Sepolia releases on proof; the six documented abuse classes are refused at the API and written to the agent's ERC-8004 record. Testnet; 1 real worker + 20 seeded, disclosed.

### ≤300 (form)

legwork-dashboard.vercel.app · `claude mcp add --transport http legwork https://legwork-api.vercel.app/mcp` · Agents hire verified humans (World ID) for four real-world checks; escrow on Base Sepolia releases on proof; abusive requests refused at the API and written to the agent's ERC-8004 record.

### Character counts

- Full: 378 with live URLs (342 with `<domain>` / `<host>` placeholders).
- Form: 298 characters / 300 bytes with live hostnames (266 with `<live-url>` / `<host>` placeholders). The form line drops the `https://` scheme and the wrapping backticks on the dashboard host so `wc -m` in a C locale stays ≤ 300; the Full line and the Live URL field carry the scheme.

## Long description

Agents hire verified humans for the legwork software can't do. Escrow releases on proof.

Marketplaces already let agents hire humans. Legwork is the first where every worker is one verified human, every payment is escrowed onchain and released on proof, every hiring agent is accountable, and the documented abuse classes are refused at the API.

**The trust model.** Verification proves a worker is a live, unique person — not that they are honest or competent. Escrow bounds the agent's loss to one task, and a per-agent daily cap bounds it to one day. Screening is a cost floor, not a cure. Legwork's guarantee is **bounded, attributable work**: an agent never pays for nothing, a worker never works for nothing, and every task leaves a record both sides can read.

Bot-proof, not fraud-proof.

The uniqueness claim is Orb's. Selfie Check is medium-assurance and does not guarantee one-person-one-account; the product's "one account per person" line is true under Orb and would not have been under Selfie Check. The credential was chosen for the claim, not the other way round. The demo ships the same IDKit 4.x relying-party flow with `orbLegacy` instead of `selfieCheckLegacy`, because Selfie Check (Beta) is access-gated and the flag was not granted for our app before the freeze — see `FEEDBACK-WORLD.md` entries E5, E6, E8 and E9 and `docs/spikes/RESULTS.md` `## S2`. The app does not use Selfie Check.

What a judge saw in the video. Beat 1: at Pão Doce, Leiria (`ez1dn`), the listing and the shop door — the errand the demo agent (ERC-8004 id 9196) posted. Beat 6: an injected `call-confirm` ("read us the 6-digit code") is refused as `authentication circumvention`; a refused task moves no money. Beat 7: the worker submits proof and the meter moves LOCKED 3.45 → RELEASED 3.00 to the worker + 0.45 fee, testnet USDC.

The four task types and their floors (what the worker keeps): `verify-open` 3.00 · `photo-of` 3.00 · `call-confirm` 2.00 · `compare-two` 1.00. On a 3.00 task the agent pays 3.45 (0.45 fee on top).

zero external posters during the hackathon — logged in POSTERS.md.

Not competence vetting: a World ID nullifier proves a live, unique person, not that they are honest or skilled, and there is no background check.

Not a dispute court: v0 is agent-approve, auto-release after the task's window, expiry-refund, and operator `resolve` for a contested proof.

Not KYC or payroll: workers are paid per task in testnet USDC in the demo; tax reporting, employment classification and mainnet payouts are not in this repo.

Not fraud-proof: GPS is self-reported and spoofable, a photo is anchored rather than authenticated, and the loss is bounded at one task.

Addresses (Base Sepolia, from `contracts/deployments/base-sepolia.json`): WorkerRegistry `0xc33d229046507f4C2E664cbf974542c92eEAbAf4` · TaskEscrow `0x641B56dfA3A033D84a75588c18579347A0DE3c6B` · Reputation `0x2f731B56D02080190fa2ef7813887B2743551E43` · AbuseMark `0x29145D47EFc76bEaBc3A4011cFf7fC0fBEa02608`. Live, not ours: ERC-8004 IdentityRegistry `0x8004A818BFB912233c491871b3d84c89A494BD9e` · ERC-8004 ReputationRegistry `0x8004B663056A597Dffe9eCcC1965A193B7388713` · USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.

Subgraph Studio: https://thegraph.com/studio/subgraph/legwork-base-sepolia — query URL https://api.studio.thegraph.com/query/74763/legwork-base-sepolia/6653cb4.

Live surfaces: dashboard https://legwork-dashboard.vercel.app · mini-app https://legwork-miniapp.vercel.app · Task API + MCP https://legwork-api.vercel.app (`/mcp`).

[`SKILL.md`](../SKILL.md) · [`POSTERS.md`](../POSTERS.md) · [`FEEDBACK-WORLD.md`](../FEEDBACK-WORLD.md) (nine dated entries, including the undocumented `verification_disabled` and the credential named only inside `IDKitDebugReport`).

Pre-kickoff artifacts: this planning pack, a pitch deck and a static UI mockup, all dated and public. No code or stylesheet from them is in this repo.

## Live / deployed / seeded

| Live, not ours | Ours, deployed on Base Sepolia | Seeded and disclosed |
| --- | --- | --- |
| World ID (Developer Portal, sandbox) · ERC-8004 registries `0x8004A818BFB912233c491871b3d84c89A494BD9e` / `0x8004B663056A597Dffe9eCcC1965A193B7388713` · x402 reference facilitator · USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | WorkerRegistry `0xc33d229046507f4C2E664cbf974542c92eEAbAf4` · TaskEscrow `0x641B56dfA3A033D84a75588c18579347A0DE3c6B` · Reputation `0x2f731B56D02080190fa2ef7813887B2743551E43` · AbuseMark `0x29145D47EFc76bEaBc3A4011cFf7fC0fBEa02608` · subgraph https://api.studio.thegraph.com/query/74763/legwork-base-sepolia/6653cb4 · mini-app https://legwork-miniapp.vercel.app · Task API + MCP https://legwork-api.vercel.app | 20 worker rows via `seedWorker()` (cannot produce a verified registration) · 5 seeded task lifecycles · one real registration (the demo phone) · marks operator-attested · relayed claims, gas paid by Legwork · operator powers: seed, reset, resolve |

## Tech tags

World ID · IDKit · MiniKit · ERC-8004 · x402 · USDC · Base Sepolia · The Graph · Foundry · Next.js · MCP · Claude

## How it's made

The Day-1 spikes locked the architecture. S1 (PASS): the World ID Router on Base Sepolia answers, onchain verification is Orb-only, and `WorkerRegistry` ships one cloud-verified `ATTESTED` mode. S2 (DOWNGRADED): IDKit 4.x verifies end to end on Orb; Selfie Check returns `verification_disabled` because the Beta flag was never granted for `app_9eeebbfc580c72269133fb3b93b15440`; `WORLD_CREDENTIAL_LEVEL` is `orb` and `pickPreset` sends `orbLegacy`. S3 (PASS): exact-EVM x402 against the reference facilitator, settle after post, nonce-keyed idempotency; the buyer paid no gas; `PAYMENT_MODE` stays x402. S5 (PASS): production ERC-8004 IdentityRegistry `0x8004A818…` and ReputationRegistry `0x8004B663…` on Base Sepolia, interfaces confirmed, no self-deploy. Locked: credential orb / GPS available / payment x402 / ERC-8004 live registries.

The worker signs in with World ID and their World App wallet; we relay the claim and pay the gas; the contract records their address. Registration is cloud-verified, operator-attested — onchain World ID verification is Orb-only today.

Screening: the deterministic gate is authoritative; the LLM can add a refusal, never overturn one; free text never reaches the classifier; the corpus in `packages/screening/fixtures` runs in CI; `claude-opus-5` with a 3 s timeout falling back to the keyword class (`CLASSIFIER_TIMEOUT_MS = 3000`).

This project was built with AI assistance and documents it. Every commit carries an `AI-Usage:` trailer; CI fails a commit without one. The prompts are committed at `examples/prompt.md` and in `packages/screening/src/classifier/`. `docs/AI-USAGE.md` is compiled Day 10 (T-49). The Reputation contract is re-implemented from the same threat model, written from a blank file after kickoff.

## Prize qualification

Tick only tracks whose bullets are literally met.

| Partner · track | Qualification bullet (verbatim) | Evidence (file / address / commit / timestamp) | Met? |
| --- | --- | --- | --- |
| World — Selfie Check | Uses Selfie Check or a Selfie Check-compatible World ID credential flow in a meaningful way. Treats Selfie Check as a risk, eligibility, fairness, continuity, or abuse-prevention signal. Test via the Sandbox App. Include a detailed feedback document. Show a working app. | **Compatible flow, not Selfie Check.** `apps/miniapp/lib/worldid.ts` `pickPreset` / `IDKitRequestWidget`; `WORLD_CREDENTIAL_LEVEL=orb` (`docs/spikes/RESULTS.md` `## S2`); real worker `0xaed0c1102e45b7f528224eacb9309a0925015810` (`## Preflight`; `WorkerRegistered` tx TODO(operator)). `WorkerRegistry` one nullifier = one account, only verified workers claim; `test_Register_DuplicateNullifierReverts` in `contracts/test/WorkerRegistry.t.sol`. Sandbox: RESULTS `## S2` (Orb 200, Selfie Check `verification_disabled`) and `FEEDBACK-WORLD.md` E5, E6, E8, E9. Feedback: `FEEDBACK-WORLD.md`, nine dated entries. Working app: https://legwork-miniapp.vercel.app; video timestamp TODO(operator). | yes |
| The Graph — Best AI Tooling or AI Use Case (From Scratch) | Use The Graph as a load-bearing part. Consume live data from a Graph provider. net-new work started during the hackathon. open source with README or SKILL.md. | `preflight_workers` in `packages/mcp` (`src/tools/preflight.ts`); hosted mount `apps/api/app/mcp/route.ts` passes `createSubgraphClient` from `packages/subgraph-client`. `examples/transcript.md` shows the agent quoting `n_real` / `median_source`; `examples/prompt.md` requires it; Day-9 live capture `n_real: 1`, `median_source: "real"` (`RESULTS.md` `## Preflight`). Studio query URL https://api.studio.thegraph.com/query/74763/legwork-base-sepolia/6653cb4; Discord "does testnet Studio count as a Graph provider": unanswered as of 2026-09-09 (`RESULTS.md` `## Graph`). First commit `be479b42a7e4111cd0386b6ec832ea43f5876c5c` at 2026-09-04T17:18:30Z. `SKILL.md`; README states MIT (no root `LICENSE` file in the tree). | yes |
| The Graph — Best Use of Composable or Standardized Graph Products | not selected — Discord unanswered (Studio-as-provider and Subgraph MCP both unanswered as of 2026-09-09); The Graph's Subgraph MCP tool was not shipped | RESULTS `## Graph`; this repo's MCP is Legwork's, not The Graph's Subgraph MCP product | no — do not select |
| Bazantic — Agentify a New API | not selected — no gateway by freeze | No T-48 issue comment with gateway URL, recipe name, recording or username by Day 9 12:00 UTC | no — do not select |
| Bazantic — Best Recipe Using Sponsor APIs | not selected — no gateway by freeze | Second recipe does not exist | no — do not select |

## Form fields

Select 3 partners and every track each one qualifies for.

- **Title** — Legwork — real-world verification for AI agents
- **Short description** — paste the ≤300 form variant (300 characters). If the form allows more, paste the Full variant.
- **Long description** — paste `## Long description` from the tagline through the Start Fresh sentence.
- **Video URL** — TODO(operator)
- **Live URL** — https://legwork-dashboard.vercel.app
- **Repo** — https://github.com/RubenSousaDinis/legwork
- **Addresses** — WorkerRegistry `0xc33d229046507f4C2E664cbf974542c92eEAbAf4` · TaskEscrow `0x641B56dfA3A033D84a75588c18579347A0DE3c6B` · Reputation `0x2f731B56D02080190fa2ef7813887B2743551E43` · AbuseMark `0x29145D47EFc76bEaBc3A4011cFf7fC0fBEa02608` · subgraph https://api.studio.thegraph.com/query/74763/legwork-base-sepolia/6653cb4
- **Partners and tracks to select** — World (Selfie Check); The Graph (Best AI Tooling or AI Use Case (From Scratch)). Do not select The Graph Composable. Do not select Bazantic.
- **Install line** — `claude mcp add --transport http legwork https://legwork-api.vercel.app/mcp`

## TODO(operator)

- Video URL and the timestamps for beats 1, 6 and 7.
- `WorkerRegistered` transaction hash for the real registration (worker `0xaed0c1102e45b7f528224eacb9309a0925015810` on WorkerRegistry `0xc33d229046507f4C2E664cbf974542c92eEAbAf4`).
- Worker online hours (README still has `<hours>`).
- Confirm or omit the €20 "the worker was paid for real, separately" line — not confirmed on the T-48 issue, so it is omitted here.
- A root `LICENSE` file if the form asks for one; the README already states MIT.
- Custom domain, if one is pointed at the dashboard before the form slot; then re-count the short description.
- Bazantic username / gateway / recipes — absent at freeze; both tracks left unselected.
