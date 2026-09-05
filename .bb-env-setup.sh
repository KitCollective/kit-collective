#!/usr/bin/env bash
# BB managed-worktree hook (see `bb guide environments`).
#
# Host-global secrets model (kit-harness):
# - GitHub: host `gh` credential store (~/.config/gh). Never GH_TOKEN in worktree or EnvironmentFile.
# - Linear: injected into bb host-daemon via systemd EnvironmentFile
#   (/root/.config/kit-collective/factory.env). BB passes non-BB_* daemon env into agents.
# - This hook VERIFIES only. It must never write secret .env files into the worktree.
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo ".bb-env-setup.sh: ERROR — gh CLI missing on host" >&2
  exit 1
fi

if ! env -u GH_TOKEN -u GITHUB_TOKEN gh auth status -h github.com >/dev/null 2>&1; then
  echo ".bb-env-setup.sh: ERROR — gh not authenticated. Run scripts/kit-harness-agent-env-wizard.sh on Mac." >&2
  exit 1
fi
echo ".bb-env-setup.sh: gh auth OK (host credential store)"

# Presence check via python so `bash -x` cannot echo secret values
if ! python3 -c 'import os,sys; sys.exit(0 if (os.environ.get("LINEAR_API_KEY") or os.environ.get("LINEAR_CLI_API_KEY")) else 1)'; then
  echo ".bb-env-setup.sh: ERROR — LINEAR_* missing from process env." >&2
  echo "  Expected systemd EnvironmentFile on bb host-daemon (factory.env)." >&2
  echo "  Re-run scripts/kit-harness-agent-env-wizard.sh on Mac." >&2
  exit 1
fi
echo ".bb-env-setup.sh: LINEAR_* present in process env (host-global; no worktree .env)"

# Hard refuse: never leave / copy secret dotenv into the worktree
if [[ -f .env ]] && grep -qE '^(LINEAR_|GH_TOKEN|GITHUB_TOKEN)=' .env 2>/dev/null; then
  echo ".bb-env-setup.sh: ERROR — refusing secret-bearing .env in worktree (host-global model)." >&2
  echo "  Delete .env and rely on host-daemon EnvironmentFile." >&2
  exit 1
fi

if [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile || pnpm install || true
fi
