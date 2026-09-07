# Day-1 spike results

One section per spike. Section-owned: a PR may touch only its own heading.

## S1

S1: code present, proof rejected (expected)

_World ID Router on Base Sepolia (feedback-doc value only)_

outcome: The World ID Router is deployed at `0x42FF98C4E85212a5D31358ACbFe76a621b50fC02` on Base Sepolia and answers. `cast code` returns 356 characters beginning `0x608060405236601057600e6013565b005b600e` — a 178-byte ERC-1967 proxy in front of `WorldIDRouterImplV1` at `0x379c62556c665f1edd25f2c2a0f76bc70a53b2e4`. The operator has no simulator proof for action `legwork-worker`, because S2' runs Selfie Check through the cloud verify endpoint and that path never produces an onchain proof, so the probe is a `verifyProof` staticcall with all-zero arguments. It reverts, and the two groups the router knows about revert for two different reasons: the router reports `groupCount() = 2`, `routeFor(0)` itself reverts `GroupIsDisabled()` (`0x4ac73bb8`) so group 0 is switched off on this chain, and `routeFor(1)` returns the group-1 verifier `0x163b09b4fE21177c455D850BD815B6D583732432`, against which `verifyProof` reverts `NonExistentRoot()` (`0xddae3b71`) — the all-zero root is not in the bridged root history. That is the expected shape of the answer: onchain verification is Orb-only and the identity roots it checks are the bridged ones, while Legwork's workers hold Selfie Check / Orb-level *staging* credentials that are in neither. Nothing downstream changes on this outcome, as the gate says: `WorkerRegistry` ships one cloud-verified `ATTESTED` mode.

evidence: `bash scripts/spikes/s1-router.sh` — output pasted in the T-04 PR. Error selectors were decoded against the verified `WorldIDRouterImplV1` ABI, which declares exactly `CannotRenounceOwnership()`, `ExpiredRoot()`, `GroupIsDisabled()`, `ImplementationNotInitialized()`, `NoSuchGroup(uint256)` and `NonExistentRoot()`.

decision: no architecture change. `WorkerRegistry` ships one cloud-verified `ATTESTED` mode. The paragraph above is the feedback-doc text; it was posted on the T-02 issue for `FEEDBACK-WORLD.md`, which T-04 does not edit.

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

Time used: 11

Packages: @x402/core@2.25.0, @x402/evm@2.25.0, @x402/fetch@2.25.0

Requirements builder: `import { x402ResourceServer } from "@x402/core/server"` and `import { ExactEvmScheme } from "@x402/evm/exact/server"`. Once at boot: `const rs = new x402ResourceServer(facilitator).register("eip155:84532", new ExactEvmScheme()); await rs.initialize();`. Then **inside the route handler**, per request, so the amount can be dynamic: `await rs.buildPaymentRequirements({ scheme: "exact", network: "eip155:84532", payTo, price: { asset: USDC_ADDRESS, amount: priceUnits(body.amount_usdc).toString(), extra: { name: "USDC", version: "2" } }, maxTimeoutSeconds: 300 })` → `PaymentRequirements[]`; then `await rs.createPaymentRequiredResponse(requirements, { url, description: "Legwork task", mimeType: "application/json" }, "payment_required")` → `PaymentRequired`. No middleware is involved, so nothing settles before the handler.

Facilitator client: `import { HTTPFacilitatorClient } from "@x402/core/server"`; `new HTTPFacilitatorClient({ url: process.env.X402_FACILITATOR_URL })`, passed to the `x402ResourceServer` constructor. The handler calls the resource server, not the facilitator client, so the server's hooks and payment-flow rules apply: `await rs.verifyPayment(payload, requirements[0])` → `{ isValid, payer?, invalidReason? }` (no money moves) and `await rs.settlePayment(payload, requirements[0])` → `{ success, transaction, payer?, network }`. `HTTPFacilitatorClient` also exposes `.verify(paymentPayload, paymentRequirements)` / `.settle(paymentPayload, paymentRequirements)` directly if a caller wants to bypass those hooks.

Header names: request `PAYMENT-SIGNATURE`, 402 `PAYMENT-REQUIRED`, response `PAYMENT-RESPONSE`. All three base64-encode a JSON object; codecs are `encodePaymentRequiredHeader` / `decodePaymentSignatureHeader` / `encodePaymentResponseHeader` from `@x402/core/http`. The v1 legacy names `X-PAYMENT` / `X-PAYMENT-RESPONSE` are still read by the client's settle-response reader but are not what v2 sends.

402 JSON body: body is free; requirements travel in header `PAYMENT-REQUIRED`. `x402HTTPClient.getPaymentRequiredResponse(getHeader, body)` returns `decodePaymentRequiredHeader(getHeader("PAYMENT-REQUIRED"))` whenever that header is present, and only falls back to the body when the body carries `x402Version === 1`. A v2 seller that answers 402 with a JSON body alone is unreadable to the v2 client. So the seller must set the header, and our own `{ "error": "payment_required", "price_usdc": "3.45", "accepts": [...] }` body is ignored by the client and exists for humans, curl and the dashboard.

