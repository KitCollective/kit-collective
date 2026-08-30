#!/usr/bin/env bash
# Factory ratchet (KIT-125): deny git add/commit of packages/db/migrations/NNNN_*.sql
# when origin/development already has a different file with that prefix.
# Also scans the worktree when the command only names the migrations directory.
# Stdin: Cursor hook JSON. Stdout: {"permission":"allow"|"deny"}. Exit 2 = deny.

set -u

allow() { printf '%s\n' '{"permission":"allow"}'; exit 0; }
deny() {
  printf '%s\n' "{\"permission\":\"deny\",\"user_message\":\"$1\",\"agent_message\":\"$1\"}"
  exit 2
}

INPUT=$(cat || true)
COMMAND=$(printf '%s' "$INPUT" | node -e '
let d = "";
process.stdin.on("data", (c) => { d += c; });
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(d);
    process.stdout.write(String(j.command ?? j.tool_input?.command ?? ""));
  } catch {
    process.stdout.write("");
  }
});
' 2>/dev/null || true)

[ -z "${COMMAND}" ] && allow

if ! printf '%s' "$COMMAND" | grep -qE 'git[[:space:]]+(add|commit)\b'; then
  allow
fi

if ! printf '%s' "$COMMAND" | grep -qE 'packages/db/migrations'; then
  allow
fi

if ! git rev-parse --verify origin/development >/dev/null 2>&1; then
  allow
fi

CANDIDATES=$(printf '%s' "$COMMAND" | grep -oE 'packages/db/migrations/[0-9]{4}_[^[:space:]]+\.sql' || true)
if [ -z "${CANDIDATES}" ]; then
  CANDIDATES=$(git ls-files -co --exclude-standard -- packages/db/migrations 2>/dev/null | grep -E '^packages/db/migrations/[0-9]{4}_.+\.sql$' || true)
fi
[ -z "${CANDIDATES}" ] && allow

BASE_LIST=$(git ls-tree -r --name-only origin/development -- packages/db/migrations 2>/dev/null || true)

while IFS= read -r ADDED; do
  [ -z "${ADDED}" ] && continue
  PREFIX=$(printf '%s' "$ADDED" | grep -oE '[0-9]{4}' | head -1 || true)
  [ -z "${PREFIX}" ] && continue
  BASE=$(printf '%s' "$BASE_LIST" | grep -E "^packages/db/migrations/${PREFIX}_" | head -1 || true)
  [ -z "${BASE}" ] && continue
  if [ "${ADDED}" = "${BASE}" ]; then
    continue
  fi
  deny "BLOCKED: migration prefix ${PREFIX} already exists on origin/development (${BASE}). Take the next prefix from git ls-tree origin/development -- packages/db/migrations, update _journal.json, and commit."
done <<EOF
${CANDIDATES}
EOF

allow
