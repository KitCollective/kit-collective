#!/usr/bin/env bash
# Local API for running the device flows on this machine (KIT-267).
# Uses a disposable local database, an in-memory object store and fixed Vision
# for the test Collector. Every value below is a local-only test value.
set -euo pipefail

cd "$(dirname "$0")/../../api"

export E2E_LOCAL_DATABASE_URL="${E2E_LOCAL_DATABASE_URL:-postgresql://kit:kit@localhost:5432/kit_e2e_test}"
export DATABASE_URL="$E2E_LOCAL_DATABASE_URL"
export BETTER_AUTH_SECRET="local-device-flow-secret-not-for-any-lane"
export BETTER_AUTH_URL="http://localhost:3000"
export E2E_TEST_DATA_TARGET="local"
export VISION_FIXED_FOR_TEST_COLLECTOR="on"
unset R2_ENDPOINT REDIS_URL OPENROUTER_VISION_API_KEY GEMINI_API_KEY PRODUCTION_DATABASE_URL NODE_ENV

# shellcheck source=local.env.sh
source "../mobile/.maestro/local.env.sh"

# shellcheck source=source-stamp.sh
source "../mobile/.maestro/source-stamp.sh"
refuse_uncommitted "${api_sources[@]}"
mkdir -p "$stamp_dir"
rm -f "$stamp_dir/api"
# An API already on the port would keep serving its old build under a new stamp.
if lsof -ti tcp:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 3000 is in use: stop the running API first." >&2
  exit 2
fi

# A fresh worktree has none of the workspace packages built (domain, db, api-contract).
pnpm --filter "@kit/api..." build
pnpm e2e:local-database
source_stamp "${api_sources[@]}" > "$stamp_dir/api"
exec pnpm start
