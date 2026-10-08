#!/usr/bin/env bash
# Builds the Release simulator app for this checkout, pointed at the local API,
# and installs it on the booted (or named) simulator (KIT-267).
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=simulator.sh
source .maestro/simulator.sh
# shellcheck source=source-stamp.sh
source .maestro/source-stamp.sh
refuse_uncommitted "${app_sources[@]}"

export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
export EXPO_PUBLIC_API_URL="${E2E_API_URL:-http://localhost:3000}"
# Social login is not part of any flow; the Facebook plugin only needs a value at prebuild.
export EXPO_PUBLIC_FACEBOOK_APP_ID="${EXPO_PUBLIC_FACEBOOK_APP_ID:-000000000000000}"
export EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN="${EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN:-local-build}"
# `expo run:ios` rewrites the ios/android scripts in package.json; keep the file as it was.
package_json="$(mktemp)"
cp package.json "$package_json"
trap 'cp "$package_json" package.json && rm -f "$package_json"' EXIT

CI=1 npx expo run:ios --configuration Release --no-bundler --device "$E2E_SIMULATOR_UDID"
mkdir -p "$stamp_dir"
source_stamp "${app_sources[@]}" > "$stamp_dir/app-$E2E_SIMULATOR_UDID"
