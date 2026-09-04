---
id: T-45
title: Docs final — threat model links, spike RESULTS filled, keys, ODbL, api/mcp re-check
lane: E
day: 7–8
size: S
agent_class: C
must: true
depends_on: [T-37, T-29, T-32, T-46]
owned_paths:                         # Days 7–8; excludes docs/plan/** (lead), docs/submission.md (T-48), docs/feedback-world/** (T-41)
  - docs/**
  - "!docs/plan/**"
  - "!docs/submission.md"
  - "!docs/feedback-world/**"
  - "!docs/media/**"                  # captured by T-46 / T-47 / T-49; you link them, never overwrite
labels: [area:docs, wave:7, size:S, agent:cloud, docs]
branch: t-45/docs-final
---

# T-45 — Docs final

## 1. Context
By Day 7 every named test exists, the spikes have outcomes, the preflight has been verified on live Studio data (T-46), the loop has run on Base Sepolia (T-29) and the API's ERC-8004 identity has written its first `paid-on-proof` (T-32). This task makes `docs/` true and complete before the Day-9 code freeze: every threat-model row links to the test that proves it; `docs/spikes/RESULTS.md` has all seven sections filled and the locked architecture block closed; `docs/keys.md` names every role and every disclosed operator power; `docs/api.md` and `docs/mcp.md` are re-checked line by line against `api-contract.ts` and `mcp-contract.ts`. The submission's "How it's made" paragraph on the spikes (T-48) is written from RESULTS, so RESULTS must be quotable.

## 2. Exact scope
- `docs/threat-model.md`: every **FIX** row's `Link` cell holds a repo-relative link to the file containing the named test (`contracts/test/TaskEscrow.t.sol`, `contracts/test/WorkerRegistry.t.sol`, `contracts/test/AbuseMark.t.sol`, `apps/api/src/**/<file>.test.ts`, `packages/mcp/**/*.test.ts`, `packages/screening/fixtures/…`, the `/proofs` unit test) — one link per test name, verified with `grep -rn "function <name>\|it('<name>'\|test('<name>'"`; no `pending` remains. **DOC** rows link to the README section (`README.md#out-of-scope` or `#threat-model`). Keep the nineteen rows and the reentrancy line untouched.
- `docs/spikes/RESULTS.md`: all seven sections have `outcome:` ∈ {PASS, FAIL, DOWNGRADED}, `evidence:` (a Basescan tx link, a `docs/feedback-world/*.png`, or the exact string) and `decision:`. Sources: the T-03 and T-04 PR bodies, the S2' notes in `FEEDBACK-WORLD.md`, T-23/T-46 PR bodies (`## Graph`, `## Preflight` — include the two Discord answers verbatim with dates, or "unanswered as of 2026-09-1X"), T-29's `## Timing` line (keep it) plus the Day-5 fresh-install → verify → claim number from the operator. `## Locked architecture`: the four lines resolved to one value each, no `_pending_`.
- `docs/keys.md`: the role table with one row per key — deployer (owner of the four contracts; disclosed operator powers `seedWorker`, `resetWorker`, `resolve`, `pause`, `setAllowlistedBuyer`, `setMarkCooldown`) · relayer (holds the float; `post`, `registerFor`, `claimFor`, `releaseClaimFor`, `submitFor`, `approve`/`dispute` on behalf; x402 `payTo`) · attestation verifier (signs EIP-712 attestations; never onchain) · AbuseMark signer (`mark` only) · buyer (the demo agent; allowlisted) · CLI worker (seeded) · treasury (receives fees) — plus the sentence "One job per key; never a personal key." and a `## Disclosed operator powers` list with the honesty line "today I am on both sides of this: my agent, my phone, my key resolves disputes. The contract doesn't know that, and that's the point of putting it in a contract." Public addresses of the deployer, relayer, treasury and AbuseMark signer may be listed (they are onchain); never a key.
- ODbL: `docs/README.md` (the docs index — create if absent) carries "Place data © OpenStreetMap contributors, available under the Open Database License (ODbL): https://www.openstreetmap.org/copyright." and links every file in `docs/`. Check the same line exists in `README.md` (T-37); if missing, say so in the PR for T-49 — do not edit `README.md`.
- `docs/api.md`: every route in `packages/shared/src/api-contract.ts` appears with its auth class and status codes; the frozen handler order sentence is present verbatim: "`x402 verify (no money moves) → envelope + schema → deterministic gate → classifier (free-text path only) → caps → agent-id verification → TaskEscrow.post(buyer = payer, buyerAgentId) via TxQueue → x402 settle (idempotency key = authorization nonce) → 201`"; the two sentences "A refusal from the gate/classifier → `AbuseMark.mark` (if a verified agent id) and 422. A failed `post` never settles."
- `docs/mcp.md`: the six tools' params and result keys equal `mcp-contract.ts` (diff by hand; fix drift in the doc, never in the contract); the two-mode table present.
- `docs/threat-model.md` and `docs/keys.md` each end with a dated line `_checked against main on 2026-09-1X_`.

