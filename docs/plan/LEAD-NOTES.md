# Lead notes — cross-task requests the briefs could not settle

Collected from the brief-writers on Sept 3. Items marked **folded into T-01** are already in the frozen contract; the rest are for the lead to handle at the moment named. Update this file as PRs land.

## Folded into T-01 (nothing to do at kickoff)
- `marks_log` column set; `direct_quotes` table (direct mode only).
- `RefusalPayload.mark_status?: 'marked' | 'logged, cooldown' | 'no identity'`.
- `GET /public/observations?place_id=` (optional, T-40); direct-mode `POST /tasks` 202 quote + `POST /tasks/:id/confirm` + `X-Buyer-Signature`/`X-Buyer-Timestamp`; generic error bodies (429/413/403/401/404).
- `POST /session` dev path: a `walletAuth` SIWE payload from a **seeded** worker is accepted without an idkit-session and bound to `nullifierOf(worker)` (the CLI worker and the e2e harness).
- `POST /tasks` success code is **201**; the terminal insert prints `201` and no URL (T-28, T-34, T-44 aligned).
- `tasks` table names `answer`, `note`, `seeded`, `dispute_reason`, `auto_dispute_reason`; `buyer_token_hash` is sha256 hex; `buyerToken.ts` (T-19) is imported by T-16; `lifecycle.settleIfEligible` (T-17) is consumed by T-19.
- `POST /idkit/request` returns `{rp_context: {...}}` (wrapped); `GET /tasks/:id` supports `ETag`/`If-None-Match` and the `poll_after_seconds` 0/1/3 rule; the 409/500/503 error family; `reset-demo` requires `{confirm:'reset-demo'}`.
- Public `price_usdc` = 3.00 (worker rate) with `fee_usdc` 0.45 alongside; `agent_pays_usdc` 3.45 only on buyer-authenticated responses.

- `/public/*` response shapes pinned; `GET /tasks/:id/spec` (claimant-only) added; `POST /tasks/:id/submit` `proofHash` optional for `call-confirm`/`compare-two`; `NEXT_PUBLIC_ADMIN_UI` added to `.env.example`.

- Custom error names on all four interfaces (+ `IAbuseMark.BadOutcome`); `contracts/src/interfaces/Outcomes.sol` constants library; the `AbuseMark.outcome` value/tag mapping; `activeClaimOf` cleared on release/resolve/expire (one task per worker until it settles); `expire` sets no cooldown; no relayer/treasury setter in v0; `deployments/*.json` keys; `BUYER_AGENT_ID`, `BASESCAN_API_KEY`, `FORCE_REDEPLOY` env; `foundry.toml` fs_permissions + etherscan block (T-00).

- Subgraph `Buyer.taskCount`/`countedExternal` + the `Feedback` slot id; `ABUSE_CLASSES` tuple export; root `package.json` scripts pre-declared in T-00 (`osm:extract`, `inserts`, `demo:*`, `abi:gen`, `e2e:anvil`).

## To settle in T-01a/T-01b while writing them (Day 1)
- **`FakeChain` (T-07) `calls[]` must record role + decoded args (bigint for uint256)** — T-20 and T-30 tests read them.
- **`FakeChain` (T-07) must offer a settable custom-error revert** (e.g. `failNextWith('MarkCooldown')`) — T-30 and T-12/T-13 tests rely on it. Put it in T-07's §2 if it is not there when you review.
- **`PaymentGateway` (T-15) result variant for direct funding** — `requirePayment` may return `{ kind: 'quote', ... }` in direct mode so T-16b needs no interface change later. Ask T-15's agent to include the variant (one line) even though `DirectFundingGateway` stays a stub.
- **T-16's route must leave explicit stub calls** to `markIfIdentified`, `logScreening`, `upsertPoster` (T-30 fills them) — check in T-16's review; otherwise T-30 is `BLOCKED` on Day 3.
- **`api-contract.ts` per-route `description` strings and the session cookie names** — T-35 (OpenAPI) needs them; add during T-01b (cheap) rather than later.
- **`scripts/package.json` `inserts` script entry** — T-29 (lead-run) adds `demo:run`/`demo:reset`; add `inserts` at the same time so T-44 is not blocked on a root file.
- **`docs/spikes/RESULTS.md` is shared by T-02, T-03 and T-04 on Day 1** — the only same-day shared file in the plan. Rule: T-02 creates the file with every section heading pre-written (`## S1 … ## Timing`) and merges first (~17:00 UTC); T-03 and T-04 each edit **only** their own `## S3` / `## S1`+`## S5` sections and rebase before opening the PR. Merge order T-02 → T-04 → T-03 (T-03 lands later because the x402 spike is the longer box). `path-ownership` treats the file as shared for these three tasks only.

