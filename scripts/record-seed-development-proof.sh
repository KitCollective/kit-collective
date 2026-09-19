#!/usr/bin/env bash
# Record seed development proof output (KIT-34 ratchet).
# Runs committed verify + MCP-path seed scripts against injected DATABASE_URL.
# Usage: record-seed-development-proof.sh <label> <competition> <fromSeason> <toSeason>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT}/seed/mcp/proof-output"
LABEL="${1:-}"
COMPETITION="${2:-}"
FROM_SEASON="${3:-}"
TO_SEASON="${4:-}"

if [[ -z "$LABEL" || -z "$COMPETITION" || -z "$FROM_SEASON" || -z "$TO_SEASON" ]]; then
  echo "usage: record-seed-development-proof.sh <label> <competition> <fromSeason> <toSeason>" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "record-seed-development-proof: DATABASE_URL is required" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
OUT="${OUT_DIR}/${LABEL}-${TS}.txt"
LATEST="${OUT_DIR}/latest.txt"

{
  echo "=== record-seed-development-proof ${LABEL} ${TS} ==="
  echo "competition=${COMPETITION} from=${FROM_SEASON} to=${TO_SEASON}"
  echo "=== baseline ${TS} ==="
  node "${ROOT}/seed/mcp/scripts/verify-development-db.mjs"
  echo "=== seed_apify first run ${TS} ==="
  node "${ROOT}/seed/mcp/scripts/run-seed-apify-mcp-path.mjs" "$COMPETITION" "$FROM_SEASON" "$TO_SEASON"
  echo "=== seed_apify skip run ${TS} ==="
  node "${ROOT}/seed/mcp/scripts/run-seed-apify-mcp-path.mjs" "$COMPETITION" "$FROM_SEASON" "$TO_SEASON"
  echo "=== post-seed verify ${TS} ==="
  node "${ROOT}/seed/mcp/scripts/verify-development-db.mjs"
} | tee "$OUT"

cp "$OUT" "$LATEST"
echo "record-seed-development-proof: wrote ${OUT} and ${LATEST}"
