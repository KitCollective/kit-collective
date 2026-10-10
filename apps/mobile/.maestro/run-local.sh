#!/usr/bin/env bash
# Runs the device flows on a local iOS Simulator (KIT-267).
#   1. .maestro/local-api.sh              (terminal 1: local API on a disposable database)
#   2. .maestro/build-local.sh            (Release build on the flows' own simulator)
#   3. .maestro/run-local.sh [flow.yaml]  (terminal 2; no argument = this issue's slice flow,
#      E2E_FLOWS=regression = the five regression flows)
# Screenshots and recordings land in .maestro/out/.
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck source=local.env.sh
source ./local.env.sh
# shellcheck source=simulator.sh
source ./simulator.sh
# shellcheck source=source-stamp.sh
source ./source-stamp.sh
# shellcheck source=slice-flow.sh
source ./slice-flow.sh

# Homebrew's openjdk is keg-only, so a shell without it on PATH has no Java and Maestro cannot start.
if ! java -version >/dev/null 2>&1; then
  for jdk in /opt/homebrew/opt/openjdk@17 /opt/homebrew/opt/openjdk /usr/local/opt/openjdk@17; do
    if [[ -x "$jdk/bin/java" ]]; then
      export JAVA_HOME="$jdk" PATH="$jdk/bin:$PATH"
      break
    fi
  done
fi

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

# A named file, else the regression flows when asked for, else this issue's slice flow.
target="${1:-}"
if [[ -z "$target" ]]; then
  if [[ "${E2E_FLOWS:-slice}" == regression ]]; then
    target="$PWD"
  else
    target="$(slice_flow_path)"
  fi
fi
if [[ "$target" != /* ]]; then
  target="$PWD/$target"
fi
mkdir -p out
maestro --udid "$E2E_SIMULATOR_UDID" test --test-output-dir "$PWD/out" "$target"
