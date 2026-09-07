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

outcome: the subgraph is deployed to Subgraph Studio and indexing Base Sepolia at the chain head. The Discord question is **open** — see "Discord" below; nothing here claims it is settled.

**Deployment.** Slug `legwork-base-sepolia`, version label `6653cb4` (the git short SHA of the manifest commit), deployment id `QmQfhYXvMH7hTvtp3inckP2662USA9c5Nbd2gvFaKUiTcv`.
Studio: https://thegraph.com/studio/subgraph/legwork-base-sepolia
Query URL: https://api.studio.thegraph.com/query/74763/legwork-base-sepolia/6653cb4
All four data sources start at block `46506271`, the deploy block from `contracts/deployments/base-sepolia.json`.

**Sync time.** Deployed 2026-09-07T14:57Z. The first status read one minute later already had `_meta.block.number = 46512377` against a chain head of ~46512380 — roughly **60 seconds** from `graph deploy` to the head, over the ~6,100 blocks since the deploy block. `hasIndexingErrors` was `false` at every read and has stayed `false`; no handler threw, so nothing goes back to T-09.

**Status check, and what it is not.** The brief asks for the Studio indexing status (`synced`, `fatalError`, `latestBlock == chainHeadBlock`). Studio no longer exposes that from a shell: `https://api.studio.thegraph.com/index-node/graphql` returns 404, and the `subgraphIndexingStatus` field on `https://api.studio.thegraph.com/graphql` answers `UNAUTHENTICATED — "Please login first."` to a deploy key, because it wants a browser session. The equivalent from public data is `_meta` on the query URL against an `eth_blockNumber` on Base Sepolia. Four consecutive samples:

```
chainHead=46512446  _meta={"block":{"number":46512444},"hasIndexingErrors":false}
chainHead=46512447  _meta={"block":{"number":46512444},"hasIndexingErrors":false}
chainHead=46512447  _meta={"block":{"number":46512446},"hasIndexingErrors":false}
chainHead=46512447  _meta={"block":{"number":46512446},"hasIndexingErrors":false}
```

One to three blocks behind a 2-second chain, moving with it: at the head, not catching up.

**Query 1 — the seeded pool.** `{ workers(where: {seeded: true}) { id seeded area completed lastCompletedAt } }` returns **20 rows, every one `seeded: true`**. These are 20 seeded workers (demo data) written by T-14, not people. The subgraph holds 20 workers in total, so the pool reads 0 real and +20 seeded (demo data) until a real worker registers.

**Query 2 — released lifecycles.** `{ tasks(where: {state: "Released"}) { id state amount fee worker { id seeded } txRelease } }` returns **6 rows**, not the 5 the brief predicted. Tasks 1–5 are T-14's seeded lifecycles (demo data); task 6 is the live one T-32 posted and released while proving the ERC-8004 identity path, and it landed after this brief was written. Every one of the six carries `amount: "3000000"` and `fee: "450000"` — the worker receives 3.00, the fee is 0.45, the agent pays 3.45 and the escrow locks 3.45. Six for five is a state change, not a mapping fault.

**Query 3 — the external-poster counter.** `{ posterStats(id: "global") { distinctExternalBuyers externalTasks } }` returns `distinctExternalBuyers: 0, externalTasks: 0`. Both buyers who have posted so far are on the operator allowlist — `0x436cA229…` for the seeded five, `0xc1286562…` for task 6 — and `PosterStats` excludes allowlisted buyers by design. Zero is the honest Day-2 answer for the W3 gate, reported as zero.

**Discord: not asked, no answer.** The question — whether a Subgraph Studio query URL on a testnet counts as "consuming live data from a Graph provider" for the Graph track — was **not put to the Graph Discord as of 2026-09-07T15:06Z**: this deploy ran from a non-interactive shell with no Discord access. It stays open and it is the operator's to ask. Nothing in this repo asserts the track is satisfied.

What the public docs do and do not settle, from reading them rather than from an answer:

