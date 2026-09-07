# `scripts/e2e` — the whole lifecycle on a local anvil

Every layer has its own tests against a fake. This harness is the one place where the real
contracts, the real API and the real CLI worker have to agree about one task from `post` to
`Released`, and about the three figures underneath it: the agent pays **3.45**, the worker
receives **3.00**, the fee is **0.45**.

```bash
bash scripts/e2e/run.sh
```

Ten minutes on a laptop, or less. Exit `0` and a last line reading `E2E PASS` is the whole
result; `1` is a step or an assertion that failed and `2` is a precondition or a guard that
refused before anything started.

> **Not green yet.** Steps 1–7 (anvil, the roles, deploy, seed, the snapshot) run today. Step
> 8 stops at the API's own configuration check, because `apps/api` rejects `CHAIN_ID=31337`
> and has no toggle for the FakeFacilitator or for a pglite database. The four requests that
> unblock it are at the bottom of this file, and on the T-36 pull request.

## What it does

| Step | What runs |
|---|---|
| 1 | Preconditions: `anvil`, `forge`, `cast`, `pnpm`, `jq`, `openssl`, `curl` and `timeout` on `PATH`; the chain-id guard; the localhost-RPC guard |
| 2 | `anvil --chain-id 31337 --block-time 1 --port 8545`, waited on until `cast chain-id` answers `31337` |
| 3 | The seven roles, derived from the public anvil mnemonic — never literal in the repository, never echoed, never written to a file |
| 4 | `bash scripts/deploy.sh --anvil` (T-14): the four contracts, the mocks, 20 seeded workers, five completed lifecycles |
| 5 | `.out/before.json`: the four USDC balances, `taskCount()` and the CLI worker's `completed` — every later assertion is a delta against this |
| 6 | The API, on `http://127.0.0.1:3001`, waited on until `GET /healthz` answers |
| 7 | The seeded CLI worker: `POST /session` through the SIWE dev path, then the board |
| 8 | `timeout 300 pnpm demo:run` as the demo agent — posts, waits for `submitted`, approves |
| 9 | `pnpm tsx scripts/e2e/assert.ts` — the chain, the receipt and the API, one line per assertion |

Everything a process prints lands in `scripts/e2e/.out/`, which is gitignored:

```
.out/anvil.log   .out/deploy.log   .out/api.log   .out/worker.log   .out/demo.log
.out/before.json
```

### The worker, and why it runs dry

`§2.7` of the brief starts the CLI worker so that it claims, uploads and submits. T-29's
`demo:run` already drives that half **in-process**, for the one task id it just posted, and
stops with `AlreadyClaimed` if anything else takes the row first. Both cannot hold, so the
worker started here runs `--dry-run`: it signs in through the seeded SIWE dev path and polls
the board, and `demo:run` does the claim, the upload and the submit. `.out/worker.log` is the
evidence that the dev path and the board work on their own. The contradiction is reported on
the pull request rather than resolved by editing either side.

## The environment

**Derived by the harness, in the open.** Nothing below is read from a file, and no key is ever
printed. `key(n) = cast wallet private-key --mnemonic "$MNEMONIC" --mnemonic-index n`, where
the mnemonic is the public test vector `anvil` prints on every start.

| Name | Where it comes from |
|---|---|
| `DEPLOYER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`, `ATTESTATION_VERIFIER_PRIVATE_KEY`, `ABUSEMARK_SIGNER_PRIVATE_KEY`, `BUYER_PRIVATE_KEY`, `CLI_WORKER_PRIVATE_KEY` | `key(0)` … `key(5)` |
| `TREASURY_ADDRESS` | the address of `key(6)` |
| `CHAIN_ID`, `BASE_SEPOLIA_RPC_URL` | `31337`, `http://127.0.0.1:8545` |
| `WORKER_REGISTRY_ADDRESS`, `TASK_ESCROW_ADDRESS`, `REPUTATION_ADDRESS`, `ABUSEMARK_ADDRESS`, `USDC_ADDRESS`, `ERC8004_IDENTITY_ADDRESS`, `ERC8004_REPUTATION_ADDRESS` | `contracts/deployments/anvil.json`, with `jq` |
| `SESSION_SECRET`, `PROOF_URL_SECRET` | `openssl rand -hex 32`, once per run |
| `PAYMENT_MODE`, `DATA_MODE`, `DEMO_DISPUTE_WINDOW_S`, `ADMIN_API_KEY`, `API_BASE_URL`, `DASHBOARD_URL`, `LONGPOLL_MAX_S`, `LIVE_LLM` | `x402`, `live`, `120`, `e2e-admin`, `http://127.0.0.1:3001`, `http://127.0.0.1:3000`, `50`, `0` |
| `LEGWORK_API_URL` | the same origin as `API_BASE_URL`. The brief names this one for the CLI worker; `scripts/cli-worker.ts` reads `API_BASE_URL`, so both are exported |
| `PORT` | `3001`. `pnpm --filter … dev` hands a `--` straight to `next dev`, which reads it as a project directory, so the port travels as an environment variable |

