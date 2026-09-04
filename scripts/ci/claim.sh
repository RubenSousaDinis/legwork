#!/usr/bin/env bash
# The branch's first commit must be the claim commit, and its id must match the
# PR title. This is the CI half of the mutex: the push is what excludes, this
# check is what stops an agent bypassing the push.
set -uo pipefail
BASE="${1:?usage: ci/claim.sh <base-sha> <pr-title>}"
TITLE="${2:?usage: ci/claim.sh <base-sha> <pr-title>}"
ID=$(sed -n 's/^\(T-[0-9]\{1,\}[a-z]\{0,\}\).*/\1/p' <<<"$TITLE")
[ -n "$ID" ] || { echo "PR title does not start with a task id: $TITLE"; exit 1; }
# --first-parent --no-merges: without them, a branch that merges main in inherits
# main's commits into this range and the "first commit" becomes whichever claim
# commit main brought along. First-parent follows this branch's own line only.
FIRST=$(git log --format=%s --reverse --first-parent --no-merges "$BASE..HEAD" | head -1)
if ! grep -q "^$ID: claim by " <<<"$FIRST"; then
  echo "first commit on this branch is not a claim commit."
  echo "  expected: '$ID: claim by <who> at <utc>'"
  echo "  found:    '$FIRST'"
  echo "Run scripts/claim.sh $ID instead of creating the branch by hand."
  exit 1
fi
echo "claim: $FIRST"
