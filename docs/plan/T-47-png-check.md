---
id: T-47
title: PNG check — read the composited 1280×720 frame at arm's length, cut cards
lane: D
day: 8
size: S
agent_class: L                        # operator + lead: needs the live deployment, the phone recording and eyes
must: true
depends_on: [T-43]
owned_paths:
  - docs/spikes/RESULTS.md            # the "## Legibility" section only; other sections untouched
  - docs/media/present-1280x720.png
labels: [area:docs, wave:8, size:S, agent:local]
branch: t-47/png-check
---

# T-47 — PNG check

## 1. Context
Every legibility rule so far was declared (T-10), measured in demo mode (T-39) and polished (T-43). None of that is the delivered frame: the video composites the dashboard in `DATA_MODE=live` with the phone recording as a picture-in-picture, is delivered at 1080p and is mostly watched at 720p on a laptop. This task is the human check the pack demands: export one 1280×720 PNG of the exact composited frame, read it at arm's length, and if anything the narration names is not legible, cut a card with T-43's `hide=` and export again. The decisions are recorded so the shoot films exactly the frame that was read, and the PNG is committed as evidence. Operator does the export and the read; the lead confirms the read and merges.

> 05-demo-video: "**Test, don't assume:** on Day 7 export one PNG of the exact composited frame at 1280×720 and read it at arm's length. If '+20 seeded (demo data)' is not legible, cut a card." · "The phone recording shows the verification completing and the 'verified human ✓' chip before claim, and the photo + GPS + timestamp before submit. No face, no name." · Cut table: "Dashboard polish → Present mode with three cards; the phone carries more of the frame."

> DESIGN-SPEC, floors: "Nothing the narration mentions renders below **24 px** in the delivered 1080p frame; the honesty chips, the refusal class + reason line, the escrow states and the three preflight numbers are **≥ 32 px** at design size. Phone UI: 16 px body, **20 px floor** for anything narrated. The escrow meter and one feed row sit inside a centre column that survives a 9:16 crop."

