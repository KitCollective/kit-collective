#!/usr/bin/env bash
# Human-only: install host-global factory secrets on kit-harness (Mac → SSH).
#
# Security model:
# - GH_TOKEN → one-shot gh auth on host (credential store). Not injected into daemon env.
# - LINEAR_* → /root/.config/kit-collective/factory.env (0400) + systemd EnvironmentFile
#   on bb-host-daemon so every agent inherits Linear without worktree .env files.
# Values are never printed. Prefer a harness-scoped Linear key (not Admin bootstrap).
#
# Interactive alternative on a harness thread (no paste into chat):
#   bb secret request LINEAR_API_KEY LINEAR_CLI_API_KEY \
#     --purpose "kit-harness factory secrets" \
#     --write-env /root/.config/kit-collective/factory.env
# then re-run the install script / restart the host-daemon unit.
set -euo pipefail

HOST="${KIT_HARNESS_SSH:-kit-harness}"
SRC_ENV="${KIT_COLLECTIVE_ENV:-$HOME/Projects/kit-collective/.env}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_SH="$REPO_ROOT/scripts/kit-harness-factory-secrets-install.sh"

if [[ ! -f "$SRC_ENV" ]]; then
  echo "Missing $SRC_ENV" >&2
  exit 1
fi
if [[ ! -f "$INSTALL_SH" ]]; then
  echo "Missing $INSTALL_SH" >&2
  exit 1
fi

TMP=$(mktemp)
chmod 600 "$TMP"
trap 'rm -f "$TMP"' EXIT
export OUT="$TMP" SRC_ENV
python3 <<'PY'
from pathlib import Path
import os
src = Path(os.environ["SRC_ENV"])
out = Path(os.environ["OUT"])
wanted = ["GH_TOKEN", "LINEAR_API_KEY", "LINEAR_CLI_API_KEY"]
vals = {}
for line in src.read_text().splitlines():
    s = line.strip()
    if not s or s.startswith("#") or "=" not in s:
        continue
    k, v = s.split("=", 1)
    k, v = k.strip(), v.strip().strip('"').strip("'")
    if k in wanted and v:
        vals[k] = v
if "GH_TOKEN" not in vals:
    raise SystemExit("SRC_ENV missing GH_TOKEN")
if "LINEAR_API_KEY" not in vals and "LINEAR_CLI_API_KEY" not in vals:
    raise SystemExit("SRC_ENV missing LINEAR_API_KEY or LINEAR_CLI_API_KEY")
lines = [f"{k}={vals[k]}" for k in wanted if k in vals]
out.write_text("\n".join(lines) + "\n")
print(f"staged {len(lines)} keys (values not shown)")
PY

scp -o BatchMode=yes -q "$TMP" "$HOST:/root/factory-secrets.stage"
scp -o BatchMode=yes -q "$INSTALL_SH" "$HOST:/root/kit-harness-factory-secrets-install.sh"
ssh -o BatchMode=yes "$HOST" bash -s <<'EOF'
set -euo pipefail
chmod 700 /root/kit-harness-factory-secrets-install.sh
chmod 600 /root/factory-secrets.stage
KIT_FACTORY_ENV_SRC=/root/factory-secrets.stage bash /root/kit-harness-factory-secrets-install.sh
rm -f /root/factory-secrets.stage
# Keep install script for re-runs; optional: rm /root/kit-harness-factory-secrets-install.sh
EOF

echo "Done. Host-global: Linear via daemon EnvironmentFile; GitHub via gh auth; no worktree secrets."
