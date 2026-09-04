#!/usr/bin/env bash
# Fails if a tracked file contains a banned word (case-insensitive, whole word).
# Four exclusions only; adding a fifth needs the lead.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
# Exclusions, and why each one is not a loophole:
#   contracts/lib/              vendored forge-std + OpenZeppelin; third-party prose we do not write
#   packages/screening/fixtures adversarial corpus text by design
#   docs/plan/                  the briefs quote the rules verbatim, banned words included
#   AGENTS.md, DESIGN-SPEC.md,
#   pull_request_template.md,
#   banned-words.txt            the four files that must name the words in order to ban them
# Adding a ninth needs the lead. Product surfaces — UI copy, README, docs the
# judges read, source, comments — are all still covered.
FILES=$(git ls-files \
  | grep -v -e '^contracts/lib/' \
            -e '^packages/screening/fixtures/' \
            -e '^docs/plan/' \
            -e '^AGENTS\.md$' \
            -e '^DESIGN-SPEC\.md$' \
            -e '^\.github/pull_request_template\.md$' \
            -e '^\.github/banned-words\.txt$' \
            -e 'pnpm-lock\.yaml')
[ -z "$FILES" ] && exit 0
if echo "$FILES" | xargs grep -n -i -w -E -f .github/banned-words.txt 2>/dev/null; then
  echo "^^ banned word(s) found — see .github/banned-words.txt for what to say instead"
  exit 1
fi
echo "banned-words: clean"