## 2. Exact scope
- Preconditions (operator): API + dashboard deployed with `DATA_MODE=live`; a rehearsal task posted by the demo agent, refused sibling marked, claimed by the filmed worker account, submitted and released on Base Sepolia (the Day-7 rehearsal); the phone screen recording of that rehearsal (hands and phone only — no face, no name, never the payout-key screen).
- Dashboard frame, 1920×1080, production build, no browser chrome: `pnpm exec playwright screenshot --browser chromium --viewport-size=1920,1080 --wait-for-timeout=5000 "https://<dashboard>/present?task=<rehearsal task id>" dashboard-released-1920x1080.png` — run from `apps/dashboard` after `pnpm --filter @legwork/dashboard e2e:install`. The `?task=` pin is mandatory (a stray task must not become the featured one). Capture it when the meter reads `RELEASED 3.00 → worker · +0.45 fee` with `proof ✓`. Capture a second frame for the refusal beat (meter `LOCKED 3.45`, mark counter `1`, screening line `REFUSED · authentication circumvention · …`) as `dashboard-refusal-1920x1080.png` — read, attached to the PR, not committed.
- Phone frame: extract the paid-state frame from the recording — `ffmpeg -ss <hh:mm:ss.ff> -i phone.mov -frames:v 1 phone-paid.png` — the frame where `Released · 3.00 USDC` sits **below the proof photo** with `testnet USDC — not spendable`; and the pre-claim frame with `Verified human ✓ · sandbox` for the refusal composite.
- Composite exactly as the edit will: PiP height ≥ 360 px (one third of 1080; start at 480), 60-px inset, bottom-right (over row 3's slot), rounded corners are the phone's own: `ffmpeg -i dashboard-released-1920x1080.png -i phone-paid.png -filter_complex "[1:v]scale=-2:480[pip];[0:v][pip]overlay=x=W-w-60:y=H-h-60" -frames:v 1 composite-released-1920x1080.png`. Downscale like the player will: `ffmpeg -i composite-released-1920x1080.png -vf scale=1280:720:flags=lanczos docs/media/present-1280x720.png`. Same for the refusal composite (PR attachment only).
- Read at arm's length: open `docs/media/present-1280x720.png` in a browser tab at 100 % zoom (on a Retina Mac this shows 1280 CSS px wide — the size of a 720p embed), sit 60–70 cm from the screen, no zooming, no squinting, about five seconds per item. Two readers when possible (operator + lead); a disagreement is a fail.
- Checklist (each line pass/fail into §8's table): (1) `+20 seeded (demo data)` on the pool chip; (2) the refusal class `authentication circumvention` **and** its one-line reason (refusal composite); (3) the three preflight numbers `4 · 1 · 3` with their labels `active · verified · seeded`; (4) the meter's `LOCKED 3.45` (refusal composite) and `RELEASED 3.00 · +0.45` (released composite) with `proof ✓` beside the released amount; (5) the mark counter `1` and the `task-refused:` line; (6) the wall clock and `t+mm:ss since posted` readable and identical on both composites' dashboards within the elapsed difference; (7) the phone's `Verified human ✓` chip and `Released · 3.00 USDC` readable inside the PiP; (8) no face, no name, no key, no seed phrase anywhere; (9) no URL, path, address bar, tab strip, dev overlay, cursor, OS menubar, `DEMO DATA` chip (live!) or `· local` clock suffix in frame; (10) the pool chip still reads `1 real · +20 seeded (demo data)` in live mode and at least two `seeded` chips are visible; (11) the meter and row 1 lie inside x 437–843 of the 1280-wide PNG (the 9:16 band — `nineSixteenBand(1280, 720)`), check with a ruler overlay or `ffmpeg -vf drawbox=x=437:y=0:w=405:h=720:color=white@0.3`; (12) the PiP does not cover any narrated element.
- Decision rule: a dashboard item fails → cut in this order and re-export: `row3` → `row2` → then only a narrated card, which also changes the narration (record the sentence to drop; 05's cut table applies). Item (7) fails → grow the PiP (`scale=-2:560`, then 640) before cutting anything, then cut `row3`/`row2` to clear the space it covers. Item (12) fails → move or shrink the PiP toward 360, or cut the covered row. Every re-export is read again from the start.
- Record in `docs/spikes/RESULTS.md` under `## Legibility` (create the section if absent; touch nothing else in the file): date, rehearsal task id and the four tx short hashes, dashboard URL pattern used (`/present?task=…&hide=…`), PiP height and position, the checklist table with pass/fail per item per composite, reader(s) and distance, the final `hide=` list (may be empty), the narration deltas, T-39's latest `floors.json` minima (24 → n px, 32 → n px at 720p), and the line `frame read: <date> · filmed with the same URL`.
- Commit `docs/media/present-1280x720.png` (the final released composite, ≤ 2 MB) and hand the final `hide=` list to the shoot script and to T-48 — the frame that was read is the frame that gets filmed.

## 3. Out of scope
- Any code change. A failing floor is fixed by cutting a card (`hide=`) here or, if the cut alone is not enough, by a `BLOCKED:` to T-43 — never by editing components, CSS or the floors. The video edit itself, narration text (T-44/T-48), the pitch deck, `docs/media/*` other than the one PNG.
- Do not touch: `apps/**`, `packages/**`, `docs/spikes/RESULTS.md` outside `## Legibility`, `.github/**`.

## 4. Owned paths
```
docs/spikes/RESULTS.md   (section "## Legibility" only)
docs/media/present-1280x720.png
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `/present?task=<id>&hide=agent,supply,screening,row2,row3&crop=1` | T-43 `app/(present)/present/page.tsx` | pin + cuts; `&crop=1` only while aligning, never in a captured frame |
| `EscrowMeter` `data-state`, `data-transitions`, `proof ✓ <captured_at>` in the released line | T-43 / T-10 | the released frame must show `data-transitions="1"` in devtools before capture — one movement happened |
| `DATA_MODE=live` adapter, `?task=` featured pin, no `DEMO DATA` chip in live | T-26 `lib/data/live.ts` | the live frame |
| `nineSixteenBand(1280, 720) = { left: 437.5, right: 842.5, width: 405 }`, `artifacts/floors.json` | T-39 `e2e/lib/crop.ts`, latest CI run | the band and the measured minima you record |
| `Released · 3.00 USDC` below the proof photo, `Verified human ✓ · sandbox` compact chip above the fold | T-33 `PaidState`, T-24 `VerifiedChip` | the two phone frames |
| `ffmpeg`, `pnpm exec playwright screenshot`, a browser | operator machine | `brew install ffmpeg` if missing |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| The final `hide=` list and PiP size | `docs/spikes/RESULTS.md#Legibility` | the shoot (05), T-48 submission content, T-44 terminal inserts (same frame layout) |
| `docs/media/present-1280x720.png` | repo | README (T-49 may embed it), submission gallery (T-48) |
| Narration deltas from any narrated cut | same section | T-48 |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-47` — it must print `CLAIMED T-47`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read T-43's `app/(present)/README.md`, T-39's `e2e/README.md`, the latest `floors.json`, and the rehearsal task id + tx hashes from the Day-7 log.
2. Capture the two dashboard frames (released, refusal) with the pinned URL; check `data-transitions="1"` on the released page in devtools before the released capture; confirm no `DEMO DATA` chip and no `· local` suffix.
3. Extract the two phone frames; verify no face/name/key on each.
4. Composite both; downscale both; read the released one first, then the refusal one; fill the table.
5. Apply the decision rule; re-export and re-read until every line passes or a narrated cut is accepted by the lead.
6. Write `## Legibility`; commit the PNG; fill the draft PR and run `gh pr ready` with both 720p composites inline and the checklist table.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `file docs/media/present-1280x720.png` | `PNG image data, 1280 x 720` |
| `du -k docs/media/present-1280x720.png` | ≤ 2048 kB |
| `grep -c "^## Legibility" docs/spikes/RESULTS.md` | `1`; the section contains a table with the twelve checklist lines, each `pass`, plus `hide=` and PiP lines |
| `git diff --stat origin/main` | exactly two paths changed: the PNG and `docs/spikes/RESULTS.md`; the diff of `RESULTS.md` touches only lines inside `## Legibility` |
| Read (two readers) | all twelve checklist items pass on the committed PNG; the refusal composite passes items 2, 4 (LOCKED), 5, 7 (chip), 8, 9 in the PR attachment |
| CI `banned-words`, `secrets` | green on the PR (the section quotes no banned string; no key, URL with token, or address appears in the PNG or the text) |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
file docs/media/present-1280x720.png && du -k docs/media/present-1280x720.png
grep -n "^## Legibility" docs/spikes/RESULTS.md && sed -n '/^## Legibility/,/^## /p' docs/spikes/RESULTS.md | grep -c "| pass |"
git diff --stat origin/main -- . | tail -3
```
Expected: `1280 x 720`, size ≤ 2048 kB; section found; ≥ 12 `pass` cells; two files in the stat.

## 10. Hard rules
- Banned words anywhere in the section or the PR: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. If any of them is visible in a captured frame, the frame fails and the source task gets a `BLOCKED:`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45**. The released frame shows `3.00` and `0.45` on the dashboard and `3.00` on the phone; a frame showing any other derived figure fails.
- No secrets in frame or text: no `ADMIN_API_KEY`, no relayer/buyer/worker address bar, no payout key or backup screen, no signed proof URL (`?t=` receipt links never appear); nothing secret was ever under `NEXT_PUBLIC_*`, so nothing in the shipped page can leak into the frame — still scan the PNG by eye for the words `key`, `secret`, `0x` outside the tx chips.
- Live only: `DATA_MODE=live` (no `DEMO DATA` chip) — yet the pool chip reads `1 real · +20 seeded (demo data)` and every seeded row carries `seeded`, because the seeded workers and tasks are seeded onchain and say so.
- Leiria only (the shop, the area chip, the rounded coordinate on the receipt); the verified chip is above the fold on the phone frame; the paid state sits below the proof photo; the escrow never reads RELEASED without `proof ✓` beside it; the refusal frame's meter still reads `LOCKED 3.45` — a refused task moves no money.
- No faces, no names, no emoji, no gradients; hands and a phone only; the PiP is the phone screen, not the person holding it. Hit targets ≥ 44 px are the phone tasks' rule; here you only confirm the SUBMIT and CLAIM blocks look tappable in the PiP.
- Nothing copied from `pitch/` or `design-system/`: the PNG is a capture of the shipped product, not a mock.
- Phone floors (verbatim): "Phone UI: 16 px body, 20 px floor for anything narrated" — measured on the phone; in the PiP the narrated chip and paid line must still be readable at arm's length, which is why the PiP grows before any dashboard card is cut.
- The ten hard rules (verbatim): (1) The three locked copy blocks (tagline, claim, trust model) are reproduced exactly. (2) Never show escrow releasing without a proof above or beside it; never show a refusal moving the escrow meter — "a refused task moves no money". (3) The tag is `task-refused` (never "violation"); the name is Legwork. (4) Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia. (5) "Bot-proof, not fraud-proof"; "bounded, attributable work"; never "trustless". (6) No faces anywhere — the worker is hands and a phone. (7) Locations are Leiria. Never Brooklyn, never "24h". (8) The filmed worker account shows only what it actually earned. (9) Every seeded row — worker or task — carries a `seeded` chip; the pool reads "1 real · +20 seeded (demo data)". (10) Fee figures are **3.45 / 3.00 / 0.45** (agent pays / worker receives / fee) on every surface; no deducted-fee numbers anywhere.
- Rule (8) in the PiP: the phone's earnings or paid state shows only the rehearsal's real release; if the recording shows a seeded balance, it is the wrong account — re-record.

## 11. Definition of done
- [ ] Every row in §8 holds; the twelve checklist lines pass on the committed PNG.
- [ ] CI green: `banned-words`, `path-ownership`, `commit-trailers`, `secrets` (the others do not run on docs-only changes; if they do, they pass).
- [ ] Only the two paths in §4 changed; `RESULTS.md` changed only inside `## Legibility`.
- [ ] Verification output from §9 pasted into the PR; both 720p composites inline in the PR.
- [ ] The final `hide=` list and PiP height posted in the shoot channel and referenced by T-48.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>` (here mostly `human read and decided`).

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-47 — PNG check
owned-paths:
  - docs/spikes/RESULTS.md   (## Legibility only)
  - docs/media/present-1280x720.png
Scope confirmed: both composites read · twelve items pass · hide=<list or none> · PiP <n> px · readers <names> · distance <cm>
Narration deltas: <none | sentence(s) dropped>
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need>` on the PR and stop. A narrated element that fails even after `row3` and `row2` are cut → `BLOCKED: <element> <n>px at 720p after hide=row2,row3 (T-43)` with the composite attached — T-43 adjusts its CSS within the floors; never patch here. The API down (`· local` suffix or empty feed) → `BLOCKED: live API` to the lead; do not capture in demo mode and pass it off as live.

## 14. Reviewer notes
Open the PNG at 100 % first and do the read yourself before reading the table. Then check: `?task=` pinned (featured is the rehearsal task, not a stray), no `DEMO DATA`, `proof ✓` beside `RELEASED`, PiP ≥ 360 px and not over a narrated element, the band check for the meter and row 1, and that `RESULTS.md` changed only inside the section. Most likely wrong: a Retina capture at 2× (3840×2160 source scaled down looks sharper than the delivered frame — the Playwright command avoids it); the refusal composite skipped; a cut made without re-reading; `hide=` recorded but not handed to the shoot.

## 15. Round 2+
—
