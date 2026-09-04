# `@legwork/chain`

Every chain read and every chain write in Legwork goes through this package. Routes, scripts
and the demo harness all talk to one interface — `ChainAdapter` — which `LiveChain` puts on
Base Sepolia or anvil and `FakeChain` puts in memory with the same rules and the same revert
names.

## Only `TxQueue` sends from the relayer key

The Task API runs as many concurrent serverless invocations as there are requests, and they
all share **one** relayer key. Two invocations that read the same nonce produce one
transaction and one replacement, so "one sender" has to be enforced outside the process.

`TxQueue` is that sender. Nothing else in the system may hold the relayer key:

- **Relayer** — `post`, `registerFor`, `claimFor`, `releaseClaimFor`, `submitFor`, `approve`,
  `dispute`, `autoRelease`, `expire`. Holds the float.
- **Signer** — `AbuseMark.mark`, and nothing else.
- **Owner** — the disclosed operator powers (`pause`, `resolve`, `seedWorker`, `resetWorker`,
  `setAllowlistedBuyer`, `setMarkCooldown`). **Scripts use the owner key; the API never has
  it** — `DEPLOYER_PRIVATE_KEY` is optional and absent in production, so `wallets.owner` is
  `undefined` and an owner-role write fails loudly rather than quietly using the wrong key.

The direct-path writes — `postAsBuyer`, `claim`, `submit` — take an explicit `walletClient`
and bypass the queue entirely. They are signed by somebody else's wallet (a script, the
self-custodial roadmap), so there is no shared nonce to serialize.

## The queue algorithm

1. Take the lock for this role (`PgNonceLock` in the API, `MemoryNonceLock` in one process).
2. `nonce` = the stored `next_nonce`, or `getTransactionCount(pending)` when nothing is stored.
3. Estimate gas and fees.
4. Sign.
5. `eth_sendRawTransaction`.
6. Store `nonce + 1`.
7. Release the lock — **before** waiting for any receipt.
8. On a nonce error (`nonce too low`, `nonce has already been used`, `already known`,
   `replacement transaction underpriced`): re-read `getTransactionCount(pending)`, **overwrite**
   the stored nonce, bump `maxFeePerGas` and `maxPriorityFeePerGas` by `gasBumpPercent` (15 %).
9. Retry from 1, up to `maxAttempts` (3); the last error is the one that surfaces.
10. Log `{ role, nonce, attempt, hash, err }` on every attempt — never the raw transaction,
    never a key.

The lock is `pg_advisory_xact_lock`, not `pg_advisory_lock`. An invocation frozen mid-flight
never runs its own release, and a session-scoped lock would be held until the connection died;
a transaction-scoped one goes back on commit, rollback or a dropped connection, whichever
comes first. `SET LOCAL lock_timeout = '10s'` means a stuck holder fails loudly instead of
piling invocations up behind it.

## Environment

The library never reads `process.env`. The caller builds the object and passes it in, which is
what keeps a key out of a client bundle and lets a route test pass a literal.

```ts
import { parseChainEnv, createClients } from '@legwork/chain';
const env = parseChainEnv(process.env);
const { publicClient, wallets } = createClients(env);
```

| Variable | Notes |
|---|---|
| `BASE_SEPOLIA_RPC_URL` | Required. *The* RPC URL for whichever chain `CHAIN_ID` selects — the name is historical, so `CHAIN_ID=31337` points it at anvil. |
| `CHAIN_ID` | `84532` (Base Sepolia) or `31337` (anvil). Defaults to `84532`. |
| `RELAYER_PRIVATE_KEY` | Required. The float and every relayed call. |
| `ABUSEMARK_SIGNER_PRIVATE_KEY` | Required. `mark` only. |
| `DEPLOYER_PRIVATE_KEY` | Optional. Owner-only calls; scripts have it, the API does not. |
| `WORKER_REGISTRY_ADDRESS` | Defaults to the placeholder until T-14 deploys. |
| `TASK_ESCROW_ADDRESS` | Same. |
| `REPUTATION_ADDRESS` | Same. |
| `ABUSEMARK_ADDRESS` | Same. |
| `USDC_ADDRESS` | Defaults to Base Sepolia USDC. |
| `ERC8004_IDENTITY_ADDRESS` | Defaults to the ERC-8004 IdentityRegistry proxy. |
| `ERC8004_REPUTATION_ADDRESS` | Defaults to the ERC-8004 ReputationRegistry proxy. |

`parseChainEnv` throws with variable *names* and never with values: two of these fields are
private keys, and a validation message quoting its input is the easiest place in a system to
leak one into a log.

## `FakeChain` in a route test

Cloud agents have no key and no RPC, so route tests run against `FakeChain`. It implements the
whole `ChainAdapter`, keeps the full escrow state machine, and rejects with `ChainRevert`
carrying the contract's own error name — `InCooldown`, `AlreadyClaimed`,
`SeededCannotClaimExternal` — so a 409 mapped in a test is the 409 production sends.

```ts
import { FakeChain, ChainRevert } from '@legwork/chain';

const chain = new FakeChain({ relayer, treasury });
chain.mintUsdc(relayer, 1_000_000_000n);
chain.setWorker(worker, { nullifier: 1n, seeded: false, area: 'ez5ku', taskTypes: 15 });
chain.setAgentIdentity(1207n, buyerWallet, buyerWallet);

const { taskId } = await chain.post({
  taskType: 1,
  specHash,
  amount: 3_000_000n,       // the escrow locks 3_450_000n — the fee is charged on top
  buyer,
  buyerAgentId: 0n,
  area: 'ez5ku',
  claimTTL: 1800,
  submitTTL: 3600,
  disputeWindow: 86_400,
});

await chain.claimFor(taskId, worker);
await chain.submitFor(taskId, worker, proofHash);
await chain.approve(taskId);
// worker +3_000_000n · treasury +450_000n

await chain.warp(900);              // the only way time passes here
chain.events();                     // every event so far, decoded, in order
```

Money, on every surface: the agent pays **3.45**, the escrow locks **3.45**, the worker
receives **3.00**, the fee is **0.45** — 15 % on top, so the worker keeps the posted rate.
On-chain that is `3_450_000n`, `3_000_000n` and `450_000n`.

The lifecycle scenarios live in `test/fixtures/lifecycle.ts` as `lifecycleSuite(make)`, written
against `ChainAdapter` alone so T-36 can point the same suite at anvil. A harness must hand
back a chain where the relayer is funded, `worker1`/`worker2` are registered, `seededWorker` is
seeded, no buyer is allowlisted and no task exists yet.

## What is not here

Route logic, the lazy sweeper and agent-id verification policy belong to T-16, T-17, T-19 and
T-30. This package exposes `ownerOf` and `getAgentWallet`; it does not decide what they mean.
