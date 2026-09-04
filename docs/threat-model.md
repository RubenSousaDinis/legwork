# Threat model

One test per row, named after the attack, is the artifact a judge opens. **FIX** rows ship in v0; **DOC** rows are disclosed in the README and the out-of-scope list.

| Attack | v0 response | Named test(s) / where | Link (filled by T-45) |
| --- | --- | --- | --- |
| **FIX** Agent pays and gets nothing (expiry refund, settle-then-post failure, `resolve`) | `buyer` = x402 payer in `post`; `expire` and `resolve(toBuyer)` pay `buyer`; `/verify → screen → post → /settle` with idempotency | `test_Expire_RefundsBuyer`, `test_Resolve_ToBuyer_NoFee`, API test `settleAfterPost` |  |
| **FIX** Splitting the loss: an injected agent posts a hundred tasks | `maxOpenTasksPerBuyer` onchain + per-agent daily cap at the API, echoed in the 402 body | `test_Post_RevertsOverOpenCap` |  |
| **FIX** AbuseMark against an agentId nothing authenticates | agentId resolved from the payer via IdentityRegistry; no identity → log only; schema error → no mark; rate limit per agentId | `test_Mark_Idempotent`, `test_Mark_RateLimited`, API test `markSubjectIsPayer` |  |
| **FIX** Fake / duplicate workers | One nullifier = one account; attestation domain-bound with a deadline and (nullifier, worker) binding; a known nullifier reverts | `test_Register_DuplicateNullifierReverts`, `test_Register_ReplayedAttestationReverts` |  |
| **FIX** Seeded workers mint "verified humans" | `seedWorker` is a separate owner-only path emitting `WorkerSeeded`; seeded workers can only claim operator-funded tasks; the flag is indexed and rendered | `test_Seeded_CannotClaimExternalTask` |  |
| **FIX** Proof replay / gallery upload / GPS far from the place | Raw content hash anchored; reuse for the same place/type and a ~150 m geofence auto-dispute at the API; `capture="environment"` | API tests `reuseAutoDisputes`, `geofenceAutoDisputes` |  |
| **FIX** Junk proof, nobody watching the dispute window | `approve_task` / `dispute_task` tools; the API auto-disputes on schema/geofence failure; `disputeWindow` per task | `test_AutoRelease_AfterWindow`, `test_Dispute_InsideWindow` |  |
| **FIX** Claim-and-vanish, stranded task | Lazy expiry inside `claimFor`; cooldown after an expired claim | `test_Claim_LazyExpiry`, `test_Claim_CooldownAfterExpiry` |  |
| **FIX** Prompt-injected screening | Deterministic gate authoritative; LLM add-only; delimited input; structured output; 300-char cap; timeout falls back to the keyword class | fixture corpus in CI (`packages/screening/fixtures`) |  |
| **FIX** Worker-authored text injected into the buyer's agent | Answer = enum + ≤120-char escaped note, wrapped as untrusted data in the tool result | MCP contract test |  |
| **FIX** Proof photos deanonymise the worker | Private store, EXIF stripped, signed URLs, rounded coordinate in every public record, `geohash5` in the subgraph | `/proofs` unit test |  |
| **FIX** Operator key compromise | Four keys with one job each; `pause` on `post`/`claim` only; single-signer disclosed | `test_Pause_NeverBlocksRelease` |  |
| **DOC** Photo is a photo of a photo / edited | We anchor, we do not authenticate; loss bounded at one task; reputation keyed to the nullifier; second-worker re-verification is the roadmap; forensics out of scope | README |  |
| **DOC** GPS spoofing | "GPS is self-reported and spoofable; we anchor it, geofence it, and dispute outside the radius — we do not prove it." | README |  |
| **DOC** Self-dealing (operator's own worker farms reputation) | Per-nullifier dedup caps it at one voice; the filmed run has the operator on both sides and says so | README, narration |  |
| **DOC** Dispute / auto-release boundary race | One constant; documented, not built | README |  |
| **DOC** Worker-directed harm (a lure, a stakeout, 23:00) | Daylight-hours default, max distance and a kill switch **before the first external poster** (pre-W3, not hackathon); `Report task` if built | README |  |
| **DOC** Worker's approximate location exposed to the poster | Rounded coordinate only; stated | README |  |
| **DOC** Settle → post custody block | The operator float holds the task's funds between `post` and `settle`; stated | README, narration |  |

Not a row: reentrancy. USDC has no transfer hooks; a plain-ERC20 escrow has no callback surface.
