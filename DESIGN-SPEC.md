# repo-seed — `DESIGN-SPEC.md` (draft; T-00 types this into the new repo; lane D implements it)

> Written spec, re-typed from the pre-kickoff design work. **No token file, stylesheet, markup or SVG is copied into the repo** — agents implement these values by hand. The figures below supersede any older draft (there is no "2.55" anywhere; the fee is on top).

## The idea
Legwork = someone actually goes there. The recurring motif is a **route line**: request → route → proof — a dot, a dashed path, a footprint at the end. It appears as dividers, progress bars and the escrow meter, which fills along it. No robots, no handshakes, no shields, no faces — the worker is hands and a phone.

## Two grounds — never mixed within a surface
| | Dashboard + deck (**ink**) | Worker phone (**paper**) |
|---|---|---|
| canvas | `#070808` | — |
| page | `#0D0F0E` | `#FAF9F5` |
| card | `#151816`, 1 px border `#262C28`, radius 12 px, no shadow | `#FFFFFF`, 1 px border `#E4E2DA`, radius 14–16 px, shadow `0 2px 10px rgba(20,22,20,.05)` |
| tag fill / track | `#202522` | `#F0EEE7` |
| chip border | `#2A302C` | `#D8D6CE` |
| hairlines | `#1E2320`, `#1B201D` | — |
| type | `#F1EFE9` primary · `#C9CCC7` body · `#8B918D` muted / unverified / seeded · `#5B615D` dim numerals · `#4A504C` faintest | `#17191B` · `#42564d` · `#6B716D` |

## Semantic palette — non-negotiable
- **Verified / released — the only accent:** `#35C79A` on ink; `#1E9E77` fills and `#137a5b` text on paper; borders `rgba(53,199,154,.5)`, tints `rgba(53,199,154,.1)` / `.08`; on paper `rgba(30,158,119,.45)` / `.1`.
- **Refusal — amber, never red:** `#E4A33F`; border `rgba(228,163,63,.45)`; on paper `#B8860B`. "Refusals are good news."
- **Status-quo red:** `#E5484D` — appears **only** on the "broken status quo" pitch slide; nowhere in the product.
- **Seeded / unverified:** muted gray `#8B918D`.
- No gradients, no blur, no elevation games; hierarchy comes from scale plus the one accent; backgrounds are flat.

## Type (Google Fonts only; no binaries shipped)
- Display / numerals: **Archivo** 700–800, tracking −0.02 em (display) to −0.03 em (numerals).
- UI + prose: **Inter** 400–700.
- Ids, addresses, hashes, contract names, chips, labels: **JetBrains Mono** 400–700; section labels UPPERCASE tracked +0.1 em; status badges UPPERCASE; headlines sentence case.
- Scale (dashboard reads at 720p): hero 150 · stat-xl 84 · stat 56 · stat-sm 40 · h1 64 · h2 24 · body-lg 29 · body-md 18 · body-sm 15 · label 16 · chip 15 (px). Leading 1.1 tight / 1.5 body.
- Wordmark: LEGWORK, Archivo 800, +0.08 em tracking.

## Spacing and radius
- 4 px base: 4 · 8 · 12 · 16 · 20 · 24 · 28 · 36 · 44 · 96.
- Radii: tag 6 · badge 8 · tile/phone button 10 · dashboard card 12 · light card / slide panel 14 · phone task card 16 · pill 999 · phone screen corner 46 (px).
- Mobile hit target ≥ 44 px.

