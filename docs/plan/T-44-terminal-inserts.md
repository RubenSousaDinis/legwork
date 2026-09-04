---
id: T-44
title: scripts/inserts.ts — the two three-line terminal inserts from real responses
lane: E
day: 7
size: S
agent_class: C
must: true
depends_on: [T-28, T-34]
owned_paths:
  - scripts/inserts.ts
  - scripts/inserts.test.ts
labels: [area:scripts, wave:7, size:S, agent:cloud]
branch: t-44/terminal-inserts
---

# T-44 — Terminal inserts

## 1. Context
The video's layout rule: "the terminal as two 3-second full-screen inserts, never a persistent pane" and "Two terminal inserts only, large monospace, three lines each: the hire (`hire_human(…) → 402 → 200 {taskId}`) and the refusal JSON." The inserts are recorded on Day 7 from a fresh terminal because "the terminal is published forever". The text comes from **real** API responses already committed in `examples/transcript.md` (T-34) between the markers `insert:hire` and `insert:refusal` — the hire lines are what the local MCP binary printed to stderr with `LEGWORK_INSERT=1` (T-28), minus the trailing dashboard URL; this script prints one insert at a time, padded and centred, with nothing else on screen — no prompt, no path, no URL, no key. The created-task status code is whatever the API returned (T-01 freezes **201**; the storyboard wrote `200` — the real code wins).