Payer path: `decoded.payload.authorization.from` (`decoded` = `decodePaymentSignatureHeader(header)`, EIP-3009 payload). Prefer the facilitator's own answer, `verifyResponse.payer`, which the facilitator recovers from the signature; the spike logged both and they matched.

Nonce path: `decoded.payload.authorization.nonce` — a `0x…` 32-byte hex string. Lowercase it before using it as a map key. Full authorization shape: `{ from, to, value, validAfter, validBefore, nonce }`.

Settle tx: https://sepolia.basescan.org/tx/0x77064504cc36f25767635fedb04f37fc663a104bfcebe81f57e199cf1dec8a46 (the run pasted into the PR). Two earlier round-trips settled the same way: `0xd5c50269a85efbf6d2931bab4468e95f144122211391e361b33609fffd1c1d83` and `0x5fcff21422411089499cb81b0a3ec949bc2e2c80b2858f663a008090b581ce8e`.

Replay: settle count stayed 1. The exact `PAYMENT-SIGNATURE` header the paying wrapper sent was re-sent with a plain `fetch`; the server answered `200 {taskId:1, settle_tx: 0x7706…}` from the nonce map and logged `replay=true settle_calls=1`. On-chain balances across the paid call **and** the replay moved exactly once: buyer 13100000 → 9650000 (−3450000), payTo 31900000 → 35350000 (+3450000). Three round-trips were run in total and each moved 3450000 exactly once.

Failing step (if FAIL): — none.

**Findings for T-15 / T-16**

- **The EIP-712 domain is the seller's job.** `buildPaymentRequirements` does *not* fill `extra` when the price is an explicit `{ asset, amount }`, and the 402 then carries `extra: {}`. The client refuses to sign it: `Failed to create payment payload: EIP-712 domain parameters (name, version) are required in payment requirements for asset 0x036C…`. Fix: put `extra: { name, version }` on the price. `getDefaultAsset("eip155:84532")` from `@x402/evm` returns `{ asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", name: "USDC", version: "2", decimals: 6, symbol: "USDC" }`, so the values come from the library rather than a hand-written constant — and comparing its `asset` against `USDC_ADDRESS` is a free sanity check on the env.
- **The buyer needs a spend control raise.** The SDK caps a single payment at **$1** on default assets, so a 3.45 charge is rejected client-side before signing. The x402 buyer (T-28) must pass `spendControls: { maxAmountPerPayment: "$5" }` (or higher) to `wrapFetchWithPaymentFromConfig`.
- **Order is free, not imposed.** Nothing in the primitives forces settle-before-handler; the exact EVM scheme's default payment flow is `authorization` (`verifyBeforeHandler`), which is exactly the frozen T-01 order. `settlePayment` takes an optional `phase` argument that defaults to `after-handler`. The framework middlewares were not used and are not needed.
- **The buyer paid no gas.** The buyer wallet holds no Base Sepolia ETH; the facilitator submitted and paid for the `transferWithAuthorization`. Gasless for the payer, as designed.
- **Idempotency is ours to build.** Neither the resource server nor the reference facilitator dedupes a repeated settle: the nonce map in front of `settlePayment` is what keeps a replay from charging twice. T-15 must carry that map into `X402Gateway` (durably, not in process memory).
- **The nonce must be claimed before `settle`, not after it.** §2's design stores `{taskId, settle_tx}` under the nonce only once settle succeeds, and one of the three runs showed what that costs. The facilitator returned `invalid_exact_evm_transaction_failed` on the first settle, so the nonce was never stored; the replay of that same authorization then looked like a fresh payment, ran `stubPost` a second time and settled successfully as `taskId 2`. Money still moved exactly once — but the work ran twice for one payment, which in the real route is a second `TaskEscrow.post` the float has to absorb. T-16 should write the nonce row **before** calling settle and mark its outcome afterwards, so a retry after a failed settle resumes the same task instead of creating another.
- **The reference facilitator fails transiently.** That `invalid_exact_evm_transaction_failed` was not reproducible: the identical authorization settled successfully seconds later, and both of the other two runs settled first time. Treat a failed settle as retryable rather than as a refusal, and keep the `float_absorbed=true` log line the architecture calls for.
- **`settle` returns before the RPC catches up.** Reading `balanceOf` immediately after a successful settle showed the pre-transfer balances; the receipt was on chain (status `success`) and the balances were correct a few seconds later. Nothing that asserts on a balance right after settle should do so without a poll.

## S5

S5: PASS

_ERC-8004 ABI confirmation — round-trip against the deployed registries_

