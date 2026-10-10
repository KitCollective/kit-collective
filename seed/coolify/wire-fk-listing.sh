#!/usr/bin/env bash
# Create or update the 24/7 FK listing HTTP Coolify application (not a one-shot compose job).
# Idempotent. Default lane is development. Production is refused.
# Coolify API credentials stay on this script — never copied into the listing process.
# Do not inject SEED_PROXY_URL (Decodo is Transfermarkt-only).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_NAME="${SEED_COOLIFY_APP_NAME:-seed-fk-listing}"
LANE="${SEED_LANE:-development}"
GIT_REPOSITORY="${GIT_REPOSITORY:-KitCollective/kit-collective}"
GIT_REF="${GIT_REF:-$LANE}"
# Coolify stores limits_memory in bytes (a raw 2048 was treated as 2KiB on KIT-148).
# POST /applications/public validates the field as a string of those bytes.
LIMITS_MEMORY_BYTES="${SEED_COOLIFY_LIMITS_MEMORY_BYTES:-536870912}"

if [[ "$LANE" == "production" ]]; then
  echo "wire-fk-listing: production is refused (FK listing wires development by default; staging when named)" >&2
  exit 1
fi

if [[ "$LANE" != "development" && "$LANE" != "staging" ]]; then
  echo "wire-fk-listing: unknown lane ${LANE}" >&2
  exit 1
fi

for name in COOLIFY_API_URL COOLIFY_API_TOKEN; do
  if [[ -z "${!name:-}" ]]; then
    echo "wire-fk-listing: missing required env ${name}" >&2
    exit 1
  fi
done

if [[ ! -f "$ROOT/seed/coolify/Dockerfile.fk-listing" ]]; then
  echo "wire-fk-listing: missing seed/coolify/Dockerfile.fk-listing" >&2
  exit 1
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
  echo "wire-fk-listing: Coolify project KitCollective not found" >&2
  exit 1
fi

ENV_UUID="$(request GET "/projects/${PROJECT_UUID}/environments" | jq -r --arg lane "$LANE" '.[] | select(.name==$lane) | .uuid' | head -1)"
if [[ -z "$ENV_UUID" || "$ENV_UUID" == "null" ]]; then
  echo "wire-fk-listing: Coolify environment ${LANE} not found" >&2
  exit 1
fi

SERVER_UUID="$(request GET /servers | jq -r '.[0].uuid')"
if [[ -z "$SERVER_UUID" || "$SERVER_UUID" == "null" ]]; then
  echo "wire-fk-listing: no Coolify server registered" >&2
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
  --arg description "FK listing HTTP (${LANE})" \
  --arg limits_memory "$LIMITS_MEMORY_BYTES" \
  '{
    project_uuid: $project_uuid,
    server_uuid: $server_uuid,
    environment_name: $environment_name,
    environment_uuid: $environment_uuid,
    git_repository: $git_repository,
    git_branch: $git_branch,
    build_pack: "dockerfile",
    base_directory: "/",
    dockerfile_location: "/seed/coolify/Dockerfile.fk-listing",
    ports_exposes: "8787",
    name: $name,
    description: $description,
    health_check_enabled: true,
    health_check_path: "/health",
    health_check_port: "8787",
    health_check_method: "GET",
    health_check_return_code: 200,
    health_check_start_period: 60,
    limits_memory: $limits_memory,
    is_force_https_enabled: false,
    instant_deploy: false
  }')"

if [[ -z "$APP_UUID" || "$APP_UUID" == "null" ]]; then
  APP_JSON="$(request POST /applications/public "$CREATE_BASE")"
  APP_UUID="$(echo "$APP_JSON" | jq -r '.uuid')"
  echo "wire-fk-listing: created application ${APP_UUID}"
else
  echo "wire-fk-listing: found existing application ${APP_UUID}"
fi

request PATCH "/applications/${APP_UUID}" "$(jq -n \
  --arg limits_memory "$LIMITS_MEMORY_BYTES" \
  '{
    health_check_enabled: true,
    health_check_path: "/health",
    health_check_port: "8787",
    health_check_method: "GET",
    health_check_return_code: 200,
    health_check_start_period: 60,
    base_directory: "/",
    dockerfile_location: "/seed/coolify/Dockerfile.fk-listing",
    ports_exposes: "8787",
    limits_memory: $limits_memory
  }')" >/dev/null

# Runtime: PORT only. Build-time: git clone args for Dockerfile.fk-listing.
# Never copy COOLIFY_* or SEED_PROXY_URL into the listing process.
BULK_ENVS="$(jq -n \
  --arg git_ref "$GIT_REF" \
  --arg git_repository "https://github.com/${GIT_REPOSITORY#https://github.com/}" \
  '{
    data: [
      {key: "PORT", value: "8787", is_literal: true, is_preview: false, is_runtime: true, is_buildtime: false},
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
echo "wire-fk-listing: application ${APP_UUID} on ${LANE} (24/7 HTTP, GET /health and GET /kits)"
if [[ -n "$FQDN" ]]; then
  echo "Set FKAPI_BASE_URL to http://${FQDN} with NO /kits suffix (Join calls {FKAPI_BASE_URL}/kits?...)."
  echo "Do not commit that value."
else
  echo "FQDN pending — copy it from the Coolify application after the first deploy, then set FKAPI_BASE_URL to http://{fqdn} with NO /kits suffix."
fi
