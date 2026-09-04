#!/usr/bin/env bash
# scripts/release.sh T-12 [--force]
# Run it when you stop on BLOCKED. The lead runs it with --force to reclaim a
# task from an agent that died (rate limit, crashed session, closed laptop).
set -euo pipefail
ID="${1:?usage: scripts/release.sh T-12 [--force]}"; FORCE="${2:-}"
BRIEF=$(ls "docs/plan/${ID}-"*.md | head -1)
BRANCH=$(sed -n 's/^branch: *//p' "$BRIEF" | head -1)
git fetch --quiet origin

# Refuse to throw away real work unless the lead insists.
WORK=$(git rev-list --count "origin/main..origin/$BRANCH" 2>/dev/null || echo 0)
if [ "$WORK" -gt 1 ] && [ "$FORCE" != "--force" ]; then
  echo "$BRANCH has $((WORK-1)) commit(s) beyond the claim. Not deleting."
  echo "Open the PR instead, or re-run with --force to discard them."; exit 1
fi
gh pr close "$BRANCH" --delete-branch --comment "Released: $ID is back in the queue." 2>/dev/null \
  || git push --quiet origin --delete "$BRANCH"
N=$(awk -v id="$ID" '$1==id {print $2}' docs/plan/ISSUES.txt)
[ -n "${N:-}" ] && gh issue edit "$N" --add-label status:ready --remove-label status:claimed >/dev/null
echo "RELEASED $ID — $BRANCH deleted, issue back to status:ready."
