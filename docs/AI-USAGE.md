# AI usage — Legwork — real-world verification for AI agents

Every commit in this repository carries an `AI-Usage:` trailer naming the tool, the model and who
reviewed what. This file is the compiled record: it is generated from the trailers and the merged
pull-request bodies, not written from memory.

## How it was enforced

- **`commit-trailers` CI job** (`.github/workflows/ci.yml`, `scripts/ci/commit-trailers.sh`) — every
  non-merge commit in a pull request must carry a line beginning `AI-Usage:`. A pull request with a
  commit that does not is red and does not merge.
- **`AGENTS.md`** states the shape every commit must use:
  `AI-Usage: <tool + model> drafted <what>; human <reviewed|edited> <what>`.
- **The pull-request template** carries an AI-usage section, which is where the per-PR lines below
  come from.

## Tools and models

Copied from the trailers rather than recalled. Across 373 commits carrying a trailer on `main`:

| Tool and model, as the trailers name it | Where it was used | Commits |
| --- | --- | --- |
| Claude Code (Opus 5) | task agents, one per git worktree, plus cloud sessions with no key or `.env` | 215 |
| Claude Opus 5 | the lead session — briefs, reviews and lead fixes | 55 |
| `scripts/claim.sh` | the claim commit each task opens with; no model wrote it | 55 |
| Cursor Grok 4.6 | task agents run from the editor | 30 |
| Claude Code (Fable 5.1) | task agents and lead fixes | 18 |

The counts sum to 373, which is every trailer on `main` — nothing is rolled into an "other".
One task ran per session, each in its own git worktree; sessions that only needed fixtures ran in
the cloud with no access to a key or a `.env`. The lead session wrote the briefs and reviewed every
pull request, and its own commits carry their own trailers rather than being exempt.

The Reputation contract is re-implemented from the same threat model, written from a blank file
after kickoff.

Pre-kickoff artifacts: this planning pack, a pitch deck and a static UI mockup, all dated and
public. No code or stylesheet from them is in this repo.

## Committed prompts

The prompts are in the repository, not paraphrased in a write-up:

- [`examples/prompt.md`](../examples/prompt.md) — the buyer agent's own prompt.
- [`packages/screening/src/classifier/prompt.md`](../packages/screening/src/classifier/prompt.md) —
  the screening classifier's system prompt. The deterministic gate is authoritative; this prompt can
  add a refusal and never overturn one.

## Per pull request

Taken from each merged pull request's AI-usage section. `—` means the body carried no such line;
the commits inside it still do, and they are in the next table.

