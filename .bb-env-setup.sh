#!/usr/bin/env bash
# BB managed-worktree hook (see `bb guide environments`).
#
# Project-level secrets model (bb):
# - GH_TOKEN and LINEAR_API_KEY are set once at project level in bb (see repo-root bb.env).
#   bb injects them into the agent process env, so gh and scripts/linear.mjs share one source.
# - This hook VERIFIES only. It must never write secret .env files into the worktree.
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo ".bb-env-setup.sh: ERROR — gh CLI missing on host" >&2
  exit 1
fi

if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo ".bb-env-setup.sh: ERROR — gh not authenticated. Set GH_TOKEN at project level in bb (see bb.env)." >&2
  exit 1
fi
echo ".bb-env-setup.sh: gh auth OK"

# Presence check via python so `bash -x` cannot echo secret values
if ! python3 -c 'import os,sys; sys.exit(0 if (os.environ.get("LINEAR_API_KEY") or os.environ.get("LINEAR_CLI_API_KEY")) else 1)'; then
  echo ".bb-env-setup.sh: ERROR — LINEAR_API_KEY missing from process env." >&2
  echo "  Set it at project level in bb (see bb.env)." >&2
  exit 1
fi
echo ".bb-env-setup.sh: LINEAR_API_KEY present in process env (no worktree .env)"

# Hard refuse: never leave / copy secret dotenv into the worktree
if [[ -f .env ]] && grep -qE '^(LINEAR_|GH_TOKEN|GITHUB_TOKEN)=' .env 2>/dev/null; then
  echo ".bb-env-setup.sh: ERROR — refusing secret-bearing .env in worktree (project-level bb secrets)." >&2
  echo "  Delete .env and rely on the bb project-level secrets." >&2
  exit 1
fi

if [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile || pnpm install || true
fi
