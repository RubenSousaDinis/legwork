#!/usr/bin/env bash
# Seed synthetic workers into one geohash-5 cell and give each one released verify-open task, so
# the preflight for that cell counts them as active (a completion inside the last seven days).
#
#   set -a; source ~/legwork.env; set +a
#   bash scripts/seed-area.sh ez1dn 21 23
#
# Every transaction is the deployer's — owner for seedWorker, relayer for post/claimFor/submitFor,
# buyer of record for approve — so the operator runs this with DEPLOYER_PRIVATE_KEY in the
# environment. The key is read by cast from the environment and never printed. The worker keys are
# the same derivation contracts/script/Seed.s.sol uses (keccak256("legwork-seed-worker-<n>")), so
# an index this script seeds is one the Foundry script would recognise as its own. If
# BUYER_PRIVATE_KEY is set and the relayer float is below one lifecycle per worker, 15 USDC is
# moved from the buyer to the relayer first; the demo agent's hires draw on that float too.
set -euo pipefail

AREA=${1:?usage: seed-area.sh <geohash5> <first index> <last index>}
FROM=${2:?first worker index}
TO=${3:?last worker index}
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY is not set}" "${BASE_SEPOLIA_RPC_URL:?BASE_SEPOLIA_RPC_URL is not set}"

ROOT=$(cd "$(dirname "$0")/.." && pwd)
RPC=$BASE_SEPOLIA_RPC_URL
address_of() { python3 -c "import json;print(json.load(open('$ROOT/contracts/deployments/base-sepolia.json'))['addresses']['$1'])"; }
ESC=$(address_of taskEscrow)
REG=$(address_of workerRegistry)
USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e   # Base Sepolia USDC
DEP=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")
AMOUNT=3000000          # 3.00 USDC, the verify-open floor; the fee makes it 3.45 per lifecycle
PER_LIFECYCLE=3450000

say() { printf 'seed-area: %s\n' "$*"; }

# One sender, sequential: the nonce comes from the pending block so a receipt the read node has
# not caught up with never yields "nonce too low".
send() {
  local nonce
  nonce=$(cast nonce --block pending "$DEP" --rpc-url "$RPC")
  cast send "$@" --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$RPC" --nonce "$nonce" --json \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print("  tx", d["transactionHash"], "status", d["status"])'
}

# Base Sepolia reads lag their own receipt: poll a view until it says what the write made true.
wait_until() { # wait_until <expected> <cast call args...>
  local expected=$1; shift
  local v=""
  for _ in $(seq 1 18); do
    v=$(cast call "$@" --rpc-url "$RPC" 2>/dev/null || true)
    [ "$v" = "$expected" ] && return 0
    sleep 5
  done
  say "read never caught up (wanted $expected, last saw '$v')"; return 1
}

count=$((TO - FROM + 1))
float=$(cast call "$USDC" 'balanceOf(address)(uint256)' "$DEP" --rpc-url "$RPC" | awk '{print $1}')
need=$((PER_LIFECYCLE * count))
say "relayer float $float units, this run locks $need"
if [ "$float" -lt "$((need + PER_LIFECYCLE))" ] && [ -n "${BUYER_PRIVATE_KEY:-}" ]; then
  say "topping the relayer up with 15 USDC from the buyer"
  nonce=$(cast nonce --block pending "$(cast wallet address --private-key "$BUYER_PRIVATE_KEY")" --rpc-url "$RPC")
  cast send "$USDC" 'transfer(address,uint256)' "$DEP" 15000000 --private-key "$BUYER_PRIVATE_KEY" --rpc-url "$RPC" --nonce "$nonce" --json \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print("  tx", d["transactionHash"], "status", d["status"])'
fi

for n in $(seq "$FROM" "$TO"); do
  pk=$(cast keccak "legwork-seed-worker-$n")
  w=$(cast wallet address --private-key "$pk")
  nullifier=$(cast keccak "seed-$n")

  if [ "$(cast call "$REG" 'isWorker(address)(bool)' "$w" --rpc-url "$RPC")" != "true" ]; then
    say "seedWorker $n → $w in $AREA"
    send "$REG" 'seedWorker(address,uint256,string,uint8)' "$w" "$nullifier" "$AREA" 15
    wait_until true "$REG" 'isWorker(address)(bool)' "$w"
  else
    say "worker $n ($w) is already registered"
  fi

  spec=$(cast keccak "seed-task-$AREA-$n")
  proof=$(cast keccak "seed-proof-$AREA-$n")
  before=$(cast call "$ESC" 'taskCount()(uint256)' --rpc-url "$RPC" | awk '{print $1}')
  id=$((before + 1))

  say "post verify-open task $id in $AREA (buyer of record: the deployer, no agent id)"
  send "$ESC" 'post((uint8,bytes32,uint96,address,uint256,string,uint32,uint32,uint32))' \
    "(1,$spec,$AMOUNT,$DEP,0,$AREA,1800,3600,120)"
  wait_until "$id" "$ESC" 'taskCount()(uint256)'

  say "claimFor task $id → worker $n"
  send "$ESC" 'claimFor(uint256,address)' "$id" "$w"
  wait_until "$id" "$ESC" 'activeClaimOf(address)(uint256)' "$w"

  say "submitFor task $id"
  send "$ESC" 'submitFor(uint256,address,bytes32)' "$id" "$w" "$proof"
  sleep 10

  say "approve task $id"
  send "$ESC" 'approve(uint256)' "$id"
  wait_until 0 "$ESC" 'activeClaimOf(address)(uint256)' "$w"
  say "worker $n: task $id released in $AREA"
done

say "done — the subgraph indexes the releases within a few minutes; then GET /public/preflight?task_type=verify-open&area=$AREA counts them"
