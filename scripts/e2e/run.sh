#!/usr/bin/env bash
# scripts/e2e/run.sh — the whole lifecycle on a local anvil, in one command.
#
#   bash scripts/e2e/run.sh
#
# Boots anvil on 31337, runs T-14's deploy and seed against it, starts the API, starts the
# seeded CLI worker, runs T-29's `demo:run` as the demo agent, and then asserts the final
# state on chain and through the API (`scripts/e2e/assert.ts`). Prints `E2E PASS` and exits 0
# when every assertion holds.
#
# Every process logs to scripts/e2e/.out/<name>.log, which is gitignored. Nothing here reads
# the operator's .env, nothing dials Base Sepolia, and no key is ever echoed or written to a
# file: the six role keys are derived at runtime from the public anvil mnemonic below.
#
# Exit codes: 0 pass · 1 a step or an assertion failed · 2 a precondition or a guard refused.
set -euo pipefail

# Never trace: an `x` here would put six private keys in the log the CI artifact uploads.
set +x

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

OUT="$ROOT/scripts/e2e/.out"
RPC_URL="http://127.0.0.1:8545"
API_PORT="${E2E_API_PORT:-3001}"
API_URL="http://127.0.0.1:${API_PORT}"
DASHBOARD_URL_LOCAL="http://127.0.0.1:3000"
# The demo place (scripts/fixtures/demo-place.json) sits in this geohash-5 cell, and so does
# seeded worker 1 — the CLI worker. The board is filtered by it.
AREA="ez1dp"

# The public anvil test mnemonic, printed by `anvil` on every start. It is a published test
# vector, not a secret, and the keys derived from it exist only on chain 31337.
MNEMONIC="test test test test test test test test test test test junk"

say() { printf 'e2e: %s\n' "$*"; }
# die <message> [exit code]
die() { printf 'e2e: %s\n' "$1" >&2; exit "${2:-1}"; }

# --------------------------------------------------------------------- 1. preconditions

# Both guards run before a process starts, so a misconfigured shell cannot reach a real chain
# through this harness: the only chain it ever talks to is a local anvil on 31337.
if [ -n "${CHAIN_ID:-}" ] && [ "${CHAIN_ID}" != "31337" ]; then
  die "the chain-id guard refuses this run: CHAIN_ID is ${CHAIN_ID}, and this harness only ever runs against a local anvil on 31337" 2
fi

is_localhost() { # is_localhost <url>
  case "${1#*://}" in
    127.0.0.1|127.0.0.1:*|localhost|localhost:*|0.0.0.0|0.0.0.0:*|\[::1\]|\[::1\]:*) return 0 ;;
    *) return 1 ;;
  esac
}

if [ -n "${BASE_SEPOLIA_RPC_URL:-}" ] && ! is_localhost "${BASE_SEPOLIA_RPC_URL}"; then
  die "the localhost-RPC guard refuses this run: BASE_SEPOLIA_RPC_URL points at ${BASE_SEPOLIA_RPC_URL%%://*}://… off this machine, and this harness only ever talks to a local anvil" 2
fi

# `openssl`, `curl` and `timeout` are as required as the five the brief names: the session
# secrets, the /healthz wait and the 300 s bound on demo:run are each one of them.
for tool in anvil forge cast pnpm jq openssl curl timeout; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not on PATH — see scripts/e2e/README.md for the toolchain" 2
done

# scripts/deploy.sh sources a root .env before it reads a role key, so the file has to exist.
# The harness never reads the operator's: it refuses when one is there, because the keys in it
# would override the anvil-derived roles below and seed a pool this run cannot settle. What it
# writes instead holds comments and no key at all, and it is removed again on the way out.
ENV_PLACEHOLDER=0
if [ -f "$ROOT/.env" ]; then
  die "a root .env is present, and scripts/deploy.sh sources it: its role keys would override the ones this harness derives from the anvil mnemonic. Move it aside (mv .env .env.operator) and run again" 2
fi

# ------------------------------------------------------------------------ 2. the cleanup

ANVIL_PID=""
API_PID=""
WORKER_PID=""

