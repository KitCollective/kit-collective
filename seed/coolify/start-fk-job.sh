#!/usr/bin/env bash
# Start the FK seed one-shot Coolify service via the Coolify MCP `control` tool.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE_UUID="${1:-${SEED_COOLIFY_FK_SERVICE_UUID:-}}"
ACTION="${2:-start}"

if [[ -z "$SERVICE_UUID" ]]; then
  echo "start-fk-job: pass service UUID or set SEED_COOLIFY_FK_SERVICE_UUID" >&2
  exit 1
fi

case "$ACTION" in
  start | stop | restart) ;;
  *)
    echo "start-fk-job: action must be start, stop, or restart" >&2
    exit 1
    ;;
esac

ARGS="$(jq -n \
  --arg resource service \
  --arg action "$ACTION" \
  --arg uuid "$SERVICE_UUID" \
  '{resource: $resource, action: $action, uuid: $uuid}')"

RESPONSE="$("${ROOT}/seed/coolify/mcp-call.sh" control "$ARGS")"

if echo "$RESPONSE" | jq -e '.result.isError == true' >/dev/null 2>&1; then
  echo "$RESPONSE" | jq -r '.result.content[0].text // .' >&2
  exit 1
fi

echo "$RESPONSE" | jq -r '.result.content[0].text // .result // .'
echo "coolify_mcp_tool=control action=${ACTION} service_uuid=${SERVICE_UUID}"
