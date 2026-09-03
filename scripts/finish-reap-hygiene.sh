#!/usr/bin/env bash
# Finish reap hygiene after development sync (4c3ba4e+).
# Idempotent — safe to re-run. Usage: bash scripts/finish-reap-hygiene.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
INTEGRATION="${LANE_INTEGRATION:-development}"
WT191="${KIT191_WORKTREE:-$HOME/Projects/kit-collective-wt/KIT-191}"
WT192="${KIT192_WORKTREE:-$HOME/Projects/kit-collective-wt/KIT-192}"

echo "== HEAD =="
git rev-parse --short HEAD

echo "== Pop hygiene stash if tree clean =="
if ! git status --porcelain | grep -q .; then
  top_msg="$(git stash list -1 --format=%s 2>/dev/null || true)"
  if [[ "$top_msg" == *main-repo-wip-before-development-sync* ]]; then
    echo "Popping: $top_msg"
    git stash pop || {
      echo "Stash pop failed — resolve conflicts, then re-run."
      exit 1
    }
  else
    echo "No hygiene stash on top — skip pop."
  fi
else
  echo "Working tree dirty — skip stash pop (commit or stash manually first)."
fi

echo "== Commit reap-worktree wiring =="
REAP_FILES=(
  .cursor/skills/reap-worktree
  .cursor/skills/ask-me/SKILL.md
  .cursor/skills/land/SKILL.md
  .cursor/skills/issue-session/SKILL.md
  .cursor/skills/bootstrap-linear/scripts/generate-harness-docs.mjs
  skills-lock.json
  scripts/reap-desktop-hygiene.sh
  scripts/finish-reap-hygiene.sh
  AGENTS.md
)

if git status --porcelain -- "${REAP_FILES[@]}" 2>/dev/null | grep -q .; then
  node scripts/generate-harness-docs.mjs
  git add "${REAP_FILES[@]}"
  git commit -m "$(cat <<'EOF'
Add reap-worktree skill for post-land worktree hygiene.

EOF
)"
  echo "Committed."
else
  echo "Nothing to commit for reap-worktree."
fi

echo "== Drop reap draft stashes =="
while git stash list | grep -q 'reap-worktree skill draft'; do
  idx="$(git stash list | grep -n 'reap-worktree skill draft' | head -1 | cut -d: -f1)"
  git stash drop "stash@{$((idx - 1))}"
done

echo "== Reap KIT-191 =="
if [ -d "$WT191" ] || git worktree list | grep -Fq "$WT191"; then
  MERGE191="$(gh pr view 184 --json mergeCommit -q .mergeCommit.oid)"
  git fetch origin "$INTEGRATION"
  git merge-base --is-ancestor "$MERGE191" "origin/$INTEGRATION"
  git worktree remove "$WT191" 2>/dev/null || git worktree remove --force "$WT191"
  BR191="$(gh pr view 184 --json headRefName -q .headRefName)"
  git push origin --delete "$BR191" 2>/dev/null || echo "Remote $BR191 already gone."
else
  echo "KIT-191 worktree already absent."
fi

echo "== Remove orphan KIT-192 =="
if [ -d "$WT192" ] && ! git worktree list | grep -Fq "$WT192"; then
  rm -rf "$WT192"
  echo "Removed orphan $WT192"
else
  echo "No orphan KIT-192."
fi

echo "== Done =="
git worktree list
git rev-parse --short HEAD
git log -1 --oneline
git stash list | head -5
ls -la "$(dirname "$WT191")" 2>/dev/null || true
