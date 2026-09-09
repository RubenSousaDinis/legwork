---
id: T-51
title: Dashboard front door — landing, the two paths, and the refusal card
lane: D
day: 5                               # added Sept 8 after the operator's first pass over the deployed UIs
size: L                              # three PRs: the refusal card, the front door, the deck
agent_class: C
must: true
depends_on: [T-26, T-43]
owned_paths:
  - apps/dashboard/app/**
  - apps/dashboard/components/**
  - apps/dashboard/lib/data/live.ts
  - apps/dashboard/lib/data/types.ts
  - apps/dashboard/lib/data/fixtures/live/refusals-1.json
  - apps/dashboard/lib/urls.ts
  - apps/dashboard/test/**
  - apps/dashboard/README.md
  - apps/miniapp/app/about/page.tsx
labels: [area:dashboard, wave:5, size:L, agent:cloud]
branch: t-51/dashboard-front-door
---

# T-51 — Dashboard front door — landing, the two paths, and the refusal card

## 1. Context

The dashboard (`apps/dashboard`) is deployed at `https://legwork-dashboard.vercel.app`. It is
the URL a judge opens first and the one every MCP tool hands back as `dashboard_url`. Today
`/` opens straight onto the nine-card operations board: no explanation of what Legwork is, no
way in for a human worker, and no instructions for the agent developer who is the customer.
There is **no HTML page on any deployed host that explains how to hire a human** — `SKILL.md`,
`docs/mcp.md` and `docs/api.md` are good documents reachable only as GitHub URLs.

The operator opened both UIs on 2026-09-08 and reported this, verbatim:

> Lots of cards showing this [a refused card reading `authentication circumvention ·
> authentication circumvention`]
>
> `https://legwork-dashboard.vercel.app` should display the landing page.
>
> `https://legwork-dashboard.vercel.app/about` leads to 404, same for support, tasks, earnings
> and /probe pages.
>
> Logo is not anywhere.
>
> Where can I find instructions for agents to create tasks. Our landing pages should have two
> paths for humans and agents.

This task answers all of it in three PRs. **PR 1/3 is the refusal card** — a real rendering bug, visible on
the deployed site, invisible to the whole test suite. **PR 2/3 is the front door** — a landing
at `/` with a path for humans and a path for agents, the board moved to `/live`, an `/agents`
page carrying the install line and the four task types, `/about` and `/support`, and the
wordmark and favicon the dashboard has never had. **PR 3/3 is `/deck`** — the thirteen-board
pitch as a web page, built from its copy rather than copied from the pre-kickoff `deck.html`.

`/` is also the video canvas: `app/page.tsx` branches on `?present=1`, and the CI
`e2e-dashboard` job navigates to `/?present=1`. **That branch does not move.** Only the
else-branch — the board — changes address.

### The ink ground, pasted from `DESIGN-SPEC.md` so you never open it

> **Two grounds — never mixed within a surface.** Dashboard + deck are **ink**: canvas
> `#070808`, page `#0D0F0E`, card `#151816` with a 1 px border `#262C28`, radius 12 px, no
> shadow; tag fill `#202522`; type `#F1EFE9` primary · `#C9CCC7` body · `#8B918D` muted /
> unverified / seeded · `#5B615D` dim numerals · `#4A504C` faintest.

> **Semantic palette — non-negotiable.** Verified / released is the only accent: `#35C79A` on
> ink; borders `rgba(53,199,154,.5)`, tints `rgba(53,199,154,.1)` / `.08`. Refusal is amber,
> never red: `#E4A33F`; border `rgba(228,163,63,.45)`. "Refusals are good news." Status-quo red
> `#E5484D` appears **only** on the pitch slide, nowhere in the product. No gradients, no blur,
> no elevation games; hierarchy comes from scale plus the one accent.

> **Type.** Display / numerals: Archivo 700–800, tracking −0.02 em. UI + prose: Inter 400–700.
> Ids, addresses, hashes, contract names, chips, labels: JetBrains Mono 400–700; section labels
> UPPERCASE tracked +0.1 em. Wordmark: LEGWORK, Archivo 800, +0.08 em tracking.

> **Iconography:** no icon font, no emoji, no filled icon sets. Unicode only: `✓` verified ·
> `·` separator · `↗` tx link · `●` live dot. The in-UI glyph is the bare footprint, always in
> the verified teal.

> **The idea.** Legwork = someone actually goes there. The recurring motif is a **route line**:
> request → route → proof — a dot, a dashed path, a footprint at the end.

> **Voice.** Plain, technical, honest. Short declaratives. No exclamation marks, no
> superlatives, no emoji.

Every one of those values already exists as a token in `apps/dashboard/app/globals.css`
(`--ink-950`, `--fg-1`, `--verified-500`, `--sp-*`, `--r-card`, `--text-*`). **Use the tokens,
never a literal hex.**

### The three locked copy blocks, reproduced exactly

**Tagline** — reproduce character for character:

> Agents hire verified humans for the legwork software can't do. Escrow releases on proof.

**The claim:**

> Marketplaces already let agents hire humans. Legwork is the first where every worker is one
> verified human, every payment is escrowed onchain and released on proof, every hiring agent is
> accountable, and the documented abuse classes are refused at the API.

**The trust model:**

> Verification proves a worker is a live, unique person — not that they are honest or
> competent. Escrow bounds the agent's loss to one task, and a per-agent daily cap bounds it to
> one day. Screening is a cost floor, not a cure. Legwork's guarantee is **bounded, attributable
> work**: an agent never pays for nothing, a worker never works for nothing, and every task
> leaves a record both sides can read.

followed by its closer, on its own line: `Bot-proof, not fraud-proof.`

## 2. Exact scope

Two governing rules before the list.

**Presentation and routing change; the data contract does not.** Every `data-testid`,
`data-state`, `data-floor`, `data-seeded`, `data-hidden`, `data-column` and `data-row`
attribute keeps its exact value. No API route changes. No file under `packages/**` changes.

**The board's markup does not change when it moves.** Moving mission control from `/` to
`/live` is a routing change: the same component tree, the same props, the same attributes.

---

### PR 1/3 — the refusal card, honestly rendered

The deployed dashboard renders this, and nine live rows currently look like it:

```
call-confirm   call to confirm   REFUSED
no money moved
authentication circumvention · authentication circumvention
posted 08:42 · no money moved · self-reported answer + timestamp (unverified)
```

Two separate duplications. Both are in the live adapter, not in the API.

**1. The class is printed twice.** `GET /public/refusals` returns `recent[]` rows with exactly
five keys — `at`, `task_type`, `class`, `rule_id`, `marked` — and **no `reason`, deliberately**.
`apps/api/app/public/refusals/route.ts:6-8` states why: a refusal log that quoted the spec back
would publish exactly the text the gate refused to run. `packages/shared/src/api-contract.ts:215`
freezes that shape. So `entry.reason` is always `undefined` in live mode, and
`apps/dashboard/lib/data/live.ts:369` collapses to the class:

```ts
refusal: { class: entry.class ?? null, reason: entry.reason ?? entry.class ?? 'refused' },
```

`components/TaskRow.tsx:66-67` then renders `class · reason` — both halves the class. The
identical fallback at `live.ts:503` feeds `components/ScreeningLog.tsx:31-36`, so the screening
log shows it too.

- `live.ts:369` — drop the `?? entry.class ?? 'refused'` fallback. The wire carries no
  `reason`; the adapter must not invent one.
- `live.ts:503` — same, for the `ScreeningLine`.
- `live.ts:129-139` — `WireRefusalRecent` stops declaring `reason`, `spec_hash`, `agent_id` and
  `mark_tx` as fields the live wire supplies. Keep `at`, `task_type`, `class`, `rule_id`,
  `marked`. Anything else the endpoint might one day add is not this task's business.
- `lib/data/types.ts:47` — `TaskRowData.refusal` becomes
  `{ class: AbuseClass | null; reason?: string }`, so the absence is representable rather than
  fudged.
- `lib/data/types.ts:86` — `ScreeningLine.reason` becomes optional for the same reason. The
  `passed` branch still renders `reason` when there is one; a passed line without one renders
  nothing rather than a placeholder.
- `components/TaskRow.tsx:64-68` — join only the parts that exist, with no stray separator.
  Order: `class`, then `rule_id` when present, then `reason` when present, joined by ` · `.
  **The element keeps `className="task-row-refusal"` and `data-floor="32"`** and the class must
  stay inside it — `e2e/present.e2e.ts:124` asserts a floor-32 element contains the class text.
  `TaskRowData` has no `ruleId` field today; add `ruleId?: string` to the `refusal` object and
  set it from `entry.rule_id` in `refusalToFeedRow`.
- `components/ScreeningLog.tsx:31-36` — the same conditional join. `ScreeningLine.ruleId` is
  already populated at `live.ts:507` and has never been rendered; render it as the second part.
  Keep `<span className="screening-class">` around the class itself.

So a live refused row now reads `authentication circumvention · deny.auth`, and a row with
neither a rule id nor a reason reads `authentication circumvention` with no trailing separator.

**2. `no money moved` is printed twice.** `TaskRow.tsx:44-47` renders it as its own line for
every refused row — correctly, and the comment there explains why the component guarantees it
rather than trusting the adapter. `live.ts:367` then puts it into the meta as well.

- `live.ts:367` — the refused row's meta becomes `` `posted ${hhmm(entry.at)}` `` and nothing
  else. The component owns the money line.

**3. The fixture lied, which is why no test caught this.**
`lib/data/fixtures/live/refusals-1.json:15` is the only fixture with a `recent` entry and it
carries a `reason` the real API never sends, so the fallback was never exercised in a test.

- Realign the fixture's `recent` array so its **first** entry has exactly the five keys the API
  returns, and keep **one** later entry carrying the extra fields (`spec`, `payer`, `agent_id`,
  `mark_tx`, `spec_hash`) so `recordedFixturesAreLeiriaAndCarryNothingPublicSurfacesMayNot`
  (`test/live-mapping.test.tsx:185-197`) still has a subject proving those are dropped. Update
  that test to look at the entry that still has them.
- Demo mode is correct and does not change: `lib/data/demo.ts:120` sets a real sentence.

---

### PR 2/3 — the front door

Routes after this PR:

| Route | State |
|---|---|
| `/` | **new** — the landing |
| `/?present=1` | **unchanged** — the present canvas; the CI gate navigates here |
| `/present` | **unchanged** |
| `/live` | **moved** — the mission-control board that was at `/` |
| `/agents` | **new** |
| `/about`, `/support` | **new** |
| `/deck` | **new** — PR 3/3 |
| `/task/[id]`, `/refusals`, `/admin`, `/opengraph-image` | unchanged |

**4. `app/page.tsx` — keep the present branch, replace the board branch.** The file currently
ends:

```tsx
if (sp.present === '1') return <PresentCanvas data={data} />;
return <LiveMissionControl initial={data} {...(taskId ? { taskId } : {})} />;
```

The `?present=1` branch and everything it reads (`?state=`, `?task=`) stay exactly as they are.
The second line becomes the landing. The landing is static, so `/` must not do the live data
load when `present` is absent — move `loadDashboardData` inside the present branch so a cold
landing does not wait on the API or the subgraph.

**5. `app/live/page.tsx` — the board, moved.** A new route rendering exactly what `/` rendered:
`loadDashboardData(mode, …)` then `<LiveMissionControl initial={data} {...(taskId ? { taskId } : {})} />`,
honouring `?task=` and `?state=` as `/` did. Add `metadata` with title `Legwork · live`. No
component under `components/` changes for this.

**6. `components/SiteHeader.tsx` — new.** The dashboard's `layout.tsx` renders no chrome, so
the public pages need their own header: `<Wordmark />` (the component already exists —
`components/Wordmark.tsx`, uppercased by `.wordmark` at `globals.css:257`) beside a nav of five
links — `live`, `agents`, `deck`, `about`, `support` — as mono `--text-body-sm`, `--fg-3`, the
current page's link `--fg-1`. It takes
`current?: 'live' | 'agents' | 'deck' | 'about' | 'support'`. It renders on `/`, `/agents`,
`/deck`, `/about`, `/support` and `/live`, and **never inside `(present)/**`** — the filmed
canvas draws its own wordmark and must not gain a nav. The `deck` link ships in PR 2/3 pointing
at a route that arrives in PR 3/3, so add it in PR 3/3, not before.

**7. `app/page.tsx` landing content.** In DOM order:

- `<SiteHeader />`.
- A hero: `<Wordmark />` at `--text-stat-sm`, then the **tagline** verbatim as the h1 at
  `--text-h2`, `data-floor="24"`, then one short paragraph: the "An agent posts a real-world
  task…" sentence from `README.md:7-9`, rewritten to Leiria and under 320 characters.
- The route-line motif as a divider: reuse the escrow meter's shape language — a dot, a dashed
  rule, a footprint — drawn with CSS borders plus the footprint SVG that already exists inline
  in `components/EscrowMeter.tsx:38-47`. **Extract that `Footprint()` into
  `components/Footprint.tsx` and import it in both places** rather than copying it a third
  time; `EscrowMeter`'s rendered markup must not change (same element, same
  `className="meter-footprint"`).
- **The two paths**, side by side on wide screens and stacked under 720 px, each a
  `<section className="card landing-path">`:
  - **"I am a person who can go and look"** — what a worker does, that the money is locked
    before the work starts, that payment releases on the proof; one link to the mini-app,
    labelled `Open the worker app ↗`, `data-hit="44"`.
  - **"I am an agent, or I build one"** — one line on what an agent gets, and one link to
    `/agents`, labelled `How to hire a human`, `data-hit="44"`.
- An honesty chip row using the existing `Chip`: `testnet USDC — not spendable`,
  `1 real · +20 seeded (demo data)`, `operator-attested`.
- The **trust model** block verbatim, then `Bot-proof, not fraud-proof.` as its own line.
- A footer line linking `live`, `refusals`, and the GitHub repository.

The mini-app URL is `process.env.NEXT_PUBLIC_MINIAPP_URL ?? 'https://legwork-miniapp.vercel.app'`
in a single exported helper `miniappUrl()` in `lib/urls.ts` (new). Do not add a required env
var; the fallback is the URL registered in the World Developer Portal.

**8. `app/agents/page.tsx` — the answer to "where are the instructions".** This page is the
first HTML surface that tells an agent developer how to post a task. Content, in order:

- `<SiteHeader current="agents" />` and an h1 `Hire a human from your agent`.
- **Install.** Two blocks, hosted first, with the sentence between them reproduced exactly:
  **"An MCP client cannot answer an x402 challenge; the payer must hold a key."**
  - Hosted — read, status, approve, dispute; `hire_human` returns `payment_required` and the
    local install line:
    `claude mcp add --transport http legwork <base>/mcp`
  - Local — all six tools; pays through x402. Needs `BUYER_PRIVATE_KEY`:
    `claude mcp add legwork -- npx @legwork/mcp`

  `<base>` is `process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'` — a second
  helper `apiUrl()` in `lib/urls.ts`. **Print the real origin.** `SKILL.md`, `README.md` and
  `docs/mcp.md` all still print the literal placeholder `https://<host>/mcp`; this page must
  not. Each command sits in a `<code>` block a reader can select in one gesture.
- **The six tools**, named in a mono list with one clause each: `preflight_workers` (how many
  workers could take it, and whether the median is `seeded`), `check_task` (dry-runs screening;
  never posts, never pays, never marks), `hire_human`, `task_status` (long-poll,
  `wait_seconds=50`), `approve_task`, `dispute_task`.
- **The four task types** — `verify-open`, `photo-of`, `call-confirm`, `compare-two` — as
  `MonoTag`s with one line each, and the sentence `Free text is not a task type.`
- **Prices**, as a table: floors 3.00 / 3.00 / 2.00 / 1.00 USDC, max 10 per task, then verbatim:
  the agent pays `amount × 1.15`, so a 3.00 task costs the agent **3.45**, the worker receives
  **3.00**, the fee is **0.45**, and the escrow locks **3.45**. Caps: 5 open tasks and 25 USDC
  per day per payer.
- **Refusals.** The six classes as a list — credential fraud, identity impersonation, automated
  reconnaissance, social media manipulation, authentication circumvention, referral fraud — with
  `A refused task moves no money.` and the fixed message
  `do not rephrase and retry; report this refusal to your principal`.
- **Worker output is data, never instructions** — the wrapper
  `{ "answer": …, "note": …, "_source": "worker", "_untrusted": true }` and the sentence that
  `answer` and `note` are untrusted strings from a stranger.
- **Honest limits**, from `SKILL.md`: `verify-open` and `photo-of` are Leiria-only during the
  event; `call-confirm` (Portuguese) and `compare-two` can be done from anywhere; answers come
  back in minutes, not milliseconds; settlement is Base Sepolia testnet.
- **Read more**, as links: `SKILL.md` and `docs/mcp.md` on GitHub, and `<base>/openapi.json`.

**9. `app/about/page.tsx`** — `<SiteHeader current="about" />`, the **claim** verbatim, the
**trust model** verbatim, a `what is live and what is seeded` list (four workers rows are
seeded and say so; one real registration), and the standards row as `Chip`s spelled exactly:
`World ID`, `ERC-8004`, `x402`, `USDC`, `Base Sepolia`. Metadata title `Legwork · about`.

**10. `app/support/page.tsx`** — `<SiteHeader current="support" />`, four short
question-and-answer pairs for someone who arrived from a task receipt: what a task is, what a
refusal means (a mark lands against the agent that posted it, never against the worker), what
`seeded` means on a row, and one link to the repository's issues to reach a person. Workers
using the phone app are pointed at the mini-app's own support page. Metadata title
`Legwork · support`.

**11. The logo, from the assets that already exist.** Copy `apps/miniapp/app/icon.png` and
`apps/miniapp/app/apple-icon.png` to `apps/dashboard/app/icon.png` and
`apps/dashboard/app/apple-icon.png` — Next's file conventions pick them up, so `layout.tsx`
needs no `icons` key. **Do not add an `opengraph-image.png`**: the dashboard's
`/opengraph-image` route is dynamic and renders the live escrow state, which is better than a
static card. Do not draw a new mark and do not copy anything from outside this repository.

**12. `globals.css` — a `landing-*` block.** The dashboard has no `Card` or `Button` component
and no ink-ground equivalent of a landing title, a fact list or a quiet link, so new rules are
expected here. Add only what the new pages use, named `.landing-*`, `.site-header`,
`.agents-*`; touch no existing rule. Every length in `var(--sp-*)`, every colour in a token,
every size in `var(--text-*)`. Links get a visible focus ring and `min-height: 44px` via the
existing `[data-hit='44']` convention if one exists, or a `.landing-link` rule if it does not.

**13. Leiria, not Brooklyn.** `apps/miniapp/app/about/page.tsx:36` reads "whether the pharmacy
on **Bedford Avenue** is open". DESIGN-SPEC hard rule 7 is *"Locations are Leiria. Never
Brooklyn, never '24h'."* The banned-words check misses it because the literal token on the list
is `Brooklyn`. The landing hero is written from that same paragraph, so fix it at the source:
replace the street with a Leiria one already used elsewhere in the repo (`Rua de Alcobaça`), and
write the landing's version Leiria-first. This is the only file outside `apps/dashboard` you
may touch.

**14. `apps/dashboard/README.md`** — a `## Routes` table covering every route and which are
public, one line saying `/` is the landing and `/?present=1` is still the filmed canvas, and the
two new env vars with their fallbacks.

---

### PR 3/3 — `/deck`, the pitch as a web page

The pitch deck exists as thirteen boards of planning copy. It is **pre-kickoff material** and
there is a rendered `deck.html` in the planning directory. **Neither may be copied.** The Start
Fresh rule, quoted in the planning pack's own sync record, is: *"the ETHGlobal Start Fresh rule
forbids project-specific designs/assets from entering the actual submission repo … nothing here
gets copied verbatim into the hackathon codebase once building starts."* The repo's `README.md`
already discloses the deck as a pre-kickoff artifact and states *"No code or stylesheet from
them is in this repo."* That stays true: you build this page from the copy below, on the ink
ground, with the dashboard's own tokens and components — the same way every other surface in
this repo was re-typed from `DESIGN-SPEC.md` rather than imported.

**15. `app/deck/page.tsx`.** Thirteen boards, each a `<section className="deck-board">` with an
`id` of `board-1` … `board-13`, stacked vertically and each at least `100svh` so a board fills
the screen, with `scroll-snap-type: y mandatory` on the container and `scroll-snap-align: start`
on each board. No JavaScript slide runner, no keyboard handler, no library: scrolling and
`#board-n` anchors are the whole navigation, which means it prints, it deep-links, and it cannot
break on a judge's machine. `<SiteHeader current="deck" />` renders once above the boards, and
`current` gains `'deck'`. A fixed board counter (`n / 13`, mono, `--fg-4`) sits bottom-right.

**16. The one place red is allowed.** `DESIGN-SPEC.md` reserves the status-quo red for exactly
this: *"Status-quo red: `#E5484D` — appears **only** on the 'broken status quo' pitch slide;
nowhere in the product."* `globals.css` says so too — *"Red exists nowhere in the product, so
there is no red token to find."* Add `--status-quo-red: #e5484d` **inside the `.deck-board`
scope, not on `:root`**, and use it on board 2 only, on the `$25` and `787,000+` figures.
Nowhere else on any page, ever.

**17. The thirteen boards.** Each has a headline, body, and a visual direction. Render the
headline at `--text-stat-sm` (`--text-h2` where the headline runs long), the body as an ordered
or unordered list at `--text-body-md`, and follow the visual direction with the tokens and
components you already have — never an image, never an icon set. The copy:

1. **Title.** `<Wordmark />` large, the **tagline** verbatim as the subtitle, then
   `Real-world verification for AI agents — one verified human per account, money locked before
   work starts, paid the moment the proof lands.` and a mono line
   `ETHOnline 2026 · solo build · Base Sepolia · World ID · ERC-8004 · x402 · USDC`.
   Visual: wordmark only, no diagram.
2. **AI is already hiring humans. It's a mess.** Headline `787,000+ "workers", failing payouts,
   and any abuse for $25.` Three points: RentAHuman, Feb 2026 — 787,000+ registered humans
   across 100+ countries, tasks done and money never arriving, supply inflated by bots and
   duplicates. The research (Mehta, arXiv:2602.19514, Feb 2026) — six abuse classes bought on
   that marketplace for a median **$25 per worker**, and a third of the bounties came in through
   APIs and MCP. Then: agents will keep hiring people; the question is whether the person is
   real, whether they get paid, and whether the agent can be held to account. Visual: `$25`
   huge, `787,000+` second, in the status-quo red — the only red in the product.
3. **Every marketplace trusts a signup form.** Headline `Verified worker? Screened request? Pick
   one — until now.` A 2×2: worker verification (none / verified) against the request
   (unscreened / refused at the API and written to the agent's record); three quadrants
   occupied, ours empty and highlighted. Money wording is `the platform holds the money` versus
   `a contract holds the money` — **never** "escrowed on proof" as an axis, or the neighbours
   land in our cell. Close on: nobody refuses the documented abuse classes at the API and writes
   the refusal to the hiring agent's public record.
4. **The claim.** The **claim** verbatim, then the **trust model** verbatim, introduced by
   `And the trust model, stated as a bound, not a promise:`. Typographic board — the two quotes
   and nothing else. Both come from the shared constant, not retyped.
5. **How it works: verify once, escrow every task.** Headline `One verification. One contract.
   Every task.` Six numbered steps, matching `README.md`'s loop: the worker verifies once
   (World ID through IDKit, one nullifier = one worker account); the agent asks for one of four
   typed things and pays through x402, the API screening the request against the six documented
   abuse classes; the money is locked before anyone can claim, with a per-task and a per-agent
   daily cap; the worker signs in and Legwork relays the claim and pays the gas, proof is a
   photo hash plus GPS plus timestamp inside a 30-minute claim window; escrow releases on
   approval or auto-releases after the dispute window, expiry refunds the buyer; both records
   move — worker reputation keyed to the nullifier, the agent's record on ERC-8004.
6. **The demo: a real person, on camera, paid on proof.** The listing says one thing, the door
   says another. The agent preflights workers from live data, hires, pays **3.45** USDC
   (**3.00** + **0.45** fee); the escrow meter locks. The worker verifies, claims (relayed, gas
   paid by Legwork), walks, photographs the sign, submits. Escrow releases **3.00** to the
   worker and **0.45** as the fee. During the walk, a well-formed `call-confirm` asking the
   callee to read back a six-digit code is refused at the API as *authentication circumvention*
   and lands as a mark on the agent's public record.
7. **One human, one account.** Headline `787,000 signups. Or one account per person. One of
   those is a real number.` Supply on today's marketplaces is a signup form; ours is one World
   ID nullifier = one worker. Reputation is keyed to the nullifier, not the address — rotate
   wallets, keep your record; agents are keyed to their ERC-8004 identity. Worker reputation is
   deduplicated per hiring agent and accumulated onchain with O(1) reads. Visual: `787,000
   registered (RentAHuman)` in `--fg-3` on the left, `1 account = 1 person` in
   `--verified-500` on the right.
8. **The empty cell (and everyone standing near it).** Headline `The neighbors are real. The
   cell is still empty.` The prior-art table, our row highlighted — take the rows from the root
   `README.md`'s `## Prior art` table, which is the maintained version of this board, and mark
   every unverified claim as the README marks it. Close on: the closest neighbour has three of
   the four and no screening and nothing written back; we cite neighbours by name because a
   claim you can falsify taints everything else. The table scrolls inside its own container on a
   narrow screen; the page never scrolls sideways.
9. **What Legwork is NOT.** Headline `Bounded work. Not magic.` Four lines, generous
   whitespace, no imagery: not competence vetting (a verified human can still be wrong — proof,
   the dispute window and reputation are the answer); not a dispute court (v0 is approve,
   auto-release after the window, or an operator resolves, disclosed, zero fee on arbitration);
   not KYC or payroll (testnet USDC today, workers paid per task, no employment claims); not
   fraud-proof (screening is a deterministic gate plus a classifier that can only add refusals,
   over enumerated task types — it raises the cost of abuse, it does not end it; GPS is
   self-reported and spoofable, so we anchor, geofence and dispute it rather than prove it).
10. **Real rails, running today.** Headline `Production identity and payments, our escrow on
    top.` Two columns — live and not ours (World ID via the Developer Portal and IDKit 4.x;
    ERC-8004 identity and reputation registries on Base Sepolia; the x402 reference facilitator;
    USDC) against ours and deployed (WorkerRegistry, TaskEscrow, Reputation, AbuseMark as
    `Chip`s, plus the subgraph, the Task API and MCP server, the mini-app and this dashboard).
    Then the disclosed row, as honesty chips.
11. **Where this goes.** Headline `Four task types are v1. The trust layer is the point.` More
    task types, each with its own proof schema, never free text; operator spend policies;
    proof re-verification by a second worker before any human review; mainnet and real payouts
    through a payout provider, and Router-based onchain verification on every chain and
    credential that has it.
12. **The agent economy's most human product.** Agents hiring humans went from a meme to a
    documented abuse market in one quarter, and the fix is not a better signup form. A demo a
    non-technical judge understands in ten seconds. Built on the identity and payment rails
    sponsors shipped this year, with one contract family on top. Visual: one line, huge —
    `A real person. A real task. Paid on proof.`
13. **Close.** `Legwork — real-world verification for AI agents.` then `A real person. A real
    task. Paid on proof.` then the **tagline** verbatim, then: one verified human per account,
    money locked before work, paid on proof; built solo in 10 days, from scratch, with an
    AI-disclosed granular history. Then the live line: this dashboard's own origin and the
    hosted install command from `apiUrl()`, as on `/agents`.

**18. The deck states today's facts, not the plan's.** The board copy above was written on
Sept 3 and four things have changed since. Write the current truth:

- **Not `sandbox World ID`.** The demo verifies a real **Orb** credential against the one
  production endpoint; the chip reads `World ID · Orb`. Board 10's disclosed row says so.
- **Selfie Check was never available to this app.** It is access-gated and returns
  `verification_disabled`; the demo ships Orb, which is the credential the one-account-per-person
  claim always needed. Board 7 must not describe Selfie Check as the credential in use, and must
  not call it low-assurance in a way that reads as what we shipped.
- **The seeded pool** is disclosed as `1 real · +20 seeded (demo data)` — the honesty chip's
  wording. Never write a total.
- **No placeholders.** Board 13 must not print `https://<domain>` or `https://<host>/mcp`; use
  `apiUrl()` and the deployed dashboard origin, as `/agents` does.

If a fact on a board contradicts something you can verify in this repository, the repository
wins and you note it in the PR. Do not invent a figure to fill a gap: a number you cannot source
is left out.

## 3. Out of scope

- **Present mode.** `app/(present)/**`, `/present`, `?present=1`, `?hide=`, `?crop=1`,
  `?state=` — T-43 owns them. Their rendered markup and every `data-*` attribute stay identical.
- **The legibility gate.** `apps/dashboard/e2e/**` is T-39's. You re-run it; you do not edit it.
  If a floor fails, that is a `BLOCKED:`, not an e2e edit.
- **The API.** Adding `reason` to `/public/refusals` would resolve the duplication and is
  **forbidden**: it breaks the privacy rule in `apps/api/app/public/refusals/route.ts:6-8` and
  the frozen contract in `packages/shared/src/api-contract.ts:215`.
- `packages/**`, `apps/api/**`, `subgraph/**`, `contracts/**`, `demo-data.json`, the root
  `README.md`, `SKILL.md`, `docs/**` — including the `<host>` placeholders in `SKILL.md` and
  `docs/mcp.md`, which T-45 and T-49 own.
- `/tasks`, `/earnings`, `/probe` **stay 404 on the dashboard host.** They are worker-app
  routes; the landing links across to the mini-app instead. Do not add redirects for them.
- The mini-app beyond the single Leiria line in item 13: no new mini-app page, no mini-app CSS.
- `lib/data/demo.ts` and `demo-data.json` — the demo path is already correct.
- **The pre-kickoff `pitch/` and `design-system/` directories.** Nothing from either enters
  this repository: no markup, no stylesheet, no SVG, no rendered `deck.html`. `/deck` is written
  from the copy in §2 item 17 against the dashboard's own tokens. If you believe a board needs an
  asset from outside the repo, that is a `BLOCKED:`, not a copy.
- The root `README.md`'s `## Prior art` table — board 8 reads from it; it is T-49's to edit.
- Do not touch: `apps/dashboard/e2e/**`, `apps/dashboard/app/(present)/**`,
  `apps/dashboard/package.json`, `apps/dashboard/next.config.ts`, `packages/**`, `apps/api/**`.

## 4. Owned paths

```
apps/dashboard/app/**
apps/dashboard/components/**
apps/dashboard/lib/data/live.ts
apps/dashboard/lib/data/types.ts
apps/dashboard/lib/data/fixtures/live/refusals-1.json
apps/dashboard/lib/urls.ts
apps/dashboard/test/**
apps/dashboard/README.md
apps/miniapp/app/about/page.tsx
!apps/dashboard/app/(present)/**
```

`scripts/claim.sh` copies this list out of the front matter into the draft PR body, so the
`owned-paths:` block is already correct when the PR opens. Do not retype it.

## 5. Interfaces consumed

| Interface | Where | What you rely on |
|---|---|---|
| `GET /public/refusals` → `{classes, recent[], examples[]}` | `apps/api/app/public/refusals/route.ts` | `recent[]` rows carry `at`, `task_type`, `class`, `rule_id`, `marked` and **nothing else** |
| `DashboardData`, `TaskRowData`, `ScreeningLine`, `PoolData` | `apps/dashboard/lib/data/types.ts` | the view model every card takes; you widen two `reason` fields and add one `ruleId` |
| `loadDashboardData`, `resolveDataMode`, `parseFeaturedState` | `apps/dashboard/lib/data/index.ts` | the server-side loader `/` uses today and `/live` uses after the move |
| `LiveMissionControl`, `PresentCanvas` | `apps/dashboard/app/` | rendered unchanged, at their new and old addresses |
| `Wordmark`, `Chip`, `SectionLabel`, `MonoTag`, `StatusBadge` | `apps/dashboard/components/` | the ink primitives; `Chip.floor` defaults to 32 |
| `ABUSE_CLASSES`, `PRICE_FLOOR_USDC`, `NO_RETRY_SENTENCE` | `@legwork/shared` | the six classes, the four floors and the fixed refusal message — import them, never retype them |
| `globals.css` tokens | `apps/dashboard/app/globals.css` | `--ink-*`, `--fg-*`, `--verified-500`, `--sp-*`, `--text-*`, `--r-card` |

## 6. Interfaces produced

| Interface | Where | Consumers |
|---|---|---|
| `/` (landing), `/agents`, `/about`, `/support`, `/live`, `/deck` | `apps/dashboard/app/` | judges, the operator's demo, every `dashboard_url` an MCP tool returns |
| `SiteHeader({ current? })` | `apps/dashboard/components/SiteHeader.tsx` | the six public pages |
| `Footprint()` | `apps/dashboard/components/Footprint.tsx` | `EscrowMeter` and the landing's route-line divider |
| `miniappUrl()`, `apiUrl()` | `apps/dashboard/lib/urls.ts` | the landing's human path and the `/agents` install lines |
| `TaskRowData.refusal.ruleId` | `apps/dashboard/lib/data/types.ts` | `TaskRow`; the honest second half of the refusal line |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-51` — must print `CLAIMED`. Exit 1 means another
agent holds it or a dependency is open: stop. The script pushes the branch, which is what makes
the claim exclusive, and opens the draft PR. Finish with `gh pr ready`, never `gh pr create`.

1. Read `apps/dashboard/README.md`, then `lib/data/types.ts`, `lib/data/live.ts` and
   `app/page.tsx` end to end. Run `pnpm --filter @legwork/dashboard test` and write down the
   passing count — it is 38 at the time of writing, and it may only go up.
2. Run the gate once before you change anything so you know it was green:
   `DATA_MODE=demo pnpm --filter @legwork/dashboard e2e` → 2 passed.
3. **PR 1/3.** Do items 1–3 of §2 in that order: the adapter first, then the two components,
   then the fixture and its test. Add the two new tests from §8. Re-run the unit suite and the
   e2e gate. Open the PR, paste §9's output, `gh pr ready`, and stop until it is merged.
4. **PR 2/3.** Start with the move: create `app/live/page.tsx`, cut the board branch out of
   `app/page.tsx`, and confirm `/?present=1` still renders by re-running the e2e gate **before**
   you write any landing markup. A broken gate here means you touched the present branch.
5. Build `lib/urls.ts`, `components/Footprint.tsx` (extracted from `EscrowMeter`), then
   `components/SiteHeader.tsx`. Confirm `EscrowMeter`'s tests still pass — its markup must be
   byte-identical.
6. Write the four pages in this order: `/agents` (the densest, and the one the feedback asked
   for), `/`, `/about`, `/support`. Add the `.landing-*` CSS as each page needs it, never ahead
   of it.
7. Copy the two icon PNGs. Do the Leiria line. Update the README.
8. Re-run everything in §9. Paste the output into the PR body, fill every section, `gh pr ready`.
9. **PR 3/3.** Build `/deck` last, once `SiteHeader` exists. Write the thirteen boards from §2
   item 17 in order, checking each against §2 item 18 as you go — four of the Sept 3 facts are
   stale and writing them unchanged is the main way this PR goes wrong. Scope the red token
   inside `.deck-board` and grep for it afterwards. Re-run §9 and `gh pr ready`.

## 8. Acceptance tests

All in `apps/dashboard/test/`. Names are exact.

| Test / command | Asserts |
|---|---|
| `liveRefusalRendersItsClassOnce` (`test/live-mapping.test.tsx`) | mapping a `recent` entry with no `reason` and no `rule_id` yields `refusal.reason === undefined`; rendering that row puts the class in the `[data-floor="32"]` element exactly once and the element's text contains no ` · ` |
| `liveRefusalUsesTheRuleIdAsTheSecondPart` (`test/live-mapping.test.tsx`) | an entry with `rule_id: 'deny.auth'` renders `authentication circumvention · deny.auth`; `refusal.ruleId` is `'deny.auth'` |
| `refusedRowSaysNoMoneyMovedOnce` (`test/live-mapping.test.tsx`) | the mapped meta is `posted HH:MM` with no `no money moved`; the rendered row contains the string `no money moved` exactly once; for a `call-confirm` row the disclosure suffix is still appended |
| `screeningLogRefusedLineHasNoDuplicateClass` (`test/live-mapping.test.tsx`) | a refused `ScreeningLine` built from a wire row with no `reason` renders the class once and, when `ruleId` is present, `class · ruleId` |
| `recordedFixturesAreLeiriaAndCarryNothingPublicSurfacesMayNot` (`test/live-mapping.test.tsx`) | updated, not deleted: still proves `spec`, `payer`, `agent_id` and `mark_tx` are dropped, now reading the fixture entry that still carries them |
| `rootRendersTheLandingAndNotTheBoard` (`test/landing.test.tsx`) | rendering `app/page.tsx` with no search params produces the tagline verbatim and both path headings, and no `[data-testid="escrow-meter"]` |
| `presentQueryStillRendersTheCanvas` (`test/landing.test.tsx`) | `app/page.tsx` with `{ present: '1' }` renders `[data-testid="escrow-meter"]`; the landing's hero heading is absent |
| `landingLinksToBothPaths` (`test/landing.test.tsx`) | exactly one link whose href is `miniappUrl()` and exactly one whose href is `/agents`; both carry `data-hit="44"` |
| `agentsPagePrintsARealHostNotAPlaceholder` (`test/agents.test.tsx`) | the rendered page contains `claude mcp add --transport http legwork` followed by `apiUrl()` + `/mcp`, and the string `<host>` appears nowhere |
| `agentsPageCarriesTheSixClassesAndTheFeeLine` (`test/agents.test.tsx`) | all six `ABUSE_CLASSES` strings render; `3.45`, `3.00` and `0.45` each render; the x402 sentence renders verbatim |
| `publicPagesShareTheHeaderAndPresentDoesNot` (`test/landing.test.tsx`) | `/`, `/agents`, `/about` and `/support` each render one `.site-header` containing `.wordmark`; `PresentCanvas` renders none |
| `lockedCopyIsVerbatim` (`test/landing.test.tsx`) | the tagline, the claim and the trust-model sentence each appear character-for-character on the pages named in §2, read from one shared constant so a typo cannot diverge |
| `escrowMeterMarkupUnchangedAfterFootprintExtraction` (`test/present-meter.test.tsx`) | the meter still renders one `.meter-footprint`, and its `data-testid`, `data-state` and `data-progress` are as before |
| `deckHasThirteenBoardsInOrder` (`test/deck.test.tsx`) | thirteen `.deck-board` sections with ids `board-1` … `board-13` in DOM order; board 4 contains the claim and the trust model verbatim from the shared constant |
| `deckIsTheOnlyPlaceRedAppears` (`test/deck.test.tsx`) | the string `e5484d` (case-insensitive) appears in `globals.css` only inside a `.deck-board`-scoped rule, and in no `.tsx` file at all |
| `deckCarriesTodaysFactsNotThePlans` (`test/deck.test.tsx`) | the rendered deck contains `World ID · Orb` and contains neither `sandbox World ID` nor `<domain>` nor `<host>`; board 10's disclosed row renders `1 real · +20 seeded (demo data)` |
| `DATA_MODE=demo pnpm --filter @legwork/dashboard e2e` | the T-39 gate, still 2 passed, with no edit to `apps/dashboard/e2e/**` |
| every existing test file | unchanged except `test/live-mapping.test.tsx`'s fixture assertion; all green |

## 9. Verification commands

```bash
# run before opening each PR; paste the output into the PR body
pnpm --filter @legwork/dashboard typecheck
pnpm --filter @legwork/dashboard lint
pnpm --filter @legwork/dashboard test
pnpm --filter @legwork/dashboard build
DATA_MODE=demo pnpm --filter @legwork/dashboard e2e
pnpm --filter @legwork/miniapp typecheck && pnpm --filter @legwork/miniapp test   # PR 2/2 only
bash scripts/ci/banned-words.sh
# no placeholder and no pre-kickoff red outside the deck may reach a rendered page
grep -rniE '<host>|<domain>|sandbox World ID' apps/dashboard/app apps/dashboard/components \
  || echo 'no placeholder: good'
grep -rni 'e5484d' apps/dashboard/app apps/dashboard/components   # PR 3/3: one hit, in globals.css
```

Expected: typecheck and lint clean; the unit suite at least 38 passing and every §8 name
present; `build` lists `/`, `/live`, `/agents`, `/about`, `/support` alongside the existing
routes; the e2e gate 2 passed; `banned-words: clean`; the grep prints the `no placeholder`
line (exit 1 with nothing found is the pass here); after PR 3/3 the red grep prints exactly one
line, the `.deck-board`-scoped rule in `globals.css`.

## 10. Hard rules

- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`,
  `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives
  **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). No deducted figure
  anywhere.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the
  only env file in git. `NEXT_PUBLIC_*` values ship in the browser bundle — only public URLs go
  there.
- Tests never call a live model or a live chain.
- **The three locked copy blocks are reproduced exactly** (§1). Hold them in one exported
  constant so no page can drift.
- Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia. The tag
  is `task-refused`; the name is Legwork.
- **A refused task moves no money**, and a refusal never moves the escrow meter. Never show
  escrow releasing without a proof beside it.
- Locations are Leiria.
- Ink ground only. No token, class or rule copied from `apps/miniapp` — the two grounds are
  never mixed. No new dependency, no icon font, no emoji: Unicode `✓ · ↗ ●` only.
- Legibility floors: `data-floor="24"` on anything the narration names, `data-floor="32"` on the
  honesty chips and the refusal class line. Nothing on the landing renders below 15 px.
- Links are real anchors with a visible focus ring and a 44 px minimum target.

## 11. Definition of done

- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `e2e-dashboard`, `banned-words`,
      `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `apps/dashboard/README.md` gained the Routes table and the two env vars.
- [ ] Nothing from `pitch/` or `design-system/` was copied into the repository.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (copy into the PR body)

```
Task: T-51 — Dashboard front door (PR <1|2|3>/3)
owned-paths:
  - apps/dashboard/app/**
  - apps/dashboard/components/**
  - apps/dashboard/lib/data/live.ts
  - apps/dashboard/lib/data/types.ts
  - apps/dashboard/lib/data/fixtures/live/refusals-1.json
  - apps/dashboard/lib/urls.ts
  - apps/dashboard/test/**
  - apps/dashboard/README.md
  - apps/miniapp/app/about/page.tsx
  - !apps/dashboard/app/(present)/**
Scope confirmed: every §2 bullet for this PR done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked

Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>`
on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`,
`contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are
frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies:
`DEP REQUEST:`. Env vars: `ENV REQUEST:`.

Two specific cases. A refusal line that cannot be rendered without a field `/public/refusals`
does not send is a `BLOCKED:` naming the field — **never an API edit**. A legibility floor that
fails in `e2e/present.e2e.ts` is a `BLOCKED:` quoting the failure — never an edit to
`apps/dashboard/e2e/**`.

## 14. Reviewer notes

Open `app/page.tsx` first and check the present branch is byte-identical to what it was; that is
the one change that can take the film and the CI gate down together. Then run the e2e gate — it
is the only proof `/?present=1` survived. The three most likely faults are the present branch
losing `?state=` or `?task=`, the extracted `Footprint` changing `EscrowMeter`'s markup, and a
landing that renders a locked copy block from a retyped string rather than the shared constant.
Read `git diff origin/main -- apps/dashboard/lib/data` and confirm the only semantic change is
the removal of three `??` fallbacks plus two widened types. Check the `/agents` page prints a
real host, not `<host>`. On PR 3/3, read board 7 and board 10 against today's facts before
anything else — the Sept 3 copy says `sandbox World ID` and describes Selfie Check as the
credential in use, and both are now false; then confirm `git diff` shows no file arriving from
`pitch/` or `design-system/`, and that the red token is scoped to `.deck-board`. Finally, after
deploy: a refused card on `/live` shows its class once, `/` shows the landing, and `/deck`
scroll-snaps through thirteen boards on a phone as well as a laptop.

## 15. Round 2+

_(empty on first dispatch)_
