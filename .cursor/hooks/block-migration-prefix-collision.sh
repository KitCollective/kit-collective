#!/usr/bin/env bash
# Factory ratchet (KIT-125): deny git add/commit of packages/db/migrations/NNNN_*.sql
# when origin/development already has a different file with that prefix.
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

if ! printf '%s' "$COMMAND" | grep -qE 'packages/db/migrations/[0-9]{4}_'; then
  allow
fi

PREFIX=$(printf '%s' "$COMMAND" | grep -oE 'packages/db/migrations/[0-9]{4}_' | head -1 | grep -oE '[0-9]{4}' || true)
[ -z "${PREFIX}" ] && allow

if ! git rev-parse --verify origin/development >/dev/null 2>&1; then
  allow
fi

BASE=$(git ls-tree -r --name-only origin/development -- packages/db/migrations 2>/dev/null | grep -E "^packages/db/migrations/${PREFIX}_" || true)
[ -z "${BASE}" ] && allow

ADDED=$(printf '%s' "$COMMAND" | grep -oE "packages/db/migrations/${PREFIX}_[^[:space:]]+\.sql" | head -1 || true)
if [ -n "${ADDED}" ] && [ "${ADDED}" = "${BASE}" ]; then
  allow
fi

deny "BLOCKED: migration prefix ${PREFIX} already exists on origin/development (${BASE}). Take the next prefix from git ls-tree origin/development -- packages/db/migrations and update _journal.json."
