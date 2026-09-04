---
id: T-46
title: Verify preflight_workers against the live subgraph
lane: C
day: 8
size: S
agent_class: L
must: true
depends_on: [T-23, T-27]
owned_paths:
  - docs/spikes/RESULTS.md            # the #Preflight section only
  - docs/media/preflight-card.png
labels: [area:subgraph, wave:8, size:S, agent:local]
branch: t-46/preflight-verify
---

# T-46 — Verify `preflight_workers` against the live subgraph

## 1. Context
`preflight_workers` is the tool the judges see the agent *act on*: before it spends money it asks the subgraph who is actually working, gets back a real/seeded split, and decides. That makes it the AI-track qualification and the Graph sponsor's still. This task is the last honesty check before the shoot: run the real tool against the real Studio subgraph, confirm the numbers on the card are the numbers the tool returned, and confirm the median carries the right label. It is a verification task — you change no code, only `docs/spikes/RESULTS.md` and one PNG.

> **02-architecture.md — MCP server** "Tools: `preflight_workers(taskType, area)` (subgraph: active = completed a task in the last 7 days, returned as a real/seeded split, median from real completions only or labelled `seeded`)"

> **02-architecture.md — Subgraph** "schema and five handlers written on Saturday and deployed to Studio that evening so it indexes while the rest is built. Entities: `Worker` (`seeded`, `area`, `taskTypes`, `completed`, `lastCompletedAt`), `Task` (state, type, `buyer`, amount, `geohash5` only — never a per-task coordinate keyed to a nullifier), `Feedback`, `Mark`, `PosterStats` (distinct buyers not on the operator allowlist — the external-poster counter the W3 gate is judged on). Serves `preflight_workers` (the AI-track qualification: the agent acts on it) and the dashboard."

The shape you are verifying (**T-01 §2, `packages/shared/src/mcp-contract.ts`**):
> `preflight_workers({task_type, area})` → `{active, verified, seeded, median_minutes: number|null, median_source: 'real'|'seeded'|'n/a', n_real, score_floor, dashboard_url}` (active = completed a task in the last 7 days).

**The window is tight and that is the point.** T-14 seeded the lifecycles on Day 2; today is Day 8. The seeded completions are six days old — inside the seven-day window, but one day from falling out of it. If they have already fallen out, the fix is to **re-seed one lifecycle through `POST /admin/seed-demo`**, never to widen the window. Widening it would make the tool answer a question nobody asked.

## 2. Exact scope
- Call `preflight_workers` for the demo task type and area (the values in `demo-data.json`) against the **live Studio subgraph**, through the deployed MCP server — not the fixture, not the client directly. Capture the raw JSON result.
- Verify the 7-day "active" window against the seeded lifecycle timestamps: query `{ workers(where:{seeded:true}){ id lastCompletedAt } }` and check every `lastCompletedAt` the tool counted is `>= now − 604800`. If any of the three counted seeded workers has aged out, run `POST /admin/seed-demo` (admin key, one lifecycle) and re-run the tool. **Never change the window constant, the `sinceTs` argument, or a fixture to make the number appear.**
- Confirm the split reads **"4 active · 1 verified · 3 seeded"** — `active: 4`, `verified: 1`, `seeded: 3`. `verified` is the one real World ID worker (the demo phone); the other three are seeded demo workers.
- Confirm the median label: while no real completion exists, `n_real: 0` and `median_source: "seeded"`, and the card reads the median as `seeded`. After the demo phone completes a task, re-run and confirm it flips to `n_real: 1`, `median_source: "real"` and the card reads `n=1 (real)`. Record **which of the two was true at capture time**.
- Screenshot the preflight card as rendered on the dashboard, at the moment the tool returned those numbers, and save it as `docs/media/preflight-card.png`. This is the Graph sponsor still.
- Write the `#Preflight` entry in `docs/spikes/RESULTS.md`: the raw tool JSON, the timestamps checked against the window, whether a re-seed was needed, the median label at capture, and the one-line reading of the card in plain words.

## 3. Out of scope
- Any fix to the tool, the client, the mappings or the dashboard — T-27, T-09 and T-26 own those. If a number is wrong, file it against the owning task and re-run here; do not patch.
- The subgraph deployment and its env wiring (T-23). Contract seeding beyond one `POST /admin/seed-demo` call (T-14).
- `score_floor` and `dashboard_url` — you report what the tool returned; you do not compute or adjust them.
- Do not touch: `apps/**`, `packages/**`, `subgraph/**`, `contracts/**`, any other section of `docs/spikes/RESULTS.md`, root configs.