- The Studio development query URL is documented as rate-limited to 3,000 queries per day, which is the endpoint the dashboard and `preflight_workers` will be pointed at.
- Neither the Studio page nor the publishing page states that a testnet subgraph cannot be published to the decentralized network — the pages simply do not address testnets.
- A separate testnet Graph Network exists (Graph Explorer at `testnet.thegraph.com`, protocol network `arbitrum-sepolia`) and carries published Base Sepolia subgraphs, so "a testnet subgraph can never be published" is looser than the brief's premise. Whether publishing there would read as a Graph provider for the track is precisely the unanswered question.

evidence: `pnpm graph codegen && pnpm graph build` green on the filled manifest; `graph deploy` output and all three query responses pasted verbatim into the T-23 PR. The four addresses in `subgraph/subgraph.yaml` match `contracts/deployments/base-sepolia.json` character for character.

decision: Studio is where the subgraph lives for the demo and its query URL is what every consumer reads. The Graph-track question stays **open** pending a Discord answer; anyone writing it up must say "Subgraph Studio, Base Sepolia" and not claim more.

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

## Deploy

_T-14 — the four contracts on Base Sepolia, wired, and the demo pool seeded_

outcome: live. The four contracts are on Base Sepolia, wired, verified on Basescan, and the demo
pool behind them is 20 seeded workers and five released lifecycles. `scripts/deploy.sh` ran 115
checks against the deployed addresses; 114 passed in the run and the one that did not, the
treasury delta, was a read that lagged the last release by a block (the treasury held 4500000 a
minute later, exactly before + 2250000) — the wrapper now waits for that read. The same script against a local anvil
(chain 31337, repository mocks) is green twice over, the second run logging `deploy: skipped` and
broadcasting nothing — that rehearsal is what T-36 reuses.

