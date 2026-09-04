#!/usr/bin/env bash
# A PR may change only the globs in its body's `owned-paths:` block.
# `!glob` lines subtract. docs/spikes/RESULTS.md and FEEDBACK-WORLD.md are
# section-owned: several tasks each append their own heading, so they are
# allowed for any PR that lists them and the reviewer checks the diff.
set -uo pipefail
BODY="${1:-}"; BASE="${2:?usage: path-ownership.sh <pr-body> <base-sha>}"
shopt -s globstar extglob nullglob

mapfile -t GLOBS < <(printf '%s\n' "$BODY" \
  | awk '/^## owned-paths:/{f=1;next} f&&/^```/{if(seen){exit}else{seen=1;next}} f&&seen{print}' \
  | sed -e 's/[[:space:]]*#.*$//' -e 's/^[[:space:]]*-\{0,1\}[[:space:]]*//' -e 's/[[:space:]]*$//' \
  | grep -v '^$')

if [ "${#GLOBS[@]}" -eq 0 ]; then
  echo "no owned-paths: block in the PR body — copy it from the brief's front matter"; exit 1
fi

fail=0
while read -r f; do
  [ -z "$f" ] && continue
  ok=0
  for g in "${GLOBS[@]}"; do
    case "$g" in
      \!*) [[ $f == ${g#\!} ]] && ok=0 ;;
      *)   [[ $f == $g ]] && ok=1 ;;
    esac
  done
  if [ "$ok" -eq 0 ]; then echo "outside owned-paths: $f"; fail=1; fi
done < <(git diff --name-only "$BASE...HEAD")
[ "$fail" -eq 0 ] && echo "path-ownership: clean (${#GLOBS[@]} glob(s))"
exit $fail
