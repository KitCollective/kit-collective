#!/usr/bin/env bash
# Runs the device flows on a local iOS Simulator (KIT-267).
#   1. .maestro/local-api.sh              (terminal 1: local API on a disposable database)
#   2. a Release simulator build pointed at http://localhost:3000, installed on the
#      booted simulator (see docs/agents/device-flows.md)
#   3. .maestro/run-local.sh [flow.yaml]  (terminal 2)
# Screenshots and recordings land in .maestro/out/.
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck source=local.env.sh
source ./local.env.sh
# shellcheck source=simulator.sh
source ./simulator.sh

export MAESTRO_API_URL="$E2E_API_URL"
export MAESTRO_TEST_DATA_TOKEN="$E2E_TEST_DATA_TOKEN"
export MAESTRO_COLLECTOR_EMAIL="$E2E_COLLECTOR_EMAIL"
export MAESTRO_COLLECTOR_PASSWORD="$E2E_COLLECTOR_PASSWORD"
export MAESTRO_PEER_EMAIL="$E2E_PEER_EMAIL"
export MAESTRO_PEER_PASSWORD="$E2E_PEER_PASSWORD"

# Reduce Motion stills the looping and entering animations, so a screenshot of
# the same screen is the same picture every run.
xcrun simctl spawn "$E2E_SIMULATOR_UDID" defaults write com.apple.Accessibility ReduceMotionEnabled -bool YES
xcrun simctl status_bar "$E2E_SIMULATOR_UDID" override --time "9:41" --batteryState charged --batteryLevel 100

target="${1:-$PWD}"
if [[ "$target" != /* ]]; then
  target="$PWD/$target"
fi
mkdir -p out
maestro --udid "$E2E_SIMULATOR_UDID" test --test-output-dir "$PWD/out" "$target"
