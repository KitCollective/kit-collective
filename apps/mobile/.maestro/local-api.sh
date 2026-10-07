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
export E2E_TEST_DATA_LANE="test"
export VISION_FIXED_FOR_TEST_COLLECTOR="on"
unset R2_ENDPOINT REDIS_URL OPENROUTER_VISION_API_KEY GEMINI_API_KEY

# shellcheck source=local.env.sh
source "../mobile/.maestro/local.env.sh"

pnpm build
pnpm e2e:local-database
exec pnpm start
