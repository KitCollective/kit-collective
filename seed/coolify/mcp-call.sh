#!/usr/bin/env bash
# Invoke a Coolify MCP tool via Streamable HTTP JSON-RPC (not the Coolify REST API).
set -euo pipefail

TOOL="${1:?tool name required}"
ARGS="${2:-"{}"}"

if [[ -z "${COOLIFY_MCP_URL:-}" ]]; then
  if [[ -n "${COOLIFY_API_URL:-}" ]]; then
    COOLIFY_MCP_URL="${COOLIFY_API_URL%/}/mcp"
  else
    echo "mcp-call: COOLIFY_MCP_URL or COOLIFY_API_URL required" >&2
    exit 1
  fi
fi

if [[ -z "${COOLIFY_API_TOKEN:-}" ]]; then
  echo "mcp-call: COOLIFY_API_TOKEN required" >&2
  exit 1
fi

PAYLOAD="$(jq -n \
  --arg tool "$TOOL" \
  --argjson args "$ARGS" \
  '{jsonrpc: "2.0", id: 1, method: "tools/call", params: {name: $tool, arguments: $args}}')"

curl -fsS -X POST "${COOLIFY_MCP_URL}" \
  -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
