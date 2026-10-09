# shellcheck shell=bash
# Local-only test values, shared by local-api.sh and run-local.sh. They work
# against the disposable local database and nowhere else. Lane settings live in
# the main checkout's .env, never here.
export E2E_API_URL="${E2E_API_URL:-http://localhost:3000}"
export E2E_TEST_DATA_TOKEN="${E2E_TEST_DATA_TOKEN:-local-device-flow-token-0123456789}"
export E2E_COLLECTOR_EMAIL="${E2E_COLLECTOR_EMAIL:-e2e-collector@local.test}"
export E2E_COLLECTOR_PASSWORD="${E2E_COLLECTOR_PASSWORD:-local-collector-1}"
export E2E_PEER_EMAIL="${E2E_PEER_EMAIL:-e2e-peer@local.test}"
export E2E_PEER_PASSWORD="${E2E_PEER_PASSWORD:-local-peer-1}"
