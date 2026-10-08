# shellcheck shell=bash
# The simulator the device flows own (KIT-267), sourced by build-local.sh and
# run-local.sh. A dedicated device keeps its photo library to exactly one fixture
# photo, so the gallery step picks the same picture on every run.
E2E_SIMULATOR="${E2E_SIMULATOR:-KitCollective Device Flows}"
E2E_SIMULATOR_MODEL="${E2E_SIMULATOR_MODEL:-iPhone 17}"

E2E_SIMULATOR_UDID="$(xcrun simctl list devices available | grep -F "$E2E_SIMULATOR (" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/' || true)"
if [[ -z "$E2E_SIMULATOR_UDID" ]]; then
  E2E_SIMULATOR_UDID="$(xcrun simctl create "$E2E_SIMULATOR" "$E2E_SIMULATOR_MODEL" 2>/dev/null)"
  xcrun simctl bootstatus "$E2E_SIMULATOR_UDID" -b >/dev/null
  xcrun simctl addmedia "$E2E_SIMULATOR_UDID" "$(dirname "${BASH_SOURCE[0]}")/fixtures/shirt-front.jpg"
else
  xcrun simctl bootstatus "$E2E_SIMULATOR_UDID" -b >/dev/null
fi
export E2E_SIMULATOR E2E_SIMULATOR_UDID
