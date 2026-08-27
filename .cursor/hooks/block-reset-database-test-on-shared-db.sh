#!/usr/bin/env bash
# Factory ratchet (KIT-73): deny test runs that would call resetDatabase while
# DATABASE_URL points at the shared development Postgres on Cloud Agent VMs.
# Stdin: Cursor hook JSON. Stdout: {"permission":"allow"|"deny"}.

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

# Packages / paths whose tests call resetDatabase (@kit/db, @kit/api, @kit/seed-apify).
if ! printf '%s' "$COMMAND" | grep -qE '@kit/db|packages/db|@kit/api|apps/api|@kit/seed-apify|seed/apify'; then
  allow
fi
if ! printf '%s' "$COMMAND" | grep -qE '[[:space:]]test([[:space:]]|$)|vitest[[:space:]]+run'; then
  allow
fi

is_test_db_url() {
  node -e '
const url = process.argv[1] ?? "";
try {
  const u = new URL(url.replace(/^postgres:/, "postgresql:"));
  const host = (u.hostname || "").toLowerCase();
  const db = (u.pathname || "").replace(/^\//, "").toLowerCase();
  const testish =
    host === "localhost" ||
    host === "127.0.0.1" ||
    db.includes("test") ||
    db.endsWith("_test");
  process.stdout.write(testish ? "yes" : "no");
} catch {
  process.stdout.write("no");
}
' "$1" 2>/dev/null || echo "no"
}

DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ]; then
  allow
fi

if [ "$(is_test_db_url "$DB_URL")" = "no" ]; then
  deny "BLOCKED: tests that call resetDatabase must not run while DATABASE_URL points at the shared development Postgres. Use localhost/*test* (e.g. kit_test) or run tests only in CI."
fi

allow