## 3. Out of scope
- `README.md` (T-37 until Day 8; T-48 Day 9; T-49 Day 10), `docs/submission.md` (T-48), `docs/plan/**` (lead), `docs/feedback-world/**` and `FEEDBACK-WORLD.md` (T-41), `SKILL.md` (T-31), `POSTERS.md` (lead/T-49), any code or contract.
- Do not touch: `packages/shared/**` (if a doc and the contract disagree, the contract wins and the doc changes).

## 4. Owned paths
```
docs/**
!docs/plan/**
!docs/submission.md
!docs/feedback-world/**
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| Route table + handler order | `packages/shared/src/api-contract.ts` | source of truth for `docs/api.md` |
| Six tools, two modes | `packages/shared/src/mcp-contract.ts` | source of truth for `docs/mcp.md` |
| Named tests | `contracts/test/*.t.sol`, `apps/api/**/*.test.ts`, `packages/**/*.test.ts` | grep by exact name |
| Spike / loop / preflight outcomes | PR bodies of T-03, T-04, T-23, T-29, T-46; `FEEDBACK-WORLD.md` | evidence for RESULTS |
| Role list | `.env.example` key names, `contracts/deployments/base-sepolia.json` | roles and public addresses |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| Quotable RESULTS (seven sections + locked block) | `docs/spikes/RESULTS.md` | T-48 "How it's made" paragraph 1 |
| Threat-model rows with test links | `docs/threat-model.md` | T-48 prize table, T-49 README |
| `docs/README.md` index | `docs/` | T-49 `## Docs` |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-45` — it must print `CLAIMED T-45`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, then every file under `docs/` except `plan/`; list what is `pending` or `_pending_`.
2. Threat model: for each FIX row run the grep for each test name; write the link; if a name is not found anywhere, do not rename it — record `MISSING TEST: <name>` in the PR and `BLOCKED:` (the owning lane adds or renames the test; a threat-model row without its test is a README claim we cannot make).
3. RESULTS: fill from the PR bodies (quote, do not summarise away the numbers); resolve the locked block.
4. `docs/keys.md`, `docs/README.md`; then the api/mcp re-check with the contract files open side by side.
5. Run §9; open one PR labelled `docs`.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `grep -c 'pending' docs/threat-model.md docs/spikes/RESULTS.md` | `0` for both |
| `grep -c '^| \*\*FIX\*\*\|^| \*\*DOC\*\*' docs/threat-model.md` | `19` |
| test-name existence (§9 loop) | every named test in the threat model is found by grep in the repo |
| `grep -c '^outcome: \(PASS\|FAIL\|DOWNGRADED\)' docs/spikes/RESULTS.md` | `7` |
| `for r in seedWorker resetWorker resolve pause setAllowlistedBuyer setMarkCooldown; do grep -Fq "$r" docs/keys.md \|\| echo "MISSING $r"; done` | no output |
| `grep -Fq 'OpenStreetMap contributors' docs/README.md` | ODbL line present |
| `grep -Fq 'x402 verify (no money moves)' docs/api.md` | handler order verbatim |
| route coverage (§9 loop) | every route path string in `api-contract.ts` appears in `docs/api.md` |
| `bash scripts/ci/banned-words.sh` | exit 0 |
| link check (§9) | no `MISSING` |

