#!/usr/bin/env bash
# Host-global factory secrets for kit-harness (run ON the harness as root).
#
# Model (strongest practical on single-tenant root):
# - GitHub: host `gh` credential store only — never in process EnvironmentFile
# - Linear: /root/.config/kit-collective/factory.env (0400) loaded by bb host-daemon
# - BB passes non-BB_* env from the daemon into agents/setup hooks (verified in daemon)
# - Worktrees must NOT contain secret .env files
#
# Usage:
#   KIT_FACTORY_ENV_SRC=/path/to/staged.env bash scripts/kit-harness-factory-secrets-install.sh
# staged.env may contain GH_TOKEN (consumed once for gh auth) + LINEAR_* (persisted).
set -euo pipefail

umask 077

CONF_DIR="${KIT_COLLECTIVE_CONF_DIR:-/root/.config/kit-collective}"
FACTORY_ENV="$CONF_DIR/factory.env"
GH_BOOTSTRAP="$CONF_DIR/github.bootstrap" # optional, never EnvironmentFile'd
SRC="${KIT_FACTORY_ENV_SRC:-}"
CHECKOUT="${KIT_COLLECTIVE_CHECKOUT:-/root/.bb-machines/eskobar.getbb.app/checkouts/kit-collective}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "must run as root on kit-harness" >&2
  exit 1
fi

if [[ -z "$SRC" || ! -f "$SRC" ]]; then
  echo "set KIT_FACTORY_ENV_SRC to a staged env file" >&2
  exit 1
fi

mkdir -p "$CONF_DIR"
chmod 700 "$CONF_DIR"

python3 - "$SRC" "$FACTORY_ENV" "$GH_BOOTSTRAP" <<'PY'
import sys
from pathlib import Path

src, factory_path, gh_path = map(Path, sys.argv[1:4])
vals = {}
for line in src.read_text().splitlines():
    s = line.strip()
    if not s or s.startswith("#") or "=" not in s:
        continue
    k, v = s.split("=", 1)
    k, v = k.strip(), v.strip().strip('"').strip("'")
    if k and v:
        vals[k] = v

forbidden_in_factory = {"GH_TOKEN", "GITHUB_TOKEN", "GITHUB_PAT", "CURSOR_API_KEY"}
linear_keys = [k for k in ("LINEAR_API_KEY", "LINEAR_CLI_API_KEY") if k in vals]
if not linear_keys:
    raise SystemExit("staged env missing LINEAR_API_KEY or LINEAR_CLI_API_KEY")

# Atomic write Linear-only factory.env (never GitHub tokens)
tmp = factory_path.with_suffix(".tmp")
tmp.write_text("\n".join(f"{k}={vals[k]}" for k in linear_keys) + "\n")
tmp.chmod(0o400)
tmp.replace(factory_path)
factory_path.chmod(0o400)

# Optional one-shot GitHub bootstrap file (not loaded by systemd)
if "GH_TOKEN" in vals:
    gtmp = gh_path.with_suffix(".tmp")
    gtmp.write_text(f"GH_TOKEN={vals['GH_TOKEN']}\n")
    gtmp.chmod(0o400)
    gtmp.replace(gh_path)
    gh_path.chmod(0o400)
    print("wrote github.bootstrap (for gh auth only; not EnvironmentFile)")
else:
    print("no GH_TOKEN in stage — assuming gh already authenticated")

# Refuse world/group readable
mode = factory_path.stat().st_mode & 0o777
if mode & 0o077:
    raise SystemExit(f"factory.env mode too open: {oct(mode)}")
for bad in forbidden_in_factory:
    if bad in factory_path.read_text():
        raise SystemExit(f"{bad} must not appear in factory.env")
print(f"factory.env keys: {','.join(linear_keys)} mode 0400")
PY

