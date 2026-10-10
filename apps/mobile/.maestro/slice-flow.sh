# shellcheck shell=bash
# The Device flow of one issue (ADR-0049): `slices/<KEY>.yaml`, written in the
# same PR as the slice, covering only what that issue changes.
#
# slice_issue_key: `E2E_ISSUE`, else the key in the branch name
# (`claude/kit-279-59e33d` gives `KIT-279`).
slice_issue_key() {
  if [[ -n "${E2E_ISSUE:-}" ]]; then
    printf '%s' "$E2E_ISSUE" | tr '[:lower:]' '[:upper:]'
    return 0
  fi
  local branch
  branch="$(git -C "$stamp_root" branch --show-current)"
  if [[ "$branch" =~ [Kk][Ii][Tt]-([0-9]+) ]]; then
    printf 'KIT-%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

# slice_flow_path: path of the slice flow relative to .maestro, or a message on
# stderr and a non-zero status.
slice_flow_path() {
  local key
  if ! key="$(slice_issue_key)"; then
    echo "No issue key: name the branch after the issue (claude/kit-<n>-...) or set E2E_ISSUE=KIT-<n>." >&2
    return 2
  fi
  if [[ ! -f "$stamp_root/apps/mobile/.maestro/slices/$key.yaml" ]]; then
    echo "No slice flow for $key: write apps/mobile/.maestro/slices/$key.yaml from slices/TEMPLATE.yaml.example, in this PR." >&2
    return 2
  fi
  printf 'slices/%s.yaml' "$key"
}
