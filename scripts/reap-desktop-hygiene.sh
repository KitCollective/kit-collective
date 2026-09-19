#!/usr/bin/env bash
# Desktop post-reap hygiene: sync development, commit reap-worktree skill, reap KIT-191, drop orphan dirs.
# Usage (from repo root): bash scripts/reap-desktop-hygiene.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAIN="$ROOT"
INTEGRATION="${LANE_INTEGRATION:-development}"
WT191="${KIT191_WORKTREE:-$HOME/Projects/kit-collective-wt/KIT-191}"
WT192="${KIT192_WORKTREE:-$HOME/Projects/kit-collective-wt/KIT-192}"

cd "$MAIN"

DID_STASH=false

echo "== 1. Stash unrelated WIP (skip if clean) =="
if git status --porcelain | grep -q .; then
  git stash push -u -m "main-repo-wip-before-development-sync-$(date +%Y%m%d)"
  DID_STASH=true
else
  echo "Working tree clean — skip stash."
fi

echo "== 2. Sync integration lane =="
git fetch origin "$INTEGRATION"
git checkout "$INTEGRATION"
git pull --ff-only origin "$INTEGRATION"
echo "HEAD: $(git rev-parse --short HEAD)"

echo "== 3. Restore WIP stash =="
if [ "$DID_STASH" = true ]; then
  git stash pop || {
    echo "Stash pop had conflicts — resolve manually, then commit reap-worktree and re-run from step 6."
    exit 1
  }
else
  echo "Nothing stashed this run — skip pop."
  # Resume: pop the newest hygiene stash if the tree is still clean after pull.
  if ! git status --porcelain | grep -q .; then
    top_msg="$(git stash list -1 --format=%s 2>/dev/null || true)"
    if [[ "$top_msg" == *main-repo-wip-before-development-sync* ]]; then
      echo "Popping leftover hygiene stash: $top_msg"
      git stash pop || {
        echo "Stash pop had conflicts — resolve manually."
        exit 1
      }
    fi
  fi
fi

echo "== 4. Commit reap-worktree skill (if changed) =="
REAP_FILES=(
  .cursor/skills/reap-worktree
  .cursor/skills/ask-me/SKILL.md
  .cursor/skills/land/SKILL.md
  .cursor/skills/issue-session/SKILL.md
  .cursor/skills/bootstrap-linear/scripts/generate-harness-docs.mjs
  skills-lock.json
  scripts/reap-desktop-hygiene.sh
)

if git status --porcelain -- "${REAP_FILES[@]}" AGENTS.md 2>/dev/null | grep -q .; then
  node scripts/generate-harness-docs.mjs
  git add "${REAP_FILES[@]}" AGENTS.md
  git commit -m "$(cat <<'EOF'
Add reap-worktree skill for post-land worktree hygiene.

EOF
)"
  echo "Committed reap-worktree wiring."
else
  echo "No reap-worktree changes to commit."
fi

echo "== 5. Drop redundant reap draft stash (if present) =="
while git stash list | grep -q 'reap-worktree skill draft'; do
  idx="$(git stash list | grep -n 'reap-worktree skill draft' | head -1 | cut -d: -f1)"
  git stash drop "stash@{$((idx - 1))}"
done

echo "== 6. Reap KIT-191 worktree =="
if [ -d "$WT191" ] || git worktree list | grep -Fq "$WT191"; then
  MERGE191="$(gh pr view 184 --json mergeCommit -q .mergeCommit.oid)"
  git merge-base --is-ancestor "$MERGE191" "origin/$INTEGRATION"
  if [ -d "$WT191" ] && git -C "$WT191" status --porcelain 2>/dev/null | grep -q .; then
    echo "KIT-191 worktree dirty — stash before remove."
    git -C "$WT191" stash push -u -m "KIT-191 orphan before reap"
  fi
  git worktree remove "$WT191" 2>/dev/null || git worktree remove --force "$WT191"
  BR191="$(gh pr view 184 --json headRefName -q .headRefName)"
  git push origin --delete "$BR191" 2>/dev/null || echo "Remote branch $BR191 already gone."
else
  echo "KIT-191 worktree already absent."
fi

echo "== 7. Remove orphan KIT-192 directory (if unregistered) =="
if [ -d "$WT192" ] && ! git worktree list | grep -Fq "$WT192"; then
  rm -rf "$WT192"
  echo "Removed orphan $WT192"
else
  echo "No orphan KIT-192 directory to remove."
fi

echo "== Done =="
git worktree list
git rev-parse --short HEAD
git stash list | head -5
ls -la "$(dirname "$WT191")" 2>/dev/null || true
