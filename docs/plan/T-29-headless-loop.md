---
id: T-29
title: CLI worker + demo:run + demo:reset — the green headless loop on Base Sepolia
lane: lead                            # lane-E paths, executed by the lead (class L)
day: 3                                # target 15:00 UTC
size: M
agent_class: L
must: true
depends_on: [T-16, T-17, T-19, T-14]
owned_paths:
  - scripts/cli-worker.ts
  - scripts/demo-run.ts
  - scripts/demo-reset.ts
  - scripts/demo-loop.test.ts
  - scripts/fixtures/**
  - scripts/package.json                # `scripts` block only
  - package.json                        # root; `scripts` block only — lead-run task
  - docs/spikes/RESULTS.md              # `## Timing` section append, Day 3 only
labels: [area:scripts, wave:3, size:M, agent:local]
branch: t-29/headless-loop
---

# T-29 — The green headless loop

## 1. Context
The schedule's Day-3 row reads: "**CLI worker** → hire → post → claim → submit → release on Base Sepolia — **the green headless loop, today.** `demo:reset` / `demo:run` scripts." Nothing on the critical path is allowed to be red on the Day-6 go/no-go, so the money loop is proven three days before it first meets the phone. The CLI worker is a **seeded** worker (`seedWorker` in T-14; `CLI_WORKER_PRIVATE_KEY`) that drives the **relayed API routes** — never the direct `claim()`/`submit()` contract path — so submit-time checks (hash reuse, geofence) are exercised and no fake "verified" registration exists to reset. The buyer is the demo agent (`BUYER_PRIVATE_KEY`, allowlisted by T-14, so a seeded worker may claim its tasks). Honesty lines to print where money is shown: "testnet USDC — not spendable"; "our custody is the one block between settlement and escrow, and we say so".

## 2. Exact scope
- `scripts/cli-worker.ts` — `runWorkerOnce(opts)` exported + a CLI (`pnpm cli-worker -- --area ez5ku --place scripts/fixtures/demo-place.json`). Sequence, all against `API_BASE_URL`: `GET /session/nonce` → sign a SIWE message with `CLI_WORKER_PRIVATE_KEY` (viem) → `POST /session` `{mode:'walletAuth', payload, nonce}` → worker-session cookie → poll `GET /tasks?area=<geohash5>&lat=&lon=` every 3 s until a row with `state: 'open'` appears → `POST /tasks/:id/claim` → generate the fixture JPEG at runtime with `sharp` (640×480, from an in-memory SVG: a coloured rectangle plus the text `LEGWORK CLI FIXTURE <ISO timestamp> <task_id>` so **the bytes differ on every run** — the same hash for the same place/type auto-disputes) → `POST /proofs` multipart `file, lat, lon, accuracy_m=25` with a coordinate jittered ≤ 50 m from the place coordinate (inside `GEOFENCE_M = 150`) → `POST /tasks/:id/submit` `{proofHash, answer:'closed', note:'CLI fixture — seeded worker, not an observation'}` → print `tx` of claim and submit. Exit non-zero on `409 InCooldown | AlreadyClaimed | SeededCannotClaimExternal` with the code printed.
- `scripts/fixtures/demo-place.json` — `{ "place_id": "node/<id>", "name", "street_address", "locality": "Leiria", "country": "PT", "lat", "lon" }` typed by the operator from the **same** OSM node used in `demo-data.json`; committed with placeholder values and a comment file `scripts/fixtures/README.md` saying so. `scripts/fixtures/.gitignore` ignores `*.jpg` (generated files are never committed — no pre-kickoff assets).
- `scripts/demo-run.ts` — the buyer: builds the `Envelope` (`task_type: 'verify-open'`, `spec.place` from `demo-place.json`, `question: 'open_now'`, `claimed_open: true`, `claimed_hours: null`, `source: 'own-list'`, `amount_usdc: 3.00`, `dispute_window_s: Number(DEMO_DISPUTE_WINDOW_S)` = 120, optional `agent_id` from `--agent-id`) → `POST /tasks` through `@x402/fetch` wrapping `fetch` with the buyer's viem account (402 → pay `3.45` USDC → **201** `{task_id, buyer_token, …}`) → calls `runWorkerOnce()` in-process → polls `GET /tasks/:id?wait=50` with `X-Buyer-Token` until `status: 'submitted'` → `POST /tasks/:id/approve` (`X-Buyer-Token`) or, with `--auto-release`, waits for `autoRelease` after `DEMO_DISPUTE_WINDOW_S` (the lazy sweeper / `POST /admin/sweep` fires it) → polls until `status: 'released'` → reads the release receipt with viem and asserts two USDC `Transfer` logs: `3_000_000` to the worker and `450_000` to `TREASURY_ADDRESS`.
- `demo-run` prints exactly these lines (Basescan links `https://sepolia.basescan.org/tx/<hash>`): `POSTED task_id=<id> <link>` · `CLAIMED <link>` · `SUBMITTED <link>` · `RELEASED <link>` · `  USDC 3.00 → worker <addr> · USDC 0.45 → treasury <addr> · testnet USDC — not spendable`; the **last line is `RELEASED`** and the exit code is 0. Any failure prints `FAILED <stage>: <reason>` and exits 1. `PAYMENT_MODE=direct` branch: `USDC.approve` + `TaskEscrow.postAsBuyer(PostParams)` from the buyer key, then continue from the claim step; if `GET /tasks?area=` does not list the task, stop with `BLOCKED:` (reconciliation is T-17's, not yours).
- `demo-run` prints `PRECONDITION FAILED: <which>` before spending anything if: `registry.isSeeded(cliWorker) == false`, `escrow.allowlistedBuyer(buyer) == false`, buyer USDC balance < 3.45, or `GET /healthz` ≠ 200.
- `scripts/demo-reset.ts` — `POST /admin/reset-demo` with `X-Admin-Key` → `{ok:true}`; then `WorkerRegistry.resetWorker(nullifier)` **with the owner key** (`DEPLOYER_PRIVATE_KEY`, viem) for `--nullifier <uint256>` or `--worker <address>` (→ `nullifierOf`), skipping with `no binding` if `workerOf(nullifier) == 0x0`; prints the mark count for the demo agent from `GET /public/refusals` and, if it is not 0, prints `onchain marks cannot be deleted — register a fresh demo agent id before filming (scripts/register-identity.ts, T-32)`. Prints `RESET OK`.
- Root `package.json` scripts: `"demo:run": "pnpm --filter scripts demo:run"`, `"demo:reset": "pnpm --filter scripts demo:reset"`, `"cli-worker": "pnpm --filter scripts cli-worker"`; `scripts/package.json` maps them to `tsx <file>`.
- `scripts/demo-loop.test.ts` (vitest, no network): `fixtureBytesDifferPerRun`, `jitterInsideGeofence` (1000 samples all < 150 m by haversine), `demoRunPrintsReleasedLast` (the formatter given a fake stage log ends with `RELEASED`).
- One real end-to-end run on Base Sepolia; the four tx links appended to `docs/spikes/RESULTS.md` under `## Timing` as `Day-3 green loop <HH:MM UTC>: post/claim/submit/release <links>` and pasted into the PR.

## 3. Out of scope
- API behaviour (T-16/T-17/T-19), contract changes, the MCP client (T-28 — `demo-run` uses REST + `@x402/fetch`, not the MCP), the mini-app, the dashboard.
- `scripts/register-identity.ts` (T-32), `scripts/inserts.ts` (T-44), `scripts/osm-extract.ts` (T-22), `scripts/ci/**` (lead).
- Do not touch: `.env.example`, `demo-data.json`, `packages/shared/**`, anything outside §4.

## 4. Owned paths
```
scripts/cli-worker.ts
scripts/demo-run.ts
scripts/demo-reset.ts
scripts/demo-loop.test.ts
scripts/fixtures/**
scripts/package.json
package.json
docs/spikes/RESULTS.md
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `POST /tasks` (x402; price = `amount × 1.15`) → 201 `{task_id, buyer_token, status:'open', spec_hash, price_usdc, eta_seconds, poll_after_seconds, dashboard_url}` | `packages/shared/src/api-contract.ts`, T-16 | 402 body `{error:'payment_required', price_usdc, accepts, remaining_budget}` answered by `@x402/fetch` |
| `GET /tasks/:id?wait=0..50` (+ `X-Buyer-Token`) → `{status, tx:{post, claim?, submit?, release?}, changed, poll_after_seconds, …}` | T-19 | long-poll ≤ 50 s |
| `POST /tasks/:id/approve` (buyer-token) → `{task_id, status, tx}` | T-19 | relayer executes `approve` |
| `GET /session/nonce` → `{nonce}`; `POST /session` `{mode:'walletAuth', payload, nonce}` → worker-session cookie | T-08 | SIWE verified server-side; **see §13 for the seeded-worker path** |
| `GET /tasks?area=&lat=&lon=` · `POST /tasks/:id/claim` → `{tx, claim_expires_at, submit_deadline}` · `POST /proofs` multipart → `{proofHash, url, captured_at}` · `POST /tasks/:id/submit` `{proofHash, answer, note?}` → `{tx, status}` | T-17 | worker-session cookie on every call |
| `POST /admin/reset-demo` · `GET /public/refusals` · `GET /healthz` | T-19 | `X-Admin-Key` |
| `IWorkerRegistry.resetWorker(uint256)` (onlyOwner), `isSeeded`, `nullifierOf`, `workerOf`; `ITaskEscrow.allowlistedBuyer`, `postAsBuyer(PostParams)`; USDC `Transfer(address,address,uint256)` | `packages/shared/src/abi/*.json`, `contracts/deployments/base-sepolia.json` (T-14) | addresses via `@legwork/shared` `addresses.ts` |
| Constants `GEOFENCE_M = 150`, `DEMO_DISPUTE_WINDOW_S = 120`, `LONGPOLL_MAX_S = 50`, `toUsdcUnits` | `packages/shared/src/constants.ts` | never re-declare |
| Env: `API_BASE_URL`, `BASE_SEPOLIA_RPC_URL`, `BUYER_PRIVATE_KEY`, `CLI_WORKER_PRIVATE_KEY`, `DEPLOYER_PRIVATE_KEY`, `ADMIN_API_KEY`, `TREASURY_ADDRESS`, `DEMO_DISPUTE_WINDOW_S`, `PAYMENT_MODE` | `.env.example` | read only from `process.env` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `pnpm demo:run` exits 0 with `RELEASED` last; `pnpm demo:reset`; `pnpm cli-worker` | root `package.json` | `e2e.yml` (T-36), the pre-record checklist (T-44), the operator |
| `runWorkerOnce(opts)` | `scripts/cli-worker.ts` | `demo-run`, T-36 |
| `scripts/fixtures/demo-place.json` shape | `scripts/fixtures/` | operator, T-44 |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-29` — it must print `CLAIMED T-29`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `docs/api.md`, `docs/keys.md`, `.env.example`; confirm T-14's `deployments/base-sepolia.json` has the four addresses and that `pnpm --filter @legwork/shared typecheck` passes.
2. Write `cli-worker.ts` against a local API (`pnpm --filter @legwork/api dev` with `DATABASE_URL` pointing at the Supabase project) first; run it once with `--dry-run` (everything but the chain-touching calls) to check the session and list shapes.
3. Write `demo-run.ts`; run against the **hosted** Day-1 URL with the funded buyer; if the 402 → pay → 201 leg fails, do not debug x402 here — `BLOCKED:` naming the stage and the response body (T-16 owns it).
4. Write `demo-reset.ts`; run it before the first full loop. Then `pnpm demo:run`; paste the output into the PR and the four links into `docs/spikes/RESULTS.md` `## Timing`.
5. Write `demo-loop.test.ts` (pure functions only: fixture generator, jitter, formatter). Run §9. Open the PR; announce "green loop" in the Day-3 dispatch thread.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `pnpm demo:reset && pnpm demo:run` (Base Sepolia, operator env) | exit 0; last stdout line is `RELEASED`; output shows `USDC 3.00 → worker` and `USDC 0.45 → treasury`; four Basescan links resolve |
| `fixtureBytesDifferPerRun` | two consecutive fixture buffers have different `keccak256` |
| `jitterInsideGeofence` | 1000 jittered coordinates all within 150 m of the input |
| `demoRunPrintsReleasedLast` | formatter output ends with `RELEASED` and contains no `0x` private-key-length hex |
| `grep -n 'Day-3 green loop' docs/spikes/RESULTS.md` | one line with four `sepolia.basescan.org/tx/` links |

## 9. Verification commands
```bash
pnpm --filter scripts typecheck && pnpm --filter scripts test
pnpm demo:reset
pnpm demo:run | tee /tmp/demo-run.log; echo "exit=$?"; tail -n 1 /tmp/demo-run.log
bash scripts/ci/banned-words.sh; git diff --name-only origin/main | grep -v -E '^(scripts/|package.json|docs/spikes/RESULTS.md)' && echo "OUT OF OWNED PATHS" || echo "paths ok"
```
Expected: tests green; `RESET OK`; `exit=0` and `RELEASED`; `paths ok`. Redact nothing but never paste a key: the log carries addresses and tx hashes only.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. Write "24 hours" or `86400`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). Assert `3_000_000` and `450_000` on the receipt, never compute them from a percentage string.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git. Never print a private key, a session cookie or a `buyer_token`.
- Tests never call a live model or a live chain; the live run is the operator's command in §8, not a test file.
- The CLI worker uses only the relayed API routes; it never calls `claim()`/`submit()` on the contract. The owner key is used for `resetWorker` only.
- "Nothing else on the critical path is allowed to be red after this merges." If the loop is red at 15:00 UTC, the lead pivots per the pack (`PAYMENT_MODE=direct`, T-16b) rather than debugging into the evening.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR, including the four Basescan links.
- [ ] `scripts/README.md` is not yours (lead) — document the three commands in `scripts/fixtures/README.md` instead.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-29 — CLI worker + demo:run + demo:reset (green headless loop)
owned-paths:
  - scripts/cli-worker.ts
  - scripts/demo-run.ts
  - scripts/demo-reset.ts
  - scripts/demo-loop.test.ts
  - scripts/fixtures/**
  - scripts/package.json
  - package.json
  - docs/spikes/RESULTS.md
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
Green loop: post <link> · claim <link> · submit <link> · release <link> · <HH:MM UTC>
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- **INTERFACE REQUEST (pre-identified):** T-01 lists `POST /session` under auth `idkit-session`. A seeded CLI worker has no World ID and therefore no idkit-session cookie. The loop needs T-08's "dev path": `POST /session` `{mode:'walletAuth', payload, nonce}` accepted **without** an idkit-session when `registry.isSeeded(worker) == true`, binding the session to `nullifierOf(worker)` (the synthetic nullifier). If T-08 did not ship this, post `INTERFACE REQUEST: seeded-worker session path on POST /session` and stop.
- If the API's post-time geocode of the demo place differs from `demo-place.json` by more than 150 m, the submit auto-disputes: fix the fixture coordinate (operator), not the geofence.

## 14. Reviewer notes
Open `demo-run.ts` first: the receipt assertion must read the two `Transfer` logs (amounts `3_000_000` / `450_000`, recipients worker / treasury), not the API's `amount_usdc`. Check the fixture has a per-run timestamp in the SVG (else the second rehearsal auto-disputes on hash reuse). Check `cli-worker.ts` never imports the escrow's `claim`/`submit` write functions. Check the last stdout line is literally `RELEASED`.

## 15. Round 2+
—
