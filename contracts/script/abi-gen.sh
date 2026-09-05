#!/usr/bin/env bash
# contracts/script/abi-gen.sh — export the four contract ABIs to the two places that read
# them. Run via `pnpm abi:gen`. CI fails if running it produces a diff, so the generated
# ABIs can never drift from the Solidity.
set -euo pipefail
cd "$(dirname "$0")/.."
forge build >/dev/null

TS_OUT=../packages/shared/src/abi
SG_OUT=../subgraph/abis
mkdir -p "$TS_OUT" "$SG_OUT"

for c in WorkerRegistry TaskEscrow Reputation AbuseMark; do
  f="out/$c.sol/$c.json"
  if [ ! -f "$f" ]; then
    echo "skip $c — not implemented yet (T-11/T-12/T-13 add it)"
    continue
  fi
  jq -S '.abi' "$f" > "$TS_OUT/$c.json"
  jq -S '.abi' "$f" > "$SG_OUT/$c.json"
  echo "wrote $c.json"
done

# The interfaces exist from T-01a, so downstream can generate types before the
# implementations land.
for i in IWorkerRegistry ITaskEscrow IReputation IAbuseMark; do
  f="out/$i.sol/$i.json"
  [ -f "$f" ] || continue
  jq -S '.abi' "$f" > "$TS_OUT/$i.json"
  echo "wrote $i.json"
  # The subgraph needs all four ABIs to codegen. Until the implementation lands, the
  # interface's events are the contract's events, so it stands in under the impl's name.
  c="${i#I}"
  if [ ! -f "out/$c.sol/$c.json" ]; then
    jq -S '.abi' "$f" > "$SG_OUT/$c.json"
    echo "wrote subgraph/abis/$c.json from $i (implementation pending)"
  fi
done