**Owned by `apps/api/README.md`,** and the reason step 6 does not start yet: its environment
table has no name for the FakeFacilitator, none for the FakeClassifier and no pglite form of
`DATABASE_URL`. What the harness does today:

| Name | Today |
|---|---|
| the FakeFacilitator toggle | `X402_FACILITATOR_URL` is **unset** — a class-C run never dials the live facilitator at `x402.org` — and `X402_FACILITATOR_MODE=fake` is exported as the name this harness asks for |
| the FakeClassifier toggle | `LIVE_LLM=0` with `ANTHROPIC_API_KEY` unset, which is what makes `apps/api` fall back to the deterministic `KeywordFallbackClassifier`. No model is called |
| `DATABASE_URL` for pglite | `pglite://scripts/e2e/.out/pglite`, unless the caller exports a `DATABASE_URL` of their own |

### The root `.env`

`scripts/deploy.sh` sources a root `.env` before it reads a role key, so the file has to exist.
The harness writes a placeholder holding three comment lines and no key, and removes it again
on the way out. If a `.env` is already there it **refuses** with exit 2: sourcing it would put
the operator's real role keys over the anvil-derived ones and seed a pool this run cannot
settle. Move it aside (`mv .env .env.operator`) and run again.

## The guards

Two, and both run before a process starts:

- `CHAIN_ID` set to anything but `31337` → exit 2.
- `BASE_SEPOLIA_RPC_URL` pointing anywhere but `127.0.0.1`, `localhost`, `0.0.0.0` or `[::1]` →
  exit 2.

A class-C harness has no secrets and no RPC of its own; these are what make "anvil only" a
property of the script rather than a habit of whoever runs it.

## `assert.ts`

`pnpm tsx scripts/e2e/assert.ts`, run by `run.sh` and runnable on its own against a finished
run. It reads `contracts/deployments/anvil.json`, `.out/before.json` and the `task_id=` line in
`.out/demo.log`, and prints one line per assertion:

- **the task** — `state == 4` (`Released`), `amount == 3_000_000n`, `fee == 450_000n`,
  `worker == the CLI worker`, `taskCount()` one above the snapshot.
- **the money**, as deltas — the worker `+3_000_000n`, the treasury `+450_000n`, the escrow
  `0n` net, the relayer `−3_450_000n`, because the relayer funds the escrow post out of its
  float and the fake facilitator settles no tokens back to it.
- **the reputation** — `completed(nullifierOf(worker))` one above the snapshot,
  `distinctRaters >= 1`.
- **the API** — `GET /tasks/:id` reports `released`, `amount_usdc` 3, `fee_usdc` 0.45, and the
  `tx.release` beside it is a receipt carrying `TaskReleased(taskId, worker, 3000000, 450000)`.
- **the public surfaces** — the feed row is `seeded`, and neither the feed nor
  `GET /public/task/:id` carries a key named `lat`, `lon`, `exact_*`, `buyer_token`, `spec`,
  `question`, `note` or `payer`. These look for the *name*: a coordinate that leaked as `0` is
  still a coordinate that leaked.
- **the ERC-8004 write**, only when `demo:run` printed `agent_id=` — one recorded call on
  `MockReputationRegistry` for that id, tagged `paid-on-proof`.

## The workflow, for the lead

Nothing under `.github/` belongs to this task. This is the shape `.github/workflows/e2e.yml`
wants, and it needs **no repository secret**: every key comes from the public anvil mnemonic
and `LIVE_LLM=0`.

```yaml
name: e2e
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  anvil:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: foundry-rs/foundry-toolchain@v1
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: bash scripts/e2e/run.sh
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: e2e-logs
          path: scripts/e2e/.out/*.log
```

The artifact is uploaded on failure only, and the logs in it carry addresses, transaction
hashes and block numbers — never a key.

## What this harness is waiting on

`run.sh` stops at step 6 today. Each of these is somebody else's file, and none of them is
worked around here:

1. **`CHAIN_ID` on 31337.** `apps/api/src/config.ts:26` pins it to `z.literal(84532)`, so the
   API answers `500 invalid environment — check CHAIN_ID` on every route.
   `packages/chain/src/env.ts` already accepts `31337`.
2. **The fake toggles.** `apps/api/src/services/hire.ts:656` always builds an
   `HTTPFacilitatorClient`, and `apps/api/src/db/client.ts:24` always opens `postgres`. The
   `FakeFacilitator` and pglite exist as test doubles that vitest installs in process; a
   running server has no way to ask for either.
3. **The x402 network.** `apps/api/src/services/hire.ts:634` fixes the network at
   `eip155:84532` and rejects any other `X402_NETWORK`.
4. **`demo:run` against anvil.** `scripts/demo-run.ts:538` reads
   `contracts/deployments/base-sepolia.json` and throws unless the record is chain 84532; its
   payment network and its viem chain are Base Sepolia literals too.
