# shellcheck shell=bash
# The native half of the Release simulator app, built once and reused (ADR-0049).
#
# A Release app is a native binary plus one Hermes bytecode file, `main.jsbundle`.
# A slice that changes only TypeScript leaves the binary as it was, so the binary
# is cached under a hash of what the native build reads, shared by every
# worktree, and a commit only gets a fresh JavaScript bundle swapped in.
#
# Sourced after simulator.sh and source-stamp.sh.
native_cache_root="${E2E_NATIVE_CACHE:-$HOME/.cache/kit-e2e/native}"
native_cache_keep="${E2E_NATIVE_CACHE_KEEP:-2}"
native_min_free_gb="${E2E_NATIVE_MIN_FREE_GB:-12}"
app_bundle_id="app.kitcollective.mobile"

# native_stamp: hash of the tracked files the native build reads, plus the Xcode
# that builds it. The lockfile is deliberately coarse: any dependency change
# rebuilds, so a stale binary can never be paired with new native code.
native_stamp() {
  {
    git -C "$stamp_root" ls-tree -r HEAD -- pnpm-lock.yaml patches \
      apps/mobile/package.json apps/mobile/app.json apps/mobile/app.config.js \
      apps/mobile/plugins apps/mobile/modules
    xcodebuild -version 2>/dev/null | tr '\n' ' '
    printf '\nfacebook:%s\n' "${EXPO_PUBLIC_FACEBOOK_APP_ID:-000000000000000}"
  } | git hash-object --stdin
}

native_cache_dir() { printf '%s/%s' "$native_cache_root" "$1"; }

free_gb() {
  df -k "$HOME" | awk 'NR==2 { printf "%d", $4 / 1048576 }'
}

# require_free_disk <gb>: stop before a build that would fill the disk.
require_free_disk() {
  local need="$1" have
  have="$(free_gb)"
  if ((have < need)); then
    echo "Only ${have} GB free; a full native build needs about ${need} GB." >&2
    echo "Nothing was deleted. Free space, or remove old issue worktrees' ios/ folders: apps/mobile/ios is generated and rebuilt on demand." >&2
    return 4
  fi
}

# prune_native_cache: keep the newest few binaries (a cache entry is ~150 MB).
prune_native_cache() {
  [[ -d "$native_cache_root" ]] || return 0
  # shellcheck disable=SC2012
  ls -1t "$native_cache_root" | tail -n +"$((native_cache_keep + 1))" | while read -r old; do
    rm -rf "${native_cache_root:?}/$old"
  done
}

# store_native_app <stamp>: keep the app now installed on the flows' simulator.
store_native_app() {
  local stamp="$1" installed target
  installed="$(xcrun simctl get_app_container "$E2E_SIMULATOR_UDID" "$app_bundle_id" app)"
  target="$(native_cache_dir "$stamp")"
  rm -rf "$target.partial" "$target"
  mkdir -p "$target.partial"
  cp -R "$installed" "$target.partial/App.app"
  mv "$target.partial" "$target"
  prune_native_cache
}

# swap_in_js <cached app dir> <target app dir>: a copy of the cached binary with
# this commit's JavaScript, compiled to Hermes bytecode as the Xcode build does.
swap_in_js() {
  local cached="$1" target="$2" work hermesc
  work="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$work'" RETURN
  rm -rf "$target"
  mkdir -p "$(dirname "$target")"
  cp -R "$cached" "$target"

  (
    cd "$stamp_root/apps/mobile" || return 1
    export NODE_ENV=production
    npx expo export:embed --platform ios --dev false --minify true \
      --entry-file "$(node -p "require.resolve('expo-router/entry')")" \
      --bundle-output "$work/main.js" --assets-dest "$target"
  )
  hermesc="$(node -p "require('path').join(require('path').dirname(require.resolve('hermes-compiler/package.json', { paths: [require.resolve('react-native/package.json', { paths: ['$stamp_root/apps/mobile'] })] })), 'hermesc/osx-bin/hermesc')")"
  "$hermesc" -w -O -emit-binary -out "$target/main.jsbundle" "$work/main.js"
  # The simulator runs ad-hoc signed apps; the changed bundle needs a fresh seal.
  codesign --force --sign - --timestamp=none --preserve-metadata=entitlements "$target" >/dev/null
}
