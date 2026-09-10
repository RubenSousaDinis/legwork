# Bazantic gateway record

the gateway lists the API; paying is still the agent's own x402 call.

This file is the record of T-58's run of `apps/api/app/openapi.json/README.md`. Steps (a) and
(b) were run against the deployed Task API by the claiming agent. Steps (c)–(f) happen in the
bazantic.com UI, which no owned path covers: they are the operator's, and every field that
comes from that UI is `TODO(operator)` until the operator hands it over. A URL written here
that nobody opened is fabricated evidence.

`PAYMENT-SIGNATURE` is an EIP-3009 authorization signed by the buyer's own key. The facilitator
recovers the payer from it, and that recovered payer becomes the escrow's buyer onchain. A
gateway holding no key cannot construct one. A gateway holding its own key would spend its own
money and would own every task it posted. Nothing in this record claims otherwise.

## Who produced what

| Output | Who | Source |
|---|---|---|
| OpenAPI fetch (step a) | agent | `GET https://legwork-api.vercel.app/openapi.json` on 2026-09-10 |
| redocly lint (step b) | agent | `npx @redocly/cli@latest lint` against that URL, same day |
| Six operation ids in the served document | agent | read off the fetched document, not off a gateway |
| Gateway URL | operator | TODO(operator) |
| Six operation ids as the gateway listed them | operator | TODO(operator) |
| `postCheck` response through the gateway | operator | TODO(operator) |
| unpaid `postTasks` status and body through the gateway | operator | TODO(operator) |
| Bazantic account username | operator | TODO(operator) |
| Screen-recording link | operator | TODO(operator) |
| Gateways the plan allows | operator | TODO(operator) — asked on issue #209 before any gateway was created |

## Plan limit — asked before anything was created

T-59 needs a second gateway (Overpass) on the same account. If the plan allows exactly one,
T-59 is impossible as briefed.

| Field | Value |
|---|---|
| Gateways the bazantic.com plan allows | TODO(operator) |
| Asked on | issue #209, 2026-09-10, before any gateway was created |
| What T-59 needs | a second gateway; one is not enough |

## (a) Document fetch

Command: `curl -s "$API_BASE_URL/openapi.json" | jq '.openapi, (.paths | keys)'` with
`API_BASE_URL=https://legwork-api.vercel.app`.

| Field | Value |
|---|---|
| OpenAPI version | `3.1.0` |
| `/admin` paths in the served document | 0 |
| Outcome | worked — public and agent routes present, no `/admin` path |

The six operation ids the checklist tells the operator to confirm are in the served document:

| Operation id | Route |
|---|---|
| `postCheck` | `POST /check` |
| `postTasks` | `POST /tasks` |
| `getTasksById` | `GET /tasks/{id}` |
| `postTasksByIdApprove` | `POST /tasks/{id}/approve` |
| `postTasksByIdDispute` | `POST /tasks/{id}/dispute` |
| `getPublicPreflight` | `GET /public/preflight` |

That is what the document contains. What the gateway lists is a different column, and it is
still TODO(operator).

## (b) redocly lint

Command: `npx @redocly/cli@latest lint "$API_BASE_URL/openapi.json"` (`@redocly/cli@2.52.0`).

| Field | Value |
|---|---|
| Summary line | Validation failed with 17 errors and 20 warnings. |
| Errors | 17, all `security-defined` — public operations omit `security` rather than setting `security: []` |
| Warnings | 20 (`operation-4xx-response`, `no-unused-components`, `info-license`) |
| Outcome | did not meet the checklist's "no errors" line |

T-35's tests assert that a public operation's `security` is undefined, which is what the
generator emits and what redocly's recommended `security-defined` rule rejects. This task does
not patch `apps/api/src/openapi.ts`. INTERFACE REQUEST: set `security: []` on public operations
(and update the T-35 assertion that requires `undefined`) so redocly recommended reports no
errors. Until that ships, the document is the one T-35 generated; do not hand-edit it in
Bazantic's UI.

## (c)–(f) Operator — not run

No gateway has been created. Nothing below is a guess at what the UI will show.

| Step | Expectation | Outcome |
|---|---|---|
| (c) Import `$API_BASE_URL/openapi.json` | gateway created from the served document | TODO(operator) |
| (d) Six operation ids as listed | the six ids above, `x402` on `postTasks` as header `PAYMENT-SIGNATURE` not HTTP bearer | TODO(operator) |
| (e) `postCheck` dry run | `{accepted: true, spec_hash, price_usdc: 3.45}` for the Act-1 `verify-open` at `amount_usdc: 3.00` | TODO(operator) |
| (f) unpaid `postTasks` | **402** with `price_usdc: 3.45`, `accepts[]`, `remaining_budget`; no task posted | TODO(operator) |

Do not attach a `PAYMENT-SIGNATURE` during (f). The 402 is the point of the step.

## Recipe

| Field | Value |
|---|---|
| Recipe name | `worker-pool-then-quote` |
| Text in this repo | `examples/recipes/worker-pool-then-quote.md` |
| Live copy in Bazantic's UI | TODO(operator) |
| Second service | The Graph — Subgraph Studio query URL `https://api.studio.thegraph.com/query/74763/legwork-base-sepolia/6653cb4` |
| Bazantic account username | TODO(operator) |
| Screen-recording link | TODO(operator) |

Prize rows in `README.md` and `docs/submission.md` stay as they are until the username and the
recording exist. That edit is the lead's.

## (g) Outcome

| Step | Outcome |
|---|---|
| (a) | worked — `"3.1.0"`, zero `/admin` paths, six checklist operation ids present in the document |
| (b) | 17 errors (all `security-defined` on public operations) and 20 warnings; summary line above |
| (c) | TODO(operator) |
| (d) | TODO(operator) |
| (e) | TODO(operator) |
| (f) | TODO(operator) |
| (g) | this file |