## 4. Owned paths
```
docs/spikes/RESULTS.md     # the #Preflight section ONLY
docs/media/preflight-card.png
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `preflight_workers` | deployed MCP server (T-27) | the result shape quoted in §1, served from the live subgraph |
| Studio query URL | `SUBGRAPH_QUERY_URL` (set by T-23) | `workers`/`tasks` queries for the window check |
| `POST /admin/seed-demo` | Task API, `X-Admin-Key` | one extra seeded lifecycle when the window has aged out |
| Demo task type + area, `{active: 4, verified: 1, seeded: 3}` | `demo-data.json` (T-01) | the expected split and the card's copy |
| Preflight card | dashboard (T-26) | renders exactly the tool's numbers |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `#Preflight` RESULTS entry (JSON + median label at capture) | `docs/spikes/RESULTS.md` | prize write-up, the Graph track submission |
| `preflight-card.png` | `docs/media/` | pitch deck, sponsor still, demo video |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-46` — it must print `CLAIMED T-46`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Confirm T-23 and T-27 are **merged** and the MCP server is serving from the live Studio URL, not a fixture (check the response is not byte-identical to `packages/subgraph-client/fixtures/preflight.json`).
2. Call the tool for the demo task type and area; save the raw JSON.
3. Run the window query; compare each counted `lastCompletedAt` against `now − 604800`. Re-seed once via `POST /admin/seed-demo` if needed, then re-run step 2.
4. Check the split is 4 / 1 / 3 and the median label matches `n_real`.
5. Open the dashboard preflight card, confirm every number on it equals the tool's JSON field for field, and capture `docs/media/preflight-card.png`.
6. If the demo phone completes a task during the session, re-run and record the flip.
7. Write the `#Preflight` RESULTS entry; fill the draft PR and run `gh pr ready` with the JSON and the screenshot in the body.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| Tool JSON pasted in the PR | `active: 4`, `verified: 1`, `seeded: 3`, and `median_source` consistent with `n_real` (`"seeded"` when `n_real == 0`, `"real"` when `n_real >= 1`) |
| Window check pasted in the PR | every `lastCompletedAt` counted as active is `>= now − 604800`; the entry says whether a re-seed was needed |
| `docs/media/preflight-card.png` in the PR | the rendered card, and every number on it matches the tool JSON above — same run, same minute |
| `docs/spikes/RESULTS.md` `#Preflight` | names **which of the two median labels** (`seeded` or `n=1 (real)`) was true at capture time |

## 9. Verification commands
```bash
# 1. the tool, against the live subgraph (demo task type + area from demo-data.json)
npx @legwork/mcp call preflight_workers --task_type verify-open --area "$DEMO_AREA" | tee /tmp/preflight.json

# 2. the 7-day window, straight from Studio
curl -s -H "Authorization: Bearer $GRAPH_API_KEY" -H 'content-type: application/json' \
  -d '{"query":"{ workers(where:{seeded:true}){ id seeded lastCompletedAt } }"}' \
  "$SUBGRAPH_QUERY_URL" | tee /tmp/window.json
node -e 'const w=require("/tmp/window.json").data.workers,c=Math.floor(Date.now()/1e3)-604800;
w.filter(x=>x.lastCompletedAt).forEach(x=>console.log(x.id,x.lastCompletedAt,+x.lastCompletedAt>=c?"IN":"AGED OUT"))'

# 3. only if a counted worker aged out — one lifecycle, never a wider window
curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "$API_BASE_URL/admin/seed-demo"

# 4. the card must not be the fixture
diff <(jq -S . /tmp/preflight.json) <(jq -S . packages/subgraph-client/fixtures/preflight.json) >/dev/null \
  && echo "FAIL: served from the fixture" || echo "OK: live"
```
Expected: `4 / 1 / 3`; every counted timestamp `IN`; step 4 prints `OK: live`.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate).
- **Never present a seeded median as measured.** When `median_source` is `"seeded"` the card, the RESULTS entry and every caption say `seeded`; **never claim the seeded workers are people**. The split is written "4 active · 1 verified · 3 seeded", never "4 workers".
- **The number that goes on screen is the one the tool returned.** No rounding, no nudging, no re-running until a nicer number appears, no editing the PNG. If the tool says 3 active, the card says 3 active and RESULTS says why.
- If the window has aged out, re-seed one lifecycle through `POST /admin/seed-demo`. Widening the 7-day window, editing `sinceTs`, or pointing the tool at a fixture is a failure of this task, not a workaround.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git. `GRAPH_API_KEY` and `ADMIN_API_KEY` never appear in the PR body, the RESULTS entry or the screenshot — crop or scrub the terminal before capture.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted). **This task is L-class and does touch the live subgraph, the live MCP server and one admin route by design** — that is scoped to the manual commands in §9, run by hand from the operator's shell. It adds no automated test and nothing here runs in CI.
- The screenshot shows the dashboard only. No coordinate, no nullifier, no buyer token, no worker's face.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed — no other section of `docs/spikes/RESULTS.md` touched.
- [ ] Verification output from §9 pasted into the PR, key-scrubbed, alongside `preflight-card.png`.
- [ ] The `#Preflight` entry names the median label true at capture time.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-46 — Verify preflight_workers against the live subgraph
owned-paths:
  - docs/spikes/RESULTS.md   (#Preflight section only)
  - docs/media/preflight-card.png
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 evidence pasted · §9 output pasted below
Tool JSON: <paste>   Median label at capture: seeded | n=1 (real)   Re-seed needed: yes | no
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- Split is not 4 / 1 / 3 → file against T-27 (reduction) or T-09 (mappings) with the raw JSON and the Studio query beside it; do not adjust the card copy to match a different number.
- `median_source` disagrees with `n_real` → T-27, blocking.
- The subgraph is behind the chain head → T-23, blocking; a stale index makes every number here meaningless.

## 14. Reviewer notes
Open the tool JSON and the screenshot side by side first: every visible number must appear in the JSON, and the timestamps must sit within a minute of each other. Then check step 4 of §9 actually ran — a card served from `fixtures/preflight.json` looks perfect and proves nothing. Then read the caption and the RESULTS entry for the one failure that matters: a `seeded` median described as a measured one, or "4 workers" where the honest line is "4 active · 1 verified · 3 seeded".

## 15. Round 2+
—
