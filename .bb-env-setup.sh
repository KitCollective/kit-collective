#!/usr/bin/env bash
# BB managed-worktree hook (see `bb guide environments`).
#
# Secrets model:
# - GH_TOKEN and LINEAR_API_KEY (names in repo-root bb.env) live in the main checkout's
#   gitignored `.env`, written there with `bb secret request ... --write-env <main>/.env`.
#   A value already in the process env wins.
# - scripts/linear.mjs reads the same main-checkout `.env`, so Linear needs no copy.
# - gh: if not logged in, log in once from that token (`gh auth login --with-token`), so
#   agents in every worktree share gh's credential store.
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

if ! env -u GH_TOKEN -u GITHUB_TOKEN gh auth status -h github.com >/dev/null 2>&1; then
  if ! read_secret GH_TOKEN | env -u GH_TOKEN -u GITHUB_TOKEN gh auth login --with-token -h github.com >/dev/null 2>&1; then
    echo ".bb-env-setup.sh: ERROR — gh not authenticated and no usable GH_TOKEN in env or $env_file." >&2
    echo "  Run: bb secret request GH_TOKEN LINEAR_API_KEY --write-env $env_file" >&2
    exit 1
  fi
fi
echo ".bb-env-setup.sh: gh auth OK"

if ! read_secret LINEAR_API_KEY >/dev/null && ! read_secret LINEAR_CLI_API_KEY >/dev/null; then
  echo ".bb-env-setup.sh: ERROR — LINEAR_API_KEY missing from env and $env_file." >&2
  echo "  Run: bb secret request GH_TOKEN LINEAR_API_KEY --write-env $env_file" >&2
  exit 1
fi
echo ".bb-env-setup.sh: LINEAR_API_KEY present"

if [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile || pnpm install || true
fi
