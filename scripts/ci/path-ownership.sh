#!/usr/bin/env bash
# A PR may change only the globs in its body's `owned-paths:` block.
# `!glob` lines subtract. docs/spikes/RESULTS.md and FEEDBACK-WORLD.md are
# section-owned: several tasks each append their own heading, so they are
# allowed for any PR that lists them and the reviewer checks the diff.
set -uo pipefail
BODY="${1:-}"; BASE="${2:?usage: path-ownership.sh <pr-body> <base-ref-or-sha>}"
# Prefer the live base branch over the pinned base.sha. If a branch merges main in,
# the merge-base against a stale sha is old and everything main brought along looks
# like this branch's work.
if git rev-parse --quiet --verify "origin/$BASE" >/dev/null 2>&1; then BASE="origin/$BASE"; fi
shopt -s extglob nullglob
# bash 3.2 (macOS) has no globstar; `**` inside `[[ == ]]` matches across `/` regardless,
# so the reviewer can run this script locally with the same result CI gets.
shopt -s globstar 2>/dev/null || true

GLOBS=()
while IFS= read -r line; do GLOBS+=("$line"); done < <(printf '%s\n' "$BODY" \
  | awk '/^## owned-paths:/{f=1;next} f&&/^```/{if(seen){exit}else{seen=1;next}} f&&seen{print}' \
  | sed -e 's/[[:space:]]*#.*$//' -e 's/^[[:space:]]*-\{0,1\}[[:space:]]*//' -e 's/[[:space:]]*$//' \
  | grep -v '^$')

if [ "${#GLOBS[@]}" -eq 0 ]; then
  echo "no owned-paths: block in the PR body — copy it from the brief's front matter"; exit 1
fi

# The globs are path text copied from a brief's front matter, where Next's `[id]` segments
# and `{claim,submit}` groups are directory names, not pattern syntax. Handed straight to
# `[[ == ]]`, `[id]` is a one-character class and `{a,b}` is seven literal characters, so a
# brief that owns `apps/api/app/tasks/[id]/claim/**` matched none of its own files. Expand
# the braces and escape the brackets first; everything else keeps its glob meaning.
BRACE_RE='^([^{]*)\{([^{}]*)\}(.*)$'
expand_braces() {
  local g="$1" pre alts post part
  if [[ $g =~ $BRACE_RE ]]; then
    pre="${BASH_REMATCH[1]}"; alts="${BASH_REMATCH[2]}"; post="${BASH_REMATCH[3]}"
    IFS=',' read -ra parts <<<"$alts"
    for part in "${parts[@]}"; do expand_braces "$pre$part$post"; done
  else
    printf '%s\n' "$g"
  fi
}
PATTERNS=()
for g in "${GLOBS[@]}"; do
  neg=""
  if [[ $g == \!* ]]; then neg='!'; g="${g#\!}"; fi
  while IFS= read -r e; do
    e="${e//\[/\\[}"; e="${e//\]/\\]}"
    PATTERNS+=("$neg$e")
  done < <(expand_braces "$g")
done

fail=0
while read -r f; do
  [ -z "$f" ] && continue
  ok=0
  for g in "${PATTERNS[@]}"; do
    case "$g" in
      \!*) [[ $f == ${g#\!} ]] && ok=0 ;;
      *)   [[ $f == $g ]] && ok=1 ;;
    esac
  done
  if [ "$ok" -eq 0 ]; then echo "outside owned-paths: $f"; fail=1; fi
done < <(git diff --name-only "$BASE...HEAD")
[ "$fail" -eq 0 ] && echo "path-ownership: clean (${#GLOBS[@]} glob(s), ${#PATTERNS[@]} pattern(s))"
exit $fail