stop() { # stop <name> <pid>
  local pid="$2"
  [ -n "$pid" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  say "stopping $1"
  # `next dev` and `pnpm` both fork; the children go first so nothing is left holding a port.
  pkill -P "$pid" 2>/dev/null || true
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  stop "the CLI worker" "$WORKER_PID"
  stop "the API" "$API_PID"
  stop "anvil" "$ANVIL_PID"
  if [ "$ENV_PLACEHOLDER" = 1 ]; then rm -f "$ROOT/.env"; fi
  exit "$status"
}
trap cleanup EXIT INT TERM

mkdir -p "$OUT"
rm -f "$OUT"/*.log "$OUT/before.json"

printf '%s\n' \
  '# Written by scripts/e2e/run.sh and removed again when it exits.' \
  '# scripts/deploy.sh sources this file; every role this run uses is exported into the' \
  '# environment from the public anvil mnemonic instead, so there is no key in here.' \
  > "$ROOT/.env"
ENV_PLACEHOLDER=1

# --------------------------------------------------------------------------- 3. the wait

wait_for() { # wait_for <label> <seconds> <command…>
  local label="$1" limit="$2"
  shift 2
  local deadline=$(( SECONDS + limit ))
  until "$@" >/dev/null 2>&1; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      printf 'e2e: %s was not ready within %ss — see %s\n' "$label" "$limit" "$OUT" >&2
      return 1
    fi
    sleep 1
  done
  say "$label is up"
}

# ------------------------------------------------------------------------- 4. start anvil

say "starting anvil on 31337"
anvil --chain-id 31337 --block-time 1 --port 8545 --mnemonic "$MNEMONIC" > "$OUT/anvil.log" 2>&1 &
ANVIL_PID=$!

anvil_ready() { [ "$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null)" = "31337" ]; }
wait_for "anvil" 30 anvil_ready || die "anvil never answered 31337 — the tail of $OUT/anvil.log is above"

# ------------------------------------------------------------------------- 5. the roles
#
# Derived here and never written down: no key is echoed, passed on a command line or put in a
# file. Indexes 0..6 are the seven roles .env.example names, in its order.

key() { cast wallet private-key --mnemonic "$MNEMONIC" --mnemonic-index "$1"; }
address_of() { cast wallet address --private-key "$1"; }

DEPLOYER_PRIVATE_KEY="$(key 0)"
RELAYER_PRIVATE_KEY="$(key 1)"
ATTESTATION_VERIFIER_PRIVATE_KEY="$(key 2)"
ABUSEMARK_SIGNER_PRIVATE_KEY="$(key 3)"
BUYER_PRIVATE_KEY="$(key 4)"
CLI_WORKER_PRIVATE_KEY="$(key 5)"
TREASURY_ADDRESS="$(address_of "$(key 6)")"
export DEPLOYER_PRIVATE_KEY RELAYER_PRIVATE_KEY ATTESTATION_VERIFIER_PRIVATE_KEY
export ABUSEMARK_SIGNER_PRIVATE_KEY BUYER_PRIVATE_KEY CLI_WORKER_PRIVATE_KEY TREASURY_ADDRESS

CHAIN_ID=31337
BASE_SEPOLIA_RPC_URL="$RPC_URL"
export CHAIN_ID BASE_SEPOLIA_RPC_URL

RELAYER_ADDRESS="$(address_of "$RELAYER_PRIVATE_KEY")"
CLI_WORKER_ADDRESS="$(address_of "$CLI_WORKER_PRIVATE_KEY")"
say "roles derived from the anvil mnemonic — worker $CLI_WORKER_ADDRESS, treasury $TREASURY_ADDRESS"

# ------------------------------------------------------------- 6. deploy, seed, addresses

RECORD="$ROOT/contracts/deployments/anvil.json"
# A record from an earlier run points at addresses this fresh anvil has no code at. Deploy's
# own guard reads the code and redeploys, but the file is removed anyway so that a failure
# here can never be read as a success by anything downstream.
rm -f "$RECORD"

say "deploying and seeding (scripts/deploy.sh --anvil)"
bash scripts/deploy.sh --anvil 2>&1 | tee "$OUT/deploy.log"

[ -f "$RECORD" ] || die "scripts/deploy.sh --anvil left no $RECORD"

WORKER_REGISTRY_ADDRESS="$(jq -r '.addresses.workerRegistry' "$RECORD")"
TASK_ESCROW_ADDRESS="$(jq -r '.addresses.taskEscrow' "$RECORD")"
REPUTATION_ADDRESS="$(jq -r '.addresses.reputation' "$RECORD")"
ABUSEMARK_ADDRESS="$(jq -r '.addresses.abuseMark' "$RECORD")"
USDC_ADDRESS="$(jq -r '.usdc' "$RECORD")"
ERC8004_IDENTITY_ADDRESS="$(jq -r '.addresses.erc8004Identity' "$RECORD")"
ERC8004_REPUTATION_ADDRESS="$(jq -r '.addresses.erc8004Reputation' "$RECORD")"
export WORKER_REGISTRY_ADDRESS TASK_ESCROW_ADDRESS REPUTATION_ADDRESS ABUSEMARK_ADDRESS
export USDC_ADDRESS ERC8004_IDENTITY_ADDRESS ERC8004_REPUTATION_ADDRESS

# ------------------------------------------------------------------- 7. the before picture
#
# Every assertion downstream is a delta against this file, never an absolute balance: the seed
# has already moved 17.25 through the escrow by the time the demo posts its task.

# `cast call` annotates a large integer ("3000000 [3e6]"); the snapshot keeps the plain value.
read_num() { cast call "$@" --rpc-url "$RPC_URL" | awk '{print $1}'; }
usdc_balance() { read_num "$USDC_ADDRESS" "balanceOf(address)(uint256)" "$1"; }

CLI_WORKER_NULLIFIER="$(read_num "$WORKER_REGISTRY_ADDRESS" "nullifierOf(address)(uint256)" "$CLI_WORKER_ADDRESS")"

jq -n \
  --arg cliWorker "$CLI_WORKER_ADDRESS" \
  --arg treasury "$TREASURY_ADDRESS" \
  --arg relayer "$RELAYER_ADDRESS" \
  --arg escrow "$TASK_ESCROW_ADDRESS" \
  --arg usdc "$USDC_ADDRESS" \
  --arg workerBalance "$(usdc_balance "$CLI_WORKER_ADDRESS")" \
  --arg treasuryBalance "$(usdc_balance "$TREASURY_ADDRESS")" \
  --arg relayerBalance "$(usdc_balance "$RELAYER_ADDRESS")" \
  --arg escrowBalance "$(usdc_balance "$TASK_ESCROW_ADDRESS")" \
  --arg taskCount "$(read_num "$TASK_ESCROW_ADDRESS" "taskCount()(uint256)")" \
  --arg nullifier "$CLI_WORKER_NULLIFIER" \
  --arg completed "$(read_num "$REPUTATION_ADDRESS" "completed(uint256)(uint256)" "$CLI_WORKER_NULLIFIER")" \
  '{addresses: {cliWorker: $cliWorker, treasury: $treasury, relayer: $relayer, escrow: $escrow, usdc: $usdc},
    usdc: {cliWorker: $workerBalance, treasury: $treasuryBalance, relayer: $relayerBalance, escrow: $escrowBalance},
    taskCount: $taskCount, nullifier: $nullifier, completed: $completed}' \
  > "$OUT/before.json"
say "snapshot written to $OUT/before.json (taskCount $(jq -r .taskCount "$OUT/before.json"))"

# ------------------------------------------------------------------------ 8. start the API

export PAYMENT_MODE=x402
# The classifier: with LIVE_LLM=0 and no ANTHROPIC_API_KEY, apps/api falls back to the
# deterministic KeywordFallbackClassifier — the screening backend that never calls a model.
export LIVE_LLM=0
unset ANTHROPIC_API_KEY
# The facilitator: apps/api builds an HTTPFacilitatorClient from X402_FACILITATOR_URL and has
# no toggle for the FakeFacilitator (apps/api/README.md's environment table has neither it nor
# a pglite DATABASE_URL). The URL is left unset rather than pointed at x402.org, because a
# class-C harness never calls a live facilitator; the name below is what the PR's ENV REQUEST
# asks T-15 for, and apps/api ignores an env name it does not know.
unset X402_FACILITATOR_URL
export X402_FACILITATOR_MODE=fake
# The database: pglite, in a directory under .out/ so a second run starts empty. `DATABASE_URL`
# is honoured when the caller exports one, which is how a local Postgres can stand in.
export DATABASE_URL="${DATABASE_URL:-pglite://$OUT/pglite}"
export DATA_MODE=live
export DEMO_DISPUTE_WINDOW_S=120
export ADMIN_API_KEY=e2e-admin
SESSION_SECRET="$(openssl rand -hex 32)"
PROOF_URL_SECRET="$(openssl rand -hex 32)"
export SESSION_SECRET PROOF_URL_SECRET
export API_BASE_URL="$API_URL"
export DASHBOARD_URL="$DASHBOARD_URL_LOCAL"
export LONGPOLL_MAX_S=50
export PORT="$API_PORT"

say "starting the API on $API_URL"
pnpm --filter @legwork/api dev -- -p "$API_PORT" > "$OUT/api.log" 2>&1 &
API_PID=$!

api_ready() { curl -fsS "$API_URL/healthz" >/dev/null 2>&1; }
wait_for "the API" 60 api_ready || die "the API never answered GET /healthz — the tail of $OUT/api.log says why"

# -------------------------------------------------------------- 9. start the CLI worker
#
# T-29's demo:run drives the worker half in-process, for the one task id it just posted, and
# fails on `AlreadyClaimed` if anything else takes that row first. So the worker started here
# runs the half of §2.7 that does not race it: it signs in through the seeded SIWE dev path
# and polls the board for the demo's task, and demo:run claims, uploads and submits. The PR
# reports the contradiction rather than patching either side of it.

export LEGWORK_API_URL="$API_URL"

say "starting the seeded CLI worker on area $AREA"
pnpm cli-worker -- --area "$AREA" --place scripts/fixtures/demo-place.json --dry-run \
  > "$OUT/worker.log" 2>&1 &
WORKER_PID=$!

# ------------------------------------------------------------------------ 10. the demo run

say "running the demo agent (timeout 300 pnpm demo:run)"
demo_status=0
timeout 300 pnpm demo:run > "$OUT/demo.log" 2>&1 || demo_status=$?
tail -n 20 "$OUT/demo.log" || true

if [ "$demo_status" -ne 0 ]; then
  die "pnpm demo:run exited $demo_status — the tail of $OUT/demo.log is above"
fi
grep -Eq 'task_id=[0-9]+' "$OUT/demo.log" ||
  die "pnpm demo:run printed no task_id= — BLOCKED: T-29 — demo:run output/approve, with the tail above"

# --------------------------------------------------------------------- 11. the assertions

say "asserting the final state"
pnpm tsx scripts/e2e/assert.ts
