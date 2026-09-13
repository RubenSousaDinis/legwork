# Demo video — the shot list, the words, and the screens

For the recording on 2026-09-13. Target **3:20**, never past **3:45** — ETHGlobal rejects a video
under 2:00 or over 4:00 automatically. Delivered at 1080p (the floor is 720p), watched at 720p.
The Bazantic clips are separate screen recordings with their own notes
(`docs/bazantic-demo-script.md`); their URLs go into the submission description.

Every sentence below obeys the ten hard rules in `DESIGN-SPEC.md`: the tagline and the trust
model are quoted verbatim, the tag is `task-refused`, the money is 3.45 / 3.00 / 0.45 on every
surface, the location is Leiria, and no face is ever in frame — the worker is hands and a phone.

## The rules that bind this recording

Read from https://ethglobal.com/events/ethonline2026/info/details on 2026-09-13. The first
column is the rule as written; the second is what it means for this shoot.

| ETHGlobal says | Here |
| --- | --- |
| Submission deadline "Sunday, September 13th 2026 at 12:00 pm EDT"; late submissions are not accepted | **16:00 UTC · 17:00 Lisbon.** Working backwards: form filled by 15:30 UTC, upload finished by 15:00, export by 14:00, edit from 12:30, record between 10:30 and 12:00. |
| "2-4 minute demo video"; under 2 or over 4 minutes is "automatically rejected" | Cut to 3:20 ± 10 s. Never trim below 2:00 to fix something. |
| Resolution minimum 720p, the upload fails below it | Export 1920×1080. |
| "No speed-ups to fit time limits" | Skip waiting with a cut, never with a faster clip. The walk in beat 5 is a cut, not a time-lapse. |
| "No AI voiceovers or text-to-speech" · "No music with text descriptions replacing narration" | Your own voice, recorded over the cut. The captions from `pnpm --silent --filter scripts inserts -- --print-captions` are an overlay, not a replacement. |
| "No mobile phone recordings" | The app is never filmed with a camera. The phone's UI is a **screen recording**, mirrored to the laptop and captured there (rig B). Camera footage is only the few seconds of door, sign and hands in beats 1, 5 and 7. |
| Introductions "no more than 20 seconds" | Beat 0 is 12 seconds and already the tagline. |
| Slides with "no more than 4 bullet points per slide" | Deck board 9, the only board used, has four lines. |
| "Show project functioning" | Beats 3, 4, 6 and 7 are the live deployment doing the work; nothing is mocked. |
| Up to 3 partner prizes | World (Selfie Check), The Graph (AI, From Scratch), Bazantic (Agentify; Best Recipe once its recording exists). |
| The Graph: "Consume live data from a Graph provider, for example querying Subgraphs with an API key from Subgraph Studio … Mocked, local-only, or static datasets do not qualify" | Beat 2 must show the preflight numbers arriving from the subgraph and name The Graph out loud — it does. |
| World: "Uses Selfie Check or a Selfie Check-compatible World ID credential flow in a meaningful way … as a risk, eligibility, fairness, continuity, or abuse-prevention signal" · "Shows a working app" · a feedback document with the four named sections | Beat 4 shows the IDKit flow working. Say "Selfie Check" only if the claim-time check is on camera (§0). `FEEDBACK-WORLD.md` must be on `main` with E10–E12 before the form is filled. |
| Bazantic: a recipe "within your hackathon project" and "a screen recording that is part of your submission" | `examples/recipes/overpass-*` and `FEEDBACK-BAZANTIC.md` are still untracked in the main worktree — commit and push them, and put the Bazantic recording URLs in the description. |
| AI tools: "Clearly document … which parts of the code, specific files, or assets were generated or assisted by AI"; "all spec files, prompts, and planning artifacts in your submission repository" | `docs/AI-USAGE.md` is the compiled record — regenerate it after today's commits so the count is current; `docs/plan/`, `examples/prompt.md` and the classifier prompt are already in the repo. Name your own work in the description: the product decisions, every phone run, the shop, the reviews. |
| "From Scratch": "Any prior project-specific code, designs, or assets are not allowed unless they're from public libraries or starter kits" | The README discloses a dated, public pre-kickoff planning pack, a pitch deck and a static mockup, and states no code or stylesheet from them is in the repo. Keep that sentence verbatim in the description; it is the honest answer to this rule. |

## 0. The stage as it stands (2026-09-13 01:50 UTC)

