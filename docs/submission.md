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

**Selfie Check is the credential, at login and again at claim.** IDKit 4.x `selfieCheckLegacy` both times (QR on desktop, deep link on a PWA, World App bridge in the mini-app), against production World App; `orbLegacy` is the fallback for a World ID with no face credential. The second check, at claim, is spent-once and is the live-person / abuse-prevention signal: a human is behind *this* phone for *this* errand, not merely at sign-up.

What that costs us is the uniqueness sentence, and we say so rather than keep it. World calls Selfie Check medium-assurance and states it does not guarantee "strict one-person-one-account uniqueness like Orb verification", so the banner reads **"a live person, camera-checked"** — not "one account per person". One nullifier still binds to one worker in the registry; what we no longer claim is that one human cannot hold two. See `FEEDBACK-WORLD.md` E5–E13 and `docs/spikes/RESULTS.md` `## S2`.

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

[`SKILL.md`](../SKILL.md) · [`POSTERS.md`](../POSTERS.md) · [`FEEDBACK-WORLD.md`](../FEEDBACK-WORLD.md) (twelve dated entries, including the undocumented `verification_disabled`, the credential named only inside `IDKitDebugReport`, and the 2026-09-13 resolution) · [`FEEDBACK-BAZANTIC.md`](../FEEDBACK-BAZANTIC.md) (Overpass form-urlencoded vs Bazantic JSON MCP/Playground; entries B1–B3; username `RubenSousaDinis`).

Pre-kickoff artifacts: this planning pack, a pitch deck and a static UI mockup, all dated and public. No code or stylesheet from them is in this repo.

## Live / deployed / seeded

| Live, not ours | Ours, deployed on Base Sepolia | Seeded and disclosed |
| --- | --- | --- |
| World ID (Developer Portal, sandbox) · ERC-8004 registries `0x8004A818BFB912233c491871b3d84c89A494BD9e` / `0x8004B663056A597Dffe9eCcC1965A193B7388713` · x402 reference facilitator · USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | WorkerRegistry `0xc33d229046507f4C2E664cbf974542c92eEAbAf4` · TaskEscrow `0x641B56dfA3A033D84a75588c18579347A0DE3c6B` · Reputation `0x2f731B56D02080190fa2ef7813887B2743551E43` · AbuseMark `0x29145D47EFc76bEaBc3A4011cFf7fC0fBEa02608` · subgraph https://api.studio.thegraph.com/query/74763/legwork-base-sepolia/6653cb4 · mini-app https://legwork-miniapp.vercel.app · Task API + MCP https://legwork-api.vercel.app | 20 worker rows via `seedWorker()` (cannot produce a verified registration) · 5 seeded task lifecycles · one real registration (the demo phone) · marks operator-attested · relayed claims, gas paid by Legwork · operator powers: seed, reset, resolve |

## Tech tags

World ID · IDKit · MiniKit · ERC-8004 · x402 · USDC · Base Sepolia · The Graph · Foundry · Next.js · MCP · Claude

## How it's made

The Day-1 spikes locked the architecture. S1 (PASS): the World ID Router on Base Sepolia answers, onchain verification is Orb-only, and `WorkerRegistry` ships one cloud-verified `ATTESTED` mode. S2 (PASS, after a DOWNGRADED first pass): IDKit 4.x verifies Orb end to end; Selfie Check returned `verification_disabled` until the Beta flag was granted on 2026-09-08, and was confirmed working on 2026-09-13. The product presents **Selfie Check twice** — at login and again at claim — with `orbLegacy` as the fallback for a World ID that has no face credential. Selfie Check is medium-assurance, so the product claims “a live person, camera-checked” rather than Orb’s one-account-per-person. S3 (PASS): exact-EVM x402 against the reference facilitator, settle after post, nonce-keyed idempotency; the buyer paid no gas; `PAYMENT_MODE` stays x402. S5 (PASS): production ERC-8004 IdentityRegistry `0x8004A818…` and ReputationRegistry `0x8004B663…` on Base Sepolia, interfaces confirmed, no self-deploy. Locked: credential selfie-at-login + selfie-at-claim (orb as fallback) / GPS available / payment x402 / ERC-8004 live registries.

