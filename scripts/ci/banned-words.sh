#!/usr/bin/env bash
# Fails if a tracked file contains a banned word (case-insensitive, whole word).
# Four exclusions only; adding a fifth needs the lead.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
FILES=$(git ls-files \
  | grep -v -e '^packages/screening/fixtures/' \
            -e '^docs/plan/' \
            -e '^\.github/banned-words\.txt$' \
            -e 'pnpm-lock\.yaml')
[ -z "$FILES" ] && exit 0
if echo "$FILES" | xargs grep -n -i -w -E -f .github/banned-words.txt 2>/dev/null; then
  echo "^^ banned word(s) found — see .github/banned-words.txt for what to say instead"
  exit 1
fi
echo "banned-words: clean"
