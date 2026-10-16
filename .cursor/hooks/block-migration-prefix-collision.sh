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

# Bash variables cannot hold NUL, so both git lists are read NUL-separated (-z) into arrays:
# without -z git quotes a non-ASCII name ("9999_\303\246ble.sql") and it never matches.
# Plain `bash` may be 3.2 (macOS): no mapfile, and an empty array is never expanded under set -u.
MIGRATION_RE='^packages/db/migrations/([0-9]{4})_.+\.sql$'

CANDIDATES=()
while IFS= read -r NAMED; do
  [ -n "${NAMED}" ] && CANDIDATES+=("${NAMED}")
done < <(printf '%s' "$COMMAND" | grep -oE 'packages/db/migrations/[0-9]{4}_[^[:space:]]+\.sql' || true)

if [ "${#CANDIDATES[@]}" -eq 0 ]; then
  while IFS= read -r -d '' FILE; do
    [[ $FILE =~ $MIGRATION_RE ]] && CANDIDATES+=("${FILE}")
  done < <(git ls-files -z -co --exclude-standard -- packages/db/migrations 2>/dev/null || true)
fi
[ "${#CANDIDATES[@]}" -eq 0 ] && allow

BASE_LIST=()
while IFS= read -r -d '' FILE; do
  BASE_LIST+=("${FILE}")
done < <(git ls-tree -r -z --name-only origin/development -- packages/db/migrations 2>/dev/null || true)
[ "${#BASE_LIST[@]}" -eq 0 ] && allow

for ADDED in "${CANDIDATES[@]}"; do
  [[ $ADDED =~ $MIGRATION_RE ]] || continue
  PREFIX="${BASH_REMATCH[1]}"
  for BASE in "${BASE_LIST[@]}"; do
    [[ $BASE == "packages/db/migrations/${PREFIX}_"* ]] || continue
    # Only the first lane file with this prefix counts, as before.
    [ "${ADDED}" = "${BASE}" ] && break
    deny "BLOCKED: migration prefix ${PREFIX} already exists on origin/development (${BASE}). Take the next prefix from git ls-tree origin/development -- packages/db/migrations, update _journal.json, and commit."
  done
done

allow
