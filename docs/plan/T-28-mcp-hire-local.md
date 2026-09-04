---
id: T-28
title: MCP local mode — paying hire_human, stdio binary, README
lane: B
day: 3
size: M
agent_class: C
must: true
depends_on: [T-27, T-16]
owned_paths:
  - packages/mcp/src/tools/hire.ts
  - packages/mcp/src/tools/hire.test.ts
  - packages/mcp/bin/**
  - packages/mcp/README.md
labels: [area:mcp, wave:3, size:M, agent:cloud]
branch: t-28/mcp-hire-local
---

# T-28 — MCP local mode — paying hire_human, stdio binary, README

## 1. Context
This is the beat the video is built on: an agent calls `hire_human`, gets a 402, pays 3.45 USDC on Base Sepolia through x402, and gets back a task id — in one tool call, no human in the loop. Claude Code's MCP client cannot answer an x402 challenge, so the paying path runs **locally**: `npx @legwork/mcp` starts a stdio MCP server that holds `BUYER_PRIVATE_KEY` and pays `POST /tasks` with `@x402/fetch`. T-27 built the server, the five other tools, the `TokenStore` and the `hireHuman` hook; this task supplies the hook (`src/tools/hire.ts`), the binary (`bin/legwork-mcp.ts`) and the package README. `examples/agent.ts` (T-34), the terminal inserts (T-44) and `SKILL.md` (T-31) consume it.

> **Approved plan, decision #7:** `packages/mcp` runs **hosted** (mounted at `/mcp`: `preflight_workers`, `check_task`, `task_status`, `approve_task`, `dispute_task`; `hire_human` returns a structured `payment_required` with the REST requirements + the local install line) and **local** (`npx @legwork/mcp` with `BUYER_PRIVATE_KEY`, all six tools, pays the REST API via `@x402/fetch`). `examples/agent.ts` and the filmed insert use local mode. Video beat 10 / `SKILL.md` say so honestly.

> **Approved plan, decision #8 — `buyer_token`:** Task ids are public (events, subgraph, `/task/<id>`), so "possession of the taskId authorizes approve/dispute" is unsafe. `POST /tasks` returns `{task_id, buyer_token, …}`; approve/dispute/refund require it; the relayer executes onchain.

> **02-architecture.md — Task API:** x402 seller (exact-EVM scheme, USDC on Base Sepolia, reference facilitator). Order on `POST /tasks`: `/verify` the payment authorization (no money moves) → screen → if refused: AbuseMark (if the payer has an identity) and a 4xx that names the class and the reason → if accepted: `TaskEscrow.post(…, buyer = payer)` from the operator float → `/settle` with an idempotency key on the authorization nonce (a retried settle cannot double-charge). A failed `post` never takes the agent's money.

Consequence for this task: a **refused** hire signs a payment authorization that is verified but never settled — "a refused task moves no money." — and the tool must show that as a refusal, not as a payment error.

## 2. Exact scope
- `packages/mcp/src/tools/hire.ts` exports `localHire: LocalHireHandler` (type from T-27's `context.ts`) and `createPayFetch(privateKey: Hex, baseFetch = fetch): typeof fetch`.
- `createPayFetch` builds an x402 client with the EVM exact scheme from `@x402/evm` and a viem account from the key, and wraps `baseFetch` with `wrapFetchWithPayment` from `@x402/fetch`. The key is read by the **binary** from `process.env.BUYER_PRIVATE_KEY` and passed in; `hire.ts` never reads env, never logs, stringifies or echoes the key or the account address at any log level.
- `localHire(input, ctx)`: validates `input` with the contract's `hire_human` input schema; builds the `Envelope` `{task_type, spec, amount_usdc, need_by?, agent_id?}` (TTLs take the shared defaults; `dispute_window_s` is **not** set by the tool — the API applies `DEMO_DISPUTE_WINDOW_S` for allowlisted buyers); `POST {ctx.apiBase}/tasks` through the pay-fetch; the x402 library performs `402 → sign → retry` transparently.
- On **201**: `await ctx.tokenStore.set(String(task_id), buyer_token)`; return `{task_id, status, eta_seconds, poll_after_seconds, dashboard_url}` — the `buyer_token` is **never** part of the tool result.
- On **422**: return the `RefusalPayload` unchanged (`message === NO_RETRY_SENTENCE`), `isError` not set; no retry, no rephrase.
- On **400** / **429**: return the API's error body plus `dashboard_url`, `isError: true`. On a network or payment-library failure: `isError: true`, text naming the step (`payment_signing_failed` | `api_unreachable`), never the key, never the raw exception with a stack.
- Insert output: when `LEGWORK_INSERT=1`, every hire prints **three lines to stderr** (stdout is the MCP protocol stream): line 1 `hire_human(<task_type> · <place name>, <locality> · <amount> USDC)`; line 2 `→ 402 payment_required · <price> USDC (<amount> + <fee> fee) · eip155:84532`; line 3 `→ 201 { task_id: <id> } · escrow locked <price>` (201 is the frozen success code for `POST /tasks`; no URL in frame — the pre-record rule). Each line ≤ 72 characters, plain ASCII apart from `→` and `·`, no colour codes. For the demo task: `3.00 USDC`, `3.45 USDC (3.00 + 0.45 fee)`, `escrow locked 3.45`.
- `packages/mcp/bin/legwork-mcp.ts` (compiled to `dist/bin/legwork-mcp.js`, shebang, referenced by the `bin` field T-27 added): no arguments → start `createLegworkMcp({mode:'local', apiBase, dashboardUrl, subgraph?, tokenStore: new FileTokenStore(), fetchImpl: fetch, hireHuman: localHire})` over `StdioServerTransport`; `payFetch` is created once from `BUYER_PRIVATE_KEY`. Missing key → exit code 2 with `BUYER_PRIVATE_KEY is not set (read from the environment only; never passed as a flag)` on stderr. Env: `LEGWORK_API_URL` (default `DEFAULT_API_BASE`), `LEGWORK_DASHBOARD_URL` (default `DEFAULT_DASHBOARD_URL`), `SUBGRAPH_QUERY_URL` (optional; absent → preflight via the API).
- `legwork-mcp --help` (also `-h`, `help`) prints usage to stdout and exits 0: modes, the env vars above, the install line `claude mcp add legwork -- npx @legwork/mcp`, the from-source alternative, the tokens file path and mode, the money line. `legwork-mcp --mode hosted` starts the same stdio server in hosted mode (no key needed; `hire_human` answers `payment_required`) for local testing.
- `legwork-mcp hire <envelope.json>`: one-shot hire outside the MCP loop that prints the three insert lines to **stdout** and exits 0 (1 on refusal, 2 on error) — the input to T-44's inserts script.
- `packages/mcp/README.md`: install (npm line + from-source line `claude mcp add legwork -- node <repo>/packages/mcp/dist/bin/legwork-mcp.js`), the two modes in a table (which tools pay, which never do), env vars, `~/.legwork/tokens.json` (0600; what it holds; how to approve from another machine by passing `buyer_token`), the honesty lines below, the insert, "tests never touch a live facilitator or chain".

## 3. Out of scope
- The server, the five other tools, `TokenStore`, `http.ts`, `route.ts`, `package.json` — **T-27** (request changes in its PR thread, never edit).
- The Task API's x402 handler, `FakeFacilitator`, `X402Gateway` — **T-15/T-16**. Direct-funding substitute — **T-16b** (if dispatched, it replaces the pay-fetch with two transactions; code against `ctx` so the swap is local to `hire.ts`).
- `SKILL.md`, `docs/mcp.md` — **T-31**. `examples/agent.ts` — **T-34**. `scripts/inserts.ts` — **T-44**.
- Publishing `@legwork/mcp` to npm — operator (see §13).
- Do not touch: `packages/mcp/src/*.ts`, `packages/mcp/src/tools/{preflight,check,status,approve,dispute,hire-hosted,result}.ts`, `packages/mcp/test/**`, `packages/mcp/package.json`, `packages/shared/**`, `apps/**`.

## 4. Owned paths
```
packages/mcp/src/tools/hire.ts
packages/mcp/src/tools/hire.test.ts
packages/mcp/bin/**
packages/mcp/README.md
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `createLegworkMcp`, `LegworkMcpOptions`, `ToolContext`, `LocalHireHandler`, `toolResult`, `DEFAULT_API_BASE`, `DEFAULT_DASHBOARD_URL` | `packages/mcp/src/{server,context,tools/result}.ts` (T-27) | the hook signature `(input, ctx) => Promise<HireHumanResult>`; `ctx.apiBase`, `ctx.dashboardUrl`, `ctx.tokenStore`, `ctx.fetch` |
| `TokenStore`, `FileTokenStore` | `packages/mcp/src/keychain.ts` (T-27) | `set(taskId, token)`; file `~/.legwork/tokens.json`, 0600 |
| `hire_human` schemas | `packages/shared/src/mcp-contract.ts` | input `{task_type, spec, amount_usdc, need_by?, agent_id?}`; local result `{task_id, status, eta_seconds, poll_after_seconds, dashboard_url}` or `RefusalPayload` |
| `POST /tasks` | `packages/shared/src/api-contract.ts` | x402 (`PAYMENT-SIGNATURE`; price = `amount × 1.15`); **201** `{task_id, buyer_token, status:'open', spec_hash, price_usdc, eta_seconds, poll_after_seconds, dashboard_url}`; **402** `{error:'payment_required', price_usdc, accepts, remaining_budget}`; **422** `RefusalPayload`; **400** `{error:'invalid_request', field, reason}`; **429** `{error:'cap_exceeded', open_tasks, daily_usdc}` |
| `Envelope`, `RefusalPayload`, `NO_RETRY_SENTENCE`, `priceWithFee`, `toUsdcUnits` | `packages/shared` | envelope shape; the sentence; 3.00 → 3.45 |
| `wrapFetchWithPayment`, x402 client, EVM exact scheme | `@x402/fetch`, `@x402/evm` (catalog) | transparent `402 → sign EIP-3009 → retry`; check the pinned version's README for the exact registration call |
| `X402Gateway`, `FakeFacilitator` | `packages/payments` (T-15) | test double: verifies/settles a payment header with no chain and no live facilitator |
| `StdioServerTransport` | `@modelcontextprotocol/sdk` | stdio server; stdout is protocol, stderr is free |
| Env | `.env.example` | `BUYER_PRIVATE_KEY`, `API_BASE_URL`, `DASHBOARD_URL`, `SUBGRAPH_QUERY_URL` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `localHire: LocalHireHandler`, `createPayFetch(privateKey, baseFetch?)` | `packages/mcp/src/tools/hire.ts` | `bin/legwork-mcp.ts`, T-34, T-16b (swap point) |
| `legwork-mcp` CLI: default (local stdio), `--mode hosted|local`, `--help`, `hire <envelope.json>`; `LEGWORK_INSERT=1` stderr insert | `packages/mcp/bin/legwork-mcp.ts` | `claude mcp add legwork -- npx @legwork/mcp`, T-34, T-44 |
| Install and honesty text | `packages/mcp/README.md` | T-31, T-37, T-48 |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-28` — it must print `CLAIMED T-28`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read T-27's `context.ts`, `server.ts`, `keychain.ts`, `tools/result.ts` and `tools/hire-hosted.ts` (mirror its result-building, not its behaviour). Read `packages/payments/src` for `X402Gateway` + `FakeFacilitator` construction, and `apps/api/app/tasks/route.ts` (T-16) for how the 402 body and the settle step are produced — you will reproduce that contract in a test double, not import the route.
2. Write `createPayFetch`; unit-test that it adds a `PAYMENT-SIGNATURE` header only after a 402 and never on the first request.
3. Write `localHire` per §2; refusals and errors before the happy path.
4. Test harness for `localHirePaysAndStoresToken`: a throwaway `node:http` server on `127.0.0.1:0` whose `POST /tasks` uses the **real** `X402Gateway` with `FakeFacilitator` (screening stubbed to accept): no header → the frozen 402 body; header → `verify` → `settle` → 201 with a generated `buyer_token`. Buyer key = the well-known Anvil account #0 key (public test vector; not a secret). `msw` for the 422/400/429 cases.
5. `bin/legwork-mcp.ts`: argument parsing by hand (no new dependency), `--help` text, env handling, exit codes; `hire <file>` one-shot; `LEGWORK_INSERT` stderr lines; wire `hireHuman: localHire`.
6. README per §2. Run §9.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `localHirePaysAndStoresToken` | against the §7-4 harness: first request has no `PAYMENT-SIGNATURE`, second has one; `FakeFacilitator.verify` and `.settle` each called once; `tokenStore.get('<task_id>')` equals the token the server issued; the tool result has no `buyer_token` key and equals the contract's local shape; the 402 seen by the client carried `price_usdc: 3.45` for `amount_usdc: 3.00` |
| `hostedHireNeverPays` | `createLegworkMcp({mode:'hosted', hireHuman: localHire, …})` with a spy pay-fetch: `hire_human` returns `payment_required: true` with the install line; the spy is never called; no request carried `PAYMENT-SIGNATURE`; `tokenStore` is empty afterwards |
| `binHelpPrints` | spawning the bin with `--help` exits 0; stdout contains `claude mcp add legwork -- npx @legwork/mcp`, `BUYER_PRIVATE_KEY`, `~/.legwork/tokens.json`; stdout does not match `/0x[0-9a-fA-F]{64}/`; spawning with no args and no `BUYER_PRIVATE_KEY` exits 2 |
| `localHireRefusalMovesNoMoney` | harness returns 422 after `verify`: result is the `RefusalPayload` with `message === NO_RETRY_SENTENCE`, `isError` not set, `FakeFacilitator.settle` never called, `tokenStore` unchanged, exactly one paid attempt (no retry) |
| `insertLinesFormat` | with `LEGWORK_INSERT=1` a successful hire writes exactly three lines to stderr, none > 72 chars, containing `3.00 USDC`, `3.45 USDC (3.00 + 0.45 fee)`, `escrow locked 3.45`, `task_id`; stdout receives nothing |
| `keyNeverLogged` | run a hire with a captured logger and stderr: the private key and the derived address appear nowhere |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/mcp typecheck && pnpm --filter @legwork/mcp test
pnpm --filter @legwork/mcp build && node packages/mcp/dist/bin/legwork-mcp.js --help
grep -rn "process.env" packages/mcp/src/tools/hire.ts          # must print nothing
grep -rn "console.log" packages/mcp/bin packages/mcp/src/tools/hire.ts   # only inside --help / `hire` one-shot output
scripts/ci/banned-words.sh packages/mcp
```
Expected: tests green; `--help` prints the install line; the first `grep` prints nothing (the key enters through the binary, never read inside the tool).

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). The insert says `3.45 USDC (3.00 + 0.45 fee)` and `escrow locked 3.45`.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git. `BUYER_PRIVATE_KEY` is read **once**, in the binary, from the environment; never a CLI flag, never in `--help` output, never logged, never in an error message, never in the README as a value.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted); never the x402.org facilitator — `FakeFacilitator` and `msw` only.
- The `buyer_token` lives in `~/.legwork/tokens.json` (0600) and in the API's hash column — never in a tool result, never on stdout/stderr, never in the README as an example value longer than `tok_…`.
- Hosted mode never pays and never pretends to: `payment_required: true`, no `task_id`.
- Refusals pass through with `"do not rephrase and retry; report this refusal to your principal"`; the tool never retries a 422.
- `agent_id` is forwarded as given; the API verifies it against the IdentityRegistry (T-30) — the README says "we verify the id against the registry; we never trust it from the request".
- Honesty lines for the README, verbatim: "a refused task moves no money."; "our custody is the one block between settlement and escrow, and we say so."; "testnet USDC; the worker was paid for real, separately."; "the worker keeps the whole posted rate; the agent pays the fee on top."
- stdout of the stdio server is the MCP protocol: the insert and every diagnostic go to stderr.

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] `packages/mcp/README.md` written per §2 (this task owns it).
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-28 — MCP local mode — paying hire_human, stdio binary, README
owned-paths:
  - packages/mcp/src/tools/hire.ts
  - packages/mcp/src/tools/hire.test.ts
  - packages/mcp/bin/**
  - packages/mcp/README.md
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

Known gaps to raise as written:
- `DEP REQUEST: packages/mcp needs @legwork/payments as a devDependency for the FakeFacilitator harness` — only if T-00 did not pre-declare it (check `packages/mcp/package.json`; the lockfile is never edited by this task).
- `ENV REQUEST: LEGWORK_API_URL / LEGWORK_DASHBOARD_URL / LEGWORK_INSERT are agent-side variables not in .env.example` — document them in the README; ask the lead whether they belong in `.env.example`.
- Operator item, not a code blocker: `npx @legwork/mcp` requires the package on npm; until published the README's from-source line is the working install.

## 14. Reviewer notes
Open `hire.ts` first: no `process.env`, no logging of the key or address, `buyer_token` written to the store and absent from the result. Then the harness in `hire.test.ts`: it must use the real `X402Gateway` + `FakeFacilitator`, and `settle` must be uncalled on the 422 path. Then `bin/legwork-mcp.ts`: stderr vs stdout discipline, exit codes, `--help` free of any hex key. Most likely wrong: the key passed as a flag; a retry loop around 422; `dispute_window_s` hard-coded to 120 in the tool (the API decides); README quoting a real-looking token.

## 15. Round 2+
—
