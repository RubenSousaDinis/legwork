# Bazantic gateway import — Day 9 dry run

`GET /openapi.json` exists for one consumer we do not control: the **Bazantic gateway**, which
imports an OpenAPI document so that agents which do not speak MCP can still reach this REST
API. The document is generated from `packages/shared/src/api-contract.ts` — the same zod the
routes validate with — so it cannot drift from the API.

This is the operator's checklist. Run it end to end on Day 9, before the filmed run. Nothing
here needs a secret: every step below is a public read, and the one authenticated call is made
with a token you already hold.

State it plainly, in the tracker and to anyone watching: **the gateway lists the API; paying is
still the agent's own x402 call.** Importing the document does not give the gateway a wallet, a
key or the ability to spend on an agent's behalf.

Set `API_BASE_URL` to the deployed API before you start.

---

## (a) Read the document

```bash
curl -s "$API_BASE_URL/openapi.json" | jq '.openapi, (.paths | keys)'
```

Expect `"3.1.0"` and the public and agent routes — `/check`, `/tasks`, `/tasks/{id}`,
`/tasks/{id}/approve`, `/tasks/{id}/dispute`, `/public/*`, `/healthz`, `/openapi.json`.

Expect **no `/admin` path at all**. Admin routes are operator-only and are omitted from the
served document on purpose; if one appears, stop and raise it — do not import.

## (b) Lint it

On the operator machine (not in CI — this one reaches the network):

```bash
npx @redocly/cli@latest lint "$API_BASE_URL/openapi.json"
```

Expect **no errors**. Warnings are allowed; paste the summary line into `tracker.md`.

## (c) Import it

In the Bazantic gateway's import flow, either:

- import **by URL**: `$API_BASE_URL/openapi.json`, or
- upload the same JSON (`curl -s "$API_BASE_URL/openapi.json" > openapi.json`).

Both are the same bytes: the document is a pure function of the contract and `API_BASE_URL`,
with no timestamp and no generated id in it, so two fetches are byte-identical.

## (d) Confirm what the gateway lists

The gateway should show these operations by id:

| Operation | Route |
|---|---|
| `postCheck` | `POST /check` |
| `postTasks` | `POST /tasks` |
| `getTasksById` | `GET /tasks/{id}` |
| `postTasksByIdApprove` | `POST /tasks/{id}/approve` |
| `postTasksByIdDispute` | `POST /tasks/{id}/dispute` |
| `getPublicPreflight` | `GET /public/preflight` |

And on `postTasks` it should show the **`x402`** security scheme: an API key in the header
`PAYMENT-SIGNATURE`. If the gateway renders it as HTTP bearer auth, the import went wrong —
re-import rather than editing it in the gateway's UI.

## (e) Dry-run the screening call

Call `postCheck` through the gateway with the Act-1 `verify-open` spec at `amount_usdc: 3.00`.

Expect `{accepted: true, spec_hash, price_usdc: 3.45}` — the agent pays 3.45 for a 3.00 task,
because the 0.45 fee is charged on top. `POST /check` is a dry run: it never posts and it
never marks.

## (f) Dry-run the unpaid post

Call `postTasks` through the gateway **without** a payment header.

Expect a **402** carrying `price_usdc: 3.45`, an `accepts` array of x402 requirements, and
`remaining_budget`. That 402 is the whole point of the step: it proves the gateway reached the
API and that the API asked for payment rather than doing the work.

**Do not fund anything from the gateway during the dry run.** The paid path stays with the
agent's own x402 client, holding the agent's own key.

## (g) Record it

Write the outcome in `tracker.md` — worked, or exactly what failed and at which step — together
with the redocly summary from (b).

---

## Headers, by name

The document names three request headers. These are **names only**; no value below is real, and
none should ever be pasted into this file, a ticket or a screenshot.

| Header | Used by | Value |
|---|---|---|
| `PAYMENT-SIGNATURE` | `POST /tasks` (x402) | produced by the agent's x402 client |
| `X-Buyer-Token` | `POST /tasks/{id}/approve`, `dispute`, `refund` | `tok_…`, returned by `POST /tasks` |
| `X-Admin-Key` | `/admin/*` | operator only, and not in the served document |

Worker routes use a session cookie rather than a header, and are not part of the gateway's
surface.

## If the import fails

Do not hand-edit the document in the gateway. It is generated: the fix belongs in
`api-contract.ts` (a lead-owned `interface-change` PR) or in `apps/api/src/openapi.ts`. Record
what the gateway rejected, and re-import after the fix ships.
