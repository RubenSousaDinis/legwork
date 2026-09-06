# @legwork/payments

The seam between `POST /tasks` and money. The route handler never touches the x402 library:
it asks this package for a price, asks whether the request is paid for, does its own work,
and only then settles.

```ts
import { selectGateway, MemoryIdempotencyStore } from '@legwork/payments';

const gateway = selectGateway(process.env.PAYMENT_MODE, {
  x402: { facilitator, payTo: RELAYER_ADDRESS, asset: USDC_ADDRESS, network: 'eip155:84532' },
});

const quote = gateway.price(envelope);            // 3.00 -> 3_450_000 units, 3.45 charged
const gate = await gateway.requirePayment(req, quote, { remaining_budget, resource });
// { kind: 'payment_required', status: 402, body, headers }  -> answer it, nothing has moved
// { kind: 'verified', ctx }                                 -> the authorization is good
```

## The frozen order

```
requirePayment  ->  screen  ->  TaskEscrow.post(buyer = payer)  ->  settle  ->  201
   (verify)         (T-06)            (T-07, via TxQueue)         (this package)
```

**`verify` moves no money, and it comes first.** It is the facilitator confirming that a
signed authorization would settle — nothing is transferred, no chain write happens, and a
task that is then refused is answered with a 4xx that names the class. **A refused task moves
no money.**

**`settle` follows `post`.** It is a separate call the route makes only after the escrow is
on chain. There is deliberately no verify-and-settle helper here and no middleware anywhere
in the path: a middleware would settle before the handler ran, which is exactly the failure
this order exists to prevent. A failed `post` never settles.

`settle` **never throws**. When the facilitator is down after `post` has already succeeded,
it resolves `{ ok: false, reason, float_absorbed: true }` so the route can log
`float_absorbed=true` and still return the task the agent paid for. The operator float
absorbed that one. **Our custody is the one block between settlement and escrow, and we say
so.**

## Money

The fee is 15 % **on top** of what the worker keeps. For a 3.00 task the agent pays **3.45**,
the escrow locks **3.45**, the worker receives **3.00** and the fee is **0.45**. There is no
deducted figure anywhere. All of it is integer arithmetic on 6-decimal units via
`priceWithFee` from `@legwork/shared` — never a float multiply, which drifts.

| | units | usdc |
|---|---|---|
| worker receives | `3_000_000` | 3.00 |
| fee | `450_000` | 0.45 |
| agent pays / escrow locks | `3_450_000` | 3.45 |

## Idempotency

The key is the **EIP-3009 authorization nonce** — never the task id, never the payer address,
never the spec hash. One signed authorization buys one task, however many times it is sent.

Task ids start at 1 on chain, so **`task_id = 0` is the reservation sentinel**: a row that
exists but whose `post` has not happened yet.

```
reserve(nonce) -> 'reserved'     first sight; go and do the work
               -> 'in_progress'  another request is mid-post with this authorization
               -> 'done'         hand back the stored { task_id, settle_tx }
complete(nonce, { task_id, settle_tx })   the post succeeded
setSettleTx(nonce, tx)                    the settle succeeded
release(nonce)                            the post never happened; free the nonce
```

The row is written **before** `settle`, not after it. The S3 spike settled one authorization
into a facilitator error, stored nothing, and watched the agent's retry run the work a second
time for one payment — in the real route that is a second `TaskEscrow.post` the float has to
absorb. Reserving first means a retry after a failed settle resumes the same task.

`MemoryIdempotencyStore` is process-local and good for a single-process test.
`SqlIdempotencyStore` takes a `SqlExecutor` — `(text, params) => rows` — so this package
never imports Drizzle or the API; T-16 passes the API's `rawQuery` in. Its table is the frozen
`idempotency` (`auth_nonce` primary key, `task_id`, `settle_tx`), and `reserve` is an
`INSERT … ON CONFLICT DO NOTHING` plus a read-back, so two concurrent requests carrying the
same authorization race on the insert and exactly one of them wins.

## Running the tests without a facilitator

Every test in this package — and in T-16 and T-28 — runs offline.

```bash
pnpm --filter @legwork/payments test
```

`FakeFacilitator` answers `verify` and `settle` from arithmetic: it checks the recipient, the
amount, the expiry and whether the nonce was already settled, exactly the facts a real one
checks about the authorization itself. It has `failNextVerify(reason)`,
`failNextSettle(reason)`, the counters `verifyCalls` / `settleCalls`, and `reset()`.

`signPaymentHeader()` produces a real `PAYMENT-SIGNATURE` value: EIP-3009 is typed-data
signing, so it needs no chain and no RPC. It defaults to Anvil account #0, a published test
vector printed by `anvil` on every start — not a secret, and never used outside tests.

No test here reaches a chain, an RPC or the public reference facilitator. This package reads
no environment variable at all; `PAYMENT_MODE`, `X402_FACILITATOR_URL`, `X402_NETWORK` and
`USDC_ADDRESS` are read by T-16's wiring and passed in. Keys come only from `process.env`,
never from a client bundle. Nothing here logs: it returns results, so no raw spec text can
leak through it.

## The x402 wire, as the spike recorded it

`src/x402/paths.ts` is the only file that knows where things live inside a decoded payload.
Both property paths are copied from `docs/spikes/RESULTS.md#s3`, which logged them against
three live round-trips on Base Sepolia:

| | |
|---|---|
| payer | `decoded.payload.authorization.from` |
| nonce | `decoded.payload.authorization.nonce` |
| request header | `PAYMENT-SIGNATURE` |
| 402 header | `PAYMENT-REQUIRED` |
| response header | `PAYMENT-RESPONSE` |

A v2 client reads its requirements from the `PAYMENT-REQUIRED` header, so the 402 always sets
it. The JSON body — `{ error: 'payment_required', price_usdc, accepts, remaining_budget }` —
is for humans, curl and the dashboard, and echoes the agent's remaining budget so an honest
one can read its own limits. A header that is present but fails `verify` comes back in that
same shape with the facilitator's reason added; there is no separate error code for it.

## Direct funding

`DirectFundingGateway`, selected by `PAYMENT_MODE=direct`, is the Day-6 pivot: the buyer calls
`postAsBuyer` themselves and the API verifies the `TaskPosted` event, so there is no 402 and
nothing to settle. Pricing is the same arithmetic either way, so `price` works today;
`requirePayment` and `settle` throw until T-16b implements them.
