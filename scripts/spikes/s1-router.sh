#!/usr/bin/env bash
#
# Spike S1 — World ID Router probe on Base Sepolia. Feedback-document value only: nothing
# downstream changes on any outcome. WorkerRegistry ships one cloud-verified ATTESTED mode
# either way, because onchain World ID verification is Orb-only and Legwork's workers hold
# Selfie Check / Orb-level staging credentials.
#
#   bash scripts/spikes/s1-router.sh
#
# Prints the first 40 characters of the Router's deployed code, then one `verifyProof`
# staticcall. No transaction is sent and no gas is spent.

set -uo pipefail

ROUTER=0x42FF98C4E85212a5D31358ACbFe76a621b50fC02
ACTION="${WORLD_ACTION:-legwork-worker}"

ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

if [ -z "${BASE_SEPOLIA_RPC_URL:-}" ]; then
  echo "missing env var BASE_SEPOLIA_RPC_URL" >&2
  exit 1
fi

echo "router  $ROUTER"
echo "chain   $(cast chain-id --rpc-url "$BASE_SEPOLIA_RPC_URL")"
echo "action  $ACTION"
echo

echo "--- cast code (first 40 chars) ---"
CODE="$(cast code "$ROUTER" --rpc-url "$BASE_SEPOLIA_RPC_URL")"
printf '%s' "$CODE" | head -c 40
echo
echo "code length: ${#CODE} chars"
if [ "$CODE" = "0x" ]; then
  echo "code present: no"
else
  echo "code present: yes"
fi
echo

# The operator has no simulator proof for action `legwork-worker` (S2' runs Selfie Check through
# the cloud verify endpoint, which never produces an onchain proof), so the staticcalls go out
# with all-zero arguments. What matters for the feedback document is the revert, not the proof.
#
# Selector -> name comes from the verified router implementation ABI, so a revert is reported by
# name rather than as four raw bytes.
decode_selector() {
  case "$1" in
    0x77aeb0ad) echo "CannotRenounceOwnership()" ;;
    0x3ae7359e) echo "ExpiredRoot()" ;;
    0x4ac73bb8) echo "GroupIsDisabled()" ;;
    0x0206032a) echo "ImplementationNotInitialized()" ;;
    0x728ade92) echo "NoSuchGroup(uint256)" ;;
    0xddae3b71) echo "NonExistentRoot()" ;;
    *) echo "(not an error of WorldIDRouterImplV1)" ;;
  esac
}

echo "--- routing table ---"
echo "groupCount: $(cast call "$ROUTER" 'groupCount()(uint256)' --rpc-url "$BASE_SEPOLIA_RPC_URL")"
for GID in 0 1; do
  ROUTE="$(cast call "$ROUTER" 'routeFor(uint256)(address)' "$GID" --rpc-url "$BASE_SEPOLIA_RPC_URL" 2>&1)"
  echo "routeFor($GID): $ROUTE"
done
echo

ZEROS='[0,0,0,0,0,0,0,0]'
for GID in 0 1; do
  echo "--- verifyProof staticcall, groupId=$GID, all-zero arguments ---"
  set +e
  OUT="$(cast call "$ROUTER" \
    'verifyProof(uint256,uint256,uint256,uint256,uint256,uint256[8])' \
    0 "$GID" 0 0 0 "$ZEROS" \
    --rpc-url "$BASE_SEPOLIA_RPC_URL" 2>&1)"
  STATUS=$?
  set -e
  echo "$OUT"
  echo "exit status: $STATUS"
  if [ "$STATUS" -eq 0 ]; then
    echo "verifyProof(groupId=$GID): success"
  else
    SELECTOR="$(printf '%s' "$OUT" | grep -oE 'data: "0x[0-9a-f]{8}' | grep -oE '0x[0-9a-f]{8}' | head -1)"
    if [ -n "$SELECTOR" ]; then
      echo "verifyProof(groupId=$GID): reverted $SELECTOR $(decode_selector "$SELECTOR")"
    else
      echo "verifyProof(groupId=$GID): reverted (no revert data returned)"
    fi
  fi
  echo
done
