# shellcheck shell=bash
# One Device flows run at a time on this Mac (KIT-267 follow-up, ADR-0049).
# The flows share one simulator, port 3000 and one disposable database, so two
# issue sessions must queue. The lock lives in the repository's common git
# directory, which every worktree of this clone shares.
#
#   device_lock_run <label> <command...>   waits its turn, runs, always releases
#
# A lock whose owner process is gone is stale and is taken over.
device_lock_dir="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --path-format=absolute --git-common-dir)/kit-device-flows.lock"
device_lock_poll_seconds="${E2E_LOCK_POLL_SECONDS:-5}"
device_lock_max_wait_seconds="${E2E_LOCK_MAX_WAIT_SECONDS:-5400}"

device_lock_owner_alive() {
  local pid
  pid="$(cat "$device_lock_dir/pid" 2>/dev/null || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

device_lock_acquire() {
  local label="$1" waited=0 told=0
  while ! mkdir "$device_lock_dir" 2>/dev/null; do
    if [[ -d "$device_lock_dir" ]] && ! device_lock_owner_alive; then
      # Rename first: of two sessions taking over a stale lock, only one rename succeeds.
      if mv "$device_lock_dir" "$device_lock_dir.stale.$$" 2>/dev/null; then
        rm -rf "$device_lock_dir.stale.$$"
        echo "Took over a Device flows lock whose owner had stopped." >&2
      fi
      continue
    fi
    if ((waited >= device_lock_max_wait_seconds)); then
      echo "Waited ${waited}s for the Device flows lock held by: $(cat "$device_lock_dir/label" 2>/dev/null)" >&2
      return 3
    fi
    if ((waited - told >= 60 || waited == 0)); then
      echo "Device flows queue: waiting for \"$(cat "$device_lock_dir/label" 2>/dev/null || echo unknown)\" (pid $(cat "$device_lock_dir/pid" 2>/dev/null || echo ?), since $(cat "$device_lock_dir/since" 2>/dev/null || echo ?))." >&2
      told=$waited
    fi
    sleep "$device_lock_poll_seconds"
    waited=$((waited + device_lock_poll_seconds))
  done
  printf '%s\n' "$$" > "$device_lock_dir/pid"
  printf '%s\n' "$label" > "$device_lock_dir/label"
  date '+%Y-%m-%d %H:%M:%S' > "$device_lock_dir/since"
}

device_lock_release() {
  # Only the owner removes the lock.
  if [[ "$(cat "$device_lock_dir/pid" 2>/dev/null || true)" == "$$" ]]; then
    rm -rf "$device_lock_dir"
  fi
}

device_lock_run() {
  local label="$1"
  shift
  device_lock_acquire "$label" || return $?
  trap device_lock_release EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  local status=0
  "$@" || status=$?
  return "$status"
}
