#!/usr/bin/env bash
# Every commit in the PR must carry an AI-Usage: trailer.
set -uo pipefail
BASE="${1:?usage: commit-trailers.sh <base-sha>}"
fail=0
while read -r sha; do
  [ -z "$sha" ] && continue
  if ! git log -1 --format=%B "$sha" | grep -q '^AI-Usage:'; then
    echo "missing AI-Usage: trailer — $(git log -1 --format='%h %s' "$sha")"; fail=1
  fi
done < <(git rev-list "$BASE..HEAD")
[ "$fail" -eq 0 ] && echo "commit-trailers: clean"
exit $fail