## Operator-facing decisions surfaced by the briefs
- The pack's ≤300-char showcase short description is **342 chars with placeholders**; T-48 carries the 264-char variant from 11-launch for the form.
- `wait_seconds` is **50** everywhere (Vercel Hobby 60 s ceiling), not the pack's 60; `SKILL.md`, MCP contract and the video copy say 50.
- `npx @legwork/mcp` requires publishing the package to npm (operator, Day 3–4); until then the README's from-source install line is the working one.
- `LEGWORK_API_URL`, `LEGWORK_DASHBOARD_URL`, `LEGWORK_INSERT` are agent-side env names used by the local MCP binary — documented in `packages/mcp/README.md`; decide whether they also belong in `.env.example` (they are not server env).

## Known pack-vs-brief drift the briefs already resolve
- T-01/`RefusalPayload` marks on **gate** hits of the six classes too (the pack sentence "the classifier's refusals are the only ones that mark" predates the deterministic gate).
- The CLI worker is seeded and uses the relayed routes (pack: direct `claim()`).
- `call-confirm.phone` matches the resolved OSM `phone`/`contact:phone` tag only (pack: "or the buyer-supplied listing").

- **T-11 follow-up (S PR after T-20):** consume `contracts/test/fixtures/attestation.json`; the fixture signer is the test key `uint256(keccak256("legwork-test-verifier"))` so no literal key is committed — `vm.sign(that, digest)` must reproduce the fixture signature.
- **DEP check at T-00:** `msw` and `@worldcoin/idkit-core` must be in `apps/api`'s dependency list (T-20 tests), `@electric-sql/pglite` in every package with DB tests.
- **`@legwork/subgraph-client` (T-09) must export `query(document, variables)`** besides the typed helpers — T-26 is told to `BLOCKED:` rather than write a fetcher.
- **Mount points across lanes (announce when the owning PR lands):** T-25's task list renders `<UnverifiedBanner>` when there is no session (T-42 supplies it); T-33's proof header links `Report task → /report/<id>` (T-42); T-10's `TaskRow` root carries `data-testid="task-row"` for T-39.
- **T-39 crop band:** the 9:16 column at 1920×1080 is x 656.25–1263.75 (width 607.5). T-39 asserts the true band; keep it.

## Decisions the lane-C briefs closed (strike them in review if you disagree)
- `activeWorkers` returns `lastCompletedAt >= sinceTs` **or** `registeredAt >= sinceTs` with `completed: 0`. Strict "completed in the last 7 days" cannot produce "4 active · 1 verified · 3 seeded" while the demo phone has no completion yet; the extension is what makes T-46's `seeded` → `n=1 (real)` flip coherent.
- `TaskResolved(toBuyer == false)` also bumps `Worker.completed`/`lastCompletedAt`, keeping the subgraph equal to the onchain `completed(nullifier)`.
- An over-cap spec returns the keyword result **without** `CLASSIFIER_TIMEOUT_LABEL` — nothing timed out; the label stays reserved for the four failure triggers (timeout, throw, `refusal` stop, null parse).
- The OSM extract queries business tags only, so a residential id outside it refuses as `region not covered` rather than `automated reconnaissance`; widening to residential buildings would store every home in Lisbon and blow the 5 MB cap. Bounding boxes: Leiria `39.68,-8.90,39.82,-8.70`, Lisbon `38.68,-9.25,38.83,-9.08`.
- `packages/screening/README.md` is T-06's file; T-22 owns only its `## OSM data` section (the ODbL attribution T-37 needs). Announce it when T-06 merges.