The worker signs in with World ID (Orb uniqueness) and their World App wallet; claiming a task requires a fresh Selfie Check (live-person / abuse-prevention). We relay the claim and pay the gas; the contract records their address. Registration is cloud-verified, operator-attested — onchain World ID verification is Orb-only today.

Screening: the deterministic gate is authoritative; the LLM can add a refusal, never overturn one; free text never reaches the classifier; the corpus in `packages/screening/fixtures` runs in CI; `claude-opus-5` with a 3 s timeout falling back to the keyword class (`CLASSIFIER_TIMEOUT_MS = 3000`).

This project was built with AI assistance and documents it. Every commit carries an `AI-Usage:` trailer; CI fails a commit without one. The prompts are committed at `examples/prompt.md` and in `packages/screening/src/classifier/`. `docs/AI-USAGE.md` is compiled Day 10 (T-49). The Reputation contract is re-implemented from the same threat model, written from a blank file after kickoff.

## Prize qualification

Tick only tracks whose bullets are literally met.

| Partner · track | Qualification bullet (verbatim) | Evidence (file / address / commit / timestamp) | Met? |
| --- | --- | --- | --- |
| World — Selfie Check | Uses Selfie Check or a Selfie Check-compatible World ID credential flow in a meaningful way. Treats Selfie Check as a risk, eligibility, fairness, continuity, or abuse-prevention signal. Test via the Sandbox App. Include a detailed feedback document. Show a working app. | **Selfie Check, twice.** Login presents `selfieCheckLegacy` and again at claim, both against production World App (IDKit `environment: production`). Confirmed live 2026-09-13: camera completed, `POST /idkit/verify` 200, `WorkerRegistered` tx `0x203f2851b267a13e61cf1195e54087cc77f60bd6ab5325ac3313074693d7f425` bound worker `0x869b94343b8506d441603fb8edebbb35065c0d67` in area `ez19y`. The API's `WORLD_CREDENTIAL_LEVEL` is `orb`, so the `selfie` on the session came from World, not a fallback. Claim-time is a second spent-once check (`lw_selfie`; `POST /tasks/:id/claim` requires it, `ClaimSelfie`); `orbLegacy` is the fallback for a World ID with no face credential. Feedback: `FEEDBACK-WORLD.md` E5–E13. Working app: https://legwork-miniapp.vercel.app. | yes |
| The Graph — Best AI Tooling or AI Use Case (From Scratch) | Use The Graph as a load-bearing part. Consume live data from a Graph provider. net-new work started during the hackathon. open source with README or SKILL.md. | `preflight_workers` in `packages/mcp` (`src/tools/preflight.ts`); hosted mount `apps/api/app/mcp/route.ts` passes `createSubgraphClient` from `packages/subgraph-client`. `examples/transcript.md` shows the agent quoting `n_real` / `median_source`; `examples/prompt.md` requires it; Day-9 live capture `n_real: 1`, `median_source: "real"` (`RESULTS.md` `## Preflight`). Studio query URL https://api.studio.thegraph.com/query/74763/legwork-base-sepolia/6653cb4; Discord "does testnet Studio count as a Graph provider": unanswered as of 2026-09-09 (`RESULTS.md` `## Graph`). First commit `be479b42a7e4111cd0386b6ec832ea43f5876c5c` at 2026-09-04T17:18:30Z. `SKILL.md`; README states MIT (no root `LICENSE` file in the tree). | yes |
| The Graph — Best Use of Composable or Standardized Graph Products | not selected — Discord unanswered (Studio-as-provider and Subgraph MCP both unanswered as of 2026-09-09); The Graph's Subgraph MCP tool was not shipped | RESULTS `## Graph`; this repo's MCP is Legwork's, not The Graph's Subgraph MCP product | no — do not select |
| Bazantic — Agentify a New API | Create an account; create an x402/MPP gateway; agentify a service not already on Bazantic and not another sponsor API; working gateway; recipe using both services; screen recording; bazantic username. | Username **RubenSousaDinis**. Overpass gateway `https://vz23lkwccfa6hfawpnzw5ohzyy.bazgateway.com` (upstream public Overpass; OpenStreetMap is not a hackathon sponsor). Legwork gateway `https://nf26bnkznrbc3cg5rbq2hmej5q.bazgateway.com`. Recipe `place-anywhere-then-quote` (repo + Bazantic UI). Feedback: [`FEEDBACK-BAZANTIC.md`](../FEEDBACK-BAZANTIC.md) — Recipe Test / Playground POST JSON to Overpass → 400; curl form `data=` through the same gateway → 200. Recording: [Integrating Bazantic, Overpass, and Legwork](https://www.loom.com/share/1942b481782740e28feeb72f9b4346aa) — 1:36, 2026-09-13: both gateways and both published recipe cards, then the Overpass flow run end to end (one form-encoded resolve through `vz23lkwccfa6hfawpnzw5ohzyy.bazgateway.com` → Legwork `postCheck` → unpaid `postTasks`, stopping at the 402). Re-verified 2026-09-13: gateway POST 200 `node/536546148`; `/check` `accepted: true`, `price_usdc: 3.45`; unpaid `/tasks` 402, nothing posted. Full record: `docs/bazantic.md`. | yes |
| Bazantic — Best Recipe Using Sponsor APIs | Recipe chaining the Task API with a sponsor API (The Graph). | Recipe `worker-pool-then-quote` — Graph Studio query URL + Legwork `postCheck` / unpaid `postTasks` 402. Same username. Text in `examples/recipes/worker-pool-then-quote.md`, published in Bazantic's UI. The 2026-09-13 clip shows this recipe's card in the recipe list but runs the Overpass flow, so no recorded run of this recipe exists. | not yet — recipe published, no recorded run |

## Form fields

Select 3 partners and every track each one qualifies for.

- **Title** — Legwork — real-world verification for AI agents
- **Short description** — paste the ≤300 form variant (300 characters). If the form allows more, paste the Full variant.
- **Long description** — paste `## Long description` from the tagline through the Start Fresh sentence.
- **Video URL and beat timestamps (1, 6, 7)** — TODO(operator)
- **Live URL** — https://legwork-dashboard.vercel.app
- **Repo** — https://github.com/RubenSousaDinis/legwork
- **Addresses** — WorkerRegistry `0xc33d229046507f4C2E664cbf974542c92eEAbAf4` · TaskEscrow `0x641B56dfA3A033D84a75588c18579347A0DE3c6B` · Reputation `0x2f731B56D02080190fa2ef7813887B2743551E43` · AbuseMark `0x29145D47EFc76bEaBc3A4011cFf7fC0fBEa02608` · subgraph https://api.studio.thegraph.com/query/74763/legwork-base-sepolia/6653cb4
- **Partners and tracks to select** — World (Selfie Check); The Graph (Best AI Tooling or AI Use Case (From Scratch)); Bazantic (Agentify a New API — met, gateway + recipe + recording + username; Best Recipe Using Sponsor APIs only if a clip of `worker-pool-then-quote` actually running is recorded). Do not select The Graph Composable.
- **Install line** — `claude mcp add --transport http legwork https://legwork-api.vercel.app/mcp`

## TODO(operator)

- Video URL and the timestamps for beats 1, 6 and 7 (form field, not World-track evidence).
- Worker online hours (README still has `<hours>`).
- Confirm or omit the €20 "the worker was paid for real, separately" line — not confirmed on the T-48 issue, so it is omitted here.
- A root `LICENSE` file if the form asks for one; the README already states MIT.
- A clip of `worker-pool-then-quote` running, if the Bazantic Best Recipe track is submitted — the 2026-09-13 clip lists the recipe but runs the Overpass one.
- The exact gateway cap the bazantic.com plan allows; two are live, the number itself was never answered.
- Custom domain, if one is pointed at the dashboard before the form slot; then re-count the short description.
- Bazantic screen-recording URL(s) for `place-anywhere-then-quote` (required for Agentify) and optionally `worker-pool-then-quote`. Username **RubenSousaDinis**; gateways and recipes recorded in `docs/bazantic.md` and [`FEEDBACK-BAZANTIC.md`](../FEEDBACK-BAZANTIC.md).
