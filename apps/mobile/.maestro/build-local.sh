#!/usr/bin/env bash
# Builds the Release simulator app for this checkout, pointed at the local API,
# and installs it on the booted (or named) simulator (KIT-267).
set -euo pipefail

cd "$(dirname "$0")/.."

export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
export EXPO_PUBLIC_API_URL="${E2E_API_URL:-http://localhost:3000}"
# Social login is not part of any flow; the Facebook plugin only needs a value at prebuild.
export EXPO_PUBLIC_FACEBOOK_APP_ID="${EXPO_PUBLIC_FACEBOOK_APP_ID:-000000000000000}"
export EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN="${EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN:-local-build}"
# react-native-iap 12 depends on the RCT-Folly pod, which the precompiled React
# Native dependencies do not ship, so `pod install` only resolves with them built
# from source. That in turn compiles expo-modules-jsi, which needs Xcode 27
# (it fails on Xcode 26.3). KIT-268; docs/agents/device-flows.md, "Known blocker".
export RCT_USE_RN_DEP=0

CI=1 npx expo run:ios --configuration Release --no-bundler --device "${E2E_SIMULATOR:-iPhone 17}"
# `expo run:ios` rewrites the ios/android scripts in package.json; that is not part of any change.
git checkout -- package.json