| PR | Title | AI-Usage (from the PR body) |
| --- | --- | --- |
| [#55](https://github.com/RubenSousaDinis/legwork/pull/55) | T-01a: interface freeze — contracts side | — |
| [#59](https://github.com/RubenSousaDinis/legwork/pull/59) | T-11: WorkerRegistry — ATTESTED registration, seeding, reset, O(1) views | Claude Code (Opus 5) drafted the contract, the test suite and the round-2 sentinel guards from the T-11 brief and review; human reviewed the `registerFor` check order, the hand-built EIP-712 domain separator in the tests, and the NatSpec disclosure. |
| [#60](https://github.com/RubenSousaDinis/legwork/pull/60) | T-02: Docs skeletons — FEEDBACK-WORLD, POSTERS, spike RESULTS, threat-model rows, README stubs | — |
| [#61](https://github.com/RubenSousaDinis/legwork/pull/61) | T-07: packages/chain — clients, TxQueue, typed contracts, FakeChain | Claude Code (Opus 5) drafted every file in `packages/chain`; human dispatched the task, granted the dependency request, and reviewed the check order, the lock boundary and the money math against T-01 §2. |
| [#62](https://github.com/RubenSousaDinis/legwork/pull/62) | T-12 (1/2): TaskEscrow — the money path, in two PRs | Claude Code (Opus 5) drafted the contract and the twelve §8 tests from the T-12 brief; human reviewed the check orders, the money math, the pause surface and the boundary assertions |
| [#63](https://github.com/RubenSousaDinis/legwork/pull/63) | T-12 (2/2): TaskEscrow — settlement | Claude Code (Opus 5) drafted the five settlement functions, the two new post guards and the eight §8 settlement tests; human reviewed the fee branches, the hook arguments, the effects-before-interactions order and the boundaries |
| [#64](https://github.com/RubenSousaDinis/legwork/pull/64) | T-01b: interface freeze — TypeScript side | — |
| [#65](https://github.com/RubenSousaDinis/legwork/pull/65) | T-10: Dashboard shell on DESIGN-SPEC — tokens, cards, present mode, data-floor | Claude Code (Opus 5) drafted the components, tokens, demo adapter and tests; human reviewed the honesty rules, the money figures and the present-mode geometry. |
| [#66](https://github.com/RubenSousaDinis/legwork/pull/66) | T-09: Subgraph mappings + packages/subgraph-client | Claude Code (Opus 5) drafted the manifest, the four mappings, the matchstick tests, the client, its fixtures and its README; human reviewed every handler against the brief's §2, the frozen schema and the sixteen event signatures in `contracts/src/interfaces`. |
| [#67](https://github.com/RubenSousaDinis/legwork/pull/67) | T-05: Mini-app scaffold + `/probe` page for the S2' spike | Claude Code (claude-opus-5) drafted the shell, primitives, probe page, temporary |
| [#68](https://github.com/RubenSousaDinis/legwork/pull/68) | T-08: Task API skeleton — config, logging, DB, sessions, middleware, 501 stubs | Claude Code (Opus 5) drafted the config, logger, error envelope, route wrapper, DB client, session model, the two live routes, the 35 stubs and the tests; human reviewed the check order in `POST /session`, the redaction list, the generated migration against the frozen schema and every deviation above. |
| [#69](https://github.com/RubenSousaDinis/legwork/pull/69) | T-06: Screening gate, pipeline and the 56-row corpus (no model) | Claude Code (Opus 5) drafted the implementation from the T-06 brief; human reviewed the rule mapping, the corpus verdicts and the privacy of the log entry. |
| [#70](https://github.com/RubenSousaDinis/legwork/pull/70) | interface-change: catalog + lockfile for the Day-1 DEP REQUESTs (jsdom/RTL, chain/minikit, matchstick) | — |
| [#71](https://github.com/RubenSousaDinis/legwork/pull/71) | interface-change: declare immutable: false on the five mutable subgraph entities | — |
| [#72](https://github.com/RubenSousaDinis/legwork/pull/72) | interface-change: drop the .js extensions from packages/shared and packages/chain relative imports | — |
| [#73](https://github.com/RubenSousaDinis/legwork/pull/73) | interface-change: post-wave-1 sync — contract, screening exports, extensionless imports, briefs | — |
| [#74](https://github.com/RubenSousaDinis/legwork/pull/74) | T-17 (1/2): Worker routes — list, claim, submit, earnings | Claude Code (Opus 5) drafted the lifecycle service, the six worker routes and the test suite; human reviewed the brief-filtering boundary, the claim check order, the proof-ownership rule and the money fields. |
| [#75](https://github.com/RubenSousaDinis/legwork/pull/75) | T-18: POST /proofs — hash raw bytes, strip EXIF, private store, signed URLs, rounding | Claude Code (Opus 5) drafted the four services, the three routes and the test suite; human reviewed the hash-before-strip order, the two-object layout, the constant-time signature check and the rounding vector. |
| [#76](https://github.com/RubenSousaDinis/legwork/pull/76) | T-19: Buyer, public and admin routes — long-poll status, approve/dispute/refund, /public/*, /admin/* | Claude Code (Opus 5) drafted the two services, the fifteen route handlers and the three test files from the T-19 brief; human reviewed the constant-time comparisons, the poll bounds, the public allowlist and every §9 command's output. |
| [#77](https://github.com/RubenSousaDinis/legwork/pull/77) | T-20: World ID v4 — /idkit/request, /idkit/verify, /register (EIP-712 attestation), /config/world | Claude Code (Opus 5) drafted the services, the four routes, the fixture and the acceptance tests; human reviewed the byte-for-byte forwarding, the EIP-712 type list and domain, the check order and revert allowlist in `/register`, and the derived-key scheme. |
| [#78](https://github.com/RubenSousaDinis/legwork/pull/78) | T-21: Anthropic classifier with keyword fallback | Claude Code (Opus 5) drafted prompt.md, anthropic.ts, live.ts and the four test files; human reviewed the failure paths, the cap ordering and the mock's abort handling |
| [#79](https://github.com/RubenSousaDinis/legwork/pull/79) | T-22: OSM extract and the PlaceIndex over it | Claude Code (Opus 5) drafted `buildExtract`, `placeIndex`, `scripts/osm-extract.ts`, the four acceptance tests and the README; human reviewed the determinism rules, the delegation to `JsonPlaceIndex`, the bounding boxes and the licence line. |
| [#80](https://github.com/RubenSousaDinis/legwork/pull/80) | CI: path-ownership must match Next's [id] segments and {a,b} groups | — |
| [#81](https://github.com/RubenSousaDinis/legwork/pull/81) | Schema: nullifiers.worker is null between /idkit/verify and /register | — |
| [#82](https://github.com/RubenSousaDinis/legwork/pull/82) | Post-wave-2 sync: contract drift, FakeChain call log, 413/retry_after_s, wiring, briefs | — |
| [#83](https://github.com/RubenSousaDinis/legwork/pull/83) | T-17 (2/2): Worker routes — submit-time checks and sweeper | Claude Code (Opus 5) drafted the two checks, the submit-then-dispute flow, the sweeper, reconcile, `POST /admin/sweep` and the suites; human reviewed the call order, the contract's comparison operators, the downgrade branch order and the secret comparison. |
| [#84](https://github.com/RubenSousaDinis/legwork/pull/84) | Wire GET /tasks/:id to T-17's settleIfEligible; one eligibleAction; sweep result in the contract | — |
| [#85](https://github.com/RubenSousaDinis/legwork/pull/85) | T-24: Mini-app auth — verify → session → payout key → register | — |
| [#86](https://github.com/RubenSousaDinis/legwork/pull/86) | T-26: Dashboard live data — adapter, receipt, refusals, admin, poster stats | Claude Code (Opus 5) drafted the live adapter, the three routes, the poller, the subgraph agent read and the named tests; human reviewed the money arithmetic, the leak surface, the buyer-token path, the admin key handling and the round-2 fixes. |
| [#87](https://github.com/RubenSousaDinis/legwork/pull/87) | T-27: MCP server core — hosted mount, read tools, preflight | Claude Code (Opus 5) drafted `packages/mcp` (six tools, preflight, token store, tests), the `/mcp` mount and the preflight service; human reviewed the untrusted-answer wrapping, the absence of a payment header, the median-source labelling and the token file permissions. |
| [#88](https://github.com/RubenSousaDinis/legwork/pull/88) | T-35: OpenAPI document from api-contract + Bazantic import | Claude Code (Opus 5) drafted the generator, the route, the Day-9 checklist and the four acceptance tests; human reviewed the schema conversion, the security schemes, the money copy and the merged `POST /tasks` decision |
| [#89](https://github.com/RubenSousaDinis/legwork/pull/89) | T-38: API hardening — limits, CORS, admin gate, log redaction | — |
| [#90](https://github.com/RubenSousaDinis/legwork/pull/90) | T-40: Observations — record per completed task + verify-open delta | Claude Code (Opus 5) drafted the observations service, the public route and the four acceptance tests; human reviewed the confidence rule, the seeded exclusion and the public response shape |
| [#91](https://github.com/RubenSousaDinis/legwork/pull/91) | Dashboard depends on @legwork/subgraph-client (T-26) | — |
| [#92](https://github.com/RubenSousaDinis/legwork/pull/92) | Task API depends on @legwork/mcp, @legwork/subgraph-client and mcp-handler (T-27) | — |
| [#93](https://github.com/RubenSousaDinis/legwork/pull/93) | T-31: SKILL.md + docs/mcp.md final — examples, prices, polling, limits, two install modes | Claude Code (Opus 5) drafted `SKILL.md` and `docs/mcp.md` from the T-31 brief and the frozen contracts; human reviewed every verbatim sentence, JSON example and field name. |
| [#94](https://github.com/RubenSousaDinis/legwork/pull/94) | Lead sync after wave 3: proxy entry for the API guards, live dashboard wiring, contract widenings, brief amendments | — |
| [#95](https://github.com/RubenSousaDinis/legwork/pull/95) | T-25: Mini-app task list + claim — 3 s poll, countdown, release-claim | Claude Code (Opus 5) drafted the components, the poll loop, the tests and the README; human reviewed the copy against §2, the poll path against the route on `main`, the request counts and the money figures. |
| [#96](https://github.com/RubenSousaDinis/legwork/pull/96) | T-39: Legibility gate — Playwright measures present-mode floors and the 9:16 column | — |
| [#97](https://github.com/RubenSousaDinis/legwork/pull/97) | Briefs after the T-25 and T-39 reviews: T-43 inherits the gate's four findings, T-25 polls /tasks/list, tests globs in front matter | — |
| [#98](https://github.com/RubenSousaDinis/legwork/pull/98) | T-43: Present-mode polish — server clock, elapsed timer, one-shot meter, card cuts | Claude Code (Opus 5) drafted the components, CSS, tests and README; human reviewed every layout cut against the floors and the honesty rules and measured the result in Chromium. |
| [#99](https://github.com/RubenSousaDinis/legwork/pull/99) | T-33: Mini-app proof flow + earnings — capture, GPS downgrade, submit, paid state | Claude Code (Opus 5) drafted `lib/gps.ts`, `app/proof/**`, `app/earnings/page.tsx` and `tests/proof/**`; human reviewed the downgrade invariant and the two-name photo hash against `packages/shared` and the API, found the `call-confirm` picker bug, and traced the multipart hang to jsdom's `Blob`. |
| [#100](https://github.com/RubenSousaDinis/legwork/pull/100) | GET /tasks/:id/spec — the claimant reads the spec, minus the buyer's claims | — |
| [#101](https://github.com/RubenSousaDinis/legwork/pull/101) | Wave-4 sync: e2e-dashboard CI job, brief records, LEAD-NOTES "Wave 4 landed" | — |
| [#102](https://github.com/RubenSousaDinis/legwork/pull/102) | T-42: Mini-app optional — compare-two screen, Report task, unverified state | Claude Code (Opus 5) drafted the three screens, the banner, the four tests and the README; human reviewed the submit body, the release-before-report order, the DOM order of the receipt and every copy string against the brief. |
| [#103](https://github.com/RubenSousaDinis/legwork/pull/103) | Mount T-42: the locked list on /tasks without a session, and Report task in the proof header | — |
| [#104](https://github.com/RubenSousaDinis/legwork/pull/104) | Root devDependencies: @x402/core, @x402/evm, @x402/fetch, viem — the spike scripts run from the root | — |
| [#105](https://github.com/RubenSousaDinis/legwork/pull/105) | T-03: Spike S3 — x402 seller and buyer round-trip on Base Sepolia | Claude Code (Opus 5) drafted the four scripts, the README and the `## S3` section; human reviewed the handler order against the frozen T-01 order, confirmed both settle receipts on chain, and ran all three round-trips live. |
| [#106](https://github.com/RubenSousaDinis/legwork/pull/106) | S3 landed: lock payment: x402, fix T-03's §9 grep, LEAD-NOTES | — |
| [#107](https://github.com/RubenSousaDinis/legwork/pull/107) | T-15: packages/payments — PaymentGateway, X402Gateway, idempotency, FakeFacilitator | Claude Code (Opus 5) drafted the package — gateway seam, X402Gateway, idempotency stores, FakeFacilitator, test signer, tests and README — from the T-15 brief and the S3 spike findings; human reviewed the verify/settle ordering, the integer fee math and the `task_id = 0` sentinel against the frozen columns. |
| [#108](https://github.com/RubenSousaDinis/legwork/pull/108) | T-16: POST /tasks and POST /check — verify, screen, cap, post, settle | Claude Code (Opus 5) drafted `hire.ts`, `caps.ts`, both routes and `hire.test.ts` from the T-16 brief against the T-15 gateway, the T-06 pipeline and the T-08 stubs; human reviewed the frozen order, the release-on-every-exit rule and that nothing but a six-class refusal can mark. |
| [#109](https://github.com/RubenSousaDinis/legwork/pull/109) | apps/api declares @legwork/payments, @legwork/screening, @x402/core; payments drops .js suffixes; the 501-stub test goes | — |
| [#110](https://github.com/RubenSousaDinis/legwork/pull/110) | packages/mcp gets @legwork/payments as a devDependency; .env.example names the agent-side variables | — |
| [#111](https://github.com/RubenSousaDinis/legwork/pull/111) | T-28: MCP local mode — paying hire_human, stdio binary, README | Claude Code (Opus 5) drafted `hire.ts`, `bin/legwork-mcp.ts`, `hire.test.ts` and the |
| [#112](https://github.com/RubenSousaDinis/legwork/pull/112) | Post-T-16 sync: contract lists 409/503 on POST /tasks and X-Payer, @types/ngeohash, check route off the payments package | — |
| [#113](https://github.com/RubenSousaDinis/legwork/pull/113) | Post-T-28 sync: isError on the local hire, caller windows forwarded, Posted admits the replay, LEAD-NOTES | — |
| [#114](https://github.com/RubenSousaDinis/legwork/pull/114) | T-04: Spike S5 + S1 — ERC-8004 round-trip and World ID Router probe | Claude Code (Opus 5) drafted the spike scripts, the vendored ABI README and both RESULTS sections; human reviewed the interface comparison, the live transactions and the key handling. |
| [#115](https://github.com/RubenSousaDinis/legwork/pull/115) | S5 landed: lock ERC-8004: live registries, T-04 §15, LEAD-NOTES | — |
| [#116](https://github.com/RubenSousaDinis/legwork/pull/116) | T-13: Reputation + AbuseMark — worker feedback, agent-side writer | Claude Code (Opus 5) drafted both contracts and their ten tests from the T-13 brief; human reviewed the mark check order, the eight giveFeedback arguments, the outcome mapping and the score adjustment on a slot update. |
| [#117](https://github.com/RubenSousaDinis/legwork/pull/117) | T-30: AbuseMark wiring — identity, marks, screening log, posters | Claude Code (Opus 5) drafted the four services and their tests; human reviewed the marking order, the privacy guards and the T-16 compatibility overloads |
| [#118](https://github.com/RubenSousaDinis/legwork/pull/118) | Lead: hand hire.ts and POST /check over to T-30's services | — |
| [#119](https://github.com/RubenSousaDinis/legwork/pull/119) | T-14: Deploy + seed Base Sepolia — contracts, workers, lifecycles | — |
| [#120](https://github.com/RubenSousaDinis/legwork/pull/120) | Lead: regenerate the AbuseMark and Reputation ABIs from the T-13 implementations | — |
| [#121](https://github.com/RubenSousaDinis/legwork/pull/121) | Lead: gitleaks fingerprint allowlist for T-14's renamed local | — |
| [#122](https://github.com/RubenSousaDinis/legwork/pull/122) | Lead: post-T-14 sync — anvil self-funding, LEAD-NOTES, brief §15 | — |
| [#123](https://github.com/RubenSousaDinis/legwork/pull/123) | T-37: README skeleton + threat model — every Day-10 section, verbatim blocks, test names | — |
| [#124](https://github.com/RubenSousaDinis/legwork/pull/124) | T-32: Register the Task API's ERC-8004 identity + one live write | Claude Code (Opus 5) drafted `scripts/register-identity.ts` and the RESULTS `## Identity` section; human reviewed the step order, the money integers and every assertion against the brief, and checked every id, address and tx link in RESULTS against the run output and independent `cast` read-backs. |
| [#125](https://github.com/RubenSousaDinis/legwork/pull/125) | Lead: AbuseMark receives the ERC-721 the IdentityRegistry mints to it | — |
| [#126](https://github.com/RubenSousaDinis/legwork/pull/126) | Lead: redeploy with the AbuseMark receiver — record, RESULTS, README, notes | — |
| [#127](https://github.com/RubenSousaDinis/legwork/pull/127) | Lead: LEAD-NOTES — T-32 landed; brief §15 | — |
| [#128](https://github.com/RubenSousaDinis/legwork/pull/128) | T-23: Deploy the subgraph to Studio and wire the query URL | Claude Code (Opus 5) drafted the eight manifest values, `subgraph/README.md` and the `#Graph` RESULTS entry; human reviewed the four addresses against `contracts/deployments/base-sepolia.json`, the three live query responses, and the open Discord question. |
| [#129](https://github.com/RubenSousaDinis/legwork/pull/129) | Lead: LEAD-NOTES — hosting, subgraph and World action landed; T-23 §9 grep | — |
| [#130](https://github.com/RubenSousaDinis/legwork/pull/130) | T-29: CLI worker + demo:run + demo:reset — the green headless loop on Base Sepolia | Claude Code (Opus 5) drafted the three scripts, the fixture, the tests and the RESULTS.md section; human reviewed every API and contract shape against `apps/api`, `packages/chain` and the live Base Sepolia deployment, ran the loop end to end, and re-read the release receipt off the chain independently of the script. |
| [#131](https://github.com/RubenSousaDinis/legwork/pull/131) | T-46: Verify preflight_workers against the live subgraph | Claude Code (Opus 5) drafted the Playwright capture script and the `#Preflight` section from the captured command output; human reviewed the rendered card against the tool JSON and the diagnosis behind the short split. |
| [#132](https://github.com/RubenSousaDinis/legwork/pull/132) | Lead: nullable nonce column, seeded-worker session path, scripts workspace package (T-29 requests) | — |
| [#133](https://github.com/RubenSousaDinis/legwork/pull/133) | Lead: demo:run defaults to BUYER_AGENT_ID; LEAD-NOTES — T-29 landed, hosting fixes | — |
| [#134](https://github.com/RubenSousaDinis/legwork/pull/134) | T-36: e2e on anvil — deploy, seed, API fakes, worker, asserts | Claude Code (Opus 5) drafted `run.sh`, `assert.ts` and the README; human reviewed the two guards, the key derivation, the assertion set and both reported defects against the merged `apps/api` and `scripts/demo-run.ts`. |
| [#135](https://github.com/RubenSousaDinis/legwork/pull/135) | Lead: the API and demo scripts on anvil — CHAIN_ID 31337, fake facilitator, pglite, record by chain (T-36 requests) | — |
| [#136](https://github.com/RubenSousaDinis/legwork/pull/136) | Lead: seeded claims mark the row demo data; demo:run allows the record's USDC (T-36's two lines) | — |
| [#137](https://github.com/RubenSousaDinis/legwork/pull/137) | Lead: e2e workflow on main (T-36's harness); LEAD-NOTES — T-36 landed | — |
| [#138](https://github.com/RubenSousaDinis/legwork/pull/138) | Lead: T-34 on the Claude Agent SDK over the operator's Claude Code login (no API key) | — |
| [#139](https://github.com/RubenSousaDinis/legwork/pull/139) | T-34: examples/agent.ts — Claude loop over the local MCP, prompt + real transcript committed | Claude Code (Opus 5) drafted examples/agent.ts, loop-rules.ts, prompt.md, prompt.test.ts, README.md and the fixtures, and the round-2 prompt rewrite; human ran every scene against the live API, read the runs that came back wrong and located each cause, and assembled the transcript from the real output. |
| [#140](https://github.com/RubenSousaDinis/legwork/pull/140) | Lead: demo:run --no-worker — post, then wait for the phone to claim and submit | — |
| [#142](https://github.com/RubenSousaDinis/legwork/pull/142) | T-50 brief: mini-app design polish; lead notes on T-34 and the first phone run | — |
| [#143](https://github.com/RubenSousaDinis/legwork/pull/143) | Mini-app: show the IDKit debug report under a failed World ID check | — |
| [#144](https://github.com/RubenSousaDinis/legwork/pull/144) | T-50: Mini-app design polish — the paper screens as the design spec draws them | Claude Code (Opus 5) drafted the stylesheet, the markup moves and the tests; human reviewed every value against DESIGN-SPEC.md and every pinned string and data hook against the existing suite. |
| [#145](https://github.com/RubenSousaDinis/legwork/pull/145) | check_task: send the floor amount, report non-accepted bodies as tool errors; T-34 round-2 items | — |
| [#146](https://github.com/RubenSousaDinis/legwork/pull/146) | Sync after T-50: claim-error line class check; lead notes (T-50, T-34 round 2, check_task, Vercel cap) | — |
| [#147](https://github.com/RubenSousaDinis/legwork/pull/147) | check.test.ts: reword the comment the banned-words check rejects | — |
| [#148](https://github.com/RubenSousaDinis/legwork/pull/148) | T-44: scripts/inserts.ts — the two three-line terminal inserts from real responses | Claude Code (Opus 5) drafted the extractor, validator, wrapper, printer and tests; human ruled on `--width` in the brief's §15 and reviewed the rendered cards against `examples/transcript.md` |
| [#149](https://github.com/RubenSousaDinis/legwork/pull/149) | Demo place → Pão Doce (ez1dn); scripts/seed-area.sh; the demo agent carries BUYER_AGENT_ID | — |
| [#150](https://github.com/RubenSousaDinis/legwork/pull/150) | T-44: --width wraps rather than rejects; examples agent accepts pnpm's -- separator | — |
| [#151](https://github.com/RubenSousaDinis/legwork/pull/151) | examples: scene 1 re-run end to end (task 23, released) | — |
| [#152](https://github.com/RubenSousaDinis/legwork/pull/152) | T-41: pin pass-1 branch, point at the operator's material | — |
| [#153](https://github.com/RubenSousaDinis/legwork/pull/153) | T-41: FEEDBACK-WORLD pass 1 | Claude Code (Opus 5) drafted the seven entries and the README from the operator's notes, issue #40 and RESULTS `## S1`; human reviewed the wording, the timestamps and the redactions. |
| [#154](https://github.com/RubenSousaDinis/legwork/pull/154) | FEEDBACK-WORLD: full app and RP ids; lead notes for T-44, T-41, the hire scene and the deployment cap | — |
| [#155](https://github.com/RubenSousaDinis/legwork/pull/155) | Vercel: create deployments for main only | — |
| [#156](https://github.com/RubenSousaDinis/legwork/pull/156) | LEAD-NOTES: what the Vercel quota actually counts | — |
| [#157](https://github.com/RubenSousaDinis/legwork/pull/157) | The agent's errand is Pão Doce, and the hire card with it | — |
| [#158](https://github.com/RubenSousaDinis/legwork/pull/158) | verification_disabled is the face credential, refused as disabled | — |
| [#159](https://github.com/RubenSousaDinis/legwork/pull/159) | Move the demo to Orb; record why Selfie Check was never available | — |
| [#160](https://github.com/RubenSousaDinis/legwork/pull/160) | The worker session is created after registration, not before it | — |
| [#161](https://github.com/RubenSousaDinis/legwork/pull/161) | Fill the S2 spike; carry today's facts into every brief that assumed otherwise | — |
| [#162](https://github.com/RubenSousaDinis/legwork/pull/162) | The verification chip names the credential, not an environment | — |
| [#164](https://github.com/RubenSousaDinis/legwork/pull/164) | T-51 brief: the dashboard's front door, the deck, and the refusal card | — |
| [#165](https://github.com/RubenSousaDinis/legwork/pull/165) | T-51: Dashboard front door — landing, the two paths, and the refusal card | — |
| [#166](https://github.com/RubenSousaDinis/legwork/pull/166) | Drop the two substitute tasks: neither spike failed | — |
| [#167](https://github.com/RubenSousaDinis/legwork/pull/167) | T-51: Dashboard front door — landing, the two paths, and the refusal card | — |
| [#169](https://github.com/RubenSousaDinis/legwork/pull/169) | T-52 brief: the worker sign-in lockout, and a board that says where you are | — |
| [#170](https://github.com/RubenSousaDinis/legwork/pull/170) | The screening log stops printing a label with nothing after it | — |
| [#171](https://github.com/RubenSousaDinis/legwork/pull/171) | T-52: The worker can get back in, and the board says where they are (1/2 + 2/2) | — |
| [#173](https://github.com/RubenSousaDinis/legwork/pull/173) | T-53 brief: inside World App the worker's address is the wallet | — |
| [#174](https://github.com/RubenSousaDinis/legwork/pull/174) | Show the Legwork icon and hosted worker path on the dashboard landing | — |
| [#176](https://github.com/RubenSousaDinis/legwork/pull/176) | T-54 brief: Selfie Check as the demo credential, with the claims that credential supports | — |
| [#177](https://github.com/RubenSousaDinis/legwork/pull/177) | T-54: Selfie Check as the demo credential, with the claims that credential supports | — |
| [#178](https://github.com/RubenSousaDinis/legwork/pull/178) | Board: T-51 is merged | — |
| [#179](https://github.com/RubenSousaDinis/legwork/pull/179) | T-54: Selfie Check as the demo credential, with the claims that credential supports | — |
| [#180](https://github.com/RubenSousaDinis/legwork/pull/180) | T-53 amended: the list is the front page too | — |
| [#181](https://github.com/RubenSousaDinis/legwork/pull/181) | T-53 amended: the preview row names the errand once | — |
| [#182](https://github.com/RubenSousaDinis/legwork/pull/182) | The landing's trust model follows the credential | — |
| [#183](https://github.com/RubenSousaDinis/legwork/pull/183) | T-53: The worker gets in — the wallet is the address, and the list is the front page | Cursor Grok 4.6 drafted the wallet-address split, routing swap, preview-row titles and tests; human dispatched T-53 |
| [#186](https://github.com/RubenSousaDinis/legwork/pull/186) | T-55 and T-56 briefs: the mini-app's shell and its board | — |
| [#187](https://github.com/RubenSousaDinis/legwork/pull/187) | T-55: A navbar, a login modal, and a logout that actually logs you out | — |
| [#188](https://github.com/RubenSousaDinis/legwork/pull/188) | The session routes join the contract, and the probe asks a session route | — |
| [#189](https://github.com/RubenSousaDinis/legwork/pull/189) | T-56: The board shows every task, searchable, on a map, with directions | Cursor Grok 4.6 drafted the rounded field, country schema, unresolvable-place refusal, board search, map tiles, directions and tests; human dispatched T-56 |
| [#190](https://github.com/RubenSousaDinis/legwork/pull/190) | Make the worker miniapp usable on a phone | — |
| [#191](https://github.com/RubenSousaDinis/legwork/pull/191) | The map fits the phone, its pins land on it, and a task says what it is | `, so `commit-trailers` fails. Adding it needs a history rewrite, which is |
| [#192](https://github.com/RubenSousaDinis/legwork/pull/192) | A claim past its window keeps the button that hands it back | — |
| [#194](https://github.com/RubenSousaDinis/legwork/pull/194) | Brief T-57: a worker withdraws without gas, and Legwork keeps 2 % | — |
| [#195](https://github.com/RubenSousaDinis/legwork/pull/195) | T-57: A worker withdraws without gas, and Legwork keeps 2 % | Claude Code Opus 5 drafted the constants, `signWithdrawal`, the withdraw service and route, the `/earnings` form and every §8 test; Cursor Grok 4.6 ran §9, fixed the gitleaks hex-literal, and marked the PR ready; human dispatched T-57 |
| [#196](https://github.com/RubenSousaDinis/legwork/pull/196) | T-46 asked for a split no area produces; amend it to what the tool returns | — |
| [#197](https://github.com/RubenSousaDinis/legwork/pull/197) | T-47: PNG check — read the composited 1280×720 frame at arm's length, cut cards | — |
| [#198](https://github.com/RubenSousaDinis/legwork/pull/198) | The worker mini-app installs as a PWA, so a screenshot has no browser chrome | — |
| [#199](https://github.com/RubenSousaDinis/legwork/pull/199) | A UI pass off the T-47 frames: the paid beat, and the Supply card | — |
| [#200](https://github.com/RubenSousaDinis/legwork/pull/200) | Ignore T-57's superseded anvil dev key so `secrets` can pass | — |
| [#201](https://github.com/RubenSousaDinis/legwork/pull/201) | T-46 §9's first command cannot run; replace it with the call that can | — |
| [#202](https://github.com/RubenSousaDinis/legwork/pull/202) | T-45: Docs final — threat model links, spike RESULTS filled, keys, ODbL, api/mcp re-check | Cursor Grok 4.6 drafted threat-model links, RESULTS outcomes, keys.md, docs/README.md, api.md handler order and mcp.md drift; human unreviewed |
| [#203](https://github.com/RubenSousaDinis/legwork/pull/203) | T-48: docs/submission.md + README prize-qualification table (Day 9, docs only) | Cursor Grok 4.6 drafted docs/submission.md and the README prize-qualification table; human dispatched the task |
| [#204](https://github.com/RubenSousaDinis/legwork/pull/204) | T-47 §4's owned-paths line cannot parse; use a `#` qualifier | — |
| [#205](https://github.com/RubenSousaDinis/legwork/pull/205) | T-48: docs/submission.md + README prize-qualification table (Day 9, docs only) | Cursor Grok 4.6 drafted docs/submission.md and the README prize-qualification table; human dispatched the task |

## Per commit

Every commit on `main` that carries an `AI-Usage:` trailer, newest first.

| Commit | Subject | AI-Usage |
| --- | --- | --- |
| `2068d64` | T-48: fill WorkerRegistered tx and move video timestamp to the form | Cursor Grok 4.6 drafted the prize-table edit from the review tx; human supplied the WorkerRegistered hash in review |
| `4c44240` | T-48: write the submission pack and prize table | Cursor Grok 4.6 drafted docs/submission.md and the README prize-qualification table; human dispatched the task |
| `08ff9ec` | T-47 §4's owned-paths line cannot parse; use a `#` qualifier | written by the lead session (Claude) while reviewing #197; the parse was reproduced by running the script's own sed over the two spellings. |
| `5e77ba0` | T-48: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-09T20:22:45Z | claim script; human dispatched the task |
| `f6ecbe6` | Set S2 outcome to DOWNGRADED; drop S3 duplicates; pin honesty line lowercase | Cursor Grok 4.6 drafted the three review replies; human reviewed the S2 call |
| `7def94d` | Fill docs final: threat-model test links, RESULTS outcomes, keys, ODbL index | Cursor Grok 4.6 drafted threat-model links, RESULTS outcomes, keys.md, docs/README.md, api.md handler order and mcp.md drift; human unreviewed |
| `3d29ae6` | T-45: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-09T19:59:06Z | claim script; human dispatched the task |
| `696d97a` | T-46: re-shoot the preflight capture now that the median is a real one | re-run by the lead session (Claude) after reviewing #131; every number came from the deployed MCP mount, the Studio query URL and Base Sepolia, and the card was re-captured with Playwright against the live dashboard. |
| `4ae0b18` | T-46 §9's first command cannot run; replace it with the call that can | written by the lead session (Claude) from the agent's own §9 finding while reviewing #131; the replacement call is the shape the agent proved works against the deployed mount. |
| `2f6b134` | Record the live 1280×720 PNG check for the paid beat. | Cursor Grok 4.6 drafted the composite and ## Legibility table; human reviewed the phone frames and continued the read |
| `d1fa961` | Merge origin/main into t-57/gasless-withdrawal-with-a-fee | Cursor Grok 4.6 merged main to pick up #200; human reviewed T-57 |
| `b748d85` | T-57: a failed fee is forfeit, not something to chase | Cursor Grok 4.6 drafted the docstring correction; human reviewed T-57 and asked for option 2 |
| `008bcde` | Ignore T-57's superseded anvil dev key so `secrets` can pass | written by the lead session (Claude) while reviewing #195; the fingerprints came from `gitleaks detect` over the PR range and the fix was verified by re-running it. |
| `155d289` | T-47: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-09T13:45:08Z | claim script; human dispatched the task |
| `bdc4efd` | T-57: generate throwaway keys in the withdraw tests | Cursor Grok 4.6 drafted the gitleaks fix; human dispatched T-57 and the resume |
| `de4eced` | T-57: a worker withdraws without gas, and Legwork keeps 2 % | Claude Code Opus 5 drafted the constants, signWithdrawal, the withdraw service and route, the /earnings form and every §8 test; human dispatched T-57 and reviewed the recipient provenance, the 403 ordering and the fee-leg failure path |
| `52def63` | Ship the worker mini-app as a standalone PWA so phone screenshots have no browser chrome | Cursor Grok 4.6 drafted the web-app manifest, Apple meta, icons, and tests; human requested the PWA for screenshot chrome |
| `4c649ed` | T-46 asked for a split no area produces; amend it to what the tool returns | written by the lead session (Claude); every number in the amendment came from the deployed preflight endpoint and the live subgraph, not from the fixture. |
| `e79df3a` | T-57: claim by t-57-agent@MacBook-Pro-de-Ruben at 2026-09-09T13:30:44Z | claim script; human dispatched the task |
| `098a76f` | Brief T-57: a worker withdraws without gas, and Legwork keeps 2 % | written by the lead session (Claude) from the operator's decision; EIP-3009 support and the empty gas balance were both checked on Base Sepolia before the design was committed to. |
| `8ed8b14` | A claim past its window keeps the button that hands it back | written by the lead session (Claude) while an operator was pinned to task 31; the expiry rule was read off TaskEscrow.expire and activeClaimOf confirmed on Base Sepolia. |
| `bf9cc79` | A claim the phone forgot is recovered from the board, not lost until the TTL | written by the lead session (Claude) from a live operator report; the own-claim invariant was read off the list route before relying on it. |
| `6302d8f` | Drop the duplicate .lw-map-pin rule that #190 landed independently | written by the lead session (Claude) resolving its own merge with main. |
| `c378ab3` | "Someone claimed this task first" was said to the worker holding the claim | written by the lead session (Claude) from a live operator report; the two AlreadyClaimed branches were read off the API source and the fix was checked to fail without it. |
| `fe619b4` | Pin the miniapp chrome to a phone | Cursor Grok 4.6 drafted the phone shell, CSS and tests; human asked for the mobile pass |
| `4405664` | T-56: show every task on a searchable board with a map and directions | Cursor Grok 4.6 drafted board search, map tiles, directions and tests; human dispatched T-56 |
| `1c2f1d4` | T-56: publish a rounded task coordinate and refuse an unresolvable place | Cursor Grok 4.6 drafted the rounded field, country schema, unresolvable-place refusal and tests; human dispatched T-56 |
| `7ddbc7d` | T-56: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-09T10:29:24Z | claim script; human dispatched the task |
| `e342674` | A 204 reaches JSON Schema as an empty object, not as undefined | written by the lead session (Claude); the fix was verified against the one test that caught it rather than by re-running a suite this machine cannot run reliably. |
| `dfdf243` | The session routes join the contract, and the probe asks a session route | written by the lead session (Claude) answering its own review of #187; the contract entries and the probe switch were the ruling that review recorded. |
| `66c09cb` | T-55: cover the navbar, the modal, logout and the first-paint chip | Cursor Grok 4.6 drafted the §8 tests and the README freeze note; human dispatched T-55 |
| `eb903aa` | T-55: make logout clear the cookie and keep a session for 30 days | Cursor Grok 4.6 drafted POST /session/logout, the TTL change and the first-paint mirror; human dispatched T-55 |
| `6fcc99d` | T-55: add a navbar, a login modal, and Login with World ID | Cursor Grok 4.6 drafted the modal, AuthFlow extraction, SiteNav and the CTA rename; human dispatched T-55 |
| `5196020` | T-55: prove logout does not survive a reload | Cursor Grok 4.6 drafted the red logoutSurvivesAReload test; human dispatched T-55 |
| `eb5f3e6` | T-55: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-09T09:31:27Z | claim script; human dispatched the task |
| `46cb550` | T-55 and T-56: the mini-app's shell and its board | written by the lead session (Claude) from the operator's six requests; two exploration agents read the API's location surfaces and the mini-app's chrome before any of it was described as new work. |
| `0347caa` | T-53: drop a banned word and stop naming getPayoutAddress in the mock | Cursor Grok 4.6 drafted the banned-word and grep fixes; human dispatched T-53 |
| `cf08b98` | T-53: title the preview row with the errand, once | Cursor Grok 4.6 drafted the QUESTION export and the preview-row test; human dispatched T-53 |
| `399e2ae` | T-53: make the task list the front page | Cursor Grok 4.6 drafted the routing swap and the list-at-root tests; human dispatched T-53 |
| `dae3e07` | T-53: move the auth flow to /verify | Cursor Grok 4.6 drafted the relocate and import updates; human dispatched T-53 |
| `36a480f` | T-53: say which address is registered in which mode | Cursor Grok 4.6 drafted the mode-honest copy; human dispatched T-53 |
| `ea230e3` | T-53: register the World App wallet, not the generated payout key | Cursor Grok 4.6 drafted walletAddress, the mode split and the tests; human dispatched T-53 |
| `0886a6a` | T-53: make mockWalletAuth sign as a distinct wallet address | Cursor Grok 4.6 drafted the mock change that reproduces the bug; human dispatched T-53 |
| `a39cccd` | T-53: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-09T07:19:34Z | claim script; human dispatched the task |
| `a5fe2cf` | The landing's trust model follows the credential, like every other surface | written by the lead session (Claude) as the follow-up its own review of #179 called for; the gap was found by tracing which components still imported the orb-pinned constant, and the test was watched fail first. |
| `59d02cc` | T-53 also fixes the preview row, which prints the task type twice | written by the lead session (Claude) from the operator's screenshot of the card; the existing QUESTION map was found in the repo before any new copy was proposed. |
| `52c0d03` | T-53 also makes the list the front page, because it is the same story | written by the lead session (Claude) after the operator's phone test; the existing unverified list was read in the repo before any of it was described as new work. |
| `7dde2ed` | Select uniqueness claims from the credential level | Cursor Grok 4.6 drafted the surface substitutions, §8 tests, and README; human reviewed the brief |
| `9bf751e` | Add credential-selected copy functions beside credentialLabel | Cursor Grok 4.6 drafted the four copy functions and orb/selfie/grep tests; human reviewed the brief |
| `657db57` | The board records T-51 as merged | written by the lead session (Claude) after reviewing and merging #174; the live URLs were re-read from the deployed pages once the production build reported Ready. |
| `0a59a66` | T-54: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-08T21:59:36Z | claim script; human dispatched the task |
| `14d7e2e` | T-54: Selfie Check becomes the demo credential, and the claims follow it | written by the lead session (Claude) after the operator chose Selfie Check over Orb for the film; the six claiming surfaces were found by grep and read before the brief was written. |
| `ef2ec96` | Keep the route-line footprint and print the stable dashboard host | Cursor Grok 4.6 drafted the round-2 footprint box, dashboardUrl, and icon wording; human reviewed the PR |
| `e2a57a1` | Put the World logo and the hosted worker path on the landing | Cursor Grok 4.6 drafted the logo mark, hosted URL helpers, and worker-app links; human reviewed the World assets and local UI |
| `4f4c381` | T-53: the World App wallet is the worker, and today it is not the one we register | written by the lead session (Claude) after reviewing T-52 round 2; the bug was confirmed with a signed request against the deployed API before the brief was written, not inferred from the diff. |
| `d884c55` | T-52: hide browser sign-in after a 409, and drop the walletAuth fallback | Cursor Grok 4.6 drafted the round-2 cookie and mock fixes; human requested the review items |
| `bd40cb7` | T-52: let a returning worker sign in, and name where the board is looking | Cursor Grok 4.6 drafted sign-in, distance, claim-radius and tests; human dispatched T-52 |
| `988d116` | T-52: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-08T15:56:35Z | claim script; human dispatched the task |
| `2d8564c` | The screening log stops printing a label with nothing after it | written by the lead session (Claude) reviewing T-51 (#167); found by reading the deployed /live HTML rather than the diff, and the test was watched fail before the fix. |
| `efcffc6` | T-52 briefs the worker lockout and the board that never said where you were | written by the lead session (Claude) from the operator's phone run; the diagnosis was read off the deployed API, the WorkerRegistry on Base Sepolia and the mini-app source before any of it was written down. |
| `c3b3f0f` | T-51: land the front door, the honest refusal card, and /deck | Cursor Grok 4.6 drafted the refusal adapter, public pages, deck and tests; human dispatched the task |
| `f7c26de` | The two substitute tasks are dropped, because neither spike failed | written by the lead session (Claude) while looking for dispatchable work and finding both substitutes on the board; verified against RESULTS.md's S3 and S5 outcomes, the deployed /healthz, and the absence of any t-13b/t-16b branch or PR. |
| `215ade5` | T-51: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-08T14:45:41Z | claim script; human dispatched the task |
| `b793f88` | T-51 briefs the dashboard's front door and the refusal card that repeats itself | written by the lead session (Claude) from the operator's feedback; the root cause was traced with three exploration subagents and every file:line in the brief was read back before it was written; verified with the claim.sh front-matter parse, the dependency gate against issues #25 and #42, and banned-words. |
| `0b37a5c` | The verification chip names the credential, because there is no sandbox World ID | written by the lead session (Claude) after the Sept 8 Orb run; verified with the full workspace typecheck and lint, the shared, dashboard and mini-app tests (38/38, 38/38, 47/47), both Next builds, the dashboard legibility e2e (2/2) and banned-words. |
| `81dc865` | Fill the S2 spike and carry today's facts into every brief that assumed otherwise | Claude Code (Opus 5) wrote the spike record and the brief notes; human ran the phone that produced the evidence |
| `41b5d8a` | The worker session is created after registration, not before it | Claude Code (Opus 5) diagnosed the 403 from the API log and reordered the flow; human ran the phone that found it |
| `01c6d48` | Move the demo to Orb, and record why Selfie Check was never available | Claude Code (Opus 5) read the credential docs, set the environment and wrote the entries; human confirmed being Orb-verified |
| `1f0e290` | verification_disabled is the face credential being refused as disabled | Claude Code (Opus 5) read the report, searched the portal and wrote the entry; human ran the phone and supplied the payload |
| `fc35397` | The agent's errand is the shop the demo films: Pão Doce, and the hire card with it | Claude Code (Opus 5) rewrote the fixture, captured the card and updated the record; human chose the shop |
| `c60ba85` | LEAD-NOTES: correct what the Vercel quota counts, and stop the retry loop | Claude Code (Opus 5) measured the deployment counts and corrected the note; human spotted the discrepancy in the build chart |
| `3e9dca4` | Vercel: create deployments for main only | Claude Code (Opus 5) drafted the config against Vercel's git-configuration reference; human asked for production-only deploys |
| `ea60b0e` | FEEDBACK-WORLD: full app and RP ids; lead notes for T-44, T-41, the hire scene and the deployment cap | Claude Code (Opus 5) drafted the notes and applied the id ruling; human reviewed |
| `9c287d2` | T-41: make docs/feedback-world real, with the naming and redaction rules | Claude Code (Opus 5) drafted the README; human reviewed |
| `97c8120` | T-41 pass 1: the Day-1/2 entries — Portal, the S1 probe, verification_disabled | Claude Code (Opus 5) drafted the entries from the operator's notes; human reviewed the wording and the redactions |
| `7552fb6` | T-41: claim by opus-high-t-41@MacBook-Pro-de-Ruben at 2026-09-08T08:20:22Z | claim script; human dispatched the task |
| `d770bf5` | T-41: pin the branch for pass 1 and say where the operator's material is | Claude Code (Opus 5) drafted the dispatch note; human reviewed |
| `19839ed` | examples: scene 1, re-run end to end now that the seeded worker is free | Claude Code (Opus 5) ran the scene and spliced the record; human resolved the escrow that unblocked it |
| `37cdc5b` | T-44: --width wraps rather than rejects; the examples agent accepts pnpm's argument separator | Claude Code (Opus 5) drafted the ruling and the parser fix; human reviewed |
| `28db1e2` | The demo place is Pão Doce (ez1dn); seed-area.sh seeds a cell; the demo agent names its ERC-8004 id | Claude Code (Fable 5.1) drafted the script, the fixture move and the identity line; human chose the place and reviewed |
| `f970d6c` | T-44: claim by opus-high-t-44@MacBook-Pro-de-Ruben at 2026-09-08T08:06:12Z | claim script; human dispatched the task |
| `f1b281e` | check.test.ts: reword a comment the banned-words check rejects | Claude Code (Fable 5.1) drafted the reword; human reviewed |
| `000bcac` | Scene 2, re-run: the refusal now comes from the hire | Claude Code (Opus 5) assembled the transcript; human ran the scene against the live API and checked the mark |
| `e08a253` | Sync after T-50: the claim-error line loses its inline colour; lead notes for T-50, T-34 round 2, check_task and the Vercel cap | Claude Code (Fable 5.1) drafted the test change and the notes; human reviewed |
| `7899c43` | Send a doubtful request to hire_human, not to check_task | Claude Code (Opus 5) drafted the prompt rewrite; human reviewed it against the storyboard beat |
| `21d056d` | check_task sends the floor amount and reports a non-accepted body as a tool error; T-34 round-2 items | Claude Code (Fable 5.1) drafted the fix, the tests and the brief text; human reviewed |
| `caf0ff3` | The transcript: two real runs, and what did not happen in them | Claude Code (Opus 5) assembled the transcript from the two runs; human ran both scenes against the live API and captured the insert |
| `f7275a1` | Drop the stderr capture that never captured anything | Claude Code (Opus 5) drafted the removal; human probed the SDK to establish the limitation |
| `f80520f` | Correct the README on the worker and on where the insert comes from | Claude Code (Opus 5) drafted the corrections; human hit both problems in the live runs |
| `01fa1ab` | Cover wrapWorkerText too | Claude Code (Opus 5) drafted the test; human reviewed the wrapper assertions |
| `c69b9c0` | Word the stop-gate denial as what it is | Claude Code (Opus 5) drafted the reword; human read the report it produced |
| `47c3089` | T-50: the claim window at 15/600, and the approval caption only where it belongs | Claude Code (Opus 5) drafted the change; human reviewed it against §2.4 and §2.6. |
| `c7e36e2` | T-50: the design tests and the README's Design section | Claude Code (Opus 5) drafted the tests and the README table; human reviewed each assertion against §8 of the brief. |
| `8e0e656` | T-50: proof, paid state, the auth steps, earnings, compare and report | Claude Code (Opus 5) drafted the markup moves; human reviewed every pinned string and data hook the existing tests read. |
| `63a76dc` | T-50: the task list, the task card rows, and the earnings bar | Claude Code (Opus 5) drafted the row structure and the bar; human reviewed the hooks the existing tests hold and the price against the money rule. |
| `53cb45a` | T-50: header rows, the landing card, and a sentence for a failed World ID check | Claude Code (Opus 5) drafted the components and the code table; human reviewed the copy against the brief and the sentences against IDKit's documented codes. |
| `da85108` | T-50: the lw-* class inventory in globals.css | Claude Code (Opus 5) drafted the stylesheet from DESIGN-SPEC.md; human reviewed the values against the spec table and the floors. |
| `fdd1335` | T-50: claim by opus-high-t-50@MacBook-Pro-de-Ruben at 2026-09-07T23:08:46Z | claim script; human dispatched the task |
| `fc1f6b4` | Mini-app: show the IDKit debug report under a failed World ID check | Claude Code (Fable 5.1) drafted the change and the test; human reviewed |
| `74be48d` | T-50: mini-app design polish brief, board row, dispatch entry, issue #141; lead notes on T-34 and the first phone run | Claude Code (Fable 5.1) drafted the brief, the board and dispatch entries and the notes; human reviewed the scope and dispatched |
| `2c2c369` | Do not spell the Anthropic key name in this package | Claude Code (Opus 5) drafted the reword; human ran the verification grep |
| `45dbdfb` | Tell the agent what a seeded worker is | Claude Code (Opus 5) drafted the seeded-worker section; human read the disputed run |
| `da2dc5f` | Redact the signed proof URL, and give the agent no built-in tools | Claude Code (Opus 5) drafted the redaction and the tool lockdown; human read the run that leaked the signed URL |
| `19824f2` | Enforce the stop rule with a PreToolUse gate, and stop dropping results | Claude Code (Opus 5) drafted the hook and the transcript writer; human reviewed the enforcement point |
| `2ada2cd` | The example README, the tests, and a prompt that does not edit its principal out | Claude Code (Opus 5) drafted the README, prompt.test.ts and the prompt fix; human read the failed run and located the cause |
| `40f9f0c` | demo:run --no-worker: post, then wait for a worker on a phone | the lead session (Claude) wrote the mode for the operator's rehearsal; scripts typecheck and tests run. |
| `9ca14f9` | The Agent SDK loop, the committed prompt and the two inbox fixtures | Claude Code (Opus 5) drafted agent.ts, prompt.md and the fixtures; human reviewed the prompt and ran the dry run |
| `b6ab4f0` | The two loop rules, testable without the Agent SDK | Claude Code (Opus 5) drafted loop-rules.ts; human reviewed the stop rule |
| `0da3dd9` | Make examples an ESM package that runs vitest | Claude Code (Opus 5) drafted the package.json change; human reviewed it |
| `e999e6a` | T-34: claim by opus-high-t-34@MacBook-Pro-de-Ruben at 2026-09-07T20:05:33Z | claim script; human dispatched the task |
| `5de85db` | T-34 runs the demo agent on the operator's Claude Code login through the Claude Agent SDK | the lead session (Claude) amended the brief and the manifests after the operator chose the Claude Code path; examples typecheck run. |
| `f5979a8` | The e2e workflow on main, from T-36's README; LEAD-NOTES for the anvil loop | the lead session (Claude) copied the workflow from the README T-36 wrote and wrote the notes. |
| `73c0c62` | A seeded worker's claim marks the task row demo data; demo:run allows the record's USDC in its spend controls | the lead session (Claude) wrote the change and the test from T-36's two findings; api and scripts suites, typecheck and lint run. |
| `68886d3` | T-36: the anvil widenings, and two things the first real lifecycle found | Claude Code (Opus 5) drafted the env changes, the worker invocation and the coordinate walker; human reviewed them against the merged apps/api and the first full lifecycle on anvil |
| `893c08d` | The API and the demo scripts run on anvil: chain 31337, a fake facilitator, pglite, the record by chain | the lead session (Claude) wrote the change and the tests from T-36's four requests; api, payments, shared, mcp and scripts suites, typecheck and lint run. |
| `98a2b71` | T-36: the API, the worker and the demo agent, and the README | Claude Code (Opus 5) drafted the API/worker/demo steps, the README and the workflow shape; human reviewed the blocked steps against apps/api and scripts/demo-run.ts |
| `759c13c` | T-36: the harness — anvil, the two guards, deploy and seed, the snapshot | Claude Code (Opus 5) drafted run.sh, assert.ts and the .gitignore; human reviewed the guards, the key derivation and the assertion set |
| `3a8d48a` | T-36: claim by opus-high-t-36@MacBook-Pro-de-Ruben at 2026-09-07T17:03:25Z | claim script; human dispatched the task |
| `0a2b2c5` | demo:run defaults the agent id to BUYER_AGENT_ID; LEAD-NOTES for the green loop and the hosting fixes | the lead session (Claude) wrote the change and the notes after reviewing T-29; scripts typecheck and tests run. |
| `6380bf2` | T-29: the Day-3 green loop, with its four transactions | Claude Code (Opus 5) drafted the Timing section; human ran the loop and re-read the release receipt off the chain independently of the script. |
| `2cae2cc` | T-29: sweep as the buyer polls, so a landed submit stops reading as claimed | Claude Code (Opus 5) drafted the change; human reproduced the stuck row against Base Sepolia and confirmed a single sweep cleared it. |
| `00fb71d` | T-29: survive the read lag between our own claim and the API's view of it | Claude Code (Opus 5) drafted both changes; human reproduced the 409 against Base Sepolia and confirmed the chain said Claimed while the API's read did not. |
| `a7b4f90` | T-29: the three reported defects are fixed; POST /proofs is the one left | Claude Code (Opus 5) drafted the Timing section; human ran the loop, read the production log and the bucket configuration behind it. |
| `bd17bb5` | nonces.next_nonce is nullable; seeded workers get a session from the registry; scripts is a workspace package | the lead session (Claude) wrote the change and the tests from T-29's requests and ran the API suite, typecheck and lint. |
| `f1b6125` | T-29: treat `resolved` as an end state the release poll must not wait on | Claude Code (Opus 5) drafted the fix; human checked the state list in packages/shared/src/enums.ts. |
| `621e70b` | T-29: record the Day-3 loop as blocked, with the three defects behind it | Claude Code (Opus 5) drafted the Timing section; human read the production log line and the two source lines it names. |
| `07895c5` | T-29: resolve the fixture path against the script, not the working directory | Claude Code (Opus 5) drafted the fix; human ran `pnpm demo:run` against the hosted API and read the failure. |
| `a24ac2d` | T-29: demo:run, demo:reset, the fixtures and the three named tests | Claude Code (Opus 5) drafted the three scripts, the fixture and the tests; human reviewed the route shapes, the money assertions and the OSM node against the live deployment. |
| `8579020` | T-29: the seeded CLI worker over the relayed API routes | Claude Code (Opus 5) drafted cli-worker.ts and the scripts package manifest; human reviewed the API shapes against apps/api and the live deployment. |
| `a3252ad` | T-46: record the live preflight result in RESULTS #Preflight | Claude Code (Opus 5) drafted the section from the captured command output; human reviewed the diagnosis and the median label |
| `7639a85` | T-46: capture the preflight card as the dashboard rendered it | Claude Code (Opus 5) drafted the Playwright capture script; human reviewed the rendered card against the tool JSON |
| `b005c7b` | T-46: claim by opus-high-t-46@MacBook-Pro-de-Ruben at 2026-09-07T15:36:09Z | claim script; human dispatched the task |
| `330bd22` | T-29: claim by opus-high-t-29@MacBook-Pro-de-Ruben at 2026-09-07T15:35:53Z | claim script; human dispatched the task |
| `2b07e84` | LEAD-NOTES: hosting, the subgraph and the World action landed; T-23 brief §9 grep matches values | written by the lead session (Claude) after deploying to Vercel and reviewing T-23; docs only. |
| `7b57167` | T-23: document the Studio deployment and record the #Graph result | Claude Code (Opus 5) drafted the README and the #Graph entry from the live deploy output and query responses; human reviewed the numbers against the query URL and the open Discord question. |
| `6653cb4` | T-23: point the four data sources at the deployed contracts | Claude Code (Opus 5) drafted the eight manifest values from the T-14 deployment record; human reviewed the addresses and startBlock against contracts/deployments/base-sepolia.json. |
| `da6aaca` | T-23: claim by opus-high-t-23@MacBook-Pro-de-Ruben at 2026-09-07T14:55:03Z | claim script; human dispatched the task |
| `03ee2e6` | LEAD-NOTES: T-32 landed; the T-32 brief's §15 | written by the lead session (Claude) after reviewing T-32; docs only. |
| `6c29c17` | T-32: RESULTS Identity — selfAgentId 9195, task 6 released, paid-on-proof read back | Claude Code (Opus 5) drafted the section; human reviewed every id, address, tx link and money figure against the run output and the cast read-backs. |
| `ba10a80` | T-32: poll what a read node has not caught up with, and resume a part-run lifecycle | Claude Code (Opus 5) drafted the polling, the resume path and the revert decoding; human reviewed each against the live failures that prompted them. |
| `4c3d130` | Redeploy the four contracts with the AbuseMark receiver; record, RESULTS, README and notes follow | the lead session (Claude) ran the deploy wrapper, verified every §8 row on chain, and wrote the record and the notes. |
| `b982eb3` | forge fmt for the mock's receiver check | formatter run by the lead session (Claude); no logic change. |
| `459f90e` | AbuseMark receives the ERC-721 the IdentityRegistry mints to it | the lead session (Claude) wrote the contract change, the mock, the tests and the wrapper change after confirming the revert with eth_call; forge, shared, chain and subgraph checks run locally. |
| `6fc45ed` | T-32: RESULTS Identity records the step-A block and what unblocks it | Claude Code (Opus 5) drafted the section; human reviewed the diagnosis against the deployed bytecode and the S5 findings above it. |
| `a022f05` | T-32: register-identity.ts — five steps, simulate before every signature | Claude Code (Opus 5) drafted the script; human reviewed the step order, the money integers and every assertion against the T-32 brief. |
| `36647b1` | T-32: claim by opus-high-t-32@MacBook-Pro-de-Ruben at 2026-09-07T10:32:24Z | claim script; human dispatched the task |
| `33c67e4` | T-37: write every Day-4 README section, word-locked blocks pasted | Claude Code (Opus 5) drafted the section prose and the tables from the T-37 brief; human reviewed the verbatim blocks and the addresses. |
| `4c98735` | T-37: claim by opus-high-t-37@MacBook-Pro-de-Ruben at 2026-09-07T09:59:55Z | claim script; human dispatched the task |
| `811b8b7` | deploy.sh --anvil funds the roles itself; LEAD-NOTES and the T-14 brief record the landing | the lead session (Claude) wrote the change and the notes and re-ran the rehearsal twice on an unfunded anvil. |
| `4836e50` | T-14: RESULTS — the Deploy section, live | Claude Code (Opus 5) filled the chain cells from the broadcast log and the record; human reviewed the tx links against Basescan and the balance arithmetic |
| `cea55b2` | T-14: the Base Sepolia deployment record | Claude Code (Opus 5) ran scripts/deploy.sh and committed the record it wrote; human reviewed the addresses against Basescan and the four verification results |
| `abf81d7` | Ignore the gitleaks false positive in T-14's first deploy-script commit | the lead session (Claude) wrote the ignore entry from the CI finding's fingerprint. |
| `78a20eb` | T-14: name the two serialize handles for what they are | Claude Code (Opus 5) drafted the rename after reading the gitleaks finding; human reviewed that the flagged line holds no secret |
| `d797877` | Regenerate the AbuseMark and Reputation ABIs from the T-13 implementations | generated by `pnpm abi:gen`; the lead session (Claude) ran shared, chain and subgraph checks and committed the output. |
| `74c9be2` | T-14: print the treasury delta with its own sign | Claude Code (Opus 5) drafted the sign handling; human reviewed the printed line against the brief's pool copy |
| `964de27` | T-14: RESULTS — the Deploy section, rehearsal filled, chain rows pending | Claude Code (Opus 5) drafted the RESULTS Deploy section from the brief's §2 list and the anvil run output; human reviewed the honesty lines and which cells are honestly pending |
| `444acda` | T-14: one wrapper for both chains, with the checks attached | Claude Code (Opus 5) drafted deploy.sh from the brief's §2 wrapper spec and §8 check list; human reviewed the jq merge, the exit-code handling and that no env value is echoed |
| `4d3e2e9` | T-14: seed 20 workers and five completed lifecycles | Claude Code (Opus 5) drafted Seed.s.sol from the brief's §2 worker and lifecycle tables; human reviewed the derivations, the allowlist ordering and the idempotence skips |
| `ab0a241` | T-14: deploy the four contracts, wire them, write the record | Claude Code (Opus 5) drafted Deploy.s.sol from the brief's §2 steps; human reviewed the re-run guard, the wiring assertions and the record shape against addresses.ts |
| `d90636b` | T-14: read the role keys and the record path in one place | Claude Code (Opus 5) drafted Env.s.sol against the brief's §2 role list; human reviewed the key handling and the chain-id mapping |
| `0badaad` | T-14: claim by opus-high-t-14@MacBook-Pro-de-Ruben at 2026-09-07T08:50:55Z | claim script; human dispatched the task |
| `948b607` | Hand hire.ts and POST /check over to T-30's log writer and poster ledger | Claude Code (Fable 5.1) wrote the change and the tests; the lead session reviewed the diff and ran typecheck, lint and the API suite. |
| `f0cf184` | T-30: keep the §9 greps honest | Claude Code (Opus 5) drafted the rewording; human reviewed the verification greps |
| `8d5f05b` | T-30: the marking-rule corpus, and a class: null that reached the wrong road | Claude Code (Opus 5) drafted the corpus tests and the null-discriminator fix; human reviewed the marking rule |
| `3224b1c` | T-30: identity, screening-log and posters tests | Claude Code (Opus 5) drafted the three test files; human reviewed the sentinel and cache assertions |
| `ff1ca1c` | T-30: identity, screening log, posters and the mark writer | Claude Code (Opus 5) drafted the four services; human reviewed the marking order and the privacy guards |
| `8398077` | T-30: claim by opus-high-t-30@MacBook-Pro-de-Ruben at 2026-09-07T06:27:57Z | claim script; human dispatched the task |
| `065bfb2` | T-13: AbuseMark — the agent-side writer into ERC-8004 | Claude Code (Opus 5) drafted the contract and its seven tests from the T-13 brief; human reviewed the mark check order, the eight giveFeedback arguments and the outcome mapping. |
| `c25525f` | T-13: Reputation — worker-side feedback keyed by nullifier | Claude Code (Opus 5) drafted the contract and its three tests from the T-13 brief; human reviewed the check order, the score adjustment on a slot update and the dedup assertions. |
| `78111b1` | T-13: claim by opus-high-t-13@MacBook-Pro-de-Ruben at 2026-09-07T06:14:02Z | claim script; human dispatched the task |
| `9e55b6c` | S5 landed: lock ERC-8004: live registries, T-04 §15, LEAD-NOTES | written by the lead session (Claude) after reviewing T-04; docs only. |
| `3d86910` | RESULTS: S5 PASS on the live registries, S1 answers and rejects as expected | Claude Code (Opus 5) drafted both sections from the spike output; human reviewed the verdict lines, the findings and the addresses. |
| `c316d68` | Spike S1: probe the World ID Router, decode what it says no with | Claude Code (Opus 5) drafted the probe; human reviewed the selector table and the group routing reads. |
| `5f5debb` | Spike S5: register, give unsolicited feedback, read it back | Claude Code (Opus 5) drafted the script; human reviewed the receipt-derived agent id, the [B]-scoped summary read and the key handling. |
| `9723295` | Vendor the ERC-8004 ABIs the deployed Base Sepolia registries actually answer to | Claude Code (Opus 5) drafted the README and the ABI extraction; human reviewed the source, commit hash and address table. |
| `fd2c528` | T-04: claim by opus-high-t-04@MacBook-Pro-de-Ruben at 2026-09-07T05:54:48Z | claim script; human dispatched the task |
| `39c3514` | Post-T-28 sync: isError hoisted on the local hire, caller windows forwarded, Posted admits the replay, LEAD-NOTES "Wave 5 landed" | written by the lead session (Claude) after reviewing T-28; verified with the shared, mcp and api typechecks, lints and tests and pnpm docs:gen. |
| `d10c48e` | Keep the env grep clean: say "the environment", not the symbol | Claude Code (Opus 5) drafted the reword; human reviewed the grep. |
| `3d8b38d` | Post-T-16 sync: contract lists 409/503 on POST /tasks and the X-Payer hint, @types/ngeohash, the check route off the payments package, LEAD-NOTES | written by the lead session (Claude) after reviewing T-15 and T-16; verified with the shared, api, miniapp and mcp typechecks, lints and tests, and pnpm docs:gen. |
| `be38f2f` | T-28: claim by opus-high-t-28@MacBook-Pro-de-Ruben at 2026-09-07T00:01:06Z | claim script; human dispatched the task |
| `d740e3f` | packages/mcp gets @legwork/payments as a devDependency; .env.example names the three agent-side variables | written by the lead session (Claude) ahead of T-28's dispatch; verified with the mcp typecheck and tests (25/25) and an import of @legwork/payments from packages/mcp. |
| `82c11f8` | apps/api declares @legwork/payments, @legwork/screening and @x402/core; payments drops its .js import suffixes; the 501-stub test goes | written by the lead session (Claude) in answer to T-16's DEP REQUEST; verified with the payments typecheck, lint and tests (7/7), the api typecheck, lint, http tests and build. |
| `7ea7645` | Add POST /check and the five acceptance tests | Claude Code (Opus 5) drafted the check route and hire.test.ts from the T-16 brief's §8; human reviewed that each named test asserts the claim the brief names it for, and that no test reaches a model, a chain or a facilitator. |
| `332a27f` | Add hire(): verify, screen, cap, post, settle, in the frozen order | Claude Code (Opus 5) drafted hire.ts and the route mount from the T-16 brief's §2 steps 1-9 against the T-15 gateway, T-06 pipeline and T-08 stubs; human reviewed the early-exit release on every branch, that settle is reachable only after a successful post, and that buyerAgentId is 0n unless the payer verified. |
| `cb89a94` | Add the per-payer caps: five open tasks, twenty-five dollars a day | Claude Code (Opus 5) drafted caps.ts from the T-16 brief's §2 against the frozen caps_ledger and tasks columns; human reviewed the two-source split and that the limits come from @legwork/shared rather than a local constant. |
| `dbaae14` | T-16: claim by opus-high-t-16@MacBook-Pro-de-Ruben at 2026-09-06T21:57:42Z | claim script; human dispatched the task |
| `5cdcb9d` | Add the direct-funding stub, selectGateway, the exports and the README | Claude Code (Opus 5) drafted the stub, the selector, the exports and the README from the T-15 brief; human reviewed the money table and the honesty lines. |
| `b13d763` | Add X402Gateway: 402, verify-only, and a settle that never throws | Claude Code (Opus 5) drafted the gateway and its three-path test against FakeFacilitator; human reviewed that verify moves no money, that settle is a separate call, and that the EIP-712 domain comes from the library's default-asset table as S3 requires. |
| `071df68` | Copy the S3 wire paths, and add the offline facilitator and signer | Claude Code (Opus 5) drafted the paths, the fake and the signer from the spike's recorded imports and property paths; human reviewed the fake's four checks and confirmed the key is the published Anvil vector. |
| `f9396cb` | Add the PaymentGateway seam and the nonce-keyed idempotency stores | Claude Code (Opus 5) drafted the types, both stores and their test from the T-15 brief and the S3 findings; human reviewed the sentinel handling and the ON CONFLICT read-back against the frozen idempotency columns. |
| `85332b5` | T-15: claim by opus-high-t-15@MacBook-Pro-de-Ruben at 2026-09-06T21:37:37Z | claim script; human dispatched the task |
| `402d42d` | S3 landed: lock payment: x402, fix T-03's §9 grep, LEAD-NOTES | written by the lead session (Claude) after reviewing T-03; docs only. |
| `8828d46` | Record the three live round-trips and what the failed settle taught | Claude Code (Opus 5) drafted the findings from the run logs; human reviewed both receipts on chain and confirmed each run moved 3450000 once. |
| `b4b37a6` | Record S3: PASS, PAYMENT_MODE x402, with the paths T-15 and T-16 need | Claude Code (Opus 5) drafted the section and the README; human reviewed the recorded paths against the live run and confirmed the balance deltas. |
| `26e1c3a` | Add the x402 buyer, its replay half, and the USDC balance probe | Claude Code (Opus 5) drafted the wrapper, the capture and the balance probe; human reviewed that the replay re-sends the captured header and ran both against Base Sepolia. |
| `28b8305` | Add the x402 seller: verify -> screen -> post -> settle on POST /tasks | Claude Code (Opus 5) drafted the route and the library wiring; human reviewed the handler order against the frozen T-01 order and ran it live. |
| `e62e340` | Add priceUnits: 6-decimal integer fee math for the x402 seller | Claude Code (Opus 5) drafted the parser and fee math; human reviewed the vectors against the brief and ran them. |
| `54db927` | T-03: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-06T21:16:22Z | claim script; human dispatched the task |
| `43baeea` | Root devDependencies: @x402/core, @x402/evm, @x402/fetch, viem — the spike scripts run from the root | written by the lead session (Claude) while preparing the operator's T-03 run; verified by importing all four packages with pnpm tsx from the root and a clean --frozen-lockfile install. |
| `6c4b668` | Mount T-42: the locked list on /tasks for a visitor with no session, and Report task in the proof header | written by the lead session (Claude) after the T-42 review; verified with the mini-app typecheck, lint, tests (37/37) and build. |
| `be98a0a` | Say the deducted-figure rule without writing the figure | Claude Code (Opus 5) drafted the comment fix; human reviewed it against the banned-words list |
| `8a57c84` | Report task: release the claim, then record the class — and a README for all three | Claude Code (Opus 5) drafted the report screen, its test and the README; human reviewed the request order, the failed-release branch and the README's mount contract |
| `291a593` | compare-two: the pair, the choice, one line, and the receipt above the money | Claude Code (Opus 5) drafted the compare screen, its paid state and the two tests; human reviewed the submit body, the DOM order of the receipt and the reason cap |
| `7181165` | Unverified state: the locked list behind one Verify to claim banner | Claude Code (Opus 5) drafted UnverifiedBanner.tsx and its test; human reviewed the copy, the disabled-button markup and the price formatting |
| `8e806e8` | T-42: claim by opus-high-t-42@MacBook-Pro-de-Ruben at 2026-09-06T19:12:35Z | claim script; human dispatched the task |
| `ff3ca95` | Wave-4 sync: the e2e-dashboard CI job, T-43/T-42/T-33 brief records, LEAD-NOTES "Wave 4 landed" | written by the lead session (Claude) after the wave-4 reviews; docs plus one CI job that runs T-39's gate. |
| `23b6a8e` | GET /tasks/:id/spec: the claimant reads the spec, minus the buyer's claims | written by the lead session (Claude) after the T-33 review; verified with the api typecheck, lint and the lifecycle suite (24/24). |
| `25b8742` | T-33: the call-confirm picker returns an id, not a question | Claude Code (Opus 5) drafted the TEMPLATE_BY_QUESTION lookup and clockTime; human found the bug by exercising the call-confirm branch and re-checked each proof shape against packages/shared |
| `5f5e4a5` | T-33: the six acceptance tests, and app/proof/README.md | Claude Code (Opus 5) drafted tests/proof/** and app/proof/README.md; human reviewed the downgrade assertions and traced the FormData hang to jsdom's Blob |
| `0f2e6a1` | T-33: the proof flow, its route and the earnings page | Claude Code (Opus 5) drafted ProofFlow.tsx, upload.ts, app/proof/[id]/page.tsx and app/earnings/page.tsx; human reviewed the submit body against the proof schemas and the earned-only rule |
| `e21c0e2` | T-33: the three proof-screen pieces — answer, downgrade, paid state | Claude Code (Opus 5) drafted AnswerToggle.tsx, Downgrade.tsx and PaidState.tsx; human reviewed the enums against packages/shared and the no-release-without-proof guard |
| `0fc1ac7` | T-33: getPosition() with the 10 s options, and the canvas re-encode | Claude Code (Opus 5) drafted lib/gps.ts and app/proof/image.ts; human reviewed the error-code mapping and the 10 s options |
| `99de601` | T-33: claim by opus-high-t-33@MacBook-Pro-de-Ruben at 2026-09-06T18:32:16Z | claim script; human dispatched the task |
| `4148bc9` | Round 2: poll /tasks/list, and render the brief the row carries | Claude Code (Opus 5) drafted the path change, BriefDetail and the tests; human reviewed both against the route on main and the amended brief |
| `2c3349e` | T-43: claim by opus-high-t-43@MacBook-Pro-de-Ruben at 2026-09-06T18:22:50Z | claim script; human dispatched the task |
| `4585c9b` | Briefs: T-39's four frame findings become T-43's required fixes; T-25 polls /tasks/list and renders the brief; tests globs in the T-25/T-33 front matter | written by the lead session (Claude) from the T-25 and T-39 reviews; docs only. |
| `9270b63` | Document the gate: how to run it, what each assertion means, how to read floors.json | Claude Code (Opus 5) drafted the README to §2's list; human checked the artifact table against a real run. |
| `c37f6be` | Add presentModeLegible — measure the floors and the centre column | Claude Code (Opus 5) drafted the test and its helpers from §7's step list; human walked the failures back to the markup with a separate probe before reporting them. |
| `0ee030d` | Add cropBandMath — the 9:16 band, asserted before anything opens a browser | Claude Code (Opus 5) drafted the test from §8's table; human checked the four expected values by hand. |
| `96165d7` | Pin the clock in the tests that need a live claim | Claude Code (Opus 5) drafted the fix; human reviewed why the suite was time-of-day dependent |
| `aadfc0d` | Add the legibility gate's Playwright config | Claude Code (Opus 5) drafted the config, the re-export and the ignore rules from the T-39 brief; human reviewed the viewport, scale factor and webServer settings against §2 and confirmed both departures against the installed Playwright version. |
| `483fe4e` | Add the gate's measurement library | Claude Code (Opus 5) drafted floors.ts, crop.ts and downscale.ts to the shapes in §2; human checked the band edges against §8 and the downscale against the reviewer note in §14. |
| `0875d55` | Document the poll, the claim state and the error copy | Claude Code (Opus 5) drafted the README; human reviewed it against §2 and the merged api-contract |
| `29e2dae` | Add the mini-app task list, claim card and countdown | Claude Code (Opus 5) drafted the components, the poll loop and the tests; human reviewed the copy against the brief and the request counts |
| `ff1c450` | T-39: claim by opus-high-t-39@MacBook-Pro-de-Ruben at 2026-09-06T14:39:21Z | claim script; human dispatched the task |
| `db54f29` | T-25: claim by opus-high-t-25@MacBook-Pro-de-Ruben at 2026-09-06T14:39:19Z | claim script; human dispatched the task |
| `0582966` | Wave-3 sync: proxy entry for the API guards, live dashboard wiring, contract widenings, brief amendments | written by the lead session (Claude) after reviewing wave 3; verified with pnpm -r typecheck/lint/test, both dashboard builds and the API build. |
| `b2e8eeb` | Sum the receipt's money in integer units; document round 2 | Claude Code (Opus 5) drafted the integer sums and the README sections; human reviewed the money arithmetic. |
| `2dd136a` | Carry the credential level through the browser poll | Claude Code (Opus 5) drafted the level hand-off and both tests; human reviewed the chip behaviour across a tick. |
| `a2d4014` | Read the agent card from the subgraph, not from the public API | Claude Code (Opus 5) drafted the subgraph agent read and its fixtures; human reviewed the class-id mapping and the blank-agent path. |
| `e754248` | Read completed tasks only, and reconcile T-17's submit-time rows | Claude Code (Opus 5) drafted the completion filter, the joins and the reconciling sync; human reviewed the two round-2 items against T-17's writer |
| `e50ebdf` | Write SECURITY.md: the guards, and the limit that actually holds | Claude Code (Opus 5) drafted SECURITY.md from the T-38 brief, docs/keys.md and docs/threat-model.md; human reviewed the disclosure claims and the caps figures |
| `b0e782b` | Re-run CI against the round-2 owned-paths block | Claude Code (Opus 5) drafted this empty re-trigger commit; human reviewed why the earlier run read a stale body |
| `cc12992` | Test the five §8 cases against createMiddleware with an injected store and clock | Claude Code (Opus 5) drafted the five acceptance tests from T-38 §8; human reviewed the assertions and the streamed-body case |
| `f4f38a1` | Compose the guards into one edge middleware; read env once in readEnv | Claude Code (Opus 5) drafted the composition and the barrel from the T-38 brief; human reviewed the guard order and the admin CORS exemption |
| `7cdc3e5` | Add the four edge guards as pure functions of (req, env, store, now) | Claude Code (Opus 5) drafted the four guards from the T-38 brief; human reviewed the guard semantics and the key-comparison approach |
| `feecbc5` | T-31: claim by opus-high-t-31@MacBook-Pro-de-Ruben at 2026-09-06T13:44:14Z | claim script; human dispatched the task |
| `a3498a8` | Take the round-2 rulings: delete probeApi, banner in the header, task_types as names, ez1dp | Claude Code (Opus 5) drafted the five round-2 changes from the PR #85 review; human reviewed the register body and the geohash correction |
| `6fa120f` | Test the six acceptance rows against recorded fixtures over msw | Claude Code (Opus 5) drafted the six named tests and the msw handlers; human reviewed the leak assertions and the fake-timer stepping. |
| `8ceae79` | Keep the admin key out of the DOM; resolve the API path against the origin | Claude Code (Opus 5) drafted both fixes and the README sections; human reviewed the key handling. |
| `9d34329` | Test the document against the contract, not against a list typed here | Claude Code (Opus 5) drafted the four acceptance tests; human reviewed the contract iteration and the banned-word source |
| `ae31f01` | Serve the document, and write the operator's Day-9 import checklist | Claude Code (Opus 5) drafted the route and the checklist; human reviewed the cache headers and the dry-run steps |
| `5dc46c5` | Generate the OpenAPI 3.1 document from api-contract.ts | Claude Code (Opus 5) drafted the generator; human reviewed the schema conversion, the security schemes and the money copy |
| `de7db38` | Test the confidence rule, the delta and the public shape | Claude Code (Opus 5) drafted the fixtures and the four acceptance tests; human reviewed the confidence cases and the privacy sentinels |
| `8fce24b` | Materialise one observation per completed task, and the verify-open delta | Claude Code (Opus 5) drafted the service and the route; human reviewed the confidence rule, the delta and the public shape |
| `8c85228` | Mount the MCP server at /mcp and compute preflight server-side | Claude Code (Opus 5) drafted the route, the preflight service and their tests; human reviewed the maxDuration ceiling and the no-subgraph fallback. |
| `07ed244` | Register the six tools, in both modes, off the frozen contract | Claude Code (Opus 5) drafted the six tools, the server registration and the tests; human reviewed the untrusted-answer wrapping and the absence of a payment header. |
| `db5eda3` | Count the pool from the subgraph, split real from seeded | Claude Code (Opus 5) drafted the queries, computePreflight and the recorded fixture; human reviewed the median source labelling and the seven-day window. |
| `d257fba` | Give the MCP package its context, its HTTP client and its token store | Claude Code (Opus 5) drafted context/http/keychain and their tests; human reviewed the file permissions and the write-serialisation. |
| `89bec89` | T-27: claim by opus-high-t-27@MacBook-Pro-de-Ruben at 2026-09-06T10:17:17Z | claim script; human dispatched the task |
| `3bb1852` | Task API depends on @legwork/mcp, @legwork/subgraph-client and mcp-handler | Claude Code (Fable 5.1) added the dependencies and refreshed the lockfile; human reviews and merges |
| `b3ad7bb` | Test both session modes, the payout key, the register body and the mock fixtures | Claude Code (Opus 5) drafted the seven acceptance tests from the T-24 brief; human reviewed the two known failures and the flags |
| `b41d5a6` | Map /public/* and the subgraph into the shape T-10 froze | Claude Code (Opus 5) drafted the adapter, the fixtures and the demo receipt; human reviewed the money arithmetic and the leak surface. |
| `ffb7c54` | Walk the worker from the unverified landing to a registered account | Claude Code (Opus 5) drafted the auth screens and the README from the T-24 brief; human reviewed the copy against §10 and the key handling |
| `e9145fb` | Move the World ID calls into lib/worldid.ts; add the payout key, the area and the real session | Claude Code (Opus 5) drafted the modules and the mocks from the T-24 brief; human reviewed the session and key handling |
| `28c7d39` | Add the Basescan and rounded-coordinate string helpers | Claude Code (Opus 5) drafted the three helpers; human reviewed the rounding and the sign. |
| `1007ee7` | T-26: claim by opus-high-t-26@MacBook-Pro-de-Ruben at 2026-09-06T10:17:15Z | claim script; human dispatched the task |
| `45accc8` | Dashboard depends on @legwork/subgraph-client | Claude Code (Fable 5.1) added the dependency and refreshed the lockfile; human reviews and merges |
| `8a437e1` | T-40: claim by opus-high-t-40@MacBook-Pro-de-Ruben at 2026-09-06T10:17:24Z | claim script; human dispatched the task |
| `609465e` | T-38: claim by opus-high-t-38@MacBook-Pro-de-Ruben at 2026-09-06T10:17:21Z | claim script; human dispatched the task |
| `eae54ea` | T-35: claim by opus-high-t-35@MacBook-Pro-de-Ruben at 2026-09-06T10:17:19Z | claim script; human dispatched the task |
| `c049a2e` | T-24: claim by opus-high-t-24@MacBook-Pro-de-Ruben at 2026-09-06T10:17:15Z | claim script; human dispatched the task |
| `725096e` | Wire the status read to T-17's settleIfEligible; one eligibleAction; record the sweep's result | Claude Code (Fable 5.1) drafted the wiring and the doc updates from the #83 review; human reviews and merges |
| `4af2392` | Test the reviewer and the sweeper; drop the recording Proxy for FakeChain.calls | Claude Code (Opus 5) drafted the suites; human reviewed the fixtures, the metre arithmetic and the call-order assertions |
| `3f516e6` | Serve POST /admin/sweep to an operator and to a cron | Claude Code (Opus 5) drafted the route; human reviewed the two auth paths, the constant-time compare and the audit payload |
| `aa365b9` | Sweep the board lazily, and settle one task on a status read | Claude Code (Opus 5) drafted the sweeper and the settle path; human reviewed the operators, the interval and the revert handling |
| `9aea884` | Reconcile the mirror against the chain, and say when it disagreed | Claude Code (Opus 5) drafted the module; human reviewed the column set and the log fields |
| `0294440` | Auto-dispute a submission that fails a check, onchain and disclosed | Claude Code (Opus 5) drafted the flow; human reviewed the call order, the log shape and the disputed-confidence value |
| `6bf5219` | Add the two submit-time checks: content-hash reuse and the geofence | Claude Code (Opus 5) drafted the checks; human reviewed the reuse scope, the fence operator and the skip branch |
| `3a91dba` | BLOCKING 2: reset-worker nulls the column instead of deleting the row | Claude Code (Opus 5) drafted the update and the assertion; human reviewed the unique-index behaviour under NULL. |
| `41f3b75` | BLOCKING 1: wire T-18's real proof helpers, delete proofDeps | Claude Code (Opus 5) drafted the swap and the test rewiring; human reviewed the signing-string mismatch and the raw/served split. |
| `5f8e3b4` | Answer 503 for anything that is not one of the registry's own reverts | Claude Code (Opus 5) drafted the revert allowlist and the transport-failure test; human reviewed the six names against IWorkerRegistry and the 503 body. |
| `1050a2d` | Add the five World ID acceptance tests on msw, FakeChain and pglite | Claude Code (Opus 5) drafted the five acceptance tests and the msw World double; human reviewed the derived keys and the recording chain wrapper. |
| `6dbe6c7` | Add /idkit/request, /idkit/verify, /register and /config/world | Claude Code (Opus 5) drafted the four World ID routes; human reviewed the check order, the revert mapping and the five-key config literal. |
| `6d0b44e` | Forward the IDKit payload to World unchanged and record the nullifier as decimal | Claude Code (Opus 5) drafted the World ID relying-party service; human reviewed the byte-for-byte forwarding and the nullifier conversion. |
| `6dbb2ea` | Sign the worker attestation and commit the digest vector both sides recompute | Claude Code (Opus 5) drafted the EIP-712 attestation service and its shared fixture; human reviewed the type list, the domain and the derived test key. |
| `7f0355b` | T-20: claim by opus-high-t-20@MacBook-Pro-de-Ruben at 2026-09-05T21:15:46Z | claim script; human dispatched the task |
| `003b59b` | Briefs and LEAD-NOTES: record what the wave-2 reviews settled | Claude Code (Fable 5.1) drafted the amendments from the review comments; human reviews and merges |
| `62aca95` | Wire the wave-2 packages: osm:extract, the screening barrel, the OSM README link | Claude Code (Fable 5.1) drafted the three edits; human reviews and merges |
| `5aa4f42` | API: an oversized proof is 413 payload_too_large; rate_limited carries retry_after_s | Claude Code (Fable 5.1) drafted the two changes and their test edits; human reviews and merges |
| `035ee63` | FakeChain records its writes and can arm one revert | Claude Code (Fable 5.1) drafted the recorder and its test; human reviews and merges |
| `46f8d8e` | Contract: record the wave-2 shapes and regenerate docs/api.md | Claude Code (Fable 5.1) drafted the contract edits from the six wave-2 reviews and ran docs:gen; human reviews and merges |
| `0fd1593` | Schema: nullifiers.worker is null between /idkit/verify and /register | Claude Code (Fable 5.1) drafted the schema line and ran drizzle-kit generate; human reviews and merges |
| `89645dc` | CI: accept owned-paths globs whose brackets are already escaped | Claude Code (Fable 5.1) drafted the change and re-ran the harness; human reviews and merges |
| `c1a60ab` | Put §10's honesty line on the hash_ok doc comment | Claude Code (Opus 5) moved one comment; human reviewed the verbatim text against §10. |
| `cccabf6` | Keep §9's two "must print nothing" greps honest | Claude Code (Opus 5) reworded two comments; human reviewed the §9 grep output. |
| `a707c2f` | Add the five acceptance tests | Claude Code (Opus 5) drafted the three test files; human reviewed the sentinel list and the chain recorder. |
| `d174a2f` | Add the admin surface and its audit ledger | Claude Code (Opus 5) drafted the shared guard and the six handlers; human reviewed the audit ordering and the reset-demo table list. |
| `32c7cfc` | Build the five public routes on an allowlist | Claude Code (Opus 5) drafted the shared view and the five handlers; human reviewed the allowlist and the rounding. |
| `5709bda` | Serve GET /tasks/:id and the three buyer verbs | Claude Code (Opus 5) drafted the four route handlers; human reviewed the poll bounds and the write-after-hash ordering. |
| `70dcae9` | Add the buyer token and the status bus | Claude Code (Opus 5) drafted both services from the T-19 brief; human reviewed the constant-time comparison and the loop bounds. |
| `135bbbe` | Test the worker path end to end on pglite and FakeChain | Claude Code (Opus 5) drafted the suite; human reviewed the fixtures, the cooldown setup and the assertions |
| `b9b2315` | Record a worker report, and report earned money only | Claude Code (Opus 5) drafted the routes; human reviewed the log shape and the earned-only sum |
| `355c999` | Submit a proof: per-type schema, proof ownership, observation | Claude Code (Opus 5) drafted the route; human reviewed the schema branches, the ownership check and the confidence rule |
| `b35fb26` | Claim and release a claim through the relayer | Claude Code (Opus 5) drafted the routes; human reviewed the check order, the 409 bodies and the revert mapping |
| `ae2f1eb` | Serve the worker board at GET /tasks/list | Claude Code (Opus 5) drafted the route; human reviewed the visibility rules, the seeded filter and the price field |
| `b8c77bf` | Add the worker lifecycle service and the lazy-sweep seam | Claude Code (Opus 5) drafted the service; human reviewed the brief filtering, the state mapping and the mirror columns |
| `f7bf2f9` | Add the extract script, the ODbL runbook and the Leiria+Lisbon fixture | Claude Code (Opus 5) drafted the extract script and the README; human reviewed the bounding boxes, the tag keep-list and the licence line. |
| `044ce63` | Run rows 40-48 and the live spike through the real classifier | Claude Code (Opus 5) drafted the corpus and live tests; human reviewed the mock's abort handling and the row-to-id mapping |
| `8d36eb3` | CI: match Next's [id] segments and {a,b} groups in owned-paths | Claude Code (Fable 5.1) drafted the fix and the harness; human dispatched, reviews and merges |
| `9fc4288` | Add the Anthropic classifier behind T-06's Classifier interface | Claude Code (Opus 5) drafted prompt.md, anthropic.ts, live.ts and the unit tests; human reviewed the failure paths and the delimiter sanitising |
| `b406fd7` | Build a deterministic OSM extract and the PlaceIndex over it | Claude Code (Opus 5) drafted buildExtract, placeIndex and the four acceptance tests; human reviewed the determinism rules and the delegation to JsonPlaceIndex. |
| `1f17374` | T-22: claim by opus-high-t-22@MacBook-Pro-de-Ruben at 2026-09-05T21:16:13Z | claim script; human dispatched the task |
| `a9aaff2` | T-21: claim by opus-high-t-21@MacBook-Pro-de-Ruben at 2026-09-05T21:15:56Z | claim script; human dispatched the task |
| `5e83402` | T-19: claim by opus-high-t-19@MacBook-Pro-de-Ruben at 2026-09-05T21:15:19Z | claim script; human dispatched the task |
| `7a5aedb` | T-18: claim by opus-high-t-18@MacBook-Pro-de-Ruben at 2026-09-05T21:14:46Z | claim script; human dispatched the task |
| `fcc081b` | T-17: claim by opus-high-t-17@MacBook-Pro-de-Ruben at 2026-09-05T21:14:26Z | claim script; human dispatched the task |
| `0a867f5` | Round 2: empty meter, call-confirm disclosure, badge floor | Claude Code (Opus 5) drafted the three fixes and their assertions; human reviewed the round-2 items against the brief. |
| `1a0b96b` | Add the six acceptance tests, the README and build fixes | Claude Code (Opus 5) drafted the tests and the README; human reviewed the acceptance names and the honesty assertions. |
| `5943d92` | Build the dashboard shell: tokens, components, present canvas | Claude Code (Opus 5) drafted the components, tokens and demo adapter; human reviewed the honesty rules and the present-mode geometry. |
| `60cb837` | T-08: keep the chain-import grep honest | Claude Code (Opus 5) reworded one comment; human reviewed the §9 grep output. |
| `4a68e59` | Assert the denylist slice boundaries, not just its length | Claude Code (Opus 5) drafted the round-2 fixes from the reviewer's BLOCKING items; human reviewed the boundary change and the regression test. |
| `06d503e` | Bound the ident.phone regex so a hash is never a phone number | Claude Code (Opus 5) drafted the round-2 fixes from the reviewer's BLOCKING items; human reviewed the boundary change and the regression test. |
| `6352c8c` | T-08: build on Turbopack, now that the .js extensions are gone | Claude Code (Opus 5) removed the webpack workaround and re-ran the build; human reviewed that Turbopack builds all 36 routes. |
| `7eefef6` | T-05: import PUBLIC_COORD_DECIMALS from @legwork/shared | Claude Code (claude-opus-5) drafted the import swap after the lead's interface-change PR merged; human reviewed that the rounding behaviour is unchanged |
| `5f71ea8` | T-05: document the mini-app and the probe run | Claude Code (claude-opus-5) drafted the README from the brief's §2 and §11; human reviewed the operator steps against the S2 test in 04-spike-gates |
| `ead1c82` | T-05: acceptance tests on msw fakes | Claude Code (claude-opus-5) drafted the msw handlers and the four tests from the brief's §8 table; human reviewed the assertions against the acceptance criteria |
| `c9d9bf8` | T-05: /probe page for the S2' spike | Claude Code (claude-opus-5) drafted the probe page, readouts and probeApi from the brief's §7 step list; human reviewed the IDKit and MiniKit call shapes against the installed v4 type definitions |
| `b84a993` | T-05: temporary /api/idkit/* handlers for the probe | Claude Code (claude-opus-5) drafted both handlers against packages/shared/src/api-contract.ts; human reviewed the response shapes and that no secret leaves the server |
| `2c070d4` | T-05: app shell on the paper ground | Claude Code (claude-opus-5) drafted the tokens, primitives and lib modules from the T-05 brief; human reviewed the token values against DESIGN-SPEC.md and the prop shapes against the brief's §6 |
| `17217f3` | T-05: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-04T23:38:23Z | claim script; human dispatched the task |
| `ccee0ae` | T-08: cover the wrappers, and write the package README | Claude Code (Opus 5) drafted test/http.test.ts and README.md; human reviewed the documented caveats against the code. |
| `6dc9330` | T-08: leave every later route as a 501 with its owner on line one | Claude Code (Opus 5) generated the 33 route stubs and the two T-30 service stubs from the brief's list; human reviewed the paths against §4. |
| `a8fb2d3` | T-08: issue a worker session, once per nonce | Claude Code (Opus 5) drafted session.ts, siwe.ts, chain.ts, the two session routes and their tests; human reviewed the check order and the nonce single-use path. |
| `5f8d7fe` | T-08: one Drizzle client, and a pglite twin that runs the same migration | Claude Code (Opus 5) drafted client.ts, migrate.ts, test/db.ts and the drizzle-kit preload; human reviewed the generated migration against the frozen schema. |
| `4510781` | T-08: wrap every route, and answer healthz | Claude Code (Opus 5) drafted route.ts, rateLimit.ts, adminKey.ts and the healthz body; human reviewed the error envelope and the CORS origins. |
| `9d16fb7` | T-08: parse the environment once, and log without leaking it | Claude Code (Opus 5) drafted config.ts, log.ts, errors.ts and their tests; human reviewed the redaction list and the parse-failure output. |
| `a71f466` | T-08: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-04T23:38:27Z | claim script; human dispatched the task |
| `eb8ddde` | T-10: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-04T23:38:21Z | claim script; human dispatched the task |
| `0b15056` | Drop the BuyerResult wrapper from getOrCreateBuyer | Claude Code (Opus 5) drafted the simplification; human reviewed it against the §13 interim rule. |
| `e44b74f` | Add packages/subgraph-client with recorded fixtures | Claude Code (Opus 5) drafted the client, helpers, fixtures, tests and README; human reviewed the reduction and the fixture arithmetic against the brief's §2 and §8. |
| `b523c22` | Add the two matchstick mapping tests | Claude Code (Opus 5) drafted the two tests and the mock-event factories; human reviewed the assertions against the brief's §8. |
| `7abc655` | Wire the four data sources and write the mappings | Claude Code (Opus 5) drafted the manifest and the four mapping files; human reviewed them against the brief's §2 and the frozen schema. |
| `2f20039` | Refresh subgraph ABIs and add the two interface-only ones | Claude Code (Opus 5) drafted the ABI copy; human reviewed the event signatures against contracts/src/interfaces. |
| `66b6122` | T-09: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-04T23:38:21Z | claim script; human dispatched the task |
| `1f9d095` | Document the pipeline, the rule-id families and the corpus | Claude Code (Opus 5) drafted the implementation from the T-06 brief; human reviewed the rule mapping, the corpus verdicts and the privacy of the log entry. |
| `bd7e2bd` | Add the corpus and gate tests | Claude Code (Opus 5) drafted the implementation from the T-06 brief; human reviewed the rule mapping, the corpus verdicts and the privacy of the log entry. |
| `4f1d009` | Add the 56-row screening corpus | Claude Code (Opus 5) drafted the implementation from the T-06 brief; human reviewed the rule mapping, the corpus verdicts and the privacy of the log entry. |
| `e0f44b0` | Add screen(): the pipeline, its precedence and its log entry | Claude Code (Opus 5) drafted the implementation from the T-06 brief; human reviewed the rule mapping, the corpus verdicts and the privacy of the log entry. |
| `de39e5c` | Add the Classifier interface, keyword fallback and fake | Claude Code (Opus 5) drafted the implementation from the T-06 brief; human reviewed the rule mapping, the corpus verdicts and the privacy of the log entry. |
| `629e302` | Add the deterministic rules: denylist, person, six-class keywords | Claude Code (Opus 5) drafted the implementation from the T-06 brief; human reviewed the rule mapping, the corpus verdicts and the privacy of the log entry. |
| `b97288a` | Add the field-level schema checks | Claude Code (Opus 5) drafted the implementation from the T-06 brief; human reviewed the rule mapping, the corpus verdicts and the privacy of the log entry. |
| `78c288e` | Add the place index over a cached OSM extract | Claude Code (Opus 5) drafted the implementation from the T-06 brief; human reviewed the rule mapping, the corpus verdicts and the privacy of the log entry. |
| `98e976f` | T-06: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-04T23:38:44Z | claim script; human dispatched the task |
| `8c5eafc` | T-12 (2/2): cover the settlement half | Claude Code (Opus 5) drafted the eight settlement tests; human reviewed the deltas, the boundaries and the hook assertions |
| `28d1cde` | T-12 (2/2): settle a submitted task | Claude Code (Opus 5) drafted the five functions from §2; human reviewed the fee branches, the hook arguments and the effects-before-interactions order |
| `ae62a31` | T-12 (2/2): reject a zero buyer and an unbounded window | Claude Code (Opus 5) drafted the two guards and their tests; human reviewed the bounds and the check order |
| `36d0181` | Close merged issues, and stop that depending on me remembering | Claude Opus 5 wrote both; human dispatched. |
| `e30966c` | T-07: run the chain test files one at a time | Claude Code (Opus 5) drafted the vitest config change; human reviewed the timing measurement |
| `8312b3a` | T-07: drop an unused option from the TxQueue test harness | Claude Code (Opus 5) drafted the cleanup; human reviewed |
| `b119f2e` | T-07: ChainAdapter, LiveChain and a FakeChain that reverts by name | Claude Code (Opus 5) drafted adapter.ts, live.ts, fake.ts, the lifecycle suite and the README; human reviewed the check order and the money math against T-01 §2 |
| `097f8e0` | Fix two rules that contradicted themselves | Claude Opus 5 wrote the fixes; reported by the T-11 agent on #59. |
| `7028cc5` | T-07: typed clients over the frozen ABIs, and one decoder for every event | Claude Code (Opus 5) drafted the contract clients, abi.ts and events.ts; human reviewed the role assignments against T-01 §2 |
| `1739e57` | T-02: restore T-00's honesty sentence to the wording its brief specified | Claude Code (Opus 5) drafted the one-sentence restore from the reviewer's BLOCKING item; human reviewed the sentence against T-00's brief |
| `8417fb5` | T-07: one sender for the relayer key — TxQueue over a Postgres advisory lock | Claude Code (Opus 5) drafted nonce-lock.ts, tx-queue.ts, the mock node and their tests; human reviewed the lock boundary and the resync path |
| `2c00dde` | T-02: README stub sections in the order T-37, T-48 and T-49 fill them | Claude Code (Opus 5) drafted the stub sections from the brief's §2 order; human reviewed that T-00's two lines survived |
| `f46d81d` | T-02: the nineteen threat-model rows, Link column left for T-45 | Claude Code (Opus 5) transcribed the nineteen rows from the brief; human reviewed the row count and the FIX/DOC split |
| `d417690` | T-02: seven bare-id spike sections plus the locked-architecture block | Claude Code (Opus 5) drafted the sections from the brief's §2 list; human reviewed the heading-to-description mapping |
| `0ee6fb9` | T-02: give POSTERS.md its table header, counting rule and count line | Claude Code (Opus 5) drafted the file from the brief's §2 strings; human reviewed the table header against the brief |
| `d539fdf` | T-02: give FEEDBACK-WORLD.md its four track headings and entry format | Claude Code (Opus 5) drafted the file from the brief's §2 strings; human reviewed the four headings character by character |
| `4aaa586` | T-02: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-04T21:35:21Z | claim script; human dispatched the task |
| `6f74e57` | T-11 round 2: reject the sentinel values before anything else | Claude Code (Opus 5) drafted the sentinel guards and the two tests from the round-2 review; human reviewed the check order and the invariant assertion. |
| `56fc513` | T-02 §8: match the repo-state line case-insensitively | Claude Opus 5 amended the brief; human dispatched. |
| `97a41a1` | T-11: WorkerRegistry tests — replay, duplicate, expiry, seeding, reset, views | Claude Code (Opus 5) drafted the test suite from the T-11 brief §8; human reviewed the hand-built domain separator, the log scan and the gas ceilings. |
| `b5753b9` | T-11: WorkerRegistry contract — ATTESTED registration, seeding, reset | Claude Code (Opus 5) drafted the contract from the T-11 brief; human reviewed the check order, storage layout and NatSpec. |
| `708dc23` | T-11: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-04T21:34:41Z | claim script; human dispatched the task |
| `483d0ed` | T-12 (1/2): time the tests off the recorded timestamps | Claude Code (Opus 5) drafted the timestamp change and the unpause assertion; human reviewed the boundaries against the brief's §8 |
| `571d07b` | T-07: parse the chain environment and build the three wallets | Claude Code (Opus 5) drafted env.ts and clients.ts from the brief; human reviewed the schema against .env.example |
| `f8fd93b` | T-12 (1/2): cover the PR-1 rows of the brief's §8 | Claude Code (Opus 5) drafted the twelve §8 tests and the shared fixture; human reviewed the boundaries and the delta assertions |
| `a597081` | T-12 (1/2): post, claim, submit and expire the escrow | Claude Code (Opus 5) drafted the contract from the T-12 brief; human reviewed the check orders, the money math and the pause surface |
| `ec8c472` | T-07: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-04T21:35:54Z | claim script; human dispatched the task |
| `9c2f7ab` | T-12: claim by Ruben Dinis@MacBook-Pro-de-Ruben at 2026-09-04T21:41:26Z | claim script; human dispatched the task |
| `be479b4` | Initial commit at 2026-09-04T17:18:30Z | Claude Opus 5 drafted the README; human reviewed and dispatched. |
