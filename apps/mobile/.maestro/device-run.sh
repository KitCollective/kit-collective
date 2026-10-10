#!/usr/bin/env bash
# The one command an issue session runs for device evidence (ADR-0049):
# waits its turn in the Device flows queue, starts the local API, installs the
# app (cached native binary plus this commit's JavaScript), runs the slice's
# flow and publishes the evidence, then stops the API and lets the next in.
#
#   apps/mobile/.maestro/device-run.sh                 the slice flow of this branch's issue
#   E2E_FLOWS=regression apps/mobile/.maestro/device-run.sh   the five regression flows
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=device-lock.sh
source "$here/device-lock.sh"
if [[ "${E2E_LOCK_HELD:-}" != 1 ]]; then
  device_lock_run "$(git -C "$here" branch --show-current) $(git -C "$here" rev-parse --short HEAD)" \
    env E2E_LOCK_HELD=1 "$0" "$@"
  exit $?
fi

# run-evidence.sh clears out/, so the log lives with the stamps.
mkdir -p "$here/.stamps"
api_log="$here/.stamps/local-api.log"
"$here/local-api.sh" > "$api_log" 2>&1 &
api_pid=$!
stop_api() {
  kill "$api_pid" 2>/dev/null || true
  # `pnpm start` leaves the Node server as a child of the shell that was killed.
  lsof -ti tcp:3000 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
}
trap stop_api EXIT

echo "Waiting for the local API (log: $api_log)"
ready=no
for _ in $(seq 1 180); do
  if curl -fsS http://localhost:3000/v1/health >/dev/null 2>&1; then
    ready=yes
    break
  fi
  if ! kill -0 "$api_pid" 2>/dev/null; then
    break
  fi
  sleep 2
done
if [[ "$ready" != yes ]]; then
  echo "The local API did not become healthy; last log lines:" >&2
  tail -20 "$api_log" >&2
  exit 1
fi

"$here/build-local.sh"
"$here/run-evidence.sh" "$@"
