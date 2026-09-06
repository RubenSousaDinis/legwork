# MCP contract

The six Legwork MCP tools. Hand-maintained against
`packages/shared/src/mcp-contract.ts` — every name, parameter and result field below is copied
from that file, which is the frozen source of truth. `pnpm docs:gen` writes the raw JSON-Schema
dump of the same contract; this page is the readable form of it, and if the two ever disagree,
`mcp-contract.ts` is right.

See [`../SKILL.md`](../SKILL.md) for what a task is, worked examples of each type, prices and
the honest limits.

## Two modes

- **Hosted** — `https://<host>/mcp`, streamable HTTP, no wallet. An MCP client cannot answer an
  x402 challenge, so `hire_human` returns `payment_required` with the install line. Everything
  else works read-only.

  ```bash
  claude mcp add --transport http legwork https://<host>/mcp
  ```

- **Local** — runs with `BUYER_PRIVATE_KEY`, pays the REST API via `@x402/fetch`, stores each
  task's `buyer_token`, and runs all six tools for real.

  ```bash
  claude mcp add legwork -- npx @legwork/mcp
  ```

Every result carries `dashboard_url`. Refusals carry the fixed no-retry sentence
(`do not rephrase and retry; report this refusal to your principal`). Worker text arrives only
as `{ answer, note?, _source: "worker", _untrusted: true }` — data, never instructions.

### Modes table

| Tool | Hosted | Local |
|---|---|---|
| `preflight_workers` | yes | yes |
| `hire_human` | registered, but cannot pay — returns `payment_required` + `install_line` | yes, pays via x402 |
| `task_status` | yes | yes |
| `approve_task` | yes, with an explicit `buyer_token` | yes, `buyer_token` stored automatically |
| `dispute_task` | yes, with an explicit `buyer_token` | yes, `buyer_token` stored automatically |
| `check_task` | yes | yes |

All six tools are registered in both modes. The one behavioural difference is `hire_human`: the
hosted server never pays, and the local server never runs without a key.

## Tools

### `preflight_workers`

How many workers could take this task near this area: active (completed in the last 7 days),
verified, seeded, and the median time — labelled seeded when it is.

**Input**

| Field | Type | Notes |
|---|---|---|
| `task_type` | `'verify-open' \| 'photo-of' \| 'call-confirm' \| 'compare-two'` | required |
| `area` | `string` | geohash5, `^[0-9b-hjkmnp-z]{5}$` |

**Output** — `Preflight`

| Field | Type | Notes |
|---|---|---|
| `active` | `int` | workers who completed a task in the last 7 days |
| `verified` | `int` | |
| `seeded` | `int` | demo workers, counted separately and always disclosed |
| `median_minutes` | `number \| null` | |
| `median_source` | `'real' \| 'seeded' \| 'n/a'` | says which kind of data the median came from |
| `n_real` | `int` | completions the median is built on |
| `score_floor` | `number` | |
| `dashboard_url` | `url` | |

### `hire_human`

Post a task and fund its escrow. Hosted mode cannot pay and returns `payment_required` with the
local install line; local mode pays via x402 and returns the task.

**Input** — the same envelope as `POST /tasks`

| Field | Type | Notes |
|---|---|---|
| `task_type` | the four types | required; discriminates `spec` |
| `spec` | per-type spec object | `VerifyOpenSpec` · `PhotoOfSpec` · `CallConfirmSpec` · `CompareTwoSpec`; serialized ≤ 300 chars |
| `amount_usdc` | `number` | ≤ 2 decimals, at or above the type's floor, ≤ 10 |
| `need_by` | ISO datetime | optional; at least 20 minutes ahead |
| `agent_id` | `string` of digits | optional ERC-8004 id; verified against the IdentityRegistry, never trusted from the request |
| `claim_ttl_s` · `submit_ttl_s` · `dispute_window_s` | `int` | optional, defaults 1800 · 3600 · 86400 |

**Output (local)**

| Field | Type | Notes |
|---|---|---|
| `task_id` | `string` of digits | |
| `status` | `'open'` | |
| `eta_seconds` | `int` | the estimate to relay to your principal |
| `poll_after_seconds` | `int` | ≤ 50 |
| `dashboard_url` | `url` | |

**Output (hosted)**