# GitHub → credential store; strip from process after
if [[ -f "$GH_BOOTSTRAP" ]]; then
  TOKEN=$(python3 -c "from pathlib import Path
for line in Path('$GH_BOOTSTRAP').read_text().splitlines():
  if line.startswith('GH_TOKEN='):
    print(line.split('=',1)[1]); break")
  printf '%s\n' "$TOKEN" | env -u GH_TOKEN -u GITHUB_TOKEN gh auth login --hostname github.com --with-token
  unset TOKEN
  # No residual GitHub token on disk after credential-store login
  rm -f "$GH_BOOTSTRAP"
  echo "wiped github.bootstrap after gh auth"
fi

if ! env -u GH_TOKEN -u GITHUB_TOKEN gh auth status -h github.com >/dev/null 2>&1; then
  echo "gh auth failed" >&2
  exit 1
fi
echo "gh auth OK (host credential store)"

# systemd drop-in: inject Linear into bb host-daemon → agents inherit via ct()
UNIT=$(systemctl --user list-unit-files 'bb-host-daemon*.service' --no-legend 2>/dev/null | awk '{print $1}' | head -1 || true)
if [[ -z "${UNIT:-}" ]]; then
  UNIT=$(systemctl --user list-units 'bb-host-daemon*.service' --all --no-legend 2>/dev/null | awk '{print $1}' | head -1 || true)
fi
if [[ -z "${UNIT:-}" ]]; then
  echo "ERROR: no bb-host-daemon*.service found under user systemd" >&2
  exit 1
fi

DROP_DIR="/root/.config/systemd/user/${UNIT}.d"
mkdir -p "$DROP_DIR"
chmod 700 /root/.config/systemd/user
cat >"$DROP_DIR/factory-env.conf" <<EOF
# Managed by kit-harness-factory-secrets-install.sh — do not put GH_TOKEN here.
[Service]
EnvironmentFile=-${FACTORY_ENV}
EOF
chmod 600 "$DROP_DIR/factory-env.conf"

# Linger so user units survive reboot
loginctl enable-linger root >/dev/null 2>&1 || true

systemctl --user daemon-reload
systemctl --user restart "$UNIT"
sleep 2
systemctl --user is-active "$UNIT" >/dev/null

# Prove daemon process has Linear key NAMES (not values)
DAEMON_PID=$(pgrep -f 'host-daemon/dist/daemon-bundle' | head -1 || true)
if [[ -z "${DAEMON_PID:-}" ]]; then
  echo "ERROR: host-daemon not running after restart" >&2
  exit 1
fi
python3 - "$DAEMON_PID" <<'PY'
import sys
from pathlib import Path
pid = sys.argv[1]
env = Path(f"/proc/{pid}/environ").read_bytes().split(b"\0")
keys = sorted(e.decode().split("=",1)[0] for e in env if e and b"=" in e)
need = {"LINEAR_API_KEY", "LINEAR_CLI_API_KEY"}
have = need.intersection(keys)
if "LINEAR_API_KEY" not in have and "LINEAR_CLI_API_KEY" not in have:
    raise SystemExit(f"daemon missing LINEAR_* in environ; have sample: {keys[:20]}")
bad = {"GH_TOKEN", "GITHUB_TOKEN"} & set(keys)
if bad:
    raise SystemExit(f"daemon must NOT have GitHub tokens in environ: {bad}")
print("daemon_env_ok:", ",".join(sorted(have)))
PY

# Scrub secret files out of checkout / future worktree copies
if [[ -d "$CHECKOUT" ]]; then
  if [[ -f "$CHECKOUT/.env" ]]; then
    # Replace with a pointer comment file? Prefer delete — no secrets in checkout.
    rm -f "$CHECKOUT/.env"
    echo "removed checkout .env (secrets are host-global now)"
  fi
fi

# Remove legacy agent.env if it still holds GH_TOKEN mixed in
if [[ -f "$CONF_DIR/agent.env" ]]; then
  rm -f "$CONF_DIR/agent.env"
  echo "removed legacy agent.env"
fi

echo "OK host-global factory secrets installed for $UNIT"
echo "Worktrees: .bb-env-setup.sh must only VERIFY env — never write secret .env"
