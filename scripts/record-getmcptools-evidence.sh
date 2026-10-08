#!/usr/bin/env bash
# Record in-session GetMcpTools evidence for ops MCP acceptance criteria.
# Usage: GetMcpTools output (JSON) piped on stdin, or pass --json-file path.
# Writes .cursor/getmcptools-evidence/<server>.json when the catalog lists the server.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_DIR="${ROOT}/.cursor/getmcptools-evidence"

usage() {
  echo "usage: record-getmcptools-evidence.sh <server> [--json-file path]" >&2
  exit 1
}

SERVER="${1:-}"
shift || usage

JSON_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json-file)
      JSON_FILE="${2:-}"
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

[[ -n "$SERVER" ]] || usage

if [[ -n "$JSON_FILE" ]]; then
  INPUT="$(cat "$JSON_FILE")"
else
  INPUT="$(cat)"
fi

if [[ -z "$INPUT" ]]; then
  echo "record-getmcptools-evidence: empty input — run GetMcpTools in this session first" >&2
  exit 1
fi

MATCHED="$(printf '%s' "$INPUT" | node -e '
const server = process.argv[1].toLowerCase();
let raw = "";
process.stdin.on("data", (c) => { raw += c; });
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(raw);
    const pattern = String(data.pattern ?? server).toLowerCase();
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const servers = matches.flatMap((m) => {
      if (typeof m === "string") return [m];
      if (m && typeof m === "object") {
        return [m.server, m.name, m.id].filter(Boolean);
      }
      return [];
    }).map((s) => String(s).toLowerCase());

    const hit =
      servers.some((s) => s.includes(server) || s.includes(pattern)) ||
      (data.mode === "search" && matches.length > 0 && pattern.includes(server));

    process.stdout.write(hit ? "yes" : "no");
  } catch {
    process.stdout.write("no");
  }
});
' "$SERVER")"

if [[ "$MATCHED" != "yes" ]]; then
  echo "record-getmcptools-evidence: catalog does not list server '${SERVER}' in this session" >&2
  exit 1
fi

mkdir -p "$EVIDENCE_DIR"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
OUT="${EVIDENCE_DIR}/${SERVER}.json"

node -e '
const fs = require("fs");
const [out, server, ts, raw] = process.argv.slice(1);
fs.writeFileSync(
  out,
  JSON.stringify({ server, recordedAt: ts, source: "GetMcpTools", input: JSON.parse(raw) }, null, 2) + "\n",
);
' "$OUT" "$SERVER" "$TS" "$INPUT"

echo "record-getmcptools-evidence: wrote ${OUT}"
