# Day-1 spike results

One section per spike. Section-owned: a PR may touch only its own heading.

## S1

_World ID Router on Base Sepolia (feedback-doc value only)_

S1: pending

outcome: pending

evidence: pending

decision: pending

## S2

_IDKit 4.x verify end to end + webview probe (S2')_

S2: pending

outcome: pending

evidence: pending

decision: pending

## S3

_x402 exact-EVM verify → post → settle + replay_

Result: PASS

PAYMENT_MODE: x402

Time used: 8

Packages: @x402/core@2.25.0, @x402/evm@2.25.0, @x402/fetch@2.25.0

Requirements builder: `import { x402ResourceServer } from "@x402/core/server"` and `import { ExactEvmScheme } from "@x402/evm/exact/server"`. Once at boot: `const rs = new x402ResourceServer(facilitator).register("eip155:84532", new ExactEvmScheme()); await rs.initialize();`. Then **inside the route handler**, per request, so the amount can be dynamic: `await rs.buildPaymentRequirements({ scheme: "exact", network: "eip155:84532", payTo, price: { asset: USDC_ADDRESS, amount: priceUnits(body.amount_usdc).toString(), extra: { name: "USDC", version: "2" } }, maxTimeoutSeconds: 300 })` → `PaymentRequirements[]`; then `await rs.createPaymentRequiredResponse(requirements, { url, description: "Legwork task", mimeType: "application/json" }, "payment_required")` → `PaymentRequired`. No middleware is involved, so nothing settles before the handler.

Facilitator client: `import { HTTPFacilitatorClient } from "@x402/core/server"`; `new HTTPFacilitatorClient({ url: process.env.X402_FACILITATOR_URL })`, passed to the `x402ResourceServer` constructor. The handler calls the resource server, not the facilitator client, so the server's hooks and payment-flow rules apply: `await rs.verifyPayment(payload, requirements[0])` → `{ isValid, payer?, invalidReason? }` (no money moves) and `await rs.settlePayment(payload, requirements[0])` → `{ success, transaction, payer?, network }`. `HTTPFacilitatorClient` also exposes `.verify(paymentPayload, paymentRequirements)` / `.settle(paymentPayload, paymentRequirements)` directly if a caller wants to bypass those hooks.

Header names: request `PAYMENT-SIGNATURE`, 402 `PAYMENT-REQUIRED`, response `PAYMENT-RESPONSE`. All three base64-encode a JSON object; codecs are `encodePaymentRequiredHeader` / `decodePaymentSignatureHeader` / `encodePaymentResponseHeader` from `@x402/core/http`. The v1 legacy names `X-PAYMENT` / `X-PAYMENT-RESPONSE` are still read by the client's settle-response reader but are not what v2 sends.

402 JSON body: body is free; requirements travel in header `PAYMENT-REQUIRED`. `x402HTTPClient.getPaymentRequiredResponse(getHeader, body)` returns `decodePaymentRequiredHeader(getHeader("PAYMENT-REQUIRED"))` whenever that header is present, and only falls back to the body when the body carries `x402Version === 1`. A v2 seller that answers 402 with a JSON body alone is unreadable to the v2 client. So the seller must set the header, and our own `{ "error": "payment_required", "price_usdc": "3.45", "accepts": [...] }` body is ignored by the client and exists for humans, curl and the dashboard.

Payer path: `decoded.payload.authorization.from` (`decoded` = `decodePaymentSignatureHeader(header)`, EIP-3009 payload). Prefer the facilitator's own answer, `verifyResponse.payer`, which the facilitator recovers from the signature; the spike logged both and they matched.

Nonce path: `decoded.payload.authorization.nonce` — a `0x…` 32-byte hex string. Lowercase it before using it as a map key. Full authorization shape: `{ from, to, value, validAfter, validBefore, nonce }`.

Settle tx: https://sepolia.basescan.org/tx/0xd5c50269a85efbf6d2931bab4468e95f144122211391e361b33609fffd1c1d83

Replay: settle count stayed 1. The exact `PAYMENT-SIGNATURE` header the paying wrapper sent was re-sent with a plain `fetch`; the server answered `200 {taskId:1, settle_tx: 0xd5c5…}` from the nonce map and logged `replay=true settle_calls=1`. On-chain balances across the paid call **and** the replay moved exactly once: buyer 20000000 → 16550000 (−3450000), payTo 25000000 → 28450000 (+3450000).

Failing step (if FAIL): — none.

**Findings for T-15 / T-16**

- **The EIP-712 domain is the seller's job.** `buildPaymentRequirements` does *not* fill `extra` when the price is an explicit `{ asset, amount }`, and the 402 then carries `extra: {}`. The client refuses to sign it: `Failed to create payment payload: EIP-712 domain parameters (name, version) are required in payment requirements for asset 0x036C…`. Fix: put `extra: { name, version }` on the price. `getDefaultAsset("eip155:84532")` from `@x402/evm` returns `{ asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", name: "USDC", version: "2", decimals: 6, symbol: "USDC" }`, so the values come from the library rather than a hand-written constant — and comparing its `asset` against `USDC_ADDRESS` is a free sanity check on the env.
- **The buyer needs a spend control raise.** The SDK caps a single payment at **$1** on default assets, so a 3.45 charge is rejected client-side before signing. The x402 buyer (T-28) must pass `spendControls: { maxAmountPerPayment: "$5" }` (or higher) to `wrapFetchWithPaymentFromConfig`.
- **Order is free, not imposed.** Nothing in the primitives forces settle-before-handler; the exact EVM scheme's default payment flow is `authorization` (`verifyBeforeHandler`), which is exactly the frozen T-01 order. `settlePayment` takes an optional `phase` argument that defaults to `after-handler`. The framework middlewares were not used and are not needed.
- **The buyer paid no gas.** The buyer wallet holds no Base Sepolia ETH; the facilitator submitted and paid for the `transferWithAuthorization`. Gasless for the payer, as designed.
- **Idempotency is ours to build.** Neither the resource server nor the reference facilitator dedupes a repeated settle: the nonce map in front of `settlePayment` is what keeps a replay from charging twice. T-15 must carry that map into `X402Gateway` (durably, not in process memory).

## S5

_ERC-8004 ABI confirmation_

S5: pending

outcome: pending

evidence: pending

decision: pending

## Graph

_Discord answers: Studio URL as "live data from a Graph provider"; Subgraph MCP as "composable"_

outcome: pending

evidence: pending

decision: pending

## Preflight

_live Studio data, Day 8 (T-46)_

outcome: pending

evidence: pending

decision: pending

## Timing

_Day-3 green loop tx links (T-29); Day-5 fresh install → verify → claim_

outcome: pending

evidence: pending

decision: pending

## Locked architecture

- credential level: selfie | orb → narration variant: A | B — _pending_
- GPS: available | downgraded (photo + server timestamp + tapped confirmation) — _pending_
- payment: x402 | direct funding (PAYMENT_MODE) — _pending_
- ERC-8004: live registries | self-deployed reference instance — _pending_
