---
id: T-41
title: FEEDBACK-WORLD.md passes — format operator notes + screenshots at the five moments
lane: E
day: 2/4/5/7                          # one PR per pass; each pass is its own dispatch
size: S
agent_class: C
must: true
depends_on: [T-02]
owned_paths:                         # from Day 2 (T-02 owned FEEDBACK-WORLD.md on Day 1 only)
  - FEEDBACK-WORLD.md
  - docs/feedback-world/**
labels: [area:docs, wave:2, size:S, agent:cloud, docs]
branch: t-41/feedback-world-pass-1        # bumped by the lead at each dispatch
---

# T-41 — `FEEDBACK-WORLD.md` passes

## 1. Context
The World "Selfie Check" track ($3,500, one winner) asks for "a detailed feedback document" and the pack's edge is "the feedback doc with error strings and screenshots from hour one". T-02 fixed the structure — the four headings, verbatim from the track text, and the five append moments. This task turns the operator's raw notes and screenshots into dated entries, one PR per pass, at the moments the pack names:

> Appended at five fixed moments, screenshotting every error dialog: Portal app + action creation · spike S2' (the exact credential-level string and payload shape) · the IDKit v4 integration on Day 4 · any sandbox error · the Day-4/5 mini-app build. Genuine findings to record: on-chain verification is Orb-only; camera and location are not requestable mini-app permissions; MiniKit no longer owns `verify`.

Published as a public post on Sept 17 and sent to Mateo Sauton with the video (operator, not this task).

## 2. Exact scope
- Four passes, each one PR labelled `docs` on branch `t-41/feedback-world-pass-<n>`:
  - **Pass 1 · Day 2:** Day-1 material — Portal app + action creation; spike S2' (the exact credential-level string returned, e.g. the `verification_level`/preset name, and the shape of the proof payload with values redacted); the S1 Router probe outcome as seen by a Base Sepolia builder; the Sauton-session answers if the operator noted them.
  - **Pass 2 · Day 4:** the IDKit v4 integration (T-20/T-24): `IDKitRequestWidget`, `rp_context`/`signRequest`, `POST https://developer.world.org/api/v4/verify/{rp_id}`, `selfieCheckLegacy()` → `orbLegacy()` fallback; every error string hit; the walletAuth/SIWE step.
  - **Pass 3 · Day 5:** the Day-4/5 mini-app build (T-25/T-33): camera file input, `getCurrentPosition` in the webview, the GPS downgrade if it fired, the fresh-install → verify → claim timing; any sandbox error.
  - **Pass 4 · Day 7:** any sandbox error since Day 5; the backup World ID run (Day 4 evening); a `## Summary for World` at the end (≤ 12 bullets: the two or three DX gaps, what worked, what was unclear) written from the entries only.
- Entry format (T-02's block, applied to every entry): `**YYYY-MM-DD HH:MM UTC · <moment> · <confusing|missing|broken|hard to test>** — what was tried · what happened (exact error string in backticks) · screenshot `docs/feedback-world/<day>-<nn>.png` · suggestion`. Each entry is filed under exactly one of the four headings; the five moment sub-bullets under heading (1) flip from `— _pending_` to `— see entries <ids>` as they are covered.
- The three genuine findings recorded as entries with their evidence: "onchain World ID verification is Orb-only" (heading 1; evidence: the docs line and the S1 probe outcome from `docs/spikes/RESULTS.md`); "camera and location are not requestable mini-app permissions — only notifications, contacts, microphone" (heading 3; evidence: the permission list and the `/probe` readouts); "MiniKit no longer owns `verify` — World ID verification moved into IDKit 4.x" (heading 1; evidence: the docs banner / migration note the operator saw).
- Screenshots: the operator attaches PNGs to the T-41 issue or commits them under `docs/feedback-world/raw/`; you move/rename them to `docs/feedback-world/<day>-<nn>.png`, crop nothing, and redact (solid black box) any signing key, `rp_id` secret, session token or personal data before commit. Every referenced file exists.
- Never edit the four heading strings, the preamble, or the entry-format block.

## 3. Out of scope
- Creating findings the operator did not report; editing other docs; the Sept 17 publication (operator).
- `README.md`, `docs/spikes/RESULTS.md`, `docs/threat-model.md` (T-37/T-45); `POSTERS.md` (lead).
- Do not touch: anything outside §4.

## 4. Owned paths
```
FEEDBACK-WORLD.md
docs/feedback-world/**
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| Four verbatim headings + entry format + five moment sub-bullets | `FEEDBACK-WORLD.md` (T-02) | you append under them, never restructure |
| Operator raw notes + screenshots | T-41 issue comments / `docs/feedback-world/raw/` | source of every entry; quote error strings exactly |
| S1/S2 outcomes | `docs/spikes/RESULTS.md` | evidence links for the genuine findings |
| `WORLD_CREDENTIAL_LEVEL`, `narrationVariant` | `.env.example` names, `demo-data.json` | names only, never values from a real `.env` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| Dated entries + `## Summary for World` | `FEEDBACK-WORLD.md` | T-48 (submission mentions the doc), the Sept 17 post (operator) |
| Screenshot naming `docs/feedback-world/<day>-<nn>.png` | `docs/feedback-world/` | T-49 README `## Docs` links |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-41` — it must print `CLAIMED T-41`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `FEEDBACK-WORLD.md` as it stands, the T-41 issue comments for this pass, `docs/spikes/RESULTS.md`.
2. For each raw note: pick the heading (1–4), the moment, the severity word; write the entry; copy the error string verbatim into backticks; name and place the screenshot; redact before `git add` (open the PNG and check).
3. Flip the covered moment sub-bullets; on pass 4 write `## Summary for World` from the entries.
4. Run §9; fill the draft PR and run `gh pr ready` titled `T-41: FEEDBACK-WORLD pass <n>` with the list of entries added.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `grep -c '^## (' FEEDBACK-WORLD.md` | still `4`; the four heading strings unchanged (`grep -Fxq` each) |
| `grep -cE '^\*\*2026-09-[0-9]{2} [0-9]{2}:[0-9]{2} UTC ·' FEEDBACK-WORLD.md` | ≥ 1 new entry per pass (pass n total ≥ n) |
| `grep -oE 'docs/feedback-world/[A-Za-z0-9._-]+\.png' FEEDBACK-WORLD.md \| sort -u \| while read -r p; do [ -f "$p" ] \|\| echo "MISSING $p"; done` | no output |
| `grep -Fq 'Orb-only' FEEDBACK-WORLD.md` (pass ≥ 1) · `grep -Fq 'not requestable' FEEDBACK-WORLD.md` (pass ≥ 3) · `grep -Fq 'IDKit' FEEDBACK-WORLD.md` (pass ≥ 2) | the three genuine findings land by their passes |
| `grep -Fq '## Summary for World' FEEDBACK-WORLD.md` (pass 4 only) | summary present |
| `grep -nE 'sk-ant\|PRIVATE_KEY=\|signing_key=\|0x[0-9a-fA-F]{64}' FEEDBACK-WORLD.md; echo $?` | prints `1` |
| `bash scripts/ci/banned-words.sh` | exit 0 |

## 9. Verification commands
```bash
bash scripts/ci/banned-words.sh; echo "banned-words exit=$?"
grep -c '^## (' FEEDBACK-WORLD.md; grep -cE '^\*\*2026-09-[0-9]{2} [0-9]{2}:[0-9]{2} UTC ·' FEEDBACK-WORLD.md
grep -oE 'docs/feedback-world/[A-Za-z0-9._-]+\.png' FEEDBACK-WORLD.md | sort -u | while read -r p; do [ -f "$p" ] || echo "MISSING $p"; done
grep -nE 'sk-ant|PRIVATE_KEY=|signing_key=|0x[0-9a-fA-F]{64}' FEEDBACK-WORLD.md; echo "secret grep exit=$?"
```
Expected: `banned-words exit=0`, `4`, an entry count ≥ the pass number, no `MISSING`, `secret grep exit=1`.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. Write "24 hours" or `86400`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate).
- No secrets: no RP signing key, no session token, no `.env` value, no personal data of the backup worker; screenshots redacted before commit.
- Honesty: write what was observed, in the operator's words, with the exact error string; never soften a "broken" into "confusing"; never invent a finding. Where the credential level fell back, say so plainly: "World ID verification in the sandbox — the same integration surface Selfie Check uses, which is in beta today."
- Standards spelled exactly: World ID, Selfie Check, IDKit, MiniKit, World App, Developer Portal. The heading text keeps the track's own spelling `SelfieCheck` in heading (1).
- "Legwork" never stands alone in the title line (T-02 wrote it paired; keep it).

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes for this pass.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-41 — FEEDBACK-WORLD pass <n>
owned-paths:
  - FEEDBACK-WORLD.md
  - docs/feedback-world/**
Scope confirmed: every §2 bullet for pass <n> done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
Entries added: <ids>  ·  Screenshots: <count>, redacted
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
- No raw notes for this pass → `BLOCKED: operator notes for pass <n>` and stop; do not write from memory.

## 14. Reviewer notes
Open a screenshot at full size and look for unredacted ids/tokens first. Then check the four headings are byte-identical to T-02's. Then read two entries for verbatim error strings (backticks, no paraphrase).

## 15. Round 2+
—

**Dispatch 1 of 4 (Sept 8, lead).** This dispatch is **pass 1**, and it is the only pass in this PR. The operator's raw material is not in this repository and is not yours to invent — it is in three places, all readable from your worktree:

- **GitHub issue #40** (`gh issue view 40 --comments`) — the operator's phone log from the first live run, Sept 7 23:38 Lisbon: World App opening the mini-app from the Developer Portal preview link, the desktop preview link showing a country-availability modal instead, the Selfie Check completing, and the widget then returning the code `verification_disabled` — which is in neither the IDKit error-code reference nor `@worldcoin/idkit@4.2.3` / `idkit-core@4.2.4`, so it comes from the World App bridge. Also: the app appears in World App as its Portal app name with the unverified-app warning triangle.
- **`docs/plan/LEAD-NOTES.md`**, the section "Hosting, the subgraph and the World action" — Portal app and action creation as the operator did it (`app_…`, `rp_…`, the `legwork-worker` action, the staging environment, the credential level), and the later sections for what the first phone run found.
- **`docs/spikes/RESULTS.md`** — `## Identity` for the S1 probe outcome and the Orb-only line; note that `## S2` is still `pending`, so the "exact credential-level string and payload shape" sub-bullet under heading (1) stays `— _pending_` in this pass. Do not write an entry for a spike nobody ran.

Cover in pass 1: Portal app + action creation; the sandbox error `verification_disabled` with its exact string and everything known about where it comes from; the two genuine findings that are already evidenced — "onchain World ID verification is Orb-only" and "MiniKit no longer owns `verify` — World ID verification moved into IDKit 4.x" (evidence: `apps/miniapp/lib/worldid.ts` imports `IDKitRequestWidget` from `@worldcoin/idkit` and the API forwards to `POST https://developer.world.org/api/v4/verify/{rp_id}`).

**Screenshots do not exist yet.** The operator holds three PNGs from the first run and has not committed them. Write no `docs/feedback-world/*.png` path you cannot point at a real file: say `screenshot pending` in those entries instead, and list in the PR body which entries are waiting for an image. A later pass attaches them.


**Dispatch 2+ (Sept 8, lead) — what changed under this brief.** Pass 1 landed as `FEEDBACK-WORLD.md` entries E1–E7; the lead added **E8** (the debug report naming `verification_level: "face"`, and the Portal having nowhere to grant it) and **E9** (Selfie Check is medium-assurance and does not carry one-person-one-account uniqueness, which is the claim our banner makes). Nine entries exist; a later pass renumbers nothing.

The facts a later pass writes from:

- **Selfie Check was never available to us.** It is access-gated; the flag was requested from `developers@toolsforhumanity.com` on Sept 8. Until it lands, the app cannot request the face credential at all, so §2's pass-3 material about the credential in the mini-app build is about **Orb**.
- **Orb verifies end to end.** `POST /idkit/verify` returned 200 on Sept 8 at 11:03 UTC with a Unique Human proof. `docs/spikes/RESULTS.md` `## S2` is filled and is the evidence for the S2' sub-bullet under heading (1), which may now flip from `— _pending_`.
- **Screenshots:** the operator has four to commit under `docs/feedback-world/raw/` — the desktop country modal (E4), the bare code (E5), the silent second attempt (E6), the app name and unverified triangle (E7) — plus today's screen showing the sentence, the code and the debug report (E8). Only entries whose file exists may name one.
- **Sandbox App:** access was requested the same day. The track asks for feedback on Sandbox App states and we have none yet; if it arrives, that is pass 3's material and the honest note otherwise is that we could not exercise it.
