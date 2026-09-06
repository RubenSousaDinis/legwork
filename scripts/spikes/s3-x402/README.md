# Spike S3 — x402 seller and buyer round-trip on Base Sepolia

Proves the `POST /tasks` payment shape end to end against the reference facilitator: an
unpaid call gets a 402 with payment requirements, the buyer signs a USDC authorization and
retries with a `PAYMENT-SIGNATURE` header, the seller verifies (no money moves), does the
work, then settles — and replaying the same authorization cannot charge twice.

The result and every import name a consumer needs live in
[`docs/spikes/RESULTS.md#s3`](../../../docs/spikes/RESULTS.md). Read that first; these
scripts are the evidence behind it.

## Prerequisites

- A buyer wallet holding **at least 5 Base Sepolia USDC**, from
  [Circle's faucet](https://faucet.circle.com/). The buyer needs **no ETH**: EIP-3009
  authorizations are gasless for the payer, and the facilitator pays the gas.
- These env vars, read from the repo-root `.env` (each script calls `process.loadEnvFile`,
  so exporting them by hand works too):
  `BUYER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY` (address derivation only — the key signs
  nothing here), `USDC_ADDRESS`, `X402_FACILITATOR_URL`, `X402_NETWORK=eip155:84532`,
  `BASE_SEPOLIA_RPC_URL`.

## Rerunning it

Record the balances, start the seller in one shell, run the buyer in another, then record the
balances again: `pnpm tsx scripts/spikes/s3-x402/check-balance.ts` prints the buyer's and
`payTo`'s USDC as 6-decimal integers, `pnpm tsx scripts/spikes/s3-x402/server.ts` listens on
`127.0.0.1:4021` and logs one line per step (`402 sent`, `PAYMENT-SIGNATURE received`,
`verify ok payer=…`, `post stub taskId=…`, `settle ok tx=…`, `200 {taskId:1}`), and
`pnpm tsx scripts/spikes/s3-x402/buyer.ts` makes the paid call and then replays the exact
header it sent, which must come back with the same `taskId` and print `replay=true` on the
server. One paid call moves `3450000` units — buyer `-3450000`, `payTo` `+3450000` — and the
replay moves nothing. A bare `curl -X POST http://127.0.0.1:4021/tasks -H 'content-type:
application/json' -d '{"amount_usdc":"3.00"}'` is the quickest check that the 402 half works:
it answers `price_usdc: "3.45"` with the requirements in the `PAYMENT-REQUIRED` header.
Each run spends real testnet USDC, so top the buyer up before a long session.

## The 90-minute rule

This is a time-boxed spike: 45–90 minutes of wall clock from the first command, then it stops
in whatever state it is in and writes the `## S3` section. A FAIL written on time is the
successful outcome of the task; a PASS written at minute 140 is not. If a step will not work
the way the plan needs, the step and its error get recorded and the spike moves on — the
Day-6 pivot to direct funding exists for exactly that outcome.

## What is deliberately not here

Nothing under `scripts/spikes/` is imported by any package, and none of it runs in CI — it
needs live keys and a live facilitator. `PaymentGateway` / `X402Gateway` are T-15, the real
`POST /tasks` is T-16, and the MCP buyer is T-28; `screen` and `post` are stubs here and no
contract is called, so the only chain effect is the facilitator's USDC transfer.
