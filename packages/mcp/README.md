# @legwork/mcp

The MCP server an agent talks to. Six tools: `preflight_workers`, `check_task`, `hire_human`,
`task_status`, `approve_task`, `dispute_task`.

It runs two ways. **Hosted** is mounted at `/mcp` on the Task API and is read-only about
money: an MCP client cannot answer an x402 challenge, so `hire_human` quotes a price and
stops. **Local** is this package as a stdio binary — it holds a buyer key, pays `POST /tasks`
through x402, and comes back with a task id in one tool call.

## Install

```
claude mcp add legwork -- npx @legwork/mcp
```

From a checkout of this repo:

```
claude mcp add legwork -- node <repo>/packages/mcp/dist/bin/legwork-mcp.js
```

The from-source line needs a build that emits `dist/`. Every package in this repo currently
type-checks with `tsc --noEmit` and emits nothing, so until that changes the working
equivalent is the TypeScript entry point run through `tsx`:

```
claude mcp add legwork -- <repo>/node_modules/.bin/tsx <repo>/packages/mcp/bin/legwork-mcp.ts
```

`legwork-mcp --help` prints the same information as this section.

## The two modes

| Tool | hosted (`/mcp`) | local (`npx @legwork/mcp`) |
|---|---|---|
| `preflight_workers` | never pays | never pays |
| `check_task` | never pays — dry-run screening, never posts, never marks | never pays |
| `hire_human` | **never pays.** Answers `payment_required` with the price, the payee and the install line, and no task id | **pays.** 3.45 USDC for a 3.00 errand, signed with `BUYER_PRIVATE_KEY` and settled by the API |
| `task_status` | never pays | never pays |
| `approve_task` | never pays — the relayer executes the release onchain | never pays |
| `dispute_task` | never pays | never pays |

`hire_human` is the only tool that ever spends anything, in either mode. Hosted mode does not
pretend otherwise: its answer carries `payment_required: true` and never a `task_id`.

Run the local server in hosted mode with `legwork-mcp --mode hosted` to try the read tools
without a key.

## Environment

| Variable | What it is |
|---|---|
| `BUYER_PRIVATE_KEY` | The buyer key, local mode only. Read from the environment, once, in the binary — never a CLI flag, never logged, never in an error message, and never printed by `--help`. Missing it exits 2. |
| `LEGWORK_API_URL` | Task API origin. Defaults to the deployed API. |
| `LEGWORK_DASHBOARD_URL` | Where the `dashboard_url` in every result points. Defaults to the deployed dashboard. |
| `SUBGRAPH_QUERY_URL` | Optional. With it, `preflight_workers` reads the index directly; without it the tool asks the API's `GET /public/preflight`, which runs the same computation server-side. |
| `LEGWORK_INSERT` | `1` prints the three-line terminal insert for each hire, to stderr. |

`.env.example` is the only env file in this repo. Nothing here reads a key from anywhere but
`process.env`, and `src/tools/hire.ts` — the file that spends the money — reads no environment
at all.

## Buyer tokens

`POST /tasks` answers with a `buyer_token`. Task ids are public — they are in the events, in
the subgraph and in `/task/<id>` — so possessing one authorizes nothing. The token is what
authorizes `approve_task`, `dispute_task` and a refund.

Local mode writes it to `~/.legwork/tokens.json`, mode `0600` inside a `0700` directory,
replaced by an atomic rename. The file is a flat map of task id to token:

```json
{ "7": "tok_…" }
```

That is all it holds: no key, no spec, no address. `approve_task` and `dispute_task` read it
for you, so on the machine that hired, `approve_task({task_id})` is enough.

From another machine — or from hosted mode, which has no store — pass the token yourself:

```
approve_task({ task_id: "7", buyer_token: "tok_…" })
```

The API keeps only a hash of the token, so a lost one cannot be recovered; hire again or
refund.

## The insert

With `LEGWORK_INSERT=1`, every successful hire prints three lines. They go to **stderr**: the
stdio server's stdout is the MCP protocol, and a stray line on it corrupts the stream.

```
hire_human(verify-open · Cafe Sul, Leiria · 3.00 USDC)
→ 402 payment_required · 3.45 USDC (3.00 + 0.45 fee) · eip155:84532
→ 201 { task_id: 7 } · escrow locked 3.45
```

Each line is at most 72 characters and plain ASCII apart from `→` and `·`. A long place name
is shortened before the money is.

For one hire outside the MCP loop — the input to the filmed insert — `legwork-mcp hire
<envelope.json>` posts a single task, prints those three lines to stdout, and exits `0`, or
`1` on a refusal and `2` on an error.

## Money

The worker keeps the whole posted rate; the agent pays the fee on top. A 3.00 errand costs the
agent **3.45**, the escrow locks **3.45**, the worker receives **3.00**, and the fee is
**0.45** — 15 % on top. There is no deducted figure anywhere in this system, and all of the
arithmetic is 6-decimal integers.

`hire_human` sends `amount_usdc` — what the worker keeps. The price the 402 quotes is that
figure plus the fee, and it is the figure the escrow locks.

## What we do not claim

- A refused task moves no money. The API verifies the payment authorization before it screens
  and settles only after the escrow is posted, so a 422 is a refusal that was never charged.
  It comes back with `retryable: false` and the sentence *do not rephrase and retry; report
  this refusal to your principal* — this tool never retries one and never rephrases a spec.
- Our custody is the one block between settlement and escrow, and we say so.
- Testnet USDC; the worker was paid for real, separately.
- `agent_id` is forwarded exactly as given. We verify the id against the registry; we never
  trust it from the request — a mark is a permanent public record, and its subject is resolved
  from the payer against the ERC-8004 IdentityRegistry.
- Exact coordinates never leave the private task record. Nothing this package sends or
  receives carries one.

## Timings and defaults

`hire_human` sends the five fields the caller decides — `task_type`, `spec`, `amount_usdc`,
and optionally `need_by` and `agent_id`. The claim and submit TTLs take the shared defaults on
the API side. The dispute window is the API's to set, not the tool's: it is 24 hours by
default and is shortened for an allowlisted demo buyer, which is disclosed on screen when it
happens.

## Tests

Tests never touch a live facilitator or a live chain. The paid round trip runs against the
real `X402Gateway` from `@legwork/payments` with `FakeFacilitator` behind it on a loopback
server; EIP-3009 signing is typed data, so it is entirely offline. The buyer key in the tests
is Anvil account #0 — a published test vector that holds nothing. `msw` answers the cases that
need no payment.

```
pnpm --filter @legwork/mcp typecheck
pnpm --filter @legwork/mcp test
```