## Components (names are the contract between lane D tasks)
| Component | Purpose | Enums / rules |
|---|---|---|
| `Button` | block action (CLAIM, SUBMIT); ≥ 44 px tall; uppercase label | `primary` (ink block) · `ghost` (bordered) · `verified` (teal fill — released/confirm moments only) |
| `Chip` | mono pill; standards, tx links and the honesty chips | tones `neutral` · `verified` · `refusal` · `verified-light` |
| `MonoTag` | task types (`verify-open`, `photo-of`, `call-confirm`, `compare-two`) and contract names | fill `#202522` on ink / `#F0EEE7` on paper, radius 6 |
| `StatusBadge` | lifecycle badge, uppercase mono | `RELEASED` teal · `REFUSED` amber · `LOCKED` off-white · `SUBMITTED` filled · `OPEN` outline · `PASSED` teal; sizes `md` / `sm` |
| `EscrowMeter` (`RouteMeter`) | the motif as a working meter: dot → dashed route → footprint; fills toward the footprint | states LOCKED / RELEASED / REFUNDED; **a refusal never moves it** |
| `TaskRow` (`TaskCard`) | dashboard feed row: type tag + title, Archivo price numeral + "USDC", mono meta, status badge right | refused rows get the amber border; seeded rows carry the `seeded` chip |
| `VerifiedChip` | the worker's verification state | full banner "Verified human ✓ · World ID · one account per person" + `sandbox` chip, or compact pill "Verified human ✓ · sandbox"; **always above the fold on the phone**; the sandbox disclosure is part of it |
| `AgentCard` | `#8004-1207`, "Storefront checker", score, tasks paid on proof, mark counter (0 → 1 on the refusal beat), `ERC-8004 identity` chip | mark line in amber: `1 mark · task-refused:<class>` |
| `WorkerPool` | "1 real · +20 seeded (demo data)"; one highlighted real row `verified human ✓`, seeded rows in gray with the `seeded` label | never "21 workers"; never imply a live pool |
| `PreflightTrio` | "4 active · 1 verified · 3 seeded" + median labelled `seeded` (or `n=1 (real)`) + score floor | the three numbers ≥ 32 px at design size |
| `ScreeningLog` | `REFUSED` / `PASSED` rows: time · type · class + reason · spec hash · `mark → #8004-1207` · tx chip | never the raw spec text; never a requester identity |

## Honesty chips (brand elements, visible, never fine print)
`sandbox World ID` · `operator-attested` · `relayed claim · gas paid by Legwork` · `testnet USDC — not spendable` · `GPS unavailable in webview — disclosed` · `1 real · +20 seeded (demo data)` · `seeded` (on every seeded worker **and** task row) · `DEMO DATA` (whenever `DATA_MODE=demo`).

## The ten hard rules (from the design prompt; fail the review)
1. The three locked copy blocks (tagline, claim, trust model) are reproduced exactly.
2. Never show escrow releasing without a proof above or beside it; never show a refusal moving the escrow meter — "a refused task moves no money".
3. The tag is `task-refused` (never "violation"); the name is Legwork.
4. Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia.
5. "Bot-proof, not fraud-proof"; "bounded, attributable work"; never "trustless".
6. No faces anywhere — the worker is hands and a phone.
7. Locations are Leiria. Never Brooklyn, never "24h".
8. The filmed worker account shows only what it actually earned.
9. Every seeded row — worker or task — carries a `seeded` chip; the pool reads "1 real · +20 seeded (demo data)".
10. Fee figures are **3.45 / 3.00 / 0.45** (agent pays / worker receives / fee) on every surface; no deducted-fee numbers anywhere.

## Legibility floors (the video is judged at 1080p, watched at 720p)
- Nothing the narration mentions renders below **24 px** in the delivered 1080p frame; the honesty chips, the refusal class + reason line, the escrow states and the three preflight numbers are **≥ 32 px** at design size — mark them `data-floor="32"`, everything narrated `data-floor="24"`.
- Phone UI: 16 px body, **20 px floor** for anything narrated; hit targets ≥ 44 px.
- `?present=1` shows at most: the escrow meter, the agent card with the mark counter, the screening log, the preflight trio, three task rows, the wall clock and `t+mm:ss since posted` — not the nine-card mock.
- The escrow meter and one feed row sit inside a centre column that survives a 9:16 crop.
- Iconography: no icon font, no emoji, no filled icon sets. Unicode only: `✓` verified · `·` separator · `↗` tx link · `●` live dot. The in-UI glyph is the bare footprint, always in the verified teal.

## Voice
Plain, technical, honest. Short declaratives. No exclamation marks, no superlatives, no emoji. Demo placeholders kept consistent everywhere: worker `#w-0417`, agent `#8004-1207`, `3.45 locked → 3.00 released + 0.45 fee`, tx `0x8f2a…c41d`, Leiria.
