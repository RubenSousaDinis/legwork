---
id: T-xx
title: <imperative title, ≤ 60 chars>
lane: A | B | C | D | E | lead        # A contracts/chain · B API/payments/MCP · C screening/subgraph · D frontends · E docs/scripts
day: <1–10; Day N = Sept 3+N>
size: S | M | L                      # S ≤ 1.5 h · M 2–3 h · L ≈ 4 h (always two PRs)
agent_class: L | C                   # L = local worktree with the operator's .env (may touch Base Sepolia) · C = cloud, mocks/fixtures/pglite/anvil only, never a secret
must: true | false                   # false = optional, dropped first when behind
depends_on: [T-yy, T-zz]             # PRs that must be MERGED before this starts
owned_paths:                         # the ONLY paths this task may create or edit; copied verbatim into the PR body
  - <glob>
labels: [area:<pkg>, wave:<day>, size:<S|M|L>, agent:<local|cloud>]
branch: t-xx/<slug>
---

# T-xx — <title>

<!--
HOW TO USE THIS TEMPLATE
- Every brief is self-contained: the agent reading it cannot open `fafo/`. Paste the pack text it needs; never link to it.
- Every bullet under "Exact scope" must be testable by something under "Acceptance tests".
- Write for an agent that will do exactly what is written and nothing else. If a decision is open, decide it here.
- Keep the 15 sections and their order; the reviewer reads them in this order.
-->

## 1. Context
<3–6 sentences: what this piece is in the product, why it exists, what depends on it. Paste the relevant pack paragraphs (02/10/09) verbatim in a blockquote when the agent needs them.>

## 2. Exact scope
- <testable bullet>
- <testable bullet>

## 3. Out of scope
- <explicit non-goal; name the task that owns it>
- Do not touch: <paths>

## 4. Owned paths
```
<same globs as the front-matter, one per line>
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| <name> | `<path>` | <one-line semantics> |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| <name/signature> | `<path>` | <T-ids> |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-xx` — must print `CLAIMED`. Exit 1 means another agent holds it or a dependency is open: stop. (Every brief starts here; the script pushes the branch — which is what makes the claim exclusive — and opens the draft PR. Finish with `gh pr ready`, never `gh pr create`.)
1. <where to start; what to read first>
2. <what to mock and how>
3. …

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `<exact test name>` | <what must hold> |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
<exact commands>
```
Expected: <what "green" looks like>.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate).
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted).
- <task-specific honesty lines and UI floors, quoted verbatim>

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] Package `README.md` (inside owned paths) updated if behaviour changed.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)
```
Task: T-xx — <title>
owned-paths:
  - <glob>
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

## 14. Reviewer notes
<what the reviewer opens first; the two or three things most likely to be wrong>

## 15. Round 2+
<empty on first dispatch. On re-dispatch the lead pastes the review's BLOCKING items verbatim here and adds: "Address each item, reply to each in the PR, change nothing else.">
