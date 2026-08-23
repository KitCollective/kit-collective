#!/usr/bin/env bash
# Record seed_fk development proof output (KIT-35).
# Requires Club + Season rows from a prior seed_apify run for the same scope.
# Usage: record-seed-fk-development-proof.sh <label> <competition> <fromSeason> <toSeason>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT}/seed/mcp/proof-output"
LABEL="${1:-}"
COMPETITION="${2:-}"
FROM_SEASON="${3:-}"
TO_SEASON="${4:-}"

if [[ -z "$LABEL" || -z "$COMPETITION" || -z "$FROM_SEASON" || -z "$TO_SEASON" ]]; then
  echo "usage: record-seed-fk-development-proof.sh <label> <competition> <fromSeason> <toSeason>" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "record-seed-fk-development-proof: DATABASE_URL is required" >&2
  exit 1
fi

if [[ -z "${FKAPI_BASE_URL:-}" ]]; then
  echo "record-seed-fk-development-proof: FKAPI_BASE_URL is required (live FK fetch, not fixture JSON)" >&2
  exit 1
fi

for var in R2_ENDPOINT R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
  if [[ -z "${!var:-}" ]]; then
    echo "record-seed-fk-development-proof: ${var} is required for lane R2 archive bytes" >&2
    exit 1
  fi
done

mkdir -p "$OUT_DIR"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
OUT="${OUT_DIR}/${LABEL}-${TS}.txt"
LATEST="${OUT_DIR}/latest-fk.txt"

{
  echo "=== record-seed-fk-development-proof ${LABEL} ${TS} ==="
  echo "competition=${COMPETITION} from=${FROM_SEASON} to=${TO_SEASON}"
  echo "=== baseline catalog ${TS} ==="
  node "${ROOT}/seed/mcp/scripts/verify-dev-catalog.mjs"
  echo "=== seed_fk first run ${TS} ==="
  node "${ROOT}/seed/mcp/scripts/run-seed-fk-mcp-path.mjs" "$COMPETITION" "$FROM_SEASON" "$TO_SEASON"
  echo "=== seed_fk upsert run ${TS} ==="
  node "${ROOT}/seed/mcp/scripts/run-seed-fk-mcp-path.mjs" "$COMPETITION" "$FROM_SEASON" "$TO_SEASON"
  echo "=== post-seed_fk catalog ${TS} ==="
  node "${ROOT}/seed/mcp/scripts/verify-dev-catalog.mjs"
} | tee "$OUT"

cp "$OUT" "$LATEST"
echo "record-seed-fk-development-proof: wrote ${OUT} and ${LATEST}"
