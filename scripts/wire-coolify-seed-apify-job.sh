#!/usr/bin/env bash
# Create or update the Apify seed one-shot job on Coolify (development lane).
# Idempotent — safe to re-run from Cloud Agents or GitHub Actions.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="${SEED_COOLIFY_SERVICE_NAME:-seed-apify-job}"
LANE="${SEED_LANE:-development}"
GIT_REPOSITORY="${GIT_REPOSITORY:-https://github.com/KitCollective/kit-collective.git}"
GIT_REF="${GIT_REF:-development}"

for name in COOLIFY_API_URL COOLIFY_API_TOKEN DATABASE_URL SEED_PROXY_URL; do
  if [[ -z "${!name:-}" ]]; then
    echo "wire-coolify-seed-apify-job: missing required env ${name}" >&2
    exit 1
  fi
done

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
  echo "wire-coolify-seed-apify-job: Coolify project KitCollective not found" >&2
  exit 1
fi

ENV_UUID="$(request GET "/projects/${PROJECT_UUID}/environments" | jq -r --arg lane "$LANE" '.[] | select(.name==$lane) | .uuid' | head -1)"
if [[ -z "$ENV_UUID" || "$ENV_UUID" == "null" ]]; then
  echo "wire-coolify-seed-apify-job: Coolify environment ${LANE} not found" >&2
  exit 1
fi

SERVER_UUID="$(request GET /servers | jq -r '.[0].uuid')"
DEST_UUID="$(request GET /destinations | jq -r '.[0].uuid')"

# Image is built from seed/coolify/Dockerfile.remote at deploy time (inline compose build);
# the running container only executes the prebuilt Kader CLI (no pnpm install or tsc).
DOCKERFILE_INLINE="$(<"$ROOT/seed/coolify/Dockerfile.remote")"
COMPOSE_BODY="$(jq -n \
  --arg seed_lane "$LANE" \
  --arg git_repository "$GIT_REPOSITORY" \
  --arg git_ref "$GIT_REF" \
  --arg dockerfile_inline "$DOCKERFILE_INLINE" \
  '{
  services: {
    "seed-apify-job": {
      build: {
        context: ".",
        dockerfile_inline: $dockerfile_inline,
        args: {
          GIT_REPOSITORY: $git_repository,
          GIT_REF: $git_ref
        }
      },
      image: "kit-collective-seed:latest",
      restart: "no",
      mem_limit: "512m",
      environment: {
        SEED_LANE: $seed_lane,
        DATABASE_URL: "${DATABASE_URL}",
        SEED_PROXY_URL: "${SEED_PROXY_URL}",
        SEED_REQUIRE_PROXY: "true",
        APIFY_TOKEN: "${APIFY_TOKEN:-}",
        SEED_COMPETITION: "${SEED_COMPETITION}",
        SEED_FROM_SEASON: "${SEED_FROM_SEASON}",
        SEED_TO_SEASON: "${SEED_TO_SEASON}"
      },
      command: [
        "node",
        "seed/apify/dist/cli.js",
        "${SEED_COMPETITION}",
        "${SEED_FROM_SEASON}",
        "${SEED_TO_SEASON}",
        $seed_lane
      ]
    }
  }
}')"

COMPOSE_B64="$(printf '%s' "$COMPOSE_BODY" | base64 -w 0)"

SERVICE_UUID="$(request GET /services | jq -r --arg name "$SERVICE_NAME" '.[] | select(.name==$name) | .uuid' | head -1)"

CREATE_PAYLOAD="$(jq -n \
  --arg project_uuid "$PROJECT_UUID" \
  --arg environment_name "$LANE" \
  --arg environment_uuid "$ENV_UUID" \
  --arg server_uuid "$SERVER_UUID" \
  --arg destination_uuid "$DEST_UUID" \
  --arg name "$SERVICE_NAME" \
  --arg description "Apify/Transfermarkt seed one-shot job (${LANE})" \
  --arg docker_compose_raw "$COMPOSE_B64" \
  --arg git_repository "$GIT_REPOSITORY" \
  --arg git_ref "$GIT_REF" \
  '{
    project_uuid: $project_uuid,
    environment_name: $environment_name,
    environment_uuid: $environment_uuid,
    server_uuid: $server_uuid,
    destination_uuid: $destination_uuid,
    name: $name,
    description: $description,
    docker_compose_raw: $docker_compose_raw,
    instant_deploy: true,
    is_container_label_escape_enabled: false
  }')"

if [[ -z "$SERVICE_UUID" || "$SERVICE_UUID" == "null" ]]; then
  SERVICE_JSON="$(request POST /services "$CREATE_PAYLOAD")"
  SERVICE_UUID="$(echo "$SERVICE_JSON" | jq -r '.uuid')"
  echo "wire-coolify-seed-apify-job: created service ${SERVICE_UUID}"
else
  request PATCH "/services/${SERVICE_UUID}" "$(echo "$CREATE_PAYLOAD" | jq '{docker_compose_raw, instant_deploy, is_container_label_escape_enabled}')" >/dev/null
  echo "wire-coolify-seed-apify-job: updated service ${SERVICE_UUID}"
fi

BULK_ENVS="$(jq -n \
  --arg database_url "$DATABASE_URL" \
  --arg proxy_url "$SEED_PROXY_URL" \
  --arg apify_token "${APIFY_TOKEN:-}" \
  --arg seed_lane "$LANE" \
  --arg competition "${SEED_COMPETITION:-superligaen}" \
  --arg from_season "${SEED_FROM_SEASON:-2014/15}" \
  --arg to_season "${SEED_TO_SEASON:-2015/16}" \
  '{
    data: [
      {key: "DATABASE_URL", value: $database_url, is_literal: true, is_preview: false},
      {key: "SEED_PROXY_URL", value: $proxy_url, is_literal: true, is_preview: false},
      {key: "SEED_REQUIRE_PROXY", value: "true", is_literal: true, is_preview: false},
      {key: "APIFY_TOKEN", value: $apify_token, is_literal: true, is_preview: false},
      {key: "SEED_LANE", value: $seed_lane, is_literal: true, is_preview: false},
      {key: "SEED_COMPETITION", value: $competition, is_literal: true, is_preview: false},
      {key: "SEED_FROM_SEASON", value: $from_season, is_literal: true, is_preview: false},
      {key: "SEED_TO_SEASON", value: $to_season, is_literal: true, is_preview: false}
    ]
  }')"

request PATCH "/services/${SERVICE_UUID}/envs/bulk" "$BULK_ENVS" >/dev/null

echo "service_uuid=${SERVICE_UUID}"
echo "wire-coolify-seed-apify-job: service ${SERVICE_UUID} on ${LANE} (one-shot, resource-limited)"
echo "wire-coolify-seed-apify-job: start the run via Coolify MCP control (not REST start):"
echo "  bash seed/coolify/start-apify-job.sh ${SERVICE_UUID} start"
