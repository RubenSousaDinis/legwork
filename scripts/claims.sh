#!/usr/bin/env bash
# scripts/claims.sh — every open claim, who holds it, how long, and whether a PR exists.
set -euo pipefail
git fetch --quiet origin --prune
printf '%-22s %-26s %-9s %s\n' BRANCH CLAIMED-BY AGE PR
for b in $(git ls-remote --heads origin 't-*' | sed 's#.*refs/heads/##'); do
  msg=$(git log --format=%s "origin/$b" 2>/dev/null | grep ': claim by ' | tail -1 || echo '(no claim commit)')
  who=$(sed -e 's/.*claim by //' -e 's/ at .*//' <<<"$msg")
  age=$(git log --format=%cr -1 "origin/$b")
  pr=$(gh pr list --head "$b" --state open --json number,isDraft -q '.[0] | "#\(.number)\(if .isDraft then " draft" else " READY" end)"' 2>/dev/null || true)
  printf '%-22s %-26s %-9s %s\n' "$b" "$who" "$age" "${pr:-NO PR — investigate}"
done
