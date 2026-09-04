#!/usr/bin/env bash
# scripts/done.sh T-11 — close a finished task's issue and mark it done.
# Deliberately not `Closes #n` in the PR body: two-PR tasks (T-12, T-17) would
# auto-close on the first half. The lead runs this when a task is actually done.
set -euo pipefail
ID="${1:?usage: scripts/done.sh T-11}"
cd "$(git rev-parse --show-toplevel)"
N=$(awk -v i="$ID" '$1==i {print $2}' docs/plan/ISSUES.txt)
[ -n "${N:-}" ] || { echo "no issue mapped for $ID in docs/plan/ISSUES.txt"; exit 1; }
gh issue edit "$N" --add-label status:done --remove-label status:ready,status:claimed >/dev/null 2>&1 || true
gh issue close "$N" --comment "Merged." >/dev/null
echo "$ID (#$N) closed — anything gated on it is now dispatchable."
