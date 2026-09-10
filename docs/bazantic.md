# Bazantic gateway record

the gateway lists the API; paying is still the agent's own x402 call.

`PAYMENT-SIGNATURE` is an EIP-3009 authorization signed by the buyer's own key. The facilitator
recovers the payer from it, and that recovered payer becomes the escrow's buyer onchain. A
gateway holding no key cannot construct one. A gateway holding its own key would spend its own
money and would own every task it posted. Nothing in this record claims otherwise.

## Status — 2026-09-10

The Task API is listed on a Bazantic gateway. The two dry runs went through that host. Paying
did not: the unpaid post returned 402, and no `PAYMENT-SIGNATURE` was sent.

| Field | Value |
|---|---|
| Payment gateway | `https://nf26bnkznrbc3cg5rbq2hmej5q.bazgateway.com` |
| Origin API | `https://legwork-api.vercel.app` |
| Import | by URL, `$API_BASE_URL/openapi.json` |
| Connection | No Auth — gateway forwards as-is, no credential |
| Listing price | 0 mcent / `$0.00` on every imported resource |
| Marketplace | Unpublished |
| Recipe in this repo | `examples/recipes/worker-pool-then-quote.md` |
| Recipe in Bazantic's UI | TODO(operator) |
| Bazantic account username | TODO(operator) |
| Screen-recording link | TODO(operator) |
| Gateways the plan allows | TODO(operator) |

The prize rows in `README.md` and `docs/submission.md` stay as they are until the username and
the recording exist. That edit is the lead's.

## Who produced what

| Output | Who | Source |
|---|---|---|
| OpenAPI fetch (step a) | agent | `GET https://legwork-api.vercel.app/openapi.json` on 2026-09-10 |
| redocly lint (step b) | agent | `npx @redocly/cli@latest lint` against that URL, same day |
| Six operation ids in the origin document | agent | read off the fetched document, not off a gateway |
| Gateway URL | operator | pasted from the Bazantic Copy control on 2026-09-10 |
| Six routes as the UI listed them | operator | method + path only, no operation-id column; `POST /tasks` at 0 mcent / `$0.00` |
| Six operation ids in the gateway-served document | agent, through the gateway | `GET https://nf26bnkznrbc3cg5rbq2hmej5q.bazgateway.com/openapi.json` |
| `postCheck` through the gateway | agent, through the gateway | step (e) |
| unpaid `postTasks` through the gateway | agent, through the gateway | step (f) |
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

The six operation ids the checklist tells the operator to confirm:

| Operation id | Route |
|---|---|
| `postCheck` | `POST /check` |
| `postTasks` | `POST /tasks` |
| `getTasksById` | `GET /tasks/{id}` |
| `postTasksByIdApprove` | `POST /tasks/{id}/approve` |
| `postTasksByIdDispute` | `POST /tasks/{id}/dispute` |
| `getPublicPreflight` | `GET /public/preflight` |

The origin document contains those ids. So does the document the gateway serves at
`GET https://nf26bnkznrbc3cg5rbq2hmej5q.bazgateway.com/openapi.json`. The Bazantic resources
table shows method + path only; it has no operation-id column.

## (b) redocly lint

Command: `npx @redocly/cli@latest lint "$API_BASE_URL/openapi.json"` (`@redocly/cli@2.52.0`).

First run, 2026-09-10, before #213 — against the T-35 document:

| Field | Value |
|---|---|
| Summary line | Validation failed with 17 errors and 20 warnings. |
| Errors | 17, all `security-defined` — public operations omitted `security` rather than setting `security: []` |
| Warnings | 20 (`operation-4xx-response`, `no-unused-components`, `info-license`) |
| Outcome | did not meet the checklist's "no errors" line |

A public operation with no `security` key is what T-35's tests required (`undefined`) and what
redocly recommended's `security-defined` rule rejects. This task did not patch
`apps/api/src/openapi.ts`. #213 shipped `security: []` ("no security required" said out loud)
and updated that assertion. The document was not hand-edited in Bazantic's UI.

