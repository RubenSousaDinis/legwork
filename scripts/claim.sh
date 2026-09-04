#!/usr/bin/env bash
# scripts/claim.sh T-12
# Claim a task so no other agent starts it. Exit 0 = it is yours, begin work.
# Exit 1 = someone else holds it, or it is already done. Stop. Do not start.
set -euo pipefail

ID="${1:?usage: scripts/claim.sh T-12 [--continue]}"
CONT="${2:-}"
BRIEF=$(ls "docs/plan/${ID}-"*.md 2>/dev/null | head -1)
[ -n "$BRIEF" ] || { echo "no brief for $ID under docs/plan/"; exit 1; }
BRANCH=$(sed -n 's/^branch: *//p' "$BRIEF" | head -1)
[ -n "$BRANCH" ] || { echo "$BRIEF front matter has no branch:"; exit 1; }
WHO="${AGENT_NAME:-$(git config user.name)}@$(hostname -s)"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# Nonce, so two claim commits can never hash the same. Without it, two cloud
# agents in identical containers (same git user, same hostname, same second)
# would produce byte-identical empty commits — the second push would be a
# no-op "success" and both agents would believe they held the task.
NONCE=$(head -c16 /dev/urandom | od -An -tx1 | tr -d ' \n')

git fetch --quiet origin

# --- dependency gate ------------------------------------------------------
# Cheap here, expensive later: a brief written against an interface that has
# not merged yet produces a PR that has to be thrown away.
# [^]]* and the trailing .* matter: `s///p` prints the whole line, so without
# them a trailing `# T-01b must be merged` comment is parsed as part of the
# dependency and the lookup below silently finds nothing. 17 briefs carry one.
DEPS=$(sed -n 's/^depends_on: *\[\([^]]*\)\].*/\1/p' "$BRIEF" | head -1 | tr -d ' ' | tr ',' '\n')
for d in $DEPS; do
  [ -n "$d" ] || continue
  # No suffix stripping: T-01a and T-01b are separate issues because they merge
  # hours apart, and four briefs need only 01a. Collapsing them onto T-01 would
  # hold the contract lane behind the TypeScript half for no reason.
  dn=$(awk -v id="$d" '$1==id {print $2}' docs/plan/ISSUES.txt)
  [ -n "${dn:-}" ] || continue
  st=$(gh issue view "$dn" --json state -q .state)
  [ "$st" = "CLOSED" ] || { echo "$ID depends on $d, which is not merged yet (issue #$dn is $st)."; echo "Stop. Tell the operator the dependency is open."; exit 1; }
done

# --- the lock -------------------------------------------------------------
# If origin already has this branch, the task is claimed — refuse, full stop.
# Continuation is explicit (--continue) and never inferred from identity: local
# agents share a machine and a git user, so "is this claim mine?" cannot be
# answered from $WHO. Guessing wrong puts two agents on one branch, which is
# the exact failure this script exists to prevent.
if git rev-parse --quiet --verify "refs/remotes/origin/$BRANCH" >/dev/null; then
  HELD=$(git log --format=%s "origin/$BRANCH" | grep "^$ID: claim by" | tail -1 || true)
  if [ "$CONT" = "--continue" ]; then
    echo "continuing an existing claim as instructed: $HELD"
    git checkout -B "$BRANCH" "origin/$BRANCH"
    exit 0
  fi
  echo "ALREADY CLAIMED: $HELD"
  echo "Stop. Do not start $ID. Report it to the operator."
  echo "(Second PR of a two-PR task, and the lead told you to start it? scripts/claim.sh $ID --continue)"
  exit 1
fi

git checkout --quiet -B "$BRANCH" origin/main
git commit --quiet --allow-empty -m "$ID: claim by $WHO at $NOW

claim-nonce: $NONCE
AI-Usage: claim script; human dispatched the task"

# Pushing a brand-new ref: rejected if another agent won the race in the
# seconds since the fetch above.
if ! git push --quiet origin "refs/heads/$BRANCH:refs/heads/$BRANCH"; then
  git fetch --quiet origin
  echo "LOST THE RACE — another agent claimed $ID while this one was starting:"
  git log --format='  %s' -1 "origin/$BRANCH" 2>/dev/null || true
  echo "Stop. Do not start $ID. Report it to the operator."
  exit 1
fi

# --- the draft PR, opened before a line of code exists --------------------
# The push is the lock; this is the claim made visible where the lead actually
# looks. It also starts CI on minute one and gives BLOCKED: somewhere to go.
TITLE=$(sed -n 's/^title: *//p' "$BRIEF" | head -1)
N=$(awk -v id="$ID" '$1==id {print $2}' docs/plan/ISSUES.txt)
# owned-paths copied from the brief's front matter, not retyped: path-ownership
# reads this block, and a mistyped glob is a green CI job guarding nothing.
OWNED=$(awk '/^owned_paths:/{f=1;next} f&&/^ *- /{sub(/^ *- /,"");sub(/ *#.*$/,"");gsub(/"/,"");print;next} f{exit}' "$BRIEF")
LABELS=$(sed -n 's/^labels: *\[\(.*\)\]/\1/p' "$BRIEF" | tr -d ' ')
# Array, not ${LABELS:+...}: an unquoted conditional expansion word-splits and
# leaves literal quote characters inside the label name. gh splits on commas.
LBL=()
if [ -n "$LABELS" ]; then LBL=(--label "$LABELS"); fi

gh pr create --draft --base main --head "$BRANCH" \
  --title "$ID: $TITLE" \
  ${LBL[@]+"${LBL[@]}"} \
  --body "$(cat <<EOF
> **Draft — claimed at $NOW by \`$WHO\`, not yet started.** This PR exists to hold the
> claim, run CI from the first commit, and give \`BLOCKED:\` somewhere to go. It is not
> ready for review until the agent runs \`gh pr ready\`. Do not review a draft.

## Task
Refs #${N:-?} — $ID — $TITLE · brief: \`$BRIEF\` · PR <1/1 — change to 1/2 or 2/2 if your brief ships two>

## owned-paths:
\`\`\`
$OWNED
\`\`\`

## Scope
- [ ] Every bullet of the brief's "Exact scope" is done
- [ ] Nothing from "Out of scope" was touched
- [ ] Every acceptance test exists **with the exact name** in the brief and passes

## Verification output
<paste the output of the brief's §9 Verification commands before marking ready>

## Interfaces
- [ ] No frozen file changed (see the brief §4)
- Requests raised: <none | INTERFACE REQUEST / DEP REQUEST / ENV REQUEST text>

## Honesty and safety
- [ ] No banned word · [ ] money 3.45 / 3.00 / 0.45 · [ ] no secret, no live call in tests
- [ ] Seeded things render a \`seeded\` chip (UI tasks)

## AI usage
<one line; mirrors the commit trailers>

## Reviewer decision (filled by the reviewer)
DECISION: merge | round-2 | reassign | split
EOF
)" >/dev/null

if [ -n "${N:-}" ]; then
  gh issue edit "$N" --add-label status:claimed --remove-label status:ready >/dev/null
  gh issue comment "$N" --body "Claimed by \`$WHO\` at $NOW on branch \`$BRANCH\` — draft PR opened.
Another agent must not start this task. If this claim is stale, the lead runs
\`scripts/release.sh $ID --force\`."  >/dev/null
fi
echo "CLAIMED $ID on $BRANCH — draft PR open. Begin work."
echo "When the brief is done: fill the PR body, then \`gh pr ready\`."
