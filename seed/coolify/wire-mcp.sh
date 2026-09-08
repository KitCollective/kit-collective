#!/usr/bin/env bash
# Create or update the 24/7 Seed MCP HTTP Coolify application (not a one-shot compose job).
# Idempotent. Default lane is development. Production is refused.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_NAME="${SEED_COOLIFY_APP_NAME:-seed-mcp}"
LANE="${SEED_LANE:-development}"
GIT_REPOSITORY="${GIT_REPOSITORY:-KitCollective/kit-collective}"
GIT_REF="${GIT_REF:-$LANE}"

if [[ "$LANE" == "production" ]]; then
  echo "wire-mcp: production is refused (Seed MCP wires development by default; staging when named)" >&2
  exit 1
fi

if [[ "$LANE" != "development" && "$LANE" != "staging" ]]; then
  echo "wire-mcp: unknown lane ${LANE}" >&2
  exit 1
fi

for name in COOLIFY_API_URL COOLIFY_API_TOKEN DATABASE_URL; do
  if [[ -z "${!name:-}" ]]; then
    echo "wire-mcp: missing required env ${name}" >&2
    exit 1
  fi
done

if [[ -z "${SEED_MCP_TOKEN:-}" ]]; then
  echo "wire-mcp: missing required env SEED_MCP_TOKEN" >&2
  exit 1
fi

require_sslmode() {
  local url="$1"
  if [[ -z "$url" ]]; then
    printf '%s' "$url"
    return
  fi
  if [[ "$url" != *"sslmode="* ]]; then
    if [[ "$url" == *"?"* ]]; then
      url="${url}&sslmode=require"
    else
      url="${url}?sslmode=require"
    fi
  fi
  # node-pg treats sslmode=require as verify-full; CX33 Postgres is not a public CA.
  if [[ "$url" != *"uselibpqcompat="* ]]; then
    url="${url}&uselibpqcompat=true"
  fi
  printf '%s' "$url"
}

DATABASE_URL="$(require_sslmode "$DATABASE_URL")"
if [[ -n "${SEED_STAGING_DATABASE_URL:-}" ]]; then
  SEED_STAGING_DATABASE_URL="$(require_sslmode "$SEED_STAGING_DATABASE_URL")"
fi

if [[ ! -f "$ROOT/seed/coolify/Dockerfile" ]]; then
  echo "wire-mcp: missing seed/coolify/Dockerfile" >&2
  exit 1
fi

# Ingest token for the Seed MCP process. Never copy the Coolify API token into app env.
INGEST_TOKEN="$SEED_MCP_TOKEN"

if [[ -z "${FKAPI_BASE_URL:-}" ]]; then
  SEED_FK_FETCH="${SEED_FK_FETCH:-fixture}"
fi

API="${COOLIFY_API_URL%/}/api/v1"
AUTH=(-H "Authorization: Bearer ${COOLIFY_API_TOKEN}" -H "Content-Type: application/json")

request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" "${API}${path}" "${AUTH[@]}" -d "$body"
  else
    curl -fsS -X "$method" "${API}${path}" "${AUTH[@]}"
  fi
}

PROJECT_UUID="$(request GET /projects | jq -r '.[] | select(.name=="KitCollective") | .uuid' | head -1)"
if [[ -z "$PROJECT_UUID" || "$PROJECT_UUID" == "null" ]]; then
  echo "wire-mcp: Coolify project KitCollective not found" >&2
  exit 1
fi

ENV_UUID="$(request GET "/projects/${PROJECT_UUID}/environments" | jq -r --arg lane "$LANE" '.[] | select(.name==$lane) | .uuid' | head -1)"
if [[ -z "$ENV_UUID" || "$ENV_UUID" == "null" ]]; then
  echo "wire-mcp: Coolify environment ${LANE} not found" >&2
  exit 1
fi

SERVER_UUID="$(request GET /servers | jq -r '.[0].uuid')"
if [[ -z "$SERVER_UUID" || "$SERVER_UUID" == "null" ]]; then
  echo "wire-mcp: no Coolify server registered" >&2
  exit 1
fi

# Look up by application name (not git repo + branch — kit-api already uses that pair).
APP_UUID="$(request GET /applications | jq -r --arg name "$APP_NAME" --arg lane "$LANE" '
  ([.[] | select(.name==$name and .git_branch==$lane) | .uuid] | first)
  // ([.[] | select(.name==$name) | .uuid] | first)
  // empty')"

CREATE_BASE="$(jq -n \
  --arg project_uuid "$PROJECT_UUID" \
  --arg server_uuid "$SERVER_UUID" \
  --arg environment_name "$LANE" \
  --arg environment_uuid "$ENV_UUID" \
  --arg git_repository "https://github.com/${GIT_REPOSITORY#https://github.com/}" \
  --arg git_branch "$GIT_REF" \
  --arg name "$APP_NAME" \
  --arg description "Seed MCP HTTP (${LANE})" \
  '{
    project_uuid: $project_uuid,
    server_uuid: $server_uuid,
    environment_name: $environment_name,
    environment_uuid: $environment_uuid,
    git_repository: $git_repository,
    git_branch: $git_branch,
    build_pack: "dockerfile",
    base_directory: "/",
    dockerfile_location: "/seed/coolify/Dockerfile.remote",
    ports_exposes: "8787",
    name: $name,
    description: $description,
    health_check_enabled: true,
    health_check_path: "/mcp",
    health_check_port: "8787",
    health_check_method: "GET",
    health_check_return_code: 401,
    health_check_start_period: 60,
    is_force_https_enabled: false,
    instant_deploy: false
  }')"

