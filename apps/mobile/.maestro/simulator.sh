# shellcheck shell=bash
# The simulator the device flows own (KIT-267), sourced by build-local.sh,
# run-local.sh and run-evidence.sh. A dedicated device keeps its photo library to exactly one fixture
# photo, so the gallery step picks the same picture on every run.
#
# A slice flow that needs other photos names them in its header, by their name in
# fixtures/photos/catalog.json:
#   # simulator-photos: fck-home-front, fck-home-back, italy-home-front, italy-home-back
# It then runs on a simulator of its own that holds exactly those photos, added in the order
# listed (the system picker shows the last one added first). Photos cannot be removed from a
# simulator, so a different list is a different simulator, named after the list. Every other
# flow, and the regression flows, keep the one-photo simulator.
maestro_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# simulator_photos: the photo names the current slice flow asks for, one per line, or nothing.
# A flow named by E2E_FLOW_FILE (a flow from a run artifact, KIT-352) is read instead of the slice flow.
simulator_photos() {
  [[ "${E2E_FLOWS:-slice}" == regression ]] && return 0
  local key="${E2E_ISSUE:-}" branch flow="${E2E_FLOW_FILE:-}"
  if [[ -z "$flow" ]]; then
    if [[ -z "$key" ]]; then
      branch="$(git -C "$maestro_dir" branch --show-current 2>/dev/null || true)"
      [[ "$branch" =~ [Kk][Ii][Tt]-([0-9]+) ]] && key="KIT-${BASH_REMATCH[1]}"
    fi
    [[ -n "$key" ]] || return 0
    flow="$maestro_dir/slices/$(printf '%s' "$key" | tr '[:lower:]' '[:upper:]').yaml"
  fi
  [[ -f "$flow" ]] || return 0
  sed -n -E 's/^#[[:space:]]*simulator-photos:[[:space:]]*(.*)$/\1/p' "$flow" | head -1 |
    tr ',' '\n' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' | grep -v '^$' || true
}

# check_simulator_photos: return 2 when an entry of E2E_SIMULATOR_PHOTOS is not a fixture photo.
# A flow from a run artifact (KIT-366) is a Scenario's flow, kept out of every log: its bad entry is
# named by its position only, never by its text. A slice flow is in the repo, so its name is shown.
check_simulator_photos() {
  local photo n=0
  while IFS= read -r photo; do
    n=$((n + 1))
    if [[ ! "$photo" =~ ^[a-z0-9][a-z0-9-]*$ || ! -f "$maestro_dir/fixtures/photos/$photo.jpg" ]]; then
      if [[ "${E2E_FLOWS:-}" == artifact || -n "${E2E_FLOW_FILE:-}" ]]; then
        echo "simulator-photos: entry $n of the flow's header is no fixture photo (not shown: the flow is from a run artifact; see apps/mobile/.maestro/fixtures/photos/catalog.json)." >&2
      else
        echo "simulator-photos: no fixture photo named '$photo' (see apps/mobile/.maestro/fixtures/photos/catalog.json)." >&2
      fi
      return 2
    fi
  done <<< "$E2E_SIMULATOR_PHOTOS"
}

E2E_SIMULATOR_PHOTOS="$(simulator_photos)"
if [[ -n "$E2E_SIMULATOR_PHOTOS" ]]; then
  check_simulator_photos || return 2
  photo_set="$(printf '%s' "$E2E_SIMULATOR_PHOTOS" | git hash-object --stdin | cut -c1-8)"
  E2E_SIMULATOR="${E2E_SIMULATOR:-KitCollective Device Flows photos-$photo_set}"
else
  E2E_SIMULATOR="${E2E_SIMULATOR:-KitCollective Device Flows}"
fi
E2E_SIMULATOR_MODEL="${E2E_SIMULATOR_MODEL:-iPhone 17}"

E2E_SIMULATOR_UDID="$(xcrun simctl list devices available | grep -F "$E2E_SIMULATOR (" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/' || true)"
if [[ -z "$E2E_SIMULATOR_UDID" ]]; then
  E2E_SIMULATOR_UDID="$(xcrun simctl create "$E2E_SIMULATOR" "$E2E_SIMULATOR_MODEL" 2>/dev/null)"
  xcrun simctl bootstatus "$E2E_SIMULATOR_UDID" -b >/dev/null
  if [[ -n "$E2E_SIMULATOR_PHOTOS" ]]; then
    while IFS= read -r photo; do
      xcrun simctl addmedia "$E2E_SIMULATOR_UDID" "$maestro_dir/fixtures/photos/$photo.jpg"
    done <<< "$E2E_SIMULATOR_PHOTOS"
  else
    xcrun simctl addmedia "$E2E_SIMULATOR_UDID" "$maestro_dir/fixtures/shirt-front.jpg"
  fi
  # Keep iOS from offering to save the test password; the dialog lands on top of
  # whatever screen is showing a few seconds after sign-in.
  xcrun simctl spawn "$E2E_SIMULATOR_UDID" defaults write com.apple.WebUI AutoFillPasswords -bool NO
  xcrun simctl spawn "$E2E_SIMULATOR_UDID" defaults write -g AutoFillPasswords -bool NO
else
  xcrun simctl bootstatus "$E2E_SIMULATOR_UDID" -b >/dev/null
fi
export E2E_SIMULATOR E2E_SIMULATOR_UDID E2E_SIMULATOR_PHOTOS