outcome: Legwork reads and writes the production ERC-8004 registries on Base Sepolia directly. No fallback is needed, so T-13b is not dispatched and nothing is labelled a self-deployed instance. Two throwaway identities were registered from keys that existed only in the spike process; the second gave unsolicited feedback on the first; the read came back exactly as AbuseMark (T-13) will make it.

**Addresses (chain 84532).** IdentityRegistry proxy `0x8004A818BFB912233c491871b3d84c89A494BD9e` → implementation `0x7274e874ca62410a93bd8bf61c69d8045e399c02`. ReputationRegistry proxy `0x8004B663056A597Dffe9eCcC1965A193B7388713` → implementation `0x16e0fa7f7c56b9a767e34b192b51f921be31da34`. Both read from the ERC-1967 implementation slot of the live proxies and both match the addresses named in the gate. Both report `getVersion() = "2.0.0"`; `ReputationRegistry.getIdentityRegistry()` returns the IdentityRegistry proxy, so the pair is wired together.

**Round-trip.** `agentIdA = 9192` (owner `0x80a18b9d1BC003879992588be432F86CA733b02D`), `agentIdB = 9193` (owner `0x1DAa145012FB3dcA5369192f211E533d563ba6E7`). `ownerOf(9192)` and `getAgentWallet(9192)` both return A, so an agent that never calls `setAgentWallet` has its owner as its wallet. Three transactions:

- `register(A)` https://sepolia.basescan.org/tx/0x65ee1d5d66dbaa36ffa68df26ad4bfde6ddec3f624d19074373e90968bbcd77e
- `register(B)` https://sepolia.basescan.org/tx/0x8374615958dd46d50fd9967615f08e95ee0a121d3c311213d60029c6f9b43fab
- `giveFeedback(B → 9192, value=1, tag1="paid-on-proof")` https://sepolia.basescan.org/tx/0x576fe44739fd1383cd75433dacca6979ff40a37f736f23aa25f9a8a214e7cc10

Read back: `getSummary(9192, [B], "paid-on-proof", "") → count=1 summaryValue=1 summaryValueDecimals=0`. Unsolicited feedback is legal on the deployed bytecode — B was never authorised by A and nothing was pre-registered between them.

**mint mode: _safeMint.** `eth_call` of `register("probe")` with `from` = USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (an address with code and no `onERC721Received`) reverts `0x64a0ae92000000000000000000000000036cbd53842c5426634e7929541ec2318f3dcf7e` = `ERC721InvalidReceiver(0x036CbD53842c5426634e7929541eC2318f3dCF7e)`. A contract must implement `onERC721Received` before it can hold an agent id. T-13 decides from this whether AbuseMark's identity is held by a contract or by an EOA.

**unregistered caller: allowed.** `eth_call` of the same `giveFeedback` from a third throwaway that was never registered succeeds. The ReputationRegistry gates on the *subject* agent id, not on the caller, so any address may rate a registered agent. Legwork cannot lean on the registry to establish who a rater is; the agent id in a request is verified against the IdentityRegistry with `ownerOf` / `getAgentWallet`, never trusted from the request.

**Interface verdict: interfaces confirmed, no change.** Every function the spike used matches `contracts/src/interfaces/IERC8004.sol` exactly, in name, parameter types, return types and overload set: `register(string) → uint256`, `ownerOf(uint256) → address`, `getAgentWallet(uint256) → address`, `giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)`, `getSummary(uint256,address[],string,string) → (uint64,int128,uint8)`. No `interface-change` PR is opened and T-13 has nothing to rebase onto.

**Two notes for T-13.** `getSummary` will not take an empty `clients` array — it reverts `Error("clientAddresses required")` — so a caller must always name the raters it means. And the write is visible a block later than its own receipt: reading the summary immediately after `giveFeedback` confirmed returned `count=0`, and the same read settled on the next attempt two seconds on. Anything asserting on a summary straight after a write has to poll, exactly as S3 found for x402 settle.

Live, not ours: World ID, ERC-8004 identity and reputation registries on Base Sepolia, the x402 reference facilitator, USDC.

evidence: `pnpm tsx scripts/spikes/s5-erc8004.ts` exits 0; full output pasted in the T-04 PR. ABIs vendored at `packages/shared/src/abi/erc8004/`.

decision: use the live registries. No self-deploy, no T-13b. `IERC8004Identity` / `IERC8004Reputation` stand as frozen in T-01.

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
- payment: x402 — S3 PASS (Sept 6): exact-EVM, reference facilitator, requirements built inside the handler, settle after post, nonce-keyed idempotency; buyer paid no gas
- ERC-8004: live registries — S5 PASS (Sept 7): production IdentityRegistry `0x8004A818…` and ReputationRegistry `0x8004B663…` on Base Sepolia, interfaces confirmed unchanged, `_safeMint` (a contract holder needs `onERC721Received`), unsolicited feedback legal, `getSummary` needs named clients and lags its receipt by a block; T-13b not dispatched