## 9. Verification commands
```bash
bash scripts/ci/banned-words.sh; echo "banned-words exit=$?"
grep -c 'pending' docs/threat-model.md docs/spikes/RESULTS.md; grep -c '^outcome: \(PASS\|FAIL\|DOWNGRADED\)' docs/spikes/RESULTS.md
grep -oE 'test_[A-Za-z0-9_]+|`[a-z][A-Za-z]+(AutoDisputes|AfterPost|IsPayer|Accepted|NoMark|In402|NeverMarks)`' docs/threat-model.md | tr -d '`' | sort -u | while read -r t; do grep -rqF "$t" contracts/test apps packages || echo "MISSING TEST $t"; done
grep -oE "'(GET|POST) [^']+'" packages/shared/src/api-contract.ts | tr -d "'" | awk '{print $2}' | sort -u | while read -r p; do grep -Fq "$p" docs/api.md || echo "MISSING ROUTE $p"; done
for f in docs/threat-model.md docs/spikes/RESULTS.md docs/keys.md docs/README.md docs/api.md docs/mcp.md; do grep -oE '\]\([^)]+\)' "$f" | sed -E 's/^\]\(//; s/\)$//; s/#.*$//' | grep -Ev '^(https?://|$)' | while read -r l; do [ -e "$(dirname "$f")/$l" ] || [ -e "$l" ] || echo "MISSING in $f: $l"; done; done
```
Expected: `banned-words exit=0`; `0 0`; `7`; no `MISSING TEST`, no `MISSING ROUTE`, no `MISSING in`. (If the route strings in `api-contract.ts` are not literal `'METHOD /path'`, adapt the extraction and paste the adapted command.)

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. Write "24 hours" or `86400`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate).
- No secrets: `docs/keys.md` lists roles and public addresses, never a key, never an RPC URL with a token.
- Honesty lines verbatim where used: "cloud-verified, operator-attested — onchain World ID verification is Orb-only today"; "GPS is self-reported and spoofable; we anchor it, geofence it, dispute outside the radius — we do not prove it."; "our custody is the one block between settlement and escrow, and we say so"; "one real registration, plus twenty seeded rows (demo data)".
- RESULTS states outcomes as observed: a fallback is `DOWNGRADED` with the variant named ("World ID verification in the sandbox — the same integration surface Selfie Check uses, which is in beta today."), never re-labelled a pass.
- Contracts beat docs: if `docs/api.md` and `api-contract.ts` disagree, the doc changes.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-45 — Docs final
owned-paths:
  - docs/**
  - !docs/plan/**
  - !docs/submission.md
  - !docs/feedback-world/**
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
Missing tests reported: <none | list>  ·  README ODbL line present: <yes|no — for T-49>
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- A spike section with no source anywhere (no PR body, no note) → `BLOCKED: RESULTS <section> outcome from the operator`; leave that `outcome:` as `pending` and say so — never guess.
- If `scripts/ci/path-ownership.sh` does not support `!` exclusions, list the owned files explicitly in the PR body instead and note it.

## 14. Reviewer notes
Run the test-name loop first; a single `MISSING TEST` means a README claim is unbacked. Then read `## Locked architecture` against what the video narration assumes (variant A/B, GPS, payment mode). Then spot-check three routes in `docs/api.md` against `api-contract.ts`.

## 15. Round 2+
—
