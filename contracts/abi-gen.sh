#!/usr/bin/env bash
# contracts/abi-gen.sh — export ABIs into packages/shared/src/abis/.
# T-01a fills the contract list; run via `pnpm abi:gen`.
set -euo pipefail
cd "$(dirname "$0")"
forge build >/dev/null
OUT=../packages/shared/src/abis
mkdir -p "$OUT"
for c in WorkerRegistry TaskEscrow Reputation AbuseMark; do
  f="out/$c.sol/$c.json"
  [ -f "$f" ] || { echo "skip $c (not built yet)"; continue; }
  jq '.abi' "$f" > "$OUT/$c.json"
  echo "wrote $OUT/$c.json"
done
