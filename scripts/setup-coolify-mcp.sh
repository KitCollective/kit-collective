#!/usr/bin/env bash
# Generate .cursor/mcp.json from the committed example when Cloud Agent secrets exist.
# Idempotent — safe to run on every environment install.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE="${ROOT}/.cursor/mcp.json.example"
TARGET="${ROOT}/.cursor/mcp.json"

if [[ ! -f "${EXAMPLE}" ]]; then
  echo "setup-coolify-mcp: missing ${EXAMPLE}" >&2
  exit 0
fi

if [[ -z "${COOLIFY_MCP_URL:-}" && -n "${COOLIFY_API_URL:-}" ]]; then
  COOLIFY_MCP_URL="${COOLIFY_API_URL%/}/mcp"
  export COOLIFY_MCP_URL
fi

if [[ -z "${COOLIFY_MCP_URL:-}" || -z "${COOLIFY_API_TOKEN:-}" ]]; then
  echo "setup-coolify-mcp: COOLIFY_MCP_URL (or COOLIFY_API_URL) and COOLIFY_API_TOKEN not set — skipping mcp.json"
  exit 0
fi

mkdir -p "${ROOT}/.cursor"
cp "${EXAMPLE}" "${TARGET}"
echo "setup-coolify-mcp: wrote ${TARGET} from example (secrets from environment only)"
