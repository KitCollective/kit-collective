#!/usr/bin/env bash
# Safe fast-forward sync of lanes.integration with origin.
# Usage (from repo root): bash scripts/sync-development.sh
#
# Mirrors .cursor/skills/sync-development/SKILL.md — prefer the skill for diverged branches.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INTEGRATION="${LANE_INTEGRATION:-development}"

cd "$ROOT"

DID_STASH=false

if git status --porcelain | grep -q .; then
  git stash push -u -m "sync-development-wip-$(date +%Y%m%d)"
  DID_STASH=true
fi

git fetch origin "$INTEGRATION"

if git show-ref --verify --quiet "refs/heads/$INTEGRATION"; then
  read -r ahead behind < <(
    git rev-list --left-right --count "$INTEGRATION...origin/$INTEGRATION" | tr '\t' ' '
  )
  if [ "${ahead:-0}" -gt 0 ] && [ "${behind:-0}" -gt 0 ]; then
    echo "Local $INTEGRATION diverged from origin (ahead $ahead, behind $behind). Stop — resolve manually."
    if [ "$DID_STASH" = true ]; then
      git stash pop || true
    fi
    exit 1
  fi
  if [ "${ahead:-0}" -gt 0 ]; then
    echo "Local $INTEGRATION is ahead of origin by $ahead commit(s). Stop — push, branch, or reset manually."
    if [ "$DID_STASH" = true ]; then
      git stash pop || true
    fi
    exit 1
  fi
fi

git checkout "$INTEGRATION"
git pull --ff-only origin "$INTEGRATION"

if [ "$DID_STASH" = true ]; then
  git stash pop || {
    echo "Stash pop had conflicts — resolve manually."
    exit 1
  }
fi

echo "Synced origin/$INTEGRATION at $(git rev-parse --short HEAD)"
