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

## Deploy

_T-14 — the four contracts on Base Sepolia, wired, and the demo pool seeded_

outcome: live. The four contracts are on Base Sepolia, wired, verified on Basescan, and the demo
pool behind them is 20 seeded workers and five released lifecycles. `scripts/deploy.sh` ran 115
checks against the deployed addresses and every one passed. The same script against a local anvil
(chain 31337, repository mocks) is green twice over, the second run logging `deploy: skipped` and
broadcasting nothing — that rehearsal is what T-36 reuses.

**Addresses** — each verified on Basescan ("Contract Source Code Verified").

| contract | address | Basescan |
|---|---|---|
| `WorkerRegistry` | `0x9011A65B89376e6cA393c3158fcB75f5a19F60a1` | [Contract Source Code Verified](https://sepolia.basescan.org/address/0x9011A65B89376e6cA393c3158fcB75f5a19F60a1#code) |
| `TaskEscrow` | `0xDAFefc07986B3336b066B19E6DE6B76680628B52` | [Contract Source Code Verified](https://sepolia.basescan.org/address/0xDAFefc07986B3336b066B19E6DE6B76680628B52#code) |
| `Reputation` | `0x68b16582c8fdFdAaDBfB158d578e2ab839e3d763` | [Contract Source Code Verified](https://sepolia.basescan.org/address/0x68b16582c8fdFdAaDBfB158d578e2ab839e3d763#code) |
| `AbuseMark` | `0x1848Db2d813A66b735f61a73c75456ca32b42Fb6` | [Contract Source Code Verified](https://sepolia.basescan.org/address/0x1848Db2d813A66b735f61a73c75456ca32b42Fb6#code) |

External, not ours: USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, ERC-8004 IdentityRegistry
`0x8004A818BFB912233c491871b3d84c89A494BD9e`, ERC-8004 ReputationRegistry
`0x8004B663056A597Dffe9eCcC1965A193B7388713`.

**Deployment transactions**

| contract | tx |
|---|---|
| `WorkerRegistry` | [`0x9bfd8e30…`](https://sepolia.basescan.org/tx/0x9bfd8e30d787f4394cacbfae00ca76de61fe0ed35e4155dbb057e653131b910d) |
| `Reputation` | [`0xe40a2b8e…`](https://sepolia.basescan.org/tx/0xe40a2b8e985201f03059e77d167e3970444a9012a817c9915bc5ad667256d941) |
| `AbuseMark` | [`0x351a855b…`](https://sepolia.basescan.org/tx/0x351a855b3c8e35acd7cf395cea3d2c57ef848cf8617271ab0a43fdd1ece9758b) |
| `TaskEscrow` | [`0xf16ab1d0…`](https://sepolia.basescan.org/tx/0xf16ab1d04777c1c712986e90b0a4da4a78bb356e71038ad618ba258e2209e9e2) |

`startBlock`: **46502519** — the `WorkerRegistry` receipt's block, merged into
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
| 1 | 1 verify-open | ez5kv | worker 1 (CLI worker) | [`0x159f90f9…`](https://sepolia.basescan.org/tx/0x159f90f98a7b4bab372ac1b08b338694edbcedf17b02164df2741d6917c79991) | [`0xaab16ac9…`](https://sepolia.basescan.org/tx/0xaab16ac9065877c68db9be89df52e7969ea8e7fa607511cb1dc68db624bd13f5) | [`0xbcd09618…`](https://sepolia.basescan.org/tx/0xbcd09618843f1cca29ba24e3b5db7a89da2a0a95ce16f2b2115db0785c85ebf9) | [`0x656e2d36…`](https://sepolia.basescan.org/tx/0x656e2d369040ebc1e10b3bba94b1cbcb6e3b637ba7a949558dd3d17bec088367) |
| 2 | 2 photo-of | ez5ks | worker 2 | [`0x0a40eba9…`](https://sepolia.basescan.org/tx/0x0a40eba92d0699a407d31949d2d214ade7208d8662b43eb86617a8cefb13a0a8) | [`0x5f82c944…`](https://sepolia.basescan.org/tx/0x5f82c94452bd7439c683d1dfb5c0442e421b6e40e3c8a3ee7c398560b501b282) | [`0x43079c17…`](https://sepolia.basescan.org/tx/0x43079c17c4cc7920ab41fad5d8512f81d1153124e098b8d9303804cacd2dfe2c) | [`0x7870ff5e…`](https://sepolia.basescan.org/tx/0x7870ff5eca8a546dbe7622cbdbb3815e90e8ac710575e29eb84f14a783d36d5e) |
| 3 | 4 call-confirm | ez5kt | worker 3 | [`0xbd1353c1…`](https://sepolia.basescan.org/tx/0xbd1353c1e19c201d0a3cf9a9c32d08630d0881d8dc74b795a34abf5f7b50871a) | [`0x827e8634…`](https://sepolia.basescan.org/tx/0x827e863481f54854d894d6c16e24252adead6dabc8a3a71731189d6c1695b3f7) | [`0xa9a55fe6…`](https://sepolia.basescan.org/tx/0xa9a55fe6237e11ea57b8f5a650df777034bd840dcd422e7a9c9176d67912ad8a) | [`0xa9dc4bf5…`](https://sepolia.basescan.org/tx/0xa9dc4bf50d0a97d034a64140584e01df60b77ed9108d80db5c44cdeda4921993) |
| 4 | 8 compare-two | ez5kg | worker 4 | [`0x98e6ea35…`](https://sepolia.basescan.org/tx/0x98e6ea356695d23b78f064e9ad3ca9324ccf6514fbed7bb2bda963e7b200bdc8) | [`0x9887e68e…`](https://sepolia.basescan.org/tx/0x9887e68e3e3769442db016c08c640bf32b24225de476dca091d12d038d94366f) | [`0x7005d81e…`](https://sepolia.basescan.org/tx/0x7005d81e0ebe4c6254d45cbcddfc427e56f323473b0ad7b0d269e41d5a367b96) | [`0x7ee4cff1…`](https://sepolia.basescan.org/tx/0x7ee4cff109b5d186d3b776b3ef67a50dcab346e9171a47e1984f32435a06a639) |
| 5 | 1 verify-open | ez1dp | worker 5 | [`0x8bb49a03…`](https://sepolia.basescan.org/tx/0x8bb49a03c72d1ed61cc72df3755146d75497afede7393298e8de84e8a590dce4) | [`0x6b3c7e8e…`](https://sepolia.basescan.org/tx/0x6b3c7e8e4cf1ecf22e2e3d30be98fe6fa1f0f49169d7539cfa18691f068c74bc) | [`0x870cfbcd…`](https://sepolia.basescan.org/tx/0x870cfbcdd50fd33fc4407c220c604f85fb88fb74bd16c468fc08778cae778bc8) | [`0xe3cbe3fe…`](https://sepolia.basescan.org/tx/0xe3cbe3fe0fbda9c412750eb0830e86348e66c40565b9c61b9be6aafb5657762c) |

All five end in `TaskState.Released` (4); `Reputation.completed(nullifier_k) == 1` and
`distinctRaters == 1` for each, keyed by the synthetic nullifier, with the deployer's address as
the rater key because `buyerAgentId = 0` — a demo completion writes no ERC-8004 feedback against
an agent identity that never asked for the task.

**Balances** (6-decimal USDC integers)

| account | before | after |
|---|---|---|
| relayer float | 35350000 | 18100000 |
| treasury `0xABFDB572…` | 0 | 2250000 |
| each seeded worker 1–5 | 0 | 3000000 |

Five lifecycles move 17250000 out of the relayer float, 15000000 to the five workers and 2250000
to the treasury.

evidence: `scripts/deploy.sh` against Base Sepolia — 115 checks, 0 failures, all four contracts
verified in the same run. `scripts/deploy.sh --anvil` twice against a fresh anvil — the second run
logs `deploy: skipped, already at <taskEscrow>`, broadcasts nothing and leaves `taskCount()` at 5.
`cast logs` over the registry from `startBlock` returns 20 `WorkerSeeded` and zero
`WorkerRegistered` on both chains. Full output pasted in PR #119.

decision: `contracts/deployments/base-sepolia.json` is the single deployment record;
`packages/shared/src/addresses.ts`, the subgraph manifest and every app read it. Its four contract
keys keep T-01a's nesting under `addresses`, with `usdc`, `treasury`, `relayer`, `deployer`,
`startBlock`, `deployedAt` and `txs` added around that shape — `parseDeployment` ignores keys it
does not know, so the provenance fields cost nothing downstream.

## Locked architecture

- credential level: selfie | orb → narration variant: A | B — _pending_
- GPS: available | downgraded (photo + server timestamp + tapped confirmation) — _pending_
- payment: x402 — S3 PASS (Sept 6): exact-EVM, reference facilitator, requirements built inside the handler, settle after post, nonce-keyed idempotency; buyer paid no gas
- ERC-8004: live registries — S5 PASS (Sept 7): production IdentityRegistry `0x8004A818…` and ReputationRegistry `0x8004B663…` on Base Sepolia, interfaces confirmed unchanged, `_safeMint` (a contract holder needs `onERC721Received`), unsolicited feedback legal, `getSummary` needs named clients and lags its receipt by a block; T-13b not dispatched
