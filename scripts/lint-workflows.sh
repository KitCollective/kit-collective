#!/usr/bin/env bash
# Ratchet (KIT-7): fail if any .github/workflows/*.yml is invalid (actionlint).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

actionlint_bin="actionlint"
if ! command -v actionlint >/dev/null 2>&1; then
  if [[ ! -x "$root/actionlint" ]]; then
    curl -sSfL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash | bash
  fi
  actionlint_bin="$root/actionlint"
fi

"$actionlint_bin" -color
