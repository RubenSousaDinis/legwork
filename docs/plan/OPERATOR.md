# Operator-only work (cannot be delegated to a coding agent)

Compiled from 07-pre-kickoff, 03-schedule, 05-demo-video, 06-prizes and 13-build-plan. Times UTC (Lisbon = UTC+1). Items marked **new** were surfaced by the build plan and are not in 07.

## Sept 3 (tonight)
- [ ] Read the employment contract's IP-assignment / outside-work clauses (gates the Day-1 MIT `LICENSE`).
- [ ] **Keys and funds** — split **four ways** (deployer · relayer · attestation verifier · AbuseMark signer) plus the buyer, the CLI worker and a treasury address; Base Sepolia ETH for every key that sends; USDC front-loaded (~30 seeded lifecycles + a dozen filmed takes + the relayer float); RPC key; Graph Studio account + subgraph slot + **deploy key** + query API key; Bazantic account; Anthropic key with the **$40 cap**; a dedicated keystore, never personal keys. Put everything in `~/legwork.env` using the names in `repo-seed/env-example.draft.md`.
- [ ] **new** Supabase project (Postgres + Storage): note `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; create the private bucket `proofs`.
- [ ] **new** World Developer Portal: besides the staging app + action `legwork-worker` + Sandbox access + the backup worker as a test user, create the **RP (`rp_id`) and its signing key** (IDKit v4 needs it; it is separate from `app_id`). Decide the demo World ID account and reserve its first registration for the camera.
- [ ] Email `developers@toolsforhumanity.com` for Selfie Check (Beta) access — the longest-lead item.
- [ ] Discord questions (verbatim texts in 07 item 3): ETHGlobal (phone screen recording; file vs URL), World (Orb-level sandbox acceptable? Selfie Check in the simulator?), The Graph (Studio query URL as "live data"? Subgraph MCP as composing?).
- [ ] Name check + buy/park the domain + X and Farcaster handles; decide whether a GitHub org carries the brand (the repo is `RubenSousaDinis/legwork` unless it does).
- [ ] Dry-run World ID on the demo phone (unmodified IDKit example vs the simulator; the 20-line HTTPS probe page in World App) — configuration only, commit nothing.
- [ ] Pick the shop (hand-written or seasonal closure note; not a farmácia de serviço; owner's verbal OK; dated screenshot of the listing); book the demo worker for Sat Sept 12 with a Thu Sept 10 backup.
- [ ] Recording rig; Base Builder Score prerequisites; five minutes in World App (Bounti live? Gigbot active?).
- [ ] **new** `gh auth login` on the machine that will run T-00; Vercel account with the GitHub app installed; `SWEEP_SECRET` and `ADMIN_API_KEY` generated.

## Sept 4 — Day 1
- [ ] **12:00** Sandbox-access checkpoint: nothing landed → escalate in the World Discord; pre-stage the simulator route.
- [ ] **16:00** kickoff. While the lead runs T-00: create the three Vercel projects (`legwork-api`, `legwork-miniapp`, `legwork-dashboard`, Hobby, Node 22) and set env vars from `~/legwork.env`; add `API_BASE_URL` + `SWEEP_SECRET` as GitHub Actions secrets.
- [ ] **~16:45** register the stable mini-app URL (`https://<legwork-miniapp>.vercel.app`) in the Developer Portal **once**; confirm in the T-00 PR.
- [ ] **~17:00–19:00** S2' on the phone via the deployed `/probe` page (T-05) with the unmodified flow: credential level string + payload shape → `docs/spikes/RESULTS.md#S2` and `FEEDBACK-WORLD.md` §3 (screenshot every error dialog).
- [ ] **19:00** Building Trust Online (Mateo Sauton): ask the two World questions live.
- [ ] **~19:30** copy `~/legwork.env` into the local worktrees of class-L tasks (T-03, T-04); never into a cloud session.
- [ ] **22:00** circuit breaker: no World ID credential of any level verified end to end → switch to `../hackathon/` (Chaperone). Otherwise nobody switches.
- [ ] Build-in-public post #1 (what the spikes returned).

## Sept 5 — Day 2
- [ ] Morning: with the lead, run `forge script Deploy` + `Seed` (T-14) — deployer key, Basescan verification, `deployments/base-sepolia.json` committed; fund the relayer float; allowlist the buyer and the CLI worker.
- [ ] Set the four contract addresses in Vercel env; redeploy.
- [ ] Evening: `graph deploy` (T-23) with the deploy key; set `SUBGRAPH_QUERY_URL` + `GRAPH_API_KEY` in Vercel.
- [ ] Phone test of the auth flow once T-24 merges; FEEDBACK-WORLD pass 2 notes to the T-41 issue.

## Sept 6 — Day 3
- [ ] Watch T-29 (green headless loop) run at ~15:00; record the two terminal inserts from real responses (fresh terminal, no keys in scrollback).
- [ ] Build-in-public post #2 with the release tx link.
- [ ] Phone: claim test after T-25 merges.

## Sept 7–8 — Days 4–5 (evenings)
- [ ] Full phone run (verify → claim → proof → submit → release) with the **backup** World ID — never the demo one (`resetWorker` exists for rehearsals only).
- [ ] Check-in #1 before sleep (due Sept 8 03:59).
- [ ] Time a fresh install → verify → claim; write the number in RESULTS `#Timing`.
- [ ] **Sept 8 19:30** Bazantic recipes session (slot 3 depends on it).

## Sept 9 — Day 6 (GO/NO-GO)
- [ ] The criterion (03): an agent posts a paid task through x402 → the operator's own phone claims via the relayer → proof → release → reputation moves and `paid-on-proof` lands, all on Base Sepolia, filmed once. GREEN → film insurance footage that hour. RED → take the pre-planned pivot that evening; "do not spend Day 7 debugging".
- [ ] Poster hunt #1 (20 min, only after GREEN); post #3.

## Sept 10–11 — Days 7–8 (evenings)
- [ ] Draft the narration against the live dashboard (Sept 10); check-in #2 before sleep (due Sept 11 03:59).
- [ ] Export one 1280×720 PNG of the composited frame and read it at arm's length (T-47); cut a card if a chip is illegible.
- [ ] Poster hunt #2; post #4 (the live feed).

## Sept 12 — Day 9
- [ ] **12:00** code freeze (docs + `hotfix` only).
- [ ] Bazantic, 2–3 h hard cap: gateway on the Task API (import `openapi.json`), the "Agentify a New API" recipe, the "Best Recipe" recipe only if cheap, two screen recordings, username noted.
- [ ] The booked demo-worker hour: one `verify-open` at the shop (+ one `photo-of` only if the dedup beat shipped); tripod/webcam B-roll — feet, a hand framing the sign, the phone in front of the storefront; the hero frame; **€20 to the worker, disclosed**.
- [ ] Scratch narration timed to a stopwatch; full composite with burned-in captions and both inserts; rough assembly uploaded; poster hunt #3.

## Sept 13 — Day 10
- [ ] Final narration (real voice), audio replace, export ≥ 720p; README review with the lead (T-49); submission form (60–90 min): select World (Selfie Check), The Graph (AI From Scratch; Composable only if both Discord answers were yes), Bazantic (both open tracks if both recipes exist); **submit by 13:00 UTC**; confirm the ETH stake; launch thread ~14:00.

## Sept 14–17
- [ ] Round-2 live judging Sept 14 16:00 (screen-share + real voice, camera off — tell the organisers up front). Finale Sept 16 16:00. Publish `FEEDBACK-WORLD.md` and send it to Mateo Sauton on Sept 17.
