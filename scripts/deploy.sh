#!/usr/bin/env bash
# scripts/deploy.sh [--anvil] [--skip-seed]
#
# Deploy the four contracts, seed the demo pool, and check the result. One script for both
# chains: Base Sepolia (84532) is the real thing, a local anvil (31337) is the rehearsal the
# e2e harness runs, and they take the same path so a green rehearsal means something.
#
#   --anvil      talk to http://127.0.0.1:8545 with the repo's mocks; no Basescan verification
#   --skip-seed  deploy and check, leave the pool alone
#
# Reads the operator's .env and never echoes it. Only addresses, tx hashes and block numbers
# reach stdout. Any failed check exits non-zero.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ANVIL=0
SKIP_SEED=0
for arg in "$@"; do
  case "$arg" in
    --anvil) ANVIL=1 ;;
    --skip-seed) SKIP_SEED=1 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "usage: scripts/deploy.sh [--anvil] [--skip-seed]" >&2; exit 2 ;;
  esac
done

if [ ! -f .env ]; then
  echo "deploy: no .env at $ROOT/.env - copy .env.example and fill the role keys" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

if [ "$ANVIL" = 1 ]; then
  RPC="http://127.0.0.1:8545"
  CHAIN=31337
  RECORD="contracts/deployments/anvil.json"
  EXPLORER=""
  VERIFY=()
else
  RPC="${BASE_SEPOLIA_RPC_URL:?BASE_SEPOLIA_RPC_URL is unset in .env}"
  CHAIN=84532
  RECORD="contracts/deployments/base-sepolia.json"
  EXPLORER="https://sepolia.basescan.org"
  VERIFY=(--verify --etherscan-api-key "${BASESCAN_API_KEY:?BASESCAN_API_KEY is unset in .env}")
fi
# bash 3.2 treats "${VERIFY[@]}" on an empty array as an unbound variable under `set -u`.
verify_flags() { echo "${VERIFY[@]+"${VERIFY[@]}"}"; }

FAILED=0
check() { # check <label> <expected> <actual>
  local want lower_want lower_got
  want="$2"
  lower_want="$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')"
  lower_got="$(printf '%s' "$3" | tr '[:upper:]' '[:lower:]')"
  if [ "$lower_want" = "$lower_got" ]; then
    printf 'ok    %-46s %s\n' "$1" "$3"
  else
    printf 'FAIL  %-46s expected %s, got %s\n' "$1" "$want" "$3" >&2
    FAILED=1
  fi
}

rpc() { cast call "$@" --rpc-url "$RPC"; }
# cast annotates large integers ("3000000 [3e6]"); the checks compare the plain value.
rpcnum() { rpc "$@" | awk '{print $1}'; }

# --------------------------------------------------------------------------- role addresses

DEPLOYER=$(cast wallet address --private-key "${DEPLOYER_PRIVATE_KEY:?}")
RELAYER=$(cast wallet address --private-key "${RELAYER_PRIVATE_KEY:?}")
VERIFIER=$(cast wallet address --private-key "${ATTESTATION_VERIFIER_PRIVATE_KEY:?}")
SIGNER=$(cast wallet address --private-key "${ABUSEMARK_SIGNER_PRIVATE_KEY:?}")
BUYER=$(cast wallet address --private-key "${BUYER_PRIVATE_KEY:?}")
CLI_WORKER=$(cast wallet address --private-key "${CLI_WORKER_PRIVATE_KEY:?}")
TREASURY="${TREASURY_ADDRESS:?TREASURY_ADDRESS is unset in .env}"

# Worker 1 is the CLI worker; 2..20 are derived in the open, the same way Seed.s.sol derives them.
seed_worker() {
  if [ "$1" = 1 ]; then printf '%s\n' "$CLI_WORKER"; return; fi
  cast wallet address --private-key "$(cast keccak "legwork-seed-worker-$1")"
}
seed_nullifier() { cast keccak "seed-$1"; }

# ------------------------------------------------------------------------------- 1. build

echo "== build"
( cd contracts && forge build )

# ------------------------------------------------------------------------------ 2. deploy