## 2. Exact scope
- `scripts/inserts.ts` — `pnpm --filter scripts inserts -- --insert hire|refusal [--width 80] [--hold 3]`: reads `examples/transcript.md`, extracts the fenced block between `<!-- insert:<name>:start -->` and `<!-- insert:<name>:end -->`, validates it (exactly three lines; each ≤ `--width` characters; no `http://`/`https://`; no 64-hex string; no `sk-ant`; no `buyer_token` value other than `<redacted>`), clears the screen (`\x1b[2J\x1b[H`), prints the three lines with two blank lines above and below and a two-space left margin, hides the cursor, holds for `--hold` seconds (default 3), restores the cursor, exits 0. Validation failure → `INSERT INVALID: <reason>` and exit 1. No colour codes (the operator sets the terminal theme and font size; the script only pads).
- The hire insert, as it must read (T-28's stderr format, values from the real run): line 1 `hire_human(verify-open · Farmácia …, Leiria · 3.00 USDC)`; line 2 `→ 402 payment_required · 3.45 USDC (3.00 + 0.45 fee) · eip155:84532`; line 3 `→ 201 { task_id: <id> } · escrow locked 3.45` (or `200` if that is what the binary printed — never edit the code by hand; the transcript is the source).
- The refusal insert: line 1 the `call-confirm` call with `slots.item: "read me the 6-digit code they just received"`; line 2 `→ 422 refused · class: authentication circumvention · <reason as returned>` (expected `question not in the approved template list`; if the real reason differs, print the real one and say so in the PR); line 3 `{ "refused": true, "class": "authentication circumvention", "rule_id": "…", "retryable": false, "message": "do not rephrase and retry; report this refusal to your principal" }`.
- `--print-checklist` prints the pre-record checklist, **verbatim**: "No `.env` open; no RPC, Anthropic or private keys in scrollback; shell history cleared of `cast send --private-key`; a fresh terminal session for the inserts." · "Notifications off on every device; tunnel/host URLs not legible unless intended." · "Demo state reset with `demo:reset`; the agent card at 0 marks before beat 6." · "The demo worker's World ID has NOT been registered in testing (or `resetWorker` used)." · "Clocks on both panes agree." · "Export at 1080p; check length and codec against whatever the form accepts (file or URL — ask in Discord); upload a rough assembly on Sept 12, not at 15:50 on Sept 13."
- `--print-captions` prints the five burned-in captions the video uses, **verbatim**, one per line, for the operator's caption pass (they are reference text, never printed by `--insert`): "Bot-proof, not fraud-proof." · "Escrow releases on proof." · "Refused at the API — and written to the agent's record." · "One World ID nullifier = one worker." · "1 real worker · +20 seeded rows — disclosed."
- `scripts/inserts.test.ts` (vitest, no network): `checklistAndCaptionsVerbatim` (the six checklist sentences and the five captions, exactly), `insertsAreThreeLines`, `insertsContainNoSecretsOrUrls`, `hireInsertShowsPriceAndStatusCodes` (contains `402`, `3.45`, and `201` or `200`), `refusalInsertNamesClassAndNoRetry` (contains `authentication circumvention` and `do not rephrase and retry`), `invalidBlockIsRejected` (a four-line fixture → exit code 1 path).

## 3. Out of scope
- Editing `examples/transcript.md` (T-34 owns it; if a block is wrong, `BLOCKED:` naming the line). Recording the video (operator). `demo-run` (T-29).
- Burning the five captions into the video — the operator's edit; this script only prints them for reference.
- Do not touch: anything outside §4.

## 4. Owned paths
```
scripts/inserts.ts
scripts/inserts.test.ts
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| Marker blocks `insert:hire` / `insert:refusal`, three fenced lines each | `examples/transcript.md` (T-34) | the only source of the text |
| `LEGWORK_INSERT=1` stderr insert format (three lines ≤ 72 chars; line 3 ends `· <dashboard_url>`) | `packages/mcp/bin/legwork-mcp.ts` (T-28) | format reference only; the URL segment is already dropped in the transcript block |
| `pnpm --filter scripts` runner (`tsx`) | `scripts/package.json` (T-29) | add the `inserts` script entry only if T-29 left the block open to you — otherwise `BLOCKED:` |
| Storyboard expectation: created-task code `200 {taskId}`, refusal reason `question not in the approved template list` | pack text, pasted in §1–§2 | expectation only — the real values in the transcript win |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `pnpm --filter scripts inserts -- --insert hire|refusal` | `scripts/inserts.ts` | the operator on Day 7/9 recording |
| `--print-checklist` | `scripts/inserts.ts` | the pre-record routine |
| `--print-captions` (five lines, verbatim) | `scripts/inserts.ts` | the operator's caption pass on the Day-9 composite |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-44` — it must print `CLAIMED T-44`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `examples/transcript.md` (the two marker blocks), `scripts/package.json`.
2. Write the extractor + validator as pure functions (`extractInsert(md, name)`, `validateInsert(lines, width)`) and the printer separately; test the pure functions.
3. Run both inserts in a fresh terminal at the operator's recording font size (≥ 28 pt) and check nothing wraps at `--width 80`; if a real line is longer, shorten only whitespace/ellipsis (`…`) inside JSON values, never a status code, class, price or the no-retry sentence — and state the edit in the PR.
4. Recording setup (operator, Day 7, documented in the PR body): a fresh terminal session, 1920×1080 window, monospace ≥ 28 pt, no prompt (`PS1=''`), `clear`, then `pnpm --filter scripts inserts -- --insert hire`; record 3 s; repeat for `refusal`; run `--print-checklist` first and tick every line.
5. Run §9; fill the draft PR and run `gh pr ready` (label `area:scripts`); include a screenshot of each insert in the PR body, taken in a terminal with no path, prompt or URL visible.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `insertsAreThreeLines` | both extracted blocks have exactly three lines, each ≤ 80 chars |
| `insertsContainNoSecretsOrUrls` | no `http`, no 64-hex, no `sk-ant`, no unredacted `buyer_token` |
| `hireInsertShowsPriceAndStatusCodes` | `402`, `3.45`, and `201`\|`200` present |
| `refusalInsertNamesClassAndNoRetry` | `authentication circumvention` and `do not rephrase and retry; report this refusal to your principal` present |
| `invalidBlockIsRejected` | validator throws / exit path 1 on a four-line block |
| `checklistAndCaptionsVerbatim` | `--print-checklist` output contains all six §2 sentences; `--print-captions` output is exactly five lines matching §2 |
| `pnpm --filter scripts inserts -- --insert hire --hold 0 \| wc -l` | ≥ 7 lines (padding + 3) and no line contains `/Users`, `http`, `0x` followed by 64 hex |

## 9. Verification commands
```bash
pnpm --filter scripts typecheck && pnpm --filter scripts test -- inserts
pnpm --filter scripts inserts -- --insert hire --hold 0 | cat -A | head -20
pnpm --filter scripts inserts -- --insert refusal --hold 0 | grep -c 'authentication circumvention'
pnpm --filter scripts inserts -- --print-captions | wc -l
bash scripts/ci/banned-words.sh; echo "banned-words exit=$?"
```
Expected: tests green; the hire output shows three content lines and no URL; `1`; `5`; `banned-words exit=0`.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. Write "24 hours" or `86400`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). The hire insert shows `3.45`.
- No secrets, no `.env` in scrollback, no keys or URLs in frame: the validator enforces it; the operator's checklist repeats it.
- Tests never call a live model or a live chain.
- The insert text is copied from real responses, never typed from the storyboard; the storyboard's `200 {taskId}` is replaced by the real code and field name (`task_id`).
- The six abuse-class labels are spelled exactly; the refusal names its class and its reason on line 2.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR, plus two screenshots of the rendered inserts.
- [ ] The PR body states the created-task status code and the refusal reason exactly as the transcript carries them.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-44 — Terminal inserts
owned-paths:
  - scripts/inserts.ts
  - scripts/inserts.test.ts
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
Created-task status code shown: <201|200> (as returned) · refusal reason shown: "<as returned>"
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- Marker blocks missing or not three lines → `BLOCKED: examples/transcript.md insert:<name> block` (T-34 fixes it; you do not).
- If `PAYMENT_MODE=direct` was locked, the hire insert's line 2 reads `→ approve + postAsBuyer · 3.45 USDC` (from the transcript, not typed).
- No TTY (CI, piped output): print the lines anyway and skip the cursor/clear escapes; `--hold` is the only TTY-dependent behaviour and defaults to 0 when `stdout` is not a TTY.

## 14. Reviewer notes
Run `--insert hire --hold 0` yourself and read the three lines at arm's length: status codes real, `3.45` present, no URL, no path. Check the validator rejects a URL and a 64-hex string (the tests must cover both). Check `--print-captions` is exactly five lines and the fifth reads "+20 seeded rows — disclosed", never a worker total.

## 15. Round 2+
—