if [[ -z "$APP_UUID" || "$APP_UUID" == "null" ]]; then
  GH_APP_UUID="$(request GET /github-apps | jq -r '.[] | select(.installation_id != null) | .uuid' | head -1)"
  if [[ -n "$GH_APP_UUID" && "$GH_APP_UUID" != "null" ]]; then
    CREATE_BODY="$(echo "$CREATE_BASE" | jq --arg github_app_uuid "$GH_APP_UUID" '. + {github_app_uuid: $github_app_uuid}')"
    APP_JSON="$(request POST /applications/private-github-app "$CREATE_BODY")"
  else
    APP_JSON="$(request POST /applications/public "$CREATE_BASE")"
  fi
  APP_UUID="$(echo "$APP_JSON" | jq -r '.uuid')"
  echo "wire-mcp: created application ${APP_UUID}"
else
  echo "wire-mcp: found existing application ${APP_UUID}"
fi

request PATCH "/applications/${APP_UUID}" "$(jq -n '{
  health_check_enabled: true,
  health_check_path: "/mcp",
  health_check_port: "8787",
  health_check_method: "GET",
  health_check_return_code: 401,
  health_check_start_period: 60,
  base_directory: "/",
  dockerfile_location: "/seed/coolify/Dockerfile.remote",
  ports_exposes: "8787"
}')" >/dev/null

# Dockerfile.remote is the fallback when Coolify cannot use the git-connected Dockerfile
# (compose jobs). Git-connected applications keep dockerfile_location above.

BULK_ENVS="$(jq -n \
  --arg ingest_token "$INGEST_TOKEN" \
  --arg database_url "$DATABASE_URL" \
  --arg staging_url "${SEED_STAGING_DATABASE_URL:-}" \
  --arg proxy_url "${SEED_PROXY_URL:-}" \
  --arg require_proxy "${SEED_REQUIRE_PROXY:-true}" \
  --arg apify_token "${APIFY_TOKEN:-}" \
  --arg fkapi_base "${FKAPI_BASE_URL:-}" \
  --arg fkapi_token "${FKAPI_TOKEN:-}" \
  --arg fk_fetch "${SEED_FK_FETCH:-fixture}" \
  --arg r2_account "${R2_ACCOUNT_ID:-}" \
  --arg r2_access "${R2_ACCESS_KEY_ID:-}" \
  --arg r2_secret "${R2_SECRET_ACCESS_KEY:-}" \
  --arg r2_bucket "${R2_BUCKET:-}" \
  --arg r2_endpoint "${R2_ENDPOINT:-}" \
  --arg git_ref "$GIT_REF" \
  --arg git_repository "https://github.com/${GIT_REPOSITORY#https://github.com/}" \
  '{
    data: [
      {key: "PORT", value: "8787", is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
      {key: "SEED_MCP_TOKEN", value: $ingest_token, is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
      {key: "SEED_FK_FETCH", value: $fk_fetch, is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
      {key: "DATABASE_URL", value: $database_url, is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
      {key: "SEED_STAGING_DATABASE_URL", value: $staging_url, is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
      {key: "SEED_PROXY_URL", value: $proxy_url, is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
      {key: "SEED_REQUIRE_PROXY", value: $require_proxy, is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
      {key: "APIFY_TOKEN", value: $apify_token, is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
      {key: "FKAPI_BASE_URL", value: $fkapi_base, is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
      {key: "FKAPI_TOKEN", value: $fkapi_token, is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
      {key: "R2_ACCOUNT_ID", value: $r2_account, is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
      {key: "R2_ACCESS_KEY_ID", value: $r2_access, is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
      {key: "R2_SECRET_ACCESS_KEY", value: $r2_secret, is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
      {key: "R2_BUCKET", value: $r2_bucket, is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
      {key: "R2_ENDPOINT", value: $r2_endpoint, is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
      {key: "GIT_REF", value: $git_ref, is_literal: true, is_preview: false, is_runtime: false, is_buildtime: true},
      {key: "GIT_REPOSITORY", value: $git_repository, is_literal: true, is_preview: false, is_runtime: false, is_buildtime: true}
    ]
  }')"

if ! request PATCH "/applications/${APP_UUID}/envs/bulk" "$BULK_ENVS" >/dev/null; then
  echo "$BULK_ENVS" | jq -c '.data[]' | while read -r env_row; do
    request POST "/applications/${APP_UUID}/envs" "$env_row" >/dev/null || true
  done
fi

request POST "/applications/${APP_UUID}/start" >/dev/null || true

APP_DETAILS="$(request GET "/applications/${APP_UUID}")"
FQDN="$(echo "$APP_DETAILS" | jq -r '.fqdn // empty' | sed -E 's#^https?://##' | cut -d',' -f1 | tr -d '[:space:]')"

echo "app_uuid=${APP_UUID}"
echo "fqdn=${FQDN:-pending}"
echo "wire-mcp: application ${APP_UUID} on ${LANE} (24/7 HTTP, path /mcp)"
if [[ -n "$FQDN" ]]; then
  echo "Set SEED_MCP_URL to https://${FQDN}/mcp (or http://${FQDN}/mcp if TLS is off)."
  echo "Do not commit that value."
else
  echo "FQDN pending — copy it from the Coolify application after the first deploy, then set SEED_MCP_URL to https-or-http://{fqdn}/mcp."
fi