| What | Where it shows | Value now |
| --- | --- | --- |
| Featured escrow | `/present`, `/live` | task **41** — `RELEASED 3.00 → worker · +0.45 fee · proof ✓` (the seeded CLI worker's rehearsal from 00:29 UTC) |
| Feed | `/live` | task 41, one unmarked refusal (a `/check` dry run at 00:30 UTC), 29 seeded board rows across ten cities |
| Agent card | `/present`, `/live` | `#8004-9196 · 6 tasks paid on proof · 0 marks` |
| Worker pool | `/live` | `1 real · +23 seeded (demo data)`; the real one is `w-5810`, the demo phone, `2 min (real)` |
| Preflight, cell `ez1dn` | Supply card, `preflight_workers` | `3 active · 0 verified · 3 seeded · median 1 min (real, n=1)` |
| Refusal wall | `/refusals` | `authentication circumvention 1` (the dry run; `marked: false`) |
| AbuseMark | chain | `markCooldown` 86400 s · `lastMarkAt(9196)` 0 · `marksOf(9196)` 0 |
| Buyer wallet | chain | 8.20 USDC — two more 3.45 posts; a refused post costs nothing |
| Credential on the live build | mini-app, API `/config/world` | **Orb** at registration. No Selfie Check at claim on `main` — the uncommitted work in the main worktree adds it, and World answered `environment_mismatch` on 2026-09-13 |

Two things follow from that table.

- **The first paid refusal in the next 24 hours is the one that marks.** `lastMarkAt` is zero, so
  the take's refusal lands `0 → 1` on camera. A rehearsal through `hire_human` would spend it:
  the same spec is idempotent and a different one hits the 86400-second cooldown. Rehearse the
  refusal scene with `--dry-run` only.
- **Do not narrate Selfie Check unless it is on camera.** The narration below says World ID and
  IDKit. If the claim-time Selfie Check ships before the take, swap in the alternative line in
  beat 4 and nothing else. The dashboard's Vercel env still carries `WORLD_CREDENTIAL_LEVEL=selfie`
  (it renders `World ID · Selfie Check` beside the real worker and the `camera-checked live human`
  claim on `/about` and the deck) while registration is Orb — set it to `orb` and redeploy, or ship
  the claim-time check, before you record the dashboard.

## 1. The one-line story

An agent needs to know whether Pão Doce in Leiria is open. It preflights the worker pool from The
Graph, hires a verified human through x402 with 3.45 USDC locked in escrow on Base Sepolia, is
refused when its principal slips in an abusive errand — and the refusal lands on the agent's own
ERC-8004 record — and pays 3.00 to the worker the moment the proof lands.

## 2. Before you record

Run from a fresh terminal at the repo root, **never in a terminal you will film**:

```bash
set -a; source .env; set +a
export API_BASE_URL=https://legwork-api.vercel.app
```

| # | Check | How |
| --- | --- | --- |
| 1 | API up, live mode | `curl -s https://legwork-api.vercel.app/healthz` → `"ok":true,"data_mode":"live"` |
| 2 | Filmed canvas alive | open `https://legwork-dashboard.vercel.app/present` in the recording browser: the wall clock ticks and has **no `· local` suffix**; the feed rows carry their chips. If the clock stays `--:--:--`, reload the tab in the foreground — a background tab does not hydrate. |
| 3 | Agent card at 0 marks | `/present` → `AGENT #8004-9196 · 0 marks`. If it reads 1, the take's refusal will not mark for 24 h (see §0). |
| 4 | Pool chip | `1 real · +23 seeded (demo data)` on `/live`; after the fixes PR merges, the landing and `/about` say the same |
| 5 | Wallets | buyer ≥ 3.45 USDC, relayer > 0.05 ETH (`pnpm demo:run` refuses to start otherwise) |
| 6 | Phone | World App signed in on the demo phone; Legwork opens; the header reads `Verified human ✓ · World ID · Orb`. Do **not** reset the worker unless you want the verification itself on camera — `resetWorker` deletes the binding and the pool reads `0 real` until you register again. |
| 7 | Credential chip | decide §0's second point |
| 8 | Rehearsal, dry | `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT pnpm --filter @legwork/examples agent -- --scene hire --dry-run` and the same with `--scene refusal --dry-run`. Nothing is posted, nothing is paid, nothing marks. |
| 9 | Pre-record checklist | `pnpm --silent --filter scripts inserts -- --print-checklist` — keys out of scrollback, notifications off, clocks agree, 1080p export |
| 10 | Do not `demo:reset` | it empties the feed, the board and the refusal wall (that is how the dashboard went blank on the 11th). A second take is just another post — the buyer has the USDC for two. If you must reset: `pnpm demo:reset`, then `POST /admin/seed-demo` with `X-Admin-Key`, then `pnpm demo:run` — about ten minutes. |

**Geography.** A claim may start within **2 km** of the place and the proof photo must be taken
within **150 m** of it; the claim window is 30 minutes from the claim and the submit window
60 minutes from the post. So: be at Pão Doce with the phone *before* the agent posts. Bring the
laptop (tethered to a second phone, not the worker's) so the dashboard records while the meter
moves — beat 7 is one uncut shot of both.

## 3. The rig

| Recording | What | Settings |
| --- | --- | --- |
| A — dashboard | Screen capture of one browser window on `https://legwork-dashboard.vercel.app/present?task=<id>` | 1920×1080, fullscreen or kiosk, no address bar, no tab strip, no cursor. Start it right after the post, once you have the id. Runs until after the release. |
| B — phone | The phone's screen, mirrored to the laptop and captured there: QuickTime → File → New Movie Recording with the iPhone on USB, or `scrcpy --record phone.mp4` for Android | Portrait, native resolution. A mirrored capture is a screen recording, which is what the rules allow; the phone's own screen recorder is the fallback (still a screen recording, never a camera). Starts before `Login with World ID`, stops after `/earnings`. Never the payout-key screen, never a name. Composited as the picture-in-picture, bottom-right, **560 px** tall, 60 px inset (the read frame in `docs/spikes/RESULTS.md` `## Legibility`). |
| C — camera | A second phone or a webcam for B-roll only | The hours listing on a screen, the shop door and its hours sign, hands framing the phone in front of the storefront, feet walking. A few seconds per beat, no faces. The demo itself is only ever a screen recording. |
| T — terminal | The agent loop, then the two insert cards | Dark theme, 24–28 pt, no prompt path, no URL. The cards: `pnpm --silent --filter scripts inserts -- --insert hire --hold 3` and `… --insert refusal --hold 3`, full screen, three seconds each. |

Other dashboard pages you will cut to, each recorded for ten seconds on their own: `/`, `/agents`
(the install line), `/refusals`, `/task/<id>` (the receipt), `/deck` boards 2 and 9, and the
Basescan page of the release transaction (the `release ↗` link on the receipt).

## 4. The shot list

Times are targets. The **screen** column is where you are; **you do** is the action; **you say**
is read as written. Bold in the last column is what must be legible in the frame.

| Beat | Time | Screen | You do | You say | Must be in frame |
| --- | --- | --- | --- | --- | --- |
| 0 | 0:00–0:12 | Dashboard `/` | Hold the landing, then the door B-roll for the last words | Software can read every page on the internet and still not know whether the bakery on Rua do Cruzeiro is open right now. Legwork is where an AI agent pays a real person to go and look. Agents hire verified humans for the legwork software can't do. Escrow releases on proof. | the tagline |
| 1 | 0:12–0:25 | B-roll: the hours listing, then the door | Cut listing → door | This is Pão Doce, in Leiria. Every hours listing for it disagrees with the next one. The only way to know is to stand at the door. | the listing's hours, the sign on the door |
| 2 | 0:25–0:45 | Terminal: the agent loop, `preflight_workers` result | Run the hire scene (§5); pause on the preflight JSON | An agent gets that question from its principal. Before it spends anything it asks Legwork who could take the errand. The numbers come from our subgraph on The Graph: three workers in this cell, all three seeded and labelled as such, and one real completion behind the median. The agent is told what is demo data before it pays. | `n_real`, `median_source: "real"`, `seeded: 3` |
| 3 | 0:45–1:05 | Terminal insert `hire`, then dashboard `/present?task=<id>` | Show the hire card three seconds; cut to the meter | It posts a typed errand — verify-open, not free text — and pays through x402. Three USDC for the worker plus a forty-five cent fee: three forty-five, locked in the escrow contract on Base Sepolia before anyone can claim. The agent is the refund party. | `402 payment_required · 3.45`, `201 { task_id }`, meter **LOCKED 3.45** |
| 4 | 1:05–1:40 | Phone: `Login with World ID` → IDKit → `Verified human ✓` → the board → the Pão Doce card → CLAIM → the claimed card | Log in (or show the signed-in header), scroll the board past a seeded row, open the card, tap CLAIM | On the phone, a worker verifies once with World ID through IDKit: one nullifier, one account. The board lists open errands nearest first; seeded rows say so and cannot be claimed. Claim. Legwork relays the claim and pays the gas — a worker never needs ETH. Both clocks are the API's. | `Verified human ✓ · World ID · Orb`, a `seeded` chip, **CLAIM**, `relayed claim · gas paid by Legwork`, the countdown |
| 5 | 1:40–1:50 | B-roll feet; dashboard timer | Cut between the walk and `t+mm:ss since posted` | The money is locked. The worker walks. | the timer counting |
| 6 | 1:50–2:25 | Terminal: the injected note highlighted → insert `refusal`; dashboard: screening log, agent card, meter | Run the refusal scene (§5) while the worker is walking; show the card three seconds; cut to `/present` | Meanwhile the principal slips in a second errand: call the pharmacy and have them read back the six-digit code they were just sent. The agent posts it exactly as asked. Legwork refuses it at the API — authentication circumvention, one of six documented abuse classes — before any money moves, and writes task-refused to the agent's public ERC-8004 record. Zero marks becomes one. The escrow meter does not move: a refused task moves no money. And the agent does not rephrase and retry; it reports the refusal. | `REFUSED · call-confirm · authentication circumvention · deny.auth`, **`1 marks`**, the feed row's `no money moved`, meter still **LOCKED 3.45** |
| 7 | 2:25–3:05 | Phone `/proof/<id>` → SUBMIT; dashboard meter (one uncut shot) | Hand frames the hours sign, take the photo, take the fix, answer, SUBMIT; hold on the meter until it turns | At the door: one photo of the hours sign, the location, a timestamp from the API's clock, and the answer. The photo is re-encoded on the phone, stripped of metadata and hashed; the hash goes on chain. Submit. The agent approves the proof and the escrow releases: three USDC to the worker, forty-five cents to the treasury. One movement, never without the proof beside it. | `Take the photo`, `±<n> m` (or the `GPS unavailable in webview — disclosed` chip), **SUBMIT**, `Submitted · waiting for release`, meter **LOCKED 3.45 → RELEASED 3.00 → worker · +0.45 fee · proof ✓**, phone `Released · 3.00 USDC` below the photo |
| 8 | 3:05–3:25 | Dashboard `/task/<id>`, Basescan release tx, the agent card, phone `/earnings` | Scroll the receipt; click `release ↗`; back to the card; phone earnings | Both records move. Worker reputation is keyed to the World ID nullifier, not a wallet. The agent's ERC-8004 record now carries paid-on-proof and one task-refused mark, written by the Task API against the identity that paid. Every hash on the receipt is a link. | `hash matches onchain ✓`, four tx links, `7 tasks paid on proof · 1 marks`, `released to you 3.00 testnet USDC` |
| 9 | 3:25–3:40 | Dashboard chips on `/live`; `/deck` board 9 | Hover the chips; cut to board 9 | What you saw: one real worker and twenty-three seeded rows, every one labelled. Testnet USDC. Operator-attested marks. Verification proves a live, unique person — not that they are honest or competent. Legwork's guarantee is bounded, attributable work. Bot-proof, not fraud-proof. | `1 real · +23 seeded (demo data)`, `testnet USDC — not spendable`, `operator-attested`, board 9's four lines |
| 10 | 3:40–3:55 | Dashboard `/agents` → `/` | Hold on the install line; end on the tagline | Hosted MCP to read and approve; the local server pays. Six tools, four task types, one contract family on Base Sepolia. Legwork — real-world verification for AI agents. A real person, a real task, paid on proof. | the install line, the tagline |

**Beat 4, if the claim-time Selfie Check is live on the phone you film:** after "Claim." say
"Claiming asks for a second proof — a Selfie Check — that a live person is behind the phone, not a
second uniqueness credential." and keep the rest.

The submission form wants timestamps for beats 1, 6 and 7 — note them from the final cut.

The narration is about 510 words — 3:25 at 150 words a minute, 3:40 at 140. Time a read-through
with a stopwatch before the edit. If the cut runs past 3:45, drop these first, in this order: beat 5's line ("The money is locked. The worker walks."), beat 2's
last sentence, then beat 8's last sentence. Never cut below 2:00 and never speed a clip up —
both are automatic rejections. Beat 0 is the introduction and stays under 20 seconds.

## 5. The commands, in the order you run them

```bash
# 1. post — the agent preflights, hires through x402 and then long-polls task_status
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT \
  pnpm --filter @legwork/examples agent -- --scene hire --transcript /tmp/take-hire.md
#    read the task id off the hire line, then open the filmed canvas and start recording A:
#    https://legwork-dashboard.vercel.app/present?task=<id>

# 2. phone: claim (within 2 km), walk to the door

# 3. while the worker walks — the refusal, once, for real (it marks 9196)
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT \
  pnpm --filter @legwork/examples agent -- --scene refusal --transcript /tmp/take-refusal.md

# 4. phone: photo, fix, answer, SUBMIT — the hire loop from step 1 approves when the proof lands

# 5. the two three-second cards, filmed on their own
pnpm --silent --filter scripts inserts -- --insert hire --hold 3
pnpm --silent --filter scripts inserts -- --insert refusal --hold 3
```

The hire loop has 24 turns; at `wait_seconds=50` that is roughly fifteen minutes from the post
to the proof. If the loop ends on `error_max_turns` before the proof lands, nothing is lost: the
task is still open and funded. Approve from the dashboard's `/admin` (paste the admin key, the
task id, `approve`), or simply keep the phone on the board — its poll runs the sweep, and the
demo dispute window is **120 seconds**, after which the escrow auto-releases without anybody's
approval. Both paths show the same `RELEASED 3.00` on the meter.

The deterministic alternative to step 1 is `pnpm demo:run --no-worker`: it posts the same errand
and waits for the phone, then approves and prints `RELEASED`. Use it if the Agent SDK loop will
not start; it has no preflight and no refusal scene, so beats 2 and 6 then come from the insert
cards alone.

## 6. If something goes wrong

| It happens | Do | Say |
| --- | --- | --- |
| The clock on `/present` shows `· local` | Reload in the foreground; if it stays, the API is down — `/healthz` first | nothing; do not film it |
| CLAIM is disabled with a distance line | You are more than 2 km from the place; move closer, the button enables on the next 3-second poll | — |
| `Selfie Check first` under CLAIM | The claim-time check shipped; complete it (World App or the Sandbox QR) | the beat-4 alternative line |
| No GPS fix on the phone | Take the disclosed path: the `GPS unavailable in webview — disclosed` chip, tap `I am at the place` | "the location is disclosed as unavailable rather than invented" |
| The refusal returns 422 but the mark counter stays 0 | `lastMarkAt(9196)` was not zero — a mark landed in the last 24 h. Film the refusal anyway | "the mark is rate-limited to one per day per agent, on purpose" — and drop "from zero to one" |
| The meter does not turn within 60 s of SUBMIT | Keep the phone on the board; auto-release fires after the 120-second window | hold the shot; the turn is still one movement |
| A take must be repeated | Post again (`--scene hire` or `demo:run --no-worker`); the refusal scene cannot be repeated for 24 h — reuse the first take's footage for beat 6 | — |

## 7. After recording

1. Export ≥ 720p (1080p preferred); check length against the form's limit.
2. `docs/submission.md`: the video URL and the timestamps of beats 1, 6 and 7; replace `<hours>`
   in `README.md` with the worker hours you are willing to promise.
3. If the refusal marked, `docs/spikes/RESULTS.md` `## Legibility` can finally record the refusal
   composite (meter `LOCKED 3.45`, counter `1`, the REFUSED line) — the read that was skipped
   because no sibling was marked.
4. Record the Bazantic clips from `docs/bazantic-demo-script.md`; paste their URLs where that file
   says and into the submission description, because the form has one video field and the
   Bazantic tracks want their recording "as part of your submission".
5. Regenerate `docs/AI-USAGE.md` from the trailers so today's commits are in the count, and push
   everything the tracks point at: `FEEDBACK-WORLD.md` (E10–E12), `FEEDBACK-BAZANTIC.md`,
   `examples/recipes/overpass-*`, `docs/bazantic.md`, `docs/submission.md`.

## 8. If Legwork reaches the finalist round

Seven minutes: four for the demo, three for questions. Play the video or run the live loop, then
answer the three questions ETHGlobal says every judge asks.

| They ask | Say |
| --- | --- |
| What inspired it? | RentAHuman went from a meme to a documented abuse market in one quarter: 787,000 signups, payouts that failed, six abuse classes bought for a median of $25. Agents will keep hiring people; the open question was whether the person is real, whether they get paid, and whether the agent can be held to account. Nobody refused the documented abuse classes at the API or wrote the refusal back to the agent. That empty cell is the product. |
| What tools, and why? | World ID through IDKit for one-person-one-account; x402 so an agent pays without a signup; USDC escrow on Base Sepolia so the money is locked before work starts; ERC-8004 so the agent has a public record a refusal can land on; The Graph so the agent can see the pool before it spends; Claude for the screening classifier that can only add refusals, never overturn the deterministic gate. Every commit carries an AI-usage trailer and CI enforces it. |
| What was hard? | Selfie Check was access-gated until Sept 8 and then returned environment_mismatch at cloud verify, so registration is Orb and the claim-time check is the next pass — documented in the feedback file. x402 settles a block before the escrow locks, so our custody is one block wide and the API says so. And the honest demo: one real worker, twenty-three seeded rows, every one labelled, because a marketplace with one worker cannot show a preflight otherwise. |
