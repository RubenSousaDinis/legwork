#!/usr/bin/env bash
# The branch's first commit must be the claim commit, and its id must match the
# PR title. This is the CI half of the mutex: the push is what excludes, this
# check is what stops an agent bypassing the push.
set -uo pipefail
BASE="${1:?usage: ci/claim.sh <base> <pr-title> [head-sha]}"
TITLE="${2:?usage: ci/claim.sh <base> <pr-title> [head-sha]}"
HEAD_SHA="${3:-HEAD}"
ID=$(sed -n 's/^\(T-[0-9]\{1,\}[a-z]\{0,\}\).*/\1/p' <<<"$TITLE")
[ -n "$ID" ] || { echo "PR title does not start with a task id: $TITLE"; exit 1; }
# Reachability, not a range. Three earlier shapes all broke a range check:
#  - a branch that merged main in donates main's commits to base..HEAD;
#  - on pull_request, actions/checkout gives the PR *merge* ref, whose first
#    parent is main, so --first-parent walks main and --no-merges leaves nothing;
#  - a 2/2 PR rebased after its 1/2 merged has its claim commit in main's
#    history, not in the PR's own commits.
# What is actually invariant: claim.sh created this branch, so a claim commit
# for THIS task id is reachable from the PR head. Check exactly that.
CLAIM=$(git log --format=%s "$HEAD_SHA" --grep="^$ID: claim by " | tail -1)
if [ -z "$CLAIM" ]; then
  echo "no claim commit for $ID is reachable from the PR head."
  echo "  expected a commit titled '$ID: claim by <who> at <utc>' in this branch's history"
  echo "Run scripts/claim.sh $ID instead of creating the branch by hand."
  exit 1
fi
echo "claim: $CLAIM"