verify_help() {
  [ -n "$EXPLORER" ] || return 0
  [ -f "$RECORD" ] || return 0
  local wr te rp am usdc
  wr=$(jq -r '.addresses.workerRegistry // empty' "$RECORD")
  te=$(jq -r '.addresses.taskEscrow // empty' "$RECORD")
  rp=$(jq -r '.addresses.reputation // empty' "$RECORD")
  am=$(jq -r '.addresses.abuseMark // empty' "$RECORD")
  usdc=$(jq -r '.usdc // empty' "$RECORD")
  [ -n "$te" ] || return 0
  cat >&2 <<EOF

Basescan verification did not complete. Run these from contracts/ once the sources settle:

forge verify-contract --chain base-sepolia --watch $wr src/WorkerRegistry.sol:WorkerRegistry --constructor-args \$(cast abi-encode "constructor(address,address,address)" $DEPLOYER $RELAYER $VERIFIER)
forge verify-contract --chain base-sepolia --watch $rp src/Reputation.sol:Reputation --constructor-args \$(cast abi-encode "constructor(address)" $DEPLOYER)
forge verify-contract --chain base-sepolia --watch $am src/AbuseMark.sol:AbuseMark --constructor-args \$(cast abi-encode "constructor(address,address,address,address)" $DEPLOYER $SIGNER $ERC8004_IDENTITY_ADDRESS $ERC8004_REPUTATION_ADDRESS)
forge verify-contract --chain base-sepolia --watch $te src/TaskEscrow.sol:TaskEscrow --constructor-args \$(cast abi-encode "constructor(address,address,address,address,address,address,address)" $DEPLOYER $usdc $TREASURY $RELAYER $wr $rp $am)
EOF
}

echo "== deploy (chain $CHAIN)"
set +e
( cd contracts && forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast --slow $(verify_flags) )
deploy_status=$?
set -e
if [ "$deploy_status" -ne 0 ]; then
  verify_help
  exit "$deploy_status"
fi

# ------------------------------------------------- 3. merge txs + startBlock into the record