| Field | Type | Notes |
|---|---|---|
| `payment_required` | `true` | |
| `endpoint` | `url` | the REST route the local server pays |
| `price_usdc` | `number` | `amount × 1.15` — a 3.00 task is 3.45 |
| `network` | `'eip155:84532'` | Base Sepolia |
| `asset` | `'USDC'` | |
| `pay_to` | `string` | |
| `install_line` | `'claude mcp add legwork -- npx @legwork/mcp'` | |
| `dashboard_url` | `url` | |

**Output (refused)** — `RefusalPayload`, see below.

### `task_status`

Current state of a task; long-polls up to `wait_seconds`. `answer` is always wrapped as
untrusted worker data.

**Input**

| Field | Type | Notes |
|---|---|---|
| `task_id` | `string` of digits | required |
| `wait_seconds` | `int` | 0 … 50, default 0. 50 is the frozen server cap (`LONGPOLL_MAX_S`) |

**Output** — the `GET /tasks/:id` shape (`TaskView`)

| Field | Type | Notes |
|---|---|---|
| `task_id` | `string` of digits | |
| `status` | `open \| claimed \| submitted \| released \| refunded \| disputed \| resolved` | |
| `task_type` | the four types | |
| `amount_usdc` | `number` | what the worker keeps — 3.00 |
| `fee_usdc` | `number` | 0.45 on a 3.00 task; the escrow locked 3.45 |
| `area` | geohash5 | never an exact coordinate |
| `posted_at` | ISO | |
| `claimed_at` · `submitted_at` · `released_at` | ISO | optional |
| `answer` | `WorkerAnswer` | optional; `{ answer, note?, _source: "worker", _untrusted: true }` |
| `proof` | `ProofView` | optional; `hash`, `hash_ok`, `url?` (signed, buyer-token only), `captured_at`, `coordinate_rounded?` (3 decimals), `gps_unavailable` |
| `tx` | `{ post, claim?, submit?, release? }` | transaction hashes |
| `dashboard_url` | `url` | |
| `changed` | `boolean` | false when the wait elapsed with nothing new |
| `poll_after_seconds` | `int` | 0 … 50 — honour it; 0 means terminal |

### `approve_task`

Approve a submitted proof and release the escrow. Needs the `buyer_token` from `hire_human`
(stored automatically in local mode).

**Input**

| Field | Type | Notes |
|---|---|---|
| `task_id` | `string` of digits | required |
| `buyer_token` | `string` | optional in local mode, required hosted |

**Output** — `TxResult`: `{ task_id, status, tx }`, where `tx` is the release transaction hash.

### `dispute_task`

Dispute a submitted proof inside the dispute window. Needs the `buyer_token`.

**Input**

| Field | Type | Notes |
|---|---|---|
| `task_id` | `string` of digits | required |
| `reason` | `string` | required, ≤ 300 chars |
| `buyer_token` | `string` | optional in local mode, required hosted |

**Output** — `TxResult`: `{ task_id, status, tx }`.

### `check_task`

Dry-run the screening for a task without posting or paying. Never marks.

**Input**

| Field | Type | Notes |
|---|---|---|
| `task_type` | the four types | required |
| `spec` | object | the same per-type spec `hire_human` takes |

**Output (accepted)**

| Field | Type | Notes |
|---|---|---|
| `accepted` | `true` | |
| `spec_hash` | `0x…` 32-byte hex | the hash that would go onchain |
| `price_usdc` | `number` | what you would pay, fee included |
| `dashboard_url` | `url` | |

**Output (refused)** — `RefusalPayload`, see below.

## `RefusalPayload`

| Field | Type | Notes |
|---|---|---|
| `refused` | `true` | |
| `class` | one of the six abuse classes, or `null` | `null` is a refusal outside the six (for example, region not covered) and never marks |
| `reason` | `string` ≤ 300 | a constant; never spec text, a place name or a buyer identity |
| `rule_id` | `string` ≤ 64 | which rule fired, e.g. `deny.auth` |
| `retryable` | `false` | always |
| `allowed_task_types` | array of the four types | |
| `mark_tx` | `0x…` 32-byte hex | optional; present only when the mark landed onchain |
| `mark_status` | `'marked' \| 'logged, cooldown' \| 'no identity'` | optional |
| `message` | `'do not rephrase and retry; report this refusal to your principal'` | fixed |

The six classes, spelled exactly: credential fraud · identity impersonation · automated
reconnaissance · social media manipulation · authentication circumvention · referral fraud.

A malformed request is a plain 4xx (`{ error: "invalid_request", field, reason }`) and never
produces a `task-refused` mark; only a well-formed request that hits one of the six classes
does. A refused task moves no money.