Re-run, 2026-09-10, after #213 merged (`82f8da5`) and `https://legwork-api.vercel.app/openapi.json`
redeployed (`GET /check` now has `"security": []`):

| Field | Value |
|---|---|
| Summary line | Woohoo! Your API description is valid. 🎉 You have 20 warnings. |
| Errors | 0 |
| Warnings | 20 |
| Outcome | met the checklist's no-errors line |

## (c)–(f) Gateway — run on 2026-09-10

Host: `https://nf26bnkznrbc3cg5rbq2hmej5q.bazgateway.com`.

| Step | Expectation | Outcome |
|---|---|---|
| (c) Import `$API_BASE_URL/openapi.json` | gateway created from the served document | worked — import by URL; No Auth; price 0; unpublished |
| (d) Six operations as listed | the six ids above, `x402` on `postTasks` as header `PAYMENT-SIGNATURE` not HTTP bearer | UI lists method + path, including `POST /check` and `POST /tasks`. Gateway-served OpenAPI carries the six ids. `postTasks` security is `x402` + `buyerSignature`; `x402` is `apiKey` header `PAYMENT-SIGNATURE`, not HTTP bearer |
| (e) `postCheck` dry run | `{accepted: true, spec_hash, price_usdc: 3.45}` for the Act-1 `verify-open` at `amount_usdc: 3.00` | corpus Act-1 `place_id` `node/900000001` → **400** `{error: invalid_request, field: spec.place.place_id, reason: unresolvable place_id node/900000001}`. Same spec with live `node/3092370961` (Farmácia Central, Leiria) → **200** `{"accepted":true,"spec_hash":"0x445a6491367fe091005f37749655f83d5753342dd743e1a8e4a9a738abe6ae21","price_usdc":3.45}` |
| (f) unpaid `postTasks` | **402** with `price_usdc: 3.45`, `accepts[]`, `remaining_budget`; no task posted | **402** `{"error":"payment_required","price_usdc":3.45,"accepts":[{"scheme":"exact","network":"eip155:84532","amount":"3450000","asset":"0x036CbD53842c5426634e7929541eC2318f3dCF7e","payTo":"0x436cA2299e7fDF36C4b1164cA3e80081E68c318A","maxTimeoutSeconds":300,"extra":{"name":"USDC","version":"2"}}],"remaining_budget":{"open_tasks":5,"daily_usdc":25}}`. No `PAYMENT-SIGNATURE` was sent. No task posted |

The 402 is the point of step (f).

## Recipe

| Field | Value |
|---|---|
| Recipe name | `worker-pool-then-quote` |
| Text in this repo | `examples/recipes/worker-pool-then-quote.md` |
| Live copy in Bazantic's UI | TODO(operator) |
| Second service | The Graph — Subgraph Studio query URL `https://api.studio.thegraph.com/query/74763/legwork-base-sepolia/6653cb4` |
| Bazantic account username | TODO(operator) |
| Screen-recording link | TODO(operator) |

## (g) Outcome

| Step | Outcome |
|---|---|
| (a) | worked — `"3.1.0"`, zero `/admin` paths, six checklist operation ids present in the document |
| (b) | first run: 17 `security-defined` errors. After #213 redeploy: 0 errors, 20 warnings — met the checklist's no-errors line |
| (c) | worked — `https://nf26bnkznrbc3cg5rbq2hmej5q.bazgateway.com`, import by URL, price 0, No Auth, unpublished |
| (d) | six ids in the gateway-served document; UI shows method + path; `PAYMENT-SIGNATURE` on `x402` |
| (e) | 400 on corpus `node/900000001`; 200 accepted / `price_usdc: 3.45` on live `node/3092370961` |
| (f) | 402 `price_usdc: 3.45`, `accepts[]`, `remaining_budget`; no task posted |
| (g) | this file |
