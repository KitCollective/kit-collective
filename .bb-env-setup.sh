#!/usr/bin/env bash
# BB managed-worktree hook (see `bb guide environments`).
#
# Secrets model:
# - GH_TOKEN and LINEAR_API_KEY (names in repo-root bb.env) live in the main checkout's
#   gitignored `.env`, written there with `bb secret request ... --write-env <main>/.env`.
# - LINEAR_API_KEY: a value already in the process env wins (scripts/linear.mjs does the same).
# - scripts/linear.mjs reads the same main-checkout `.env`, so Linear needs no copy.
# - gh: the stored login must hold the `.env` GH_TOKEN, so agents in every worktree share
#   gh's credential store with the current token. Here `.env` wins over the process env
#   (a stale GH_TOKEN exported in a shell must not undo a rotation); the process env is
#   used only when `.env` has no GH_TOKEN. Python compares that value with
#   `gh auth token` and runs `gh auth login --with-token` when gh is logged out or the
#   two differ. Login overwrites the stored token, including one stored with no account
#   name, which `gh auth logout` cannot match. No logout is needed after a rotation.
# - This hook never writes a `.env` into the worktree and never prints a secret value.
set -euo pipefail

main_root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
env_file="$main_root/.env"

# Prints the value of $1 from the process env, else from the main checkout .env.
# Exit 1 when unset. Python keeps `bash -x` from echoing values.
read_secret() {
  python3 - "$1" "$env_file" <<'PY'
import os, sys
name, path = sys.argv[1], sys.argv[2]
val = os.environ.get(name, "")
if not val:
    try:
        for line in open(path, encoding="utf8"):
            line = line.strip()
            if line.startswith("export "):
                line = line[7:]
            k, sep, v = line.partition("=")
            if sep and k.strip() == name:
                val = v.strip().strip("\"'")
    except OSError:
        pass
if not val:
    sys.exit(1)
sys.stdout.write(val)
PY
}

if ! command -v gh >/dev/null 2>&1; then
  echo ".bb-env-setup.sh: ERROR — gh CLI missing on host" >&2
  exit 1
fi

# Syncs gh's stored login with the `.env` GH_TOKEN. Every value stays inside Python:
# none reaches a bash variable, argv, stdout or stderr. Prints one status line.
# Exit 1 when gh ends up without a usable login.
sync_gh_login() {
  python3 - "$env_file" <<'PY'
import hmac, os, subprocess, sys
path = sys.argv[1]

def from_env_file(name):
    val = ""
    try:
        for line in open(path, encoding="utf8"):
            line = line.strip()
            if line.startswith("export "):
                line = line[7:]
            k, sep, v = line.partition("=")
            if sep and k.strip() == name:
                val = v.strip().strip("\"'")
    except OSError:
        pass
    return val

want, source = from_env_file("GH_TOKEN"), ".env"
if not want:
    want, source = os.environ.get("GH_TOKEN", "").strip(), "the process env"
gh_env = {k: v for k, v in os.environ.items() if k not in ("GH_TOKEN", "GITHUB_TOKEN")}

def stored_token():
    r = subprocess.run(["gh", "auth", "token", "-h", "github.com"], env=gh_env,
                       stdin=subprocess.DEVNULL, capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else ""

def same(a, b):
    return hmac.compare_digest(a.encode(), b.encode())

have = stored_token()
if not want:
    if have:
        print(".bb-env-setup.sh: gh auth OK (no GH_TOKEN in .env; kept the stored login)")
        sys.exit(0)
    sys.exit(1)
if have and same(have, want):
    print(".bb-env-setup.sh: gh auth OK")
    sys.exit(0)
r = subprocess.run(["gh", "auth", "login", "--with-token", "-h", "github.com"], env=gh_env,
                   input=want + "\n", capture_output=True, text=True)
if r.returncode != 0 or not same(stored_token(), want):
    sys.exit(1)
print(f".bb-env-setup.sh: gh re-logged in from {source} (stored token differed)" if have
      else f".bb-env-setup.sh: gh logged in from {source}")
PY
}

if ! sync_gh_login; then
  echo ".bb-env-setup.sh: ERROR — gh not authenticated with the GH_TOKEN in $env_file (or env)." >&2
  echo "  Run: bb secret request GH_TOKEN LINEAR_API_KEY --write-env $env_file" >&2
  exit 1
fi

if ! read_secret LINEAR_API_KEY >/dev/null && ! read_secret LINEAR_CLI_API_KEY >/dev/null; then
  echo ".bb-env-setup.sh: ERROR — LINEAR_API_KEY missing from env and $env_file." >&2
  echo "  Run: bb secret request GH_TOKEN LINEAR_API_KEY --write-env $env_file" >&2
  exit 1
fi
echo ".bb-env-setup.sh: LINEAR_API_KEY present"

if [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile || pnpm install || true
fi
