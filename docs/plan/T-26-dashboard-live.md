---
id: T-26
title: Dashboard live data — adapter, receipt, refusals, admin, poster stats
lane: D
day: 3                                # starts Day 3 evening, lands Day 4
size: M
agent_class: C
must: true
depends_on: [T-10, T-19, T-09]        # T-10 shell + DashboardData · T-19 /public/* + /admin/* routes · T-09 subgraph + @legwork/subgraph-client
owned_paths:
  - apps/dashboard/lib/**
  - apps/dashboard/app/task/**
  - apps/dashboard/app/refusals/**
  - apps/dashboard/app/admin/**
  - apps/dashboard/components/PosterStats.tsx
  - apps/dashboard/test/live*.test.tsx
labels: [area:dashboard, wave:3, size:M, agent:cloud]
branch: t-26/dashboard-live
---

# T-26 — Dashboard live data

## 1. Context
T-10 built the dashboard shell on the ink ground with a `DATA_MODE=demo` adapter that reads `demo-data.json` and shows the `DEMO DATA` chip. This task makes the same shell read the real deployment: `DATA_MODE=live` → the API's `/public/*` routes plus the subgraph, mapped into the `DashboardData` shape T-10 froze, polled every 3 s. It also adds the three routes the shell left out — `/task/<id>` (the receipt an external builder's agent hands them via `dashboard_url`), `/refusals` (class counts, never a raw live feed) and `/admin` (operator controls, env-gated, key pasted at runtime) — and wires the `PosterStats` card and the mark counter. The filmed run depends on it: beat 6 needs the agent card's mark counter to go 0 → 1 when the refusal is marked, and beat 7 needs the meter to see the release within a poll. T-43 mounts your `LiveDashboard` in present mode; T-47 films it in live mode.

> 02-architecture, dashboard: "public, read-only, at the domain; operator controls behind an env-gated key from the first commit. Routes: `/` …, `/task/<id>` (state, proof hash + "hash matches onchain ✓", coordinate rounded to ~100 m, tx links, gated thumbnail — the receipt an external builder's agent hands them via `dashboard_url`), `/refusals` (class counts plus hand-picked examples, never a raw live feed, never the requester's identity). … OG/Twitter-card meta so every link unfurls with the escrow meter. Seeded chips on seeded **task** rows as well as worker rows."

> T-01, public routes: "`GET /public/feed` · `/public/task/:id` · `/public/refusals` · `/public/posters` · `/public/preflight?task_type=&area=` · `/public/proofs/:hash/verify` — public — never raw spec text, never an exact coordinate, never a buyer token, never a requester identity."

## 2. Exact scope
- `lib/data/live.ts` — `getLiveDashboardData({ taskId? }): Promise<DashboardData>`, isomorphic: `apiBase()` returns `process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'` on the server and `/api` in the browser (T-10's same-origin rewrite); every call `fetch(url, { cache: 'no-store' })`; the subgraph via `@legwork/subgraph-client` at `NEXT_PUBLIC_SUBGRAPH_QUERY_URL`. Sources: `GET /public/feed`, `GET /public/refusals`, `GET /public/posters`, `GET /public/preflight?task_type=verify-open&area=<featured.area ?? 'ez1dp'>`, subgraph `workers`, `outcomes`. `dataMode: 'live'`; `generatedAt` = the `Date` response header of `/public/feed` when present, else `new Date().toISOString()`. Any source failing → that section's zero/empty value plus `ScreeningLine`-free mono note `<source> unavailable`; never demo numbers in live mode.
- Mapping rules (decided here): **featured** = the row whose `task_id === taskId` when given (`?task=<id>` pins the filmed task), else the newest feed row whose status is not `refunded`; `status` → `FeaturedTask.state`: `open|claimed` → `locked`, `submitted|disputed` → `submitted`, `released` → `released`, `refunded` → `refunded`, `resolved` → `released` if `tx.release` else `refunded`; `proofPresent = Boolean(proof?.hash)`; money `workerReceives = amount_usdc`, `fee = fee_usdc`, `agentPays = escrowLocked = amount_usdc + fee_usdc` (a sum, never a subtraction). **feed** = funded rows from `/public/feed` (`TaskRowData.state` = status) merged with refused rows from `/public/refusals.recent` (`state: 'refused'`, `refusal: {class, reason}`, `type` = `task_type` or `'free-text'`), sorted by time desc, first 20; `title` = the row's `title` when the API sends one, else `<type label> · area <geohash5>` (`verify-open` → `open now?`, `photo-of` → `photo of`, `call-confirm` → `call to confirm`, `compare-two` → `compare two`); `seeded` from the row; `meta` = `posted <HH:MM> · <area>`; `call-confirm` rows keep T-10's unverified suffix. **screening** = refused entries as `REFUSED` lines (`class, reason, ruleId, specHash, marked, markTx, agentId`) plus one `PASSED` line per funded feed row (`reason: 'schema ok · placeId resolved'`, `specHash` = the row's `spec_hash`), newest first, max 12. **agent** = `id` = featured row's `buyer_agent_id` (string), else the `agent_id` of the newest marked refusal, else `'—'`; `marks` = count of `/public/refusals.recent` entries with `marked === true && agent_id === agent.id`; `lastMarkClass` = that newest entry's class; `paidOnProof` = count of subgraph `outcomes(where: {agentId, outcome: 1})`; `score: null` (hidden). **pool** = subgraph `workers`: `real` = count `seeded == false && reset == false`, `seeded` = count `seeded == true`; `highlighted` = the real worker with the most recent `lastCompletedAt` as `{ id: 'w-' + last 4 hex of the address, minutesReal: (releasedAt − postedAt)/60 of their newest released task, rounded, level: process.env.WORLD_CREDENTIAL_LEVEL === 'orb' ? 'orb' : 'selfie' }`; `rows` = every worker with `seeded` flag, `area`, `completed`. **preflight** straight from `/public/preflight` (`active, verified, seeded, score_floor → scoreFloor, median_minutes → medianMinutes, median_source → medianSource, n_real → nReal`). **posterStats** from `/public/posters` (`distinct_external_buyers`, `external_tasks`).
- `lib/data/index.ts`: the `'live'` branch calls `getLiveDashboardData`; `'demo'` unchanged (T-10) except `lib/data/demo.ts` gains `getDemoTaskReceipt(id)` and `getDemoRefusals()` built from the same JSON (unknown id → `null`).
- `lib/live/poll.ts` — `createPoller<T>({ fetchOnce, intervalMs = 3000, onChange })`: never overlaps requests; if the response carries `changed === false` it calls nothing; else it compares `JSON.stringify` of the mapped result with the previous one and calls `onChange` only on a difference; waits `max(intervalMs, poll_after_seconds × 1000)` when the response carries `poll_after_seconds`; pauses while `document.hidden`; stops on `dispose()`. `lib/live/useLiveDashboard.ts` — `useLiveDashboard(initial: DashboardData, opts?: { intervalMs?; taskId? }) → DashboardData` (client hook over the poller and `getLiveDashboardData`; returns `initial` untouched when `initial.dataMode === 'demo'`). `lib/live/LiveDashboard.tsx` — `'use client'` render-prop wrapper `LiveDashboard { initial; taskId?; children: (data) => ReactNode }`.
- `lib/data/receipt.ts` — `getTaskReceipt(id, { buyerToken? }): Promise<{ task: TaskResponse; seeded: boolean | null } | null>`: `GET /tasks/:id` (with header `X-Buyer-Token` only when `buyerToken` is given) + subgraph `task(id) { seeded }` (`null` when the subgraph fails); 404 → `null`. `lib/live/useLiveTask.ts` — polls the same route every 3 s until `status ∈ released|refunded|resolved`.
- `app/task/[id]/page.tsx` (server, thin): `DATA_MODE=demo` → `getDemoTaskReceipt`; live → `getTaskReceipt(id, { buyerToken: searchParams.t })` — the token is forwarded server-side only, never rendered, never logged, never put in a link; `null` → `notFound()`. Renders `Receipt.tsx` (presentational, takes `{ task, seeded, dataMode }`): header `task #<id>` mono + `StatusBadge status` + `MonoTag task_type` + `Chip tone="seeded">seeded` when `seeded === true` + `DEMO DATA` chip in demo mode; money line by state — `LOCKED 3.45` (open/claimed/submitted/disputed), `RELEASED 3.00 → worker · +0.45 fee` (released), `REFUNDED 3.45 → buyer` (refunded), all figures from `amount_usdc`/`fee_usdc`; proof block **only when `proof` is present**: full `proof.hash` mono (wrapping), `hash matches onchain ✓` in `--verified-500` **only when `proof.hash_ok === true`**, `hash does not match onchain — not verified` in `--refusal-500` when `hash_ok === false`, `<img>` thumbnail only when `proof.url` is present (caption `buyer-gated thumbnail · signed URL`), else the line `thumbnail gated — buyer only`; `captured <captured_at>`; `coordinate_rounded` → `≈ <lat>, <lon> · rounded to ~100 m` formatted with `toFixed(PUBLIC_COORD_DECIMALS)`, never more decimals; `gps_unavailable === true` → chip `GPS unavailable in webview — disclosed`; `answer` → `answer: <answer>` + mono `worker-reported · untrusted`; `call-confirm` → suffix `self-reported answer + timestamp (unverified)`. When `status === 'released'` and `proof` is absent, the proof block position shows the submit tx link labelled `proof hash onchain ↗` — the RELEASED line never renders without a proof reference beside it. Tx block: `post ↗`, `claim ↗`, `submit ↗`, `release ↗` for each present hash → `https://sepolia.basescan.org/tx/<hash>`, mono `shortHash`. Timeline `posted · claimed · submitted · released` timestamps where present; `area <geohash5>`. Footer chips `Base Sepolia · USDC`, `testnet USDC — not spendable`, `relayed claim · gas paid by Legwork` (when `tx.claim` exists). Live mode mounts `useLiveTask`.
- `app/task/[id]/opengraph-image.tsx` (1200×630, `ImageResponse`, ink ground, wordmark, `task #<id>`, the state word and its amounts, `proof ✓ <shortHash>` only when `hash_ok === true`; never the thumbnail, coordinate or answer) + `generateMetadata` (`Legwork · task #<id> · <STATE>`, `openGraph`/`twitter` pointing at it).
- `app/refusals/page.tsx` + `Refusals.tsx`: heading `Refusals`, line `a refused task moves no money`; the six `AbuseClass` labels (imported, order 1–6) each with its count (Archivo 40) — live from `/public/refusals.counts`, demo from `getDemoRefusals()`; zero renders `0`; total line. Section `hand-picked examples (demo data)`: the refused demo feed row and its screening line rendered as `class · reason · rule_id · spec <shortHash>` plus the `NO_RETRY_SENTENCE` once under `what the agent receives`; in live mode the same demo examples with the chip `counts live · examples demo data`. The page never renders a `/public/refusals.recent` entry, an `agent_id`, a payer, a tx or a spec text.
- `app/admin/page.tsx`: `process.env.NEXT_PUBLIC_ADMIN_UI !== '1'` → `notFound()`; `robots: { index: false }`. `AdminPanel.tsx` (`'use client'`): key field (`type="password"`, `autoComplete="off"`, React state only — never `localStorage`, `sessionStorage`, a cookie or a query string; gone on reload); buttons disabled until the key is non-empty; actions `pause`, `unpause`, `resolve` (inputs `task_id`, `to_buyer` toggle), `reset-demo`, `reset-worker` (input `nullifier`) → `POST /api/admin/<action>` with header `X-Admin-Key` and the JSON body; `resolve`, `reset-demo`, `reset-worker` need a second tap `Confirm` within 5 s; result line `ok · tx <shortHash> ↗` or the error body (`401` → `key rejected`) in `--refusal-500`, never red; line `every call is audit-logged by the API`; every control `data-hit="44"`.
- `components/PosterStats.tsx`: keeps T-10's props and copy; adds `asOf?: string` (`as of HH:MM:SS`) and the zero-state line `no external posters yet` — never a placeholder count.
- `lib/format.ts` additions: `shortHash(h) → '0x8f2a…c41d'` (`0x` + 4 hex + `…` + 4 hex), `basescanTx(h)`, `basescanAddress(a)`, `coord(lat, lon) → '≈ 39.744, −8.807 · rounded to ~100 m'`.
- `apps/dashboard/README.md` (T-10's file, inside `apps/dashboard/**` — edit only the sections `Live mode`, `Routes`, `Admin`): env, the `?task=` pin, the receipt token rule, the admin flow.

## 3. Out of scope
- Components other than `PosterStats.tsx` (frozen, T-10; `BLOCKED:` if one lacks a prop you need). `app/page.tsx`, `app/layout.tsx`, `app/(present)/**`, `components/EscrowMeter.tsx` — T-43 mounts `LiveDashboard` in present mode; `/` normal mode re-fetches on load (`cache: 'no-store'`). Playwright — T-39. The PNG read — T-47. API behaviour, audit log, admin auth — T-19. Subgraph handlers — T-09.
- Do not touch: `demo-data.json`, `packages/**`, `apps/api/**`, `apps/miniapp/**`, `.env.example`, `.github/**`, `apps/dashboard/package.json`.

## 4. Owned paths
```
apps/dashboard/lib/**   apps/dashboard/app/task/**   apps/dashboard/app/refusals/**   apps/dashboard/app/admin/**
apps/dashboard/components/PosterStats.tsx   apps/dashboard/test/live*.test.tsx
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `GET /tasks/:id?wait=0..50` | `packages/shared/src/api-contract.ts`, `docs/api.md` | public (+ optional `X-Buyer-Token` reveals `proof.url`) → `{task_id, status, task_type, amount_usdc, fee_usdc, area, posted_at, claimed_at?, submitted_at?, released_at?, answer?: WorkerAnswer, proof?: {hash, hash_ok, url?, captured_at, coordinate_rounded?: {lat,lon}, gps_unavailable}, tx:{post, claim?, submit?, release?}, dashboard_url, changed: boolean, poll_after_seconds}` — frozen |
| `GET /public/feed` · `/public/refusals` · `/public/posters` · `/public/preflight?task_type=&area=` | same | public; never raw spec text, never an exact coordinate, never a buyer token, never a requester identity. **Expected shapes** (T-19; `api-contract.ts` is the authority — where it differs, follow it and list the difference in the PR; a missing field → `INTERFACE REQUEST:` + the fallback in §2): feed `{tasks: [{task_id, status, task_type, title?, amount_usdc, fee_usdc, area, posted_at, released_at?, seeded, spec_hash, buyer_agent_id?, tx:{post, claim?, submit?, release?}}], generated_at}` · refusals `{counts: Record<AbuseClass, number>, total, recent: [{at, task_type, class, reason, rule_id, spec_hash, marked, mark_tx?, mark_status?, agent_id?}]}` · posters `{distinct_external_buyers, external_tasks}` · preflight = the MCP `preflight_workers` result `{active, verified, seeded, median_minutes: number|null, median_source: 'real'|'seeded'|'n/a', n_real, score_floor, dashboard_url}` |
| `POST /admin/pause` · `/unpause` · `/resolve` (`{task_id, to_buyer}`) · `/reset-demo` · `/reset-worker` (`{nullifier}`) | same | admin-key (`X-Admin-Key`) → `{ok:true, tx?}`; every call audit-logged; `401 {error:'unauthorized'}` |
| Generic errors | same | `429 {error:'rate_limited', retry_after_s}` (wait `retry_after_s`) · `404 {error:'not_found'}` |
| Subgraph `Worker { id, nullifier, seeded, reset, area, taskTypes, completed, lastCompletedAt, score, distinctRaters, registeredAt }` · `Task { id, …, buyerAgentId, state, postedAt, releasedAt, seeded }` · `Outcome { agentId, task, outcome, at }` · `Mark { agentId, classId, specHash, at, tx }` | `subgraph/schema.graphql` (frozen) via `@legwork/subgraph-client` (T-09) | use the client's exported query function; if its names differ from your assumption, use what it exports and name it in the PR — never add a second GraphQL fetcher |
| `DashboardData`, `FeaturedTask`, `TaskRowData`, `AgentData`, `PoolData`, `ScreeningLine`, `PreflightData`, `poolString`, `usdc`, `Chip`, `StatusBadge`, `MonoTag`, `AgentCard` (`data-testid="mark-counter"`, `data-from`, `data-to`, `data-value`, `is-animating` 600 ms), `PosterStats { stats }` | `apps/dashboard/lib/data/types.ts`, `lib/format.ts`, `components/*` (T-10) | shapes verbatim; `ScreeningLine` has no spec text field — keep it that way |
| `AbuseClass` (six labels verbatim), `TaskState`, `NO_RETRY_SENTENCE`, `PUBLIC_COORD_DECIMALS = 3`, `DemoData` | `packages/shared` | import; never retype |
| Env | `.env.example` | `DATA_MODE=live\|demo` (server), `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUBGRAPH_QUERY_URL`, `WORLD_CREDENTIAL_LEVEL` (server), `NEXT_PUBLIC_ADMIN_UI` (new, public flag, value `1`; declare with `ENV REQUEST:` — the lead adds it to `.env.example`) |
| `msw` (`msw/node` `setupServer`, `onUnhandledRequest: 'error'`), `vitest`, `@testing-library/react` | `apps/dashboard/package.json` (T-00 catalog) | missing → `DEP REQUEST:` and stop |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `getLiveDashboardData({ taskId? })`, `getDashboardData('live', { taskId? })` | `lib/data/live.ts`, `lib/data/index.ts` | pages, T-43, T-47 (`?task=` pin) |
| `LiveDashboard { initial; taskId?; children: (data) => ReactNode }`, `useLiveDashboard(initial, opts?)` | `lib/live/LiveDashboard.tsx`, `lib/live/useLiveDashboard.ts` | T-43 (`PresentCanvas`), T-39 |
| `createPoller`, `useLiveTask(initial)` | `lib/live/poll.ts`, `lib/live/useLiveTask.ts` | receipt, T-43 |
| `getTaskReceipt(id, { buyerToken? })`, `Receipt` | `lib/data/receipt.ts`, `app/task/[id]/Receipt.tsx` | T-47 (receipt unfurl check) |
| `shortHash`, `basescanTx`, `basescanAddress`, `coord` | `lib/format.ts` | T-43, T-42 (phone copies the Basescan pattern) |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-26` — it must print `CLAIMED T-26`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read `AGENTS.md`, `apps/dashboard/README.md`, `lib/data/types.ts`, `lib/data/demo.ts`, `api-contract.ts` (the routes above), `subgraph/schema.graphql`, the `@legwork/subgraph-client` README.
2. Record fixtures under `test/fixtures/live/*.json`: `feed.json` (4 rows: released verify-open `amount_usdc: 3, fee_usdc: 0.45`, submitted photo-of `seeded: true`, open compare-two `seeded: true`, one claimed), `refusals-0.json` / `refusals-1.json` (the second adds one marked entry `class: 'authentication circumvention'`, `agent_id: '8004-1207'`, `mark_tx`), `posters.json`, `preflight.json`, `task-7-released.json` (`hash_ok: true`, `coordinate_rounded: {lat: 39.744, lon: -8.807}`, all four tx), `task-7-mismatch.json` (`hash_ok: false`), `task-8-locked.json` (no `proof`), `workers.json`, `outcomes.json`. All Leiria; no `spec`, `payer` or exact coordinate anywhere.
3. `lib/format.ts` additions → `lib/data/live.ts` + mapping unit tests → `lib/data/index.ts` live branch.
4. `lib/live/poll.ts`, `useLiveDashboard`, `LiveDashboard`, `useLiveTask` (fake timers in tests).
5. Receipt: `lib/data/receipt.ts`, `app/task/[id]/{page,Receipt,opengraph-image}.tsx`.
6. `/refusals`, then `/admin`, then `PosterStats.tsx`.
7. Tests (§8), README sections, PR. Note in the PR which expected fields of §5 the real `api-contract.ts` lacked.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `taskReceiptRehashes` | `Receipt` with `task-7-released.json` shows `hash matches onchain ✓` exactly once and the full hash; with `task-7-mismatch.json` the text is absent and `hash does not match onchain — not verified` is present; with `task-8-locked.json` neither string renders and there is no `img`; the released render contains `3.00`, `0.45`, `3.45` and no string starting `2.`; `≈ 39.744, −8.807` renders and no coordinate with more than 3 decimals appears; four Basescan links present in the released case, one (`post`) in the locked case |
| `refusalsNeverRawSpec` | `Refusals` fed a live fixture whose `recent` entries carry extra fields `spec: 'SPEC-LEAK'`, `payer: '0xPAYER'`, `agent_id: '8004-1207'`, `mark_tx: '0xMARK'` renders none of those four strings; all six class labels render verbatim with their counts; the examples section contains `authentication circumvention` and the `NO_RETRY_SENTENCE`; the chip `counts live · examples demo data` is present |
| `markCounterAnimates` | `LiveDashboard` with msw returning `refusals-0.json` renders `AgentCard` with `[data-testid="mark-counter"][data-value="0"]`; swap the handler to `refusals-1.json`, advance fake timers 3 s → the counter has class `is-animating`, `data-from="0"`, `data-to="1"`; after 600 ms `data-value="1"` and `task-refused:authentication circumvention` renders; the escrow meter's outer HTML is identical before and after |
| `adminHiddenWithoutFlag` | with `NEXT_PUBLIC_ADMIN_UI` unset the admin route calls `notFound()` (mocked) and renders no `AdminPanel`; with `'1'`, the panel renders the key field and five buttons all disabled; typing a key enables them; clicking `pause` sends `POST /api/admin/pause` with header `X-Admin-Key: <key>`; `resolve` sends nothing until `Confirm`; the key never appears in `document.body.innerHTML`, `localStorage` or `sessionStorage` |
| `liveFeedMergesRefusalsWithoutSpec` | `getLiveDashboardData()` over the fixtures: `feed` has 5 rows sorted newest first, the refused row has `state: 'refused'`, `refusal.class === 'authentication circumvention'`, `type: 'call-confirm'`; seeded rows have `seeded: true`; `featured` is the newest non-refunded row with `agentPays 3.45`, `escrowLocked 3.45`, `workerReceives 3.00`, `fee 0.45`; `JSON.stringify(result)` contains neither `SPEC-LEAK` nor `0xPAYER`; `pool` is `{real: 1, seeded: 20}` and `poolString` gives `1 real · +20 seeded (demo data)`; `dataMode === 'live'` |
| `pollShortCircuitsOnUnchanged` | `createPoller` with a fetch returning `{changed: false}` three times calls `onChange` zero times; a response with `poll_after_seconds: 7` delays the next request to ≥ 7 s; identical mapped results call `onChange` once; requests never overlap (a slow fetch is awaited before the next tick) |
| `pnpm --filter @legwork/dashboard build` | passes with `DATA_MODE=live` and with `DATA_MODE=demo`; routes `/task/[id]`, `/task/[id]/opengraph-image`, `/refusals`, `/admin` listed |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/dashboard typecheck && pnpm --filter @legwork/dashboard lint
pnpm --filter @legwork/dashboard test
DATA_MODE=live NEXT_PUBLIC_API_BASE_URL=http://localhost:3001 pnpm --filter @legwork/dashboard build
DATA_MODE=demo pnpm --filter @legwork/dashboard build
grep -rn "ADMIN_API_KEY\|GRAPH_API_KEY" apps/dashboard --include=*.ts --include=*.tsx | grep -v test ; echo "expect no output"
```
Expected: clean typecheck/lint; T-10's 6 tests plus your 6 named tests green; both builds list the four new routes; the grep prints nothing.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`. Hours with a space (`1 h 40 min`), never `<n>h`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). `agentPays` is `amount + fee`; never `amount − fee`; never a figure the API did not send or that is not that sum.
- No secrets in code or client bundles: `ADMIN_API_KEY` is never an env of the dashboard, never under `NEXT_PUBLIC_*`, never persisted — the operator pastes it; `GRAPH_API_KEY` never reaches the client (the browser queries only `NEXT_PUBLIC_SUBGRAPH_QUERY_URL`); the buyer token from `?t=` is forwarded server-side once and never rendered. You may not edit `.env.example`.
- Tests never call a live model or a live chain; network = msw with `onUnhandledRequest: 'error'`; fixtures are recorded JSON.
- Public-surface rule (T-01, verbatim): "never raw spec text, never an exact coordinate, never a buyer token, never a requester identity." Your types have no `spec`, `payer` or exact-coordinate field, so a leak cannot be mapped by accident; `/refusals` never shows an agent id either.
- Leiria only (`ez1dp`, `Farmácia Central · Rua Direita 12, Leiria`, `39.744, −8.807`); the verified chip is always above the fold on the phone (the receipt's chips sit in the header, not the footer, when `gps_unavailable`); hit targets ≥ 44 px on every control (`data-hit="44"`).
- Nothing copied from `pitch/` or `design-system/`; T-10's components are imported, not re-drawn.
- Tokens you need (ink ground): `--ink-900 #0D0F0E` page · `--ink-800 #151816` card · `--ink-700 #202522` tag fill · `--border-1 #262C28` card border · `--border-2 #2A302C` neutral chip border · `--fg-1 #F1EFE9` primary · `--fg-2 #C9CCC7` body · `--fg-3 #8B918D` muted / seeded · `--fg-4 #5B615D` dim · `--verified-500 #35C79A` verified / released — the only accent · `--verified-border rgba(53,199,154,.5)` · `--refusal-500 #E4A33F` refusal amber, never red · `--refusal-border rgba(228,163,63,.45)`. Type: Archivo numerals (stat-sm 40 for class counts), Inter body 18/15, JetBrains Mono for ids, hashes, chips, labels (uppercase, +0.1em). Cards radius 12, 1 px border, no shadow, no gradient, no blur, no emoji, no icon font; unicode `✓ · ↗ ●` only. Red exists nowhere.
- Legibility floors (verbatim): "nothing the narration mentions renders below 24 px in the delivered 1080p frame; the honesty chips, the refusal class + reason line, the escrow states and the three preflight numbers are ≥ 32 px at design size — mark them `data-floor="32"`, everything narrated `data-floor="24"`." The receipt, refusals and admin pages are not filmed and carry no `data-floor`; the live adapter must not strip any attribute T-10 set.
- Honesty chips are brand elements, never fine print: `sandbox World ID` · `operator-attested` · `relayed claim · gas paid by Legwork` · `testnet USDC — not spendable` · `GPS unavailable in webview — disclosed` · `1 real · +20 seeded (demo data)` · `seeded` · `DEMO DATA` (whenever `DATA_MODE=demo`, never in live) · `ERC-8004 identity`.
- The ten hard rules (verbatim): (1) The three locked copy blocks (tagline, claim, trust model) are reproduced exactly. (2) Never show escrow releasing without a proof above or beside it; never show a refusal moving the escrow meter — "a refused task moves no money". (3) The tag is `task-refused` (never "violation"); the name is Legwork. (4) Standards spelled exactly: World ID, Selfie Check, ERC-8004, x402, USDC, Base Sepolia. (5) "Bot-proof, not fraud-proof"; "bounded, attributable work"; never "trustless". (6) No faces anywhere — the worker is hands and a phone. (7) Locations are Leiria. Never Brooklyn, never "24h". (8) The filmed worker account shows only what it actually earned. (9) Every seeded row — worker or task — carries a `seeded` chip; the pool reads "1 real · +20 seeded (demo data)". (10) Fee figures are **3.45 / 3.00 / 0.45** (agent pays / worker receives / fee) on every surface; no deducted-fee numbers anywhere.
- Rule (2) here: refused entries never become `FeaturedTask` (only funded feed rows can); the receipt's RELEASED line always has the proof block or the `proof hash onchain ↗` link beside it. Rule (9) here: `seeded` comes from the API/subgraph flag, never inferred; `seeded === null` on the receipt renders the mono line `seeded status unavailable`, never silence.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed (plus the three named README sections).
- [ ] Verification output from §9 pasted into the PR; the list of §5 fields the real contract lacked pasted too.
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-26 — Dashboard live data
owned-paths:
  - apps/dashboard/lib/**
  - apps/dashboard/app/task/**
  - apps/dashboard/app/refusals/**
  - apps/dashboard/app/admin/**
  - apps/dashboard/components/PosterStats.tsx
  - apps/dashboard/test/live*.test.tsx
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
Contract deltas: <fields of §5 missing or renamed in api-contract.ts, or "none">
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need>` on the PR, stop, and do not work around it. Frozen interfaces: `INTERFACE REQUEST:`. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.
Known at dispatch — comment at start, continue with the written fallback: `ENV REQUEST: NEXT_PUBLIC_ADMIN_UI=0|1 in .env.example` (fallback: read it anyway; unset means hidden). `INTERFACE REQUEST: /public/feed rows need seeded, spec_hash, buyer_agent_id?, title?; /public/refusals needs counts + recent[].agent_id?` (fallbacks: `seeded` from the subgraph `Task`, `title` composed, `agent.id` from the newest marked refusal). If `@legwork/subgraph-client` exposes no `query(document, variables)`-style function, `BLOCKED:` — do not write your own fetcher.

## 14. Reviewer notes
Open `lib/data/live.ts` first (featured never a refused row; `agentPays` a sum; no `spec`/`payer` reaches `DashboardData`; `seeded` from the flag), then `Receipt.tsx` (`hash_ok === true` strict; thumbnail only on `proof.url`; RELEASED never without a proof reference; `?t=` never rendered), then `Refusals.tsx` (renders demo examples, never `recent`), then `AdminPanel.tsx` (key in state only; flag check on the server page). Most likely wrong: the poller overlapping requests or ignoring `changed: false`; `coordinate_rounded` re-formatted with 4+ decimals; `agent_id` leaking onto `/refusals` via the `ScreeningLog` component; the admin flag read with `process.env[dynamicKey]` (Next inlines only the literal `process.env.NEXT_PUBLIC_ADMIN_UI`).

## 15. Round 2+
Round 2 (Sept 6, #86 merged): the INTERFACE REQUEST for `feed[].buyer_agent_id` / `recent[].agent_id` was **declined** — a requester identity stays off the public API; the agent card reads `Task.buyerAgentId` and the `Mark` entity from the subgraph (`agentHandle`, `abuseClassById`). `highlighted.level` is carried through the browser poll (`getLiveDashboardData({ taskId, level })`) because `WORLD_CREDENTIAL_LEVEL` is a server var. Fixtures live under `lib/data/fixtures/live/` (accepted; `test/fixtures/**` was never in §4). `apps/dashboard/README.md` belongs in §4/§12. `getDashboardData` stays synchronous; `loadDashboardData(mode, { taskId?, state? })` is the awaited form, and the lead wired `/` (`LiveMissionControl`), `/present` and the OG image to it in the wave-3 sync. `NEXT_PUBLIC_ADMIN_UI` was already in `.env.example`.
