#!/usr/bin/env bash
# Generate .cursor/mcp.json from environment secrets when present.
# Idempotent — safe to run on every environment install.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${ROOT}/.cursor/mcp.json"

if [[ -z "${COOLIFY_MCP_URL:-}" && -n "${COOLIFY_API_URL:-}" ]]; then
  COOLIFY_MCP_URL="${COOLIFY_API_URL%/}/mcp"
  export COOLIFY_MCP_URL
fi

if [[ -z "${COOLIFY_MCP_URL:-}" || -z "${COOLIFY_API_TOKEN:-}" ]]; then
  echo "setup-coolify-mcp: COOLIFY_MCP_URL (or COOLIFY_API_URL) and COOLIFY_API_TOKEN not set — skipping mcp.json"
  exit 0
fi

mkdir -p "${ROOT}/.cursor"

# Write literal URL/token for IDE/local use. Cloud Agents also need the same server
# registered under Dashboard → Integrations & MCP (repo mcp.json alone is not enough).
jq -n \
  --arg url "$COOLIFY_MCP_URL" \
  --arg token "$COOLIFY_API_TOKEN" \
  '{
    mcpServers: {
      coolify: {
        url: $url,
        headers: { Authorization: ("Bearer " + $token) }
      },
      kc_seed_mcp: {
        command: "node",
        args: ["seed/mcp/dist/index.js"],
        env: {
          SEED_REPO_ROOT: "${workspaceFolder}",
          DATABASE_URL: "${env:DATABASE_URL}",
          SEED_STAGING_DATABASE_URL: "${env:SEED_STAGING_DATABASE_URL}",
          SEED_PROXY_URL: "${env:SEED_PROXY_URL}",
          SEED_REQUIRE_PROXY: "${env:SEED_REQUIRE_PROXY}",
          APIFY_TOKEN: "${env:APIFY_TOKEN}",
          FKAPI_BASE_URL: "${env:FKAPI_BASE_URL}",
          FKAPI_TOKEN: "${env:FKAPI_TOKEN}",
          R2_ACCOUNT_ID: "${env:R2_ACCOUNT_ID}",
          R2_ACCESS_KEY_ID: "${env:R2_ACCESS_KEY_ID}",
          R2_SECRET_ACCESS_KEY: "${env:R2_SECRET_ACCESS_KEY}",
          R2_BUCKET: "${env:R2_BUCKET}",
          R2_ENDPOINT: "${env:R2_ENDPOINT}"
        }
      }
    }
  }' > "${TARGET}"

echo "setup-coolify-mcp: wrote ${TARGET} (Coolify URL resolved; token from environment only)"