**Redeployed (Sept 7, 11:33 UTC).** T-32 found that `AbuseMark.registerIdentity` could never mint:
the ERC-8004 IdentityRegistry mints with `_safeMint` (S5) and the first AbuseMark implemented no
`onERC721Received`, so the registry reverted `ERC721InvalidReceiver`. AbuseMark now implements the
receiver (lead PR #125); `TaskEscrow.abuseMark` is immutable, so all four contracts were deployed
again as one consistent set and the pool re-seeded (17250000 out of the float). The first set —
WorkerRegistry `0x9011A65B89376e6cA393c3158fcB75f5a19F60a1`, TaskEscrow `0xDAFefc07986B3336b066B19E6DE6B76680628B52`,
Reputation `0x68b16582c8fdFdAaDBfB158d578e2ab839e3d763`, AbuseMark `0x1848Db2d813A66b735f61a73c75456ca32b42Fb6` — stays verified on
Basescan with its five released lifecycles, and nothing reads it. The tables below are the live set.

**Addresses** — each verified on Basescan ("Contract Source Code Verified").

| contract | address | Basescan |
|---|---|---|
| `WorkerRegistry` | `0xc33d229046507f4C2E664cbf974542c92eEAbAf4` | [Contract Source Code Verified](https://sepolia.basescan.org/address/0xc33d229046507f4C2E664cbf974542c92eEAbAf4#code) |
| `TaskEscrow` | `0x641B56dfA3A033D84a75588c18579347A0DE3c6B` | [Contract Source Code Verified](https://sepolia.basescan.org/address/0x641B56dfA3A033D84a75588c18579347A0DE3c6B#code) |
| `Reputation` | `0x2f731B56D02080190fa2ef7813887B2743551E43` | [Contract Source Code Verified](https://sepolia.basescan.org/address/0x2f731B56D02080190fa2ef7813887B2743551E43#code) |
| `AbuseMark` | `0x29145D47EFc76bEaBc3A4011cFf7fC0fBEa02608` | [Contract Source Code Verified](https://sepolia.basescan.org/address/0x29145D47EFc76bEaBc3A4011cFf7fC0fBEa02608#code) |

External, not ours: USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, ERC-8004 IdentityRegistry
`0x8004A818BFB912233c491871b3d84c89A494BD9e`, ERC-8004 ReputationRegistry
`0x8004B663056A597Dffe9eCcC1965A193B7388713`.

**Deployment transactions**

| contract | tx |
|---|---|
| `WorkerRegistry` | [`0x9169775d…`](https://sepolia.basescan.org/tx/0x9169775d1e3d6551cfcd1d1d189a432910737b59d876bd3b1775f4535fabb142) |
| `Reputation` | [`0xb8d35fd3…`](https://sepolia.basescan.org/tx/0xb8d35fd32ea5a99d5c7ecbcd078dfdaae7d1c5d2f67b9c2cf3b6cfc44ca1005e) |
| `AbuseMark` | [`0x3f8dd1b2…`](https://sepolia.basescan.org/tx/0x3f8dd1b2d898c7b2a53265305e61ad8fa821ddd41285738c2a00999bf46e8c3e) |
| `TaskEscrow` | [`0x04da18be…`](https://sepolia.basescan.org/tx/0x04da18be1d99b1f47896f1a216a05e91e9bbf49f3a119db36cb521455c93eff0) |

`startBlock`: **46506271** — the `WorkerRegistry` receipt's block, merged into
`contracts/deployments/base-sepolia.json` by `scripts/deploy.sh`. The subgraph manifest and
`packages/shared/src/addresses.ts` both read that file.

**Seeded workers** — 20 rows, worker 1 is the CLI worker, so the pool reads
"1 real · +20 seeded (demo data)". Addresses and nullifiers are derived from fixed strings, so
they are the same on anvil and on Base Sepolia.

| n | address | area | taskTypes | synthetic nullifier |
|---|---|---|---|---|
| 1 | `0x7b4EB10df800881f73BC1d85BDeF02f82386271e` (CLI worker) | ez5kv | 15 | `0x7b9fd1b052517cadd66e16862fb6c9140aa08c04b28661c7777d585c89872f22` |
| 2 | `0x24F9c1b734d304dD7C753C5253656C1389E076C6` | ez5ks | 15 | `0x88a1254e004805810c4609beb0a221862b6b3b13f39ec3c033762159e5b55ed4` |
| 3 | `0x87B90a409B0a84c378F8b11903EcCdaA2cF74cAb` | ez5kt | 15 | `0xe9089d4e8b9c057f1fec1cc89a95ea6b724f11fcd030b30daead722111aebb4c` |
| 4 | `0x98E4682f8a1a6201907eeab9f7826A0BA4E408A9` | ez5kg | 15 | `0xc0e71ee9ac4b277ecbf96216ee9cefd6e440603c5c64f9d24175b10aba5fe836` |
| 5 | `0x1D6662ABFbCc49751235717Fd18A30242CbFAd37` | ez1dp | 15 | `0x6835a27a3ce75d1aa5271b4b453d3c2bff2919996f1fe74831211d8d7dab1933` |
| 6 | `0xB7D752D77245f8aE8656A96dFEB4c7BE0E435b84` | ez5kv | 2 | `0xd7130cf4a5ddad397addb2b1b7a87a30e6d2dcf7c6670ea6228e46d76cc8c0a8` |
| 7 | `0xB0d03A16631a6C7F60A514E47fC0cFaF33B06e5D` | ez5ks | 4 | `0xd20091266338a5c066db08318e26ea5d3b7a941017dd95461a250144ba51339c` |
| 8 | `0x497b1684Efa4FAE787c9b77b33C73B8EF790bC39` | ez5kt | 8 | `0x359d187819ad3dc260e8542c934edcc7f0b1cb513bdd4b08e963c782921f0962` |
| 9 | `0xAdEd7B6784A7a2b848c3424456567DC2F6592e51` | ez5kg | 15 | `0x27af80fc0fdd9a61ad992ffb34b1f328fde89d0b573a6956f6503334c41fc3c8` |
| 10 | `0x79D2De6f266839da58f3467Df69104Ba037981D3` | ez1dp | 1 | `0x0bc051f955f327bbd6e74237ddb80f8f6d5fa2a2bbff46617122fb8f3f4ed919` |
| 11 | `0xa2a07730c545b3e928ec81168C045E333A6c1362` | ez5kv | 2 | `0xce9169fce5342d41cd6a1cb1bab1f49ed809cc1fc764e9080fcac99210e1d067` |
| 12 | `0x1ec304f5d976A8F303f71F069B3eAAB7B26dBb55` | ez5ks | 4 | `0xf89dccae922ebc663e147d54e857593be5dda4ca14073414dc90509facca0b00` |
| 13 | `0x856FBA8C9e2130488EE8FfD28E4Ab1D66A02B2ab` | ez5kt | 8 | `0x01bf64b000c9160a62e14204db365b822590500b56a7f9b96adca943da6938d2` |
| 14 | `0xADb7e09e86c5B5a340b11f4556A3c964e3bc5B93` | ez5kg | 15 | `0x29ca8dab8f65654360c37ed54508d5b040dd3bf2c4426d4e0cf8502e3d22c6e7` |
| 15 | `0x244183988B0779990C4c0a581AfF797b99c87A4c` | ez1dp | 1 | `0x3b497d9da929f68ae3ede755bbee136dd5c9d6880d2c7b2f6420e785c40f26ea` |
| 16 | `0xBB7916e6d51c51809b38fddDC1eCF2Fc4443b492` | ez5kv | 2 | `0x673c200465505ddff82547b46dee106b3a01de9f7cd07a0fb8ef4d50d01330ca` |
| 17 | `0x02EC9dE89ba5f36c8CaF0b7A4Cea07e86591CC19` | ez5ks | 4 | `0x0fe5171907596e72ea50aaf06ce969c25af605c49e96abffa3898f1b6d08782d` |
| 18 | `0xf97fDDF7ecED4EecB2D593CB6B1d5b80c7cf4089` | ez5kt | 8 | `0x2252558c8ddcd5206f4f5ababa3f83de405fc578d779db74108df93432017a7a` |
| 19 | `0x30272fC453aF0345738C865680C49DA09e31EcAD` | ez5kg | 15 | `0x70cb5e9e4a56627228300d34447c46458d8ad0e2bbf661844e9fe9114216eed8` |
| 20 | `0xbC3Eb72283DaC153951b440eed6350DC24003400` | ez1dp | 1 | `0x3f60139c63413f1bcf75f946e75387d13c34245cfa8e2f22663aa7c0f39197a2` |

20 seeded (demo data) — seeded rows come from `seedWorker`, emit `WorkerSeeded`, never
`WorkerRegistered`. On the anvil rehearsal, `cast logs` over the registry from `startBlock`
returns 20 `WorkerSeeded(uint256,address,string,uint8)` and zero
`WorkerRegistered(uint256,address,string,uint8)`.

**Lifecycles** — five tasks posted, claimed, submitted and released, one closing before the next
opens. Buyer of record is the deployer on all five, and the deployer is allowlisted: seeded
completions feed the preflight medians; no seeded address can ever claim a task a real buyer paid
for. Each is 3.00 posted, 0.45 fee, 3.45 locked (`amount 3000000`, `fee 450000`).

| taskId | type | area | worker | post | claimFor | submitFor | approve |
|---|---|---|---|---|---|---|---|
| 1 | 1 verify-open | ez5kv | worker 1 (CLI worker) | [`0x34de0941…`](https://sepolia.basescan.org/tx/0x34de094181cc267dbb2397dfb42a80888b2efee81ceed78ec9e685ae45ee44a6) | [`0xf364a735…`](https://sepolia.basescan.org/tx/0xf364a735f2fa2122115cf74c86b034e405b2a8712d46d5d79658244da7ce47dd) | [`0x5d6c412f…`](https://sepolia.basescan.org/tx/0x5d6c412f11f274e416810a94867b8088bdd8ded5998659a264a02452c29d777e) | [`0x697466e2…`](https://sepolia.basescan.org/tx/0x697466e23c0c37733e22a7b6a936890d41b4fba52483d976e5ed84d60322f2db) |
| 2 | 2 photo-of | ez5ks | worker 2 | [`0x3a129e8a…`](https://sepolia.basescan.org/tx/0x3a129e8ab5881377dac7e3e0717e1a16eb4db7a4f488502207108b72dd6dcbb7) | [`0x00c5d8b6…`](https://sepolia.basescan.org/tx/0x00c5d8b69c039363dbb44bc69942c36aaf027661da03ea24db381affb4f1df66) | [`0xc7809c72…`](https://sepolia.basescan.org/tx/0xc7809c72a8dc728541863c66b2be555760e277851bddfc86ccc3e4c95e68382c) | [`0xd5a69665…`](https://sepolia.basescan.org/tx/0xd5a696650dff8e5ba8a8e91e4c8082a3c0b159bedb57a4c9cc1cd37a541dbf05) |
| 3 | 4 call-confirm | ez5kt | worker 3 | [`0x45f4b837…`](https://sepolia.basescan.org/tx/0x45f4b837d670c4ca85f728bb269cb5d714a45cc804654314c3fc0a41a418d5c0) | [`0xf16b6759…`](https://sepolia.basescan.org/tx/0xf16b675948191bcff98b931c819b63dd86485d0b7013c7763be261c31f34f695) | [`0x5dc0e899…`](https://sepolia.basescan.org/tx/0x5dc0e899d245fe1daee3a21dee1537d55a8334bb1797ee390f3f3464df72583d) | [`0x1e715764…`](https://sepolia.basescan.org/tx/0x1e715764364f328ac2c3f6f944ae565e9b3cec4e65d851db00207947642f10f2) |
| 4 | 8 compare-two | ez5kg | worker 4 | [`0x23f4bc53…`](https://sepolia.basescan.org/tx/0x23f4bc533e1fa1d05eeec467036d3e5b148a921f37759b1f5a45e82e2105f426) | [`0xacbfb6a7…`](https://sepolia.basescan.org/tx/0xacbfb6a71009bd3a0e085b56e42ed17d6928214c7434312a6ac9acdd47e9e083) | [`0xa98d04d4…`](https://sepolia.basescan.org/tx/0xa98d04d46ef269977428172837c80297300b5dc09d07d487fd7b08d7424190f4) | [`0x6b5788b0…`](https://sepolia.basescan.org/tx/0x6b5788b0006115ec3a2f8c701ddcce618ac4fe6ef0b925346af4db88b887e4ad) |
| 5 | 1 verify-open | ez1dp | worker 5 | [`0x99d28e1e…`](https://sepolia.basescan.org/tx/0x99d28e1e4aee39b657a90962e6018a4555507eee3858b3fc8b2e6b920b6eee26) | [`0xe84ac132…`](https://sepolia.basescan.org/tx/0xe84ac13217c267a87139e2aa5331e26c468fd247d8460bae11c35cd8abbfcd85) | [`0x8796e2e5…`](https://sepolia.basescan.org/tx/0x8796e2e54f0aaf5eb131a3c85ed566566a565a732201b14b432a6fbc42b028f9) | [`0x236c0b26…`](https://sepolia.basescan.org/tx/0x236c0b26600ac5d6548bc42db2cf1d355e39191ef7f00bc66138cc0a5f9f2a04) |

All five end in `TaskState.Released` (4); `Reputation.completed(nullifier_k) == 1` and
`distinctRaters == 1` for each, keyed by the synthetic nullifier, with the deployer's address as
the rater key because `buyerAgentId = 0` — a demo completion writes no ERC-8004 feedback against
an agent identity that never asked for the task.

**Balances** (6-decimal USDC integers)

| account | before | after |
|---|---|---|
| relayer float | 18100000 | 850000 |
| treasury `0xABFDB572…` | 2250000 | 4500000 |
| each seeded worker 1–5 | 3000000 | 6000000 |

Five lifecycles move 17250000 out of the relayer float, 15000000 to the five workers and 2250000
to the treasury.

evidence: `scripts/deploy.sh` against Base Sepolia — 115 checks, all four contracts verified in
the same run (first deploy: 0 failures; redeploy: the one lagging treasury read above). `scripts/deploy.sh --anvil` twice against a fresh anvil — the second run
logs `deploy: skipped, already at <taskEscrow>`, broadcasts nothing and leaves `taskCount()` at 5.
`cast logs` over the registry from `startBlock` returns 20 `WorkerSeeded` and zero
`WorkerRegistered` on both chains. Full output pasted in PR #119; the redeploy is recorded in LEAD-NOTES.

decision: `contracts/deployments/base-sepolia.json` is the single deployment record;
`packages/shared/src/addresses.ts`, the subgraph manifest and every app read it. Its four contract
keys keep T-01a's nesting under `addresses`, with `usdc`, `treasury`, `relayer`, `deployer`,
`startBlock`, `deployedAt` and `txs` added around that shape — `parseDeployment` ignores keys it
does not know, so the provenance fields cost nothing downstream.

## Identity

_T-32 — the Task API's ERC-8004 identity, and one released task carrying a real agent id_

outcome: live. The Task API holds ERC-8004 agent id **9195** on the canonical Base Sepolia
IdentityRegistry, minted to `AbuseMark` itself, and the agent-side feedback pipe has been proved
end to end: task 6 was posted with `buyerAgentId = 9196`, released to the CLI worker, and the
release wrote `paid-on-proof` against 9196 in the ERC-8004 ReputationRegistry with `AbuseMark` as
the rater. `getSummary` reads it back as `count=1 summaryValue=1 summaryValueDecimals=0`.

This ran against the second deployment (`startBlock` 46506271). The first attempt, against the
deployment of `## Deploy`, was blocked: the IdentityRegistry mints with `_safeMint`, `AbuseMark`
implemented no `onERC721Received`, and `registerIdentity` reverted
`ERC721InvalidReceiver(<abuseMark>)` in simulation, so nothing was sent. T-13 added the receiver
and T-14 redeployed all four contracts as one set, because `TaskEscrow.abuseMark` is immutable.

**Step A — the Task API's own identity.**

| field | value |
|---|---|
| `selfAgentId` | **9195** |
| `agentURI` source | `data-uri` — `DASHBOARD_URL` is unset, so the dashboard's `/agent.json` was never there to answer (lane D) |
| `agentURI` | `data:application/json;base64,eyJ0eXBlIjoiaHR0cHM6Ly9laXBzLmV0aGVyZXVtLm9yZy9FSVBTL2VpcC04MDA0I3JlZ2lzdHJhdGlvbi12MSIsIm5` … (first 120 of 325 chars) |
| decoded | `{"type":"https://eips.ethereum.org/EIPS/eip-8004#registration-v1","name":"Legwork Task API","description":"Hire a verified human for a small real-world check; pays USDC on proof.","services":[{"name":"web","endpoint":""}]}` |
| `ownerOf(9195)` | `0x29145D47EFc76bEaBc3A4011cFf7fC0fBEa02608` — the AbuseMark address; the contract minted to itself |
| register tx | [`0x2211390c…`](https://sepolia.basescan.org/tx/0x2211390c33742f4bc93873a65327f77bfed0cb240e715bc605b3d7b4c69a86f5) |

**Step B — the demo agent's id.** `BUYER_AGENT_ID` was empty, so one was registered directly on
the IdentityRegistry from the buyer key: **9196**, `ownerOf(9196) =
0xc1286562DCD771eD76ED59e3D2A51DCe92d349d7`, the buyer.
Tx [`0x10076a44…`](https://sepolia.basescan.org/tx/0x10076a441ac83363e7f81f71d17413aeb88925c3d2d7947cb12b2787b4bb28c3).
The operator sets `BUYER_AGENT_ID=9196` in `.env`; the demo agent passes it as `hire_human.agent_id`
and T-16/T-30 verify it against the payer. The subject of the feedback is this buyer-owned id and
never `selfAgentId` — the reference registry rejects feedback from an agent's own owner.

**Step C — task 6, one released lifecycle carrying the id.** `taskType 1`, `area ez1dp`,
`amount 3000000`, `fee 450000`, `3450000` locked, buyer `0xc128…49d7`, worker the CLI worker
`0x7b4EB10df800881f73BC1d85BDeF02f82386271e`, `claimTTL 1800`, `submitTTL 3600`,
`disputeWindow 120`.

| call | tx |
|---|---|
| `post` | [`0x340cfb9e…`](https://sepolia.basescan.org/tx/0x340cfb9e43d5ffc4ea1af1550f25c42deb50d81f127b04d792ebe8202b2c8486) |
| `claimFor` | [`0x281dfdc5…`](https://sepolia.basescan.org/tx/0x281dfdc58e7fa304ada0bf50ff71d14c7f74e2c2ed8d7fa5cf3cd5b60d06c543) |
| `submitFor` | [`0x69ef157a…`](https://sepolia.basescan.org/tx/0x69ef157afe3f60e67dba9da01e1c18be573528d4d31a4c0a3e46e7ad2b5cfecb) |
| `approve` | [`0x4969dbdc…`](https://sepolia.basescan.org/tx/0x4969dbdcf5578c9f76893115faba09b5422f80c4556d60586064475f8983c2a9) |

`getTask(6)` is state `4` (`Released`) with `buyerAgentId 9196`, `amount 3000000`, `fee 450000`
and the CLI worker as `worker`. Balances moved by exactly one lifecycle: relayer float
24850000 → 21400000, the CLI worker took 3000000, the treasury 450000.

**The decoded `Outcome` event**, emitted by AbuseMark inside `approve`, in block 46506918 of
tx `0x4969dbdc…`:

```
Outcome(agentId = 9196, taskId = 6, outcome = 1)
  topic1 0x…23ec = 9196   topic2 0x…06 = 6   data 0x…01 = 1 (OUTCOME_PAID)
```

**Step D — read back off the ReputationRegistry.**

```
getSummary(9196, [0x29145D47EFc76bEaBc3A4011cFf7fC0fBEa02608], "paid-on-proof", "")
  -> count=1 summaryValue=1 summaryValueDecimals=0
getSummary(9196, [], "", "")
  -> reverts Error("clientAddresses required")
getClients(9196)
  -> 0x29145D47EFc76bEaBc3A4011cFf7fC0fBEa02608
```

§2 asks for the unfiltered summary too. The deployed registry refuses an empty `clientAddresses`
array, as S5 found, so the script makes the call inside a `try` and prints the revert rather than
hiding it; `getClients` answers the same question and names AbuseMark as the only rater.

after this run `taskCount()` is 6 — T-14's check of 5 predates it

**Two notes for whoever runs this next.** A read lags its own receipt here, and it bites twice:
`ownerOf` on an id minted seconds ago still reverts `ERC721NonexistentToken`, and a `claimFor`
simulated straight after the `post` receipt reverts against a task slot the read node has not seen
yet. Both are polled now, and `--only-register` is the cheap way to confirm a run landed. And the
lifecycle resumes rather than restarts: a run that stops between `post` and `approve` leaves a
task with 3.45 locked in it, so the script looks for an unfinished task carrying this agent id
before it posts a new one. That path is not theoretical — it is how task 6 was finished.

the Task API's ERC-8004 identity is operator-attested in v0

the agent id is verified against the IdentityRegistry, never trusted from a request body

evidence: `pnpm tsx scripts/register-identity.ts --dry-run` exits 0 and sends nothing;
`pnpm tsx scripts/register-identity.ts` exits 0 with all twelve step-C assertions and both
step-D bounds green; `… --only-register` prints `selfAgentId 9195 — already registered, skipping`,
sends nothing and exits 0. `cast` confirms `selfAgentId`, `ownerOf`, `getSummary`, `getTask(6)` and
one `Outcome` log independently of the script. `pnpm -r typecheck` green. Full output in PR #124.

decision: `AbuseMark` holds the Task API's identity as agent 9195 and is the only writer of
agent-side feedback. `BUYER_AGENT_ID=9196` is the demo agent's id and belongs in the operator's
`.env`.

## Locked architecture

- credential level: selfie | orb → narration variant: A | B — _pending_
- GPS: available | downgraded (photo + server timestamp + tapped confirmation) — _pending_
- payment: x402 — S3 PASS (Sept 6): exact-EVM, reference facilitator, requirements built inside the handler, settle after post, nonce-keyed idempotency; buyer paid no gas
- ERC-8004: live registries — S5 PASS (Sept 7): production IdentityRegistry `0x8004A818…` and ReputationRegistry `0x8004B663…` on Base Sepolia, interfaces confirmed unchanged, `_safeMint` (a contract holder needs `onERC721Received`), unsolicited feedback legal, `getSummary` needs named clients and lags its receipt by a block; T-13b not dispatched