RUN_LATEST="contracts/broadcast/Deploy.s.sol/$CHAIN/run-latest.json"
if [ -f "$RUN_LATEST" ]; then
  TXS=$(jq -c '[.transactions[] | select(.transactionType == "CREATE") | {contractName, hash}]
               | map({key: .contractName, value: .hash}) | from_entries' "$RUN_LATEST")
  if [ "$TXS" != "{}" ]; then
    WR_HASH=$(jq -r '.transactions[]
                     | select(.transactionType == "CREATE" and .contractName == "WorkerRegistry")
                     | .hash' "$RUN_LATEST")
    WR_BLOCK=$(jq -r --arg h "$WR_HASH" '.receipts[] | select(.transactionHash == $h) | .blockNumber' "$RUN_LATEST")
    case "$WR_BLOCK" in
      0x*|0X*) START_BLOCK=$(( WR_BLOCK )) ;;
      *)       START_BLOCK=$(( 10#$WR_BLOCK )) ;;
    esac
    TMP=$(mktemp)
    jq --argjson txs "$TXS" --argjson sb "$START_BLOCK" \
       '.txs = ((.txs // {}) + $txs) | .startBlock = $sb' "$RECORD" > "$TMP"
    mv "$TMP" "$RECORD"
    echo "record: merged $(jq -r '.txs | length' "$RECORD") tx hash(es), startBlock $START_BLOCK"
  else
    echo "record: no CREATE in this run - keeping the recorded txs and startBlock"
  fi
fi

WORKER_REGISTRY=$(jq -r '.addresses.workerRegistry' "$RECORD")
TASK_ESCROW=$(jq -r '.addresses.taskEscrow' "$RECORD")
REPUTATION=$(jq -r '.addresses.reputation' "$RECORD")
ABUSE_MARK=$(jq -r '.addresses.abuseMark' "$RECORD")
USDC=$(jq -r '.usdc' "$RECORD")
START_BLOCK=$(jq -r '.startBlock' "$RECORD")

usdc_balance() { rpcnum "$USDC" "balanceOf(address)(uint256)" "$1"; }

RELAYER_BEFORE=$(usdc_balance "$RELAYER")
TREASURY_BEFORE=$(usdc_balance "$TREASURY")
TASKS_BEFORE=$(rpcnum "$TASK_ESCROW" "taskCount()(uint256)")

# -------------------------------------------------------------------------------- 4. seed

if [ "$SKIP_SEED" = 1 ]; then
  echo "== seed (skipped)"
else
  echo "== seed"
  ( cd contracts && forge script script/Seed.s.sol:Seed --rpc-url "$RPC" --broadcast --slow )
fi

RELAYER_AFTER=$(usdc_balance "$RELAYER")
TREASURY_AFTER=$(usdc_balance "$TREASURY")

# ----------------------------------------------------------------------------- 5. the ABIs

# The generated ABIs are what the subgraph and the apps bind to. A deploy that ships Solidity
# the committed ABIs do not describe leaves lanes B and C indexing a contract that no longer
# exists, so drift is a failed check rather than a warning.
echo "== abis"
set +e
pnpm abi:gen >/dev/null && git diff --exit-code packages/shared/src/abi subgraph/abis
abi_status=$?
set -e
if [ "$abi_status" -ne 0 ]; then
  echo "FAIL  abi:gen leaves a diff under packages/shared/src/abi or subgraph/abis" >&2
  FAILED=1
else
  echo "ok    abi:gen clean"
fi

# ------------------------------------------------------------------------------ 6. checks

echo "== checks"

check "registry.relayer()"                "$RELAYER"  "$(rpc "$WORKER_REGISTRY" "relayer()(address)")"
check "registry.attestationVerifier()"    "$VERIFIER" "$(rpc "$WORKER_REGISTRY" "attestationVerifier()(address)")"
check "abuseMark.signer()"                "$SIGNER"   "$(rpc "$ABUSE_MARK" "signer()(address)")"
check "abuseMark.escrow()"                "$TASK_ESCROW" "$(rpc "$ABUSE_MARK" "escrow()(address)")"
check "reputation.escrow()"               "$TASK_ESCROW" "$(rpc "$REPUTATION" "escrow()(address)")"
check "escrow.usdc()"                     "$USDC"     "$(rpc "$TASK_ESCROW" "usdc()(address)")"
check "escrow.treasury()"                 "$TREASURY" "$(rpc "$TASK_ESCROW" "treasury()(address)")"
check "escrow.relayer()"                  "$RELAYER"  "$(rpc "$TASK_ESCROW" "relayer()(address)")"

if [ "$SKIP_SEED" = 1 ]; then
  echo "seed skipped - pool checks not run"
  [ "$FAILED" = 0 ] || exit 1
  exit 0
fi

WORKER_1=$(seed_worker 1)
check "worker 1 == CLI worker"            "$CLI_WORKER" "$WORKER_1"

for n in $(seq 1 20); do
  w=$(seed_worker "$n")
  check "isSeeded(worker $n)"  "true" "$(rpc "$WORKER_REGISTRY" "isSeeded(address)(bool)" "$w")"
  check "isWorker(worker $n)"  "true" "$(rpc "$WORKER_REGISTRY" "isWorker(address)(bool)" "$w")"
  check "nullifierOf(worker $n)" \
        "$(cast to-dec "$(seed_nullifier "$n")")" \
        "$(rpcnum "$WORKER_REGISTRY" "nullifierOf(address)(uint256)" "$w")"
done

check "taskCount()"                       "5" "$(rpcnum "$TASK_ESCROW" "taskCount()(uint256)")"
check "allowlistedBuyer(deployer)"        "true"  "$(rpc "$TASK_ESCROW" "allowlistedBuyer(address)(bool)" "$DEPLOYER")"
check "allowlistedBuyer(buyer)"           "true"  "$(rpc "$TASK_ESCROW" "allowlistedBuyer(address)(bool)" "$BUYER")"
check "allowlistedBuyer(worker 2)"        "false" "$(rpc "$TASK_ESCROW" "allowlistedBuyer(address)(bool)" "$(seed_worker 2)")"

TASK_TUPLE='getTask(uint256)((uint8,bytes32,uint96,uint96,address,uint256,string,address,uint8,uint64,uint64,uint64,uint32,uint32,uint32,bytes32))'
read_task() { # read_task <taskId> -> TASK_F[]
  local raw
  raw=$(rpc "$TASK_ESCROW" "$TASK_TUPLE" "$1" | tr -d '\n')
  raw=$(printf '%s' "$raw" | sed -e 's/^(//' -e 's/)$//' -e 's/ \[[^]]*\]//g' -e 's/"//g')
  local old_ifs="$IFS"
  IFS=','
  # shellcheck disable=SC2206
  TASK_F=($raw)
  IFS="$old_ifs"
  local i
  for i in "${!TASK_F[@]}"; do
    TASK_F[$i]=$(printf '%s' "${TASK_F[$i]}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
  done
}

for k in 1 2 3 4 5; do
  read_task "$k"
  check "task $k state (4 == Released)"   "4"       "${TASK_F[8]}"
  check "task $k amount"                  "3000000" "${TASK_F[2]}"
  check "task $k fee"                     "450000"  "${TASK_F[3]}"
  check "task $k buyer == deployer"       "$DEPLOYER" "${TASK_F[4]}"
  check "task $k worker"                  "$(seed_worker "$k")" "${TASK_F[7]}"
  nk=$(cast to-dec "$(seed_nullifier "$k")")
  check "reputation.completed(worker $k)"      "1" "$(rpcnum "$REPUTATION" "completed(uint256)(uint256)" "$nk")"
  check "reputation.distinctRaters(worker $k)" "1" "$(rpcnum "$REPUTATION" "distinctRaters(uint256)(uint256)" "$nk")"
  check "usdc.balanceOf(worker $k)" "3000000" "$(usdc_balance "$(seed_worker "$k")")"
done

TREASURY_DELTA=$(( TREASURY_AFTER - TREASURY_BEFORE ))
if [ "$TASKS_BEFORE" -lt 5 ]; then
  check "treasury delta over this run"    "2250000" "$TREASURY_DELTA"
else
  check "treasury delta over this run"    "0"       "$TREASURY_DELTA"
fi
# The five fees only show up as a treasury delta when the treasury is its own account. Point
# TREASURY_ADDRESS at the relayer and the same balance also pays out the 17.25 float, so the
# delta reads -15000000 and the fee the demo is meant to show is invisible. TaskEscrow.treasury
# is immutable, so this is a pre-deploy fix, not a setter.
if [ "$TREASURY" = "$RELAYER" ]; then
  echo "note: TREASURY_ADDRESS is the relayer address - the fee cannot be read off a balance delta" >&2
fi

# ------------------------------------------------------------------------- 7. RESULTS block

link() { if [ -n "$EXPLORER" ]; then printf '%s/address/%s' "$EXPLORER" "$1"; else printf '%s' "$1"; fi; }
txlink() { if [ -n "$EXPLORER" ]; then printf '%s/tx/%s' "$EXPLORER" "$1"; else printf '%s' "$1"; fi; }

echo
echo "== RESULTS block (chain $CHAIN)"
echo
echo "| contract | address |"
echo "|---|---|"
echo "| WorkerRegistry | [\`$WORKER_REGISTRY\`]($(link "$WORKER_REGISTRY")) |"
echo "| TaskEscrow | [\`$TASK_ESCROW\`]($(link "$TASK_ESCROW")) |"
echo "| Reputation | [\`$REPUTATION\`]($(link "$REPUTATION")) |"
echo "| AbuseMark | [\`$ABUSE_MARK\`]($(link "$ABUSE_MARK")) |"
echo
echo "| deployment tx | hash |"
echo "|---|---|"
for c in WorkerRegistry Reputation AbuseMark TaskEscrow; do
  h=$(jq -r --arg c "$c" '.txs[$c] // empty' "$RECORD")
  [ -n "$h" ] && echo "| $c | [\`$h\`]($(txlink "$h")) |"
done
echo
echo "startBlock: $START_BLOCK"
echo "relayer float: $RELAYER_BEFORE -> $RELAYER_AFTER (6-decimal USDC)"
if [ "$TREASURY_DELTA" -ge 0 ]; then DELTA_SIGNED="+$TREASURY_DELTA"; else DELTA_SIGNED="$TREASURY_DELTA"; fi
echo "treasury: $TREASURY_BEFORE -> $TREASURY_AFTER (delta $DELTA_SIGNED)"
printf "pool: 1 real \xc2\xb7 +20 seeded (demo data)\n"
echo

if [ "$FAILED" != 0 ]; then
  echo "deploy: one or more checks failed" >&2
  exit 1
fi
echo "deploy: all checks passed"
