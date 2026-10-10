#!/usr/bin/env bash
# Puts the Release simulator app for this commit on the flows' own simulator,
# pointed at the local API (KIT-267, ADR-0049).
#
# The native binary is cached by a hash of what the native build reads and shared
# by every worktree. On a hit only the JavaScript is bundled and swapped in
# (about a minute, no Xcode, no extra disk); on a miss the full Xcode build runs
# once and its binary goes into the cache. `E2E_FORCE_NATIVE_BUILD=1` skips the cache.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=device-lock.sh
source "$here/device-lock.sh"
if [[ "${E2E_LOCK_HELD:-}" != 1 ]]; then
  device_lock_run "build $(git -C "$here" branch --show-current)" env E2E_LOCK_HELD=1 "$0" "$@"
  exit $?
fi

cd "$here/.."
# shellcheck source=simulator.sh
source .maestro/simulator.sh
# shellcheck source=source-stamp.sh
source .maestro/source-stamp.sh
# shellcheck source=native-cache.sh
source .maestro/native-cache.sh
refuse_uncommitted "${app_sources[@]}"

export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
export EXPO_PUBLIC_API_URL="${E2E_API_URL:-http://localhost:3000}"
# Social login is not part of any flow; the Facebook plugin only needs a value at prebuild.
export EXPO_PUBLIC_FACEBOOK_APP_ID="${EXPO_PUBLIC_FACEBOOK_APP_ID:-000000000000000}"
export EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN="${EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN:-local-build}"

mkdir -p "$stamp_dir"
stamp="$(native_stamp)"
cached="$(native_cache_dir "$stamp")/App.app"

if [[ -d "$cached" && "${E2E_FORCE_NATIVE_BUILD:-}" != 1 ]]; then
  echo "Native binary $stamp is cached: bundling JavaScript only."
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT
  swap_in_js "$cached" "$work/App.app"
  xcrun simctl terminate "$E2E_SIMULATOR_UDID" "$app_bundle_id" >/dev/null 2>&1 || true
  xcrun simctl install "$E2E_SIMULATOR_UDID" "$work/App.app"
else
  echo "No cached native binary for $stamp: full Xcode build."
  require_free_disk "$native_min_free_gb"
  # `expo run:ios` rewrites the ios/android scripts in package.json; keep the file as it was.
  package_json="$(mktemp)"
  cp package.json "$package_json"
  trap 'cp "$package_json" package.json && rm -f "$package_json"' EXIT
  CI=1 npx expo run:ios --configuration Release --no-bundler --device "$E2E_SIMULATOR_UDID"
  store_native_app "$stamp"
fi
source_stamp "${app_sources[@]}" > "$stamp_dir/app-$E2E_SIMULATOR_UDID"
