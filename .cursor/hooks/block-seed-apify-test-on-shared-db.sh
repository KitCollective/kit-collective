#!/usr/bin/env bash
# Factory ratchet (KIT-34 round 6): deny @kit/seed-apify test runs that would call
# resetDatabase against the shared development DATABASE_URL on Cloud Agent VMs.
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

# Only gate seed-apify test invocations (vitest / pnpm filter test).
if ! printf '%s' "$COMMAND" | grep -qE '@kit/seed-apify|seed/apify.*vitest|seed-apify.*test'; then
  allow
fi
if ! printf '%s' "$COMMAND" | grep -qE '[[:space:]]test([[:space:]]|$)|vitest[[:space:]]+run'; then
  allow
fi

is_test_db() {
  node -e '
const url = process.argv[1] ?? "";
try {
  const u = new URL(url.replace(/^postgres:/, "postgresql:"));
  const host = (u.hostname || "").toLowerCase();
  const db = (u.pathname || "").replace(/^\//, "").toLowerCase();
  const testish =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local") ||
    db.includes("test") ||
    db === "kit_test";
  process.stdout.write(testish ? "yes" : "no");
} catch {
  process.stdout.write("no");
}
' "$1" 2>/dev/null || echo "no"
}

DB_URL="${DATABASE_URL:-}"
if [ -n "$DB_URL" ]; then
  if [ "$(is_test_db "$DB_URL")" = "no" ]; then
    TEST_URL="${SEED_APIFY_TEST_DATABASE_URL:-}"
    if [ -z "$TEST_URL" ] || [ "$(is_test_db "$TEST_URL")" = "no" ]; then
      deny "BLOCKED: @kit/seed-apify tests must not run while DATABASE_URL points at the shared development Postgres. Set SEED_APIFY_TEST_DATABASE_URL to a disposable test database (localhost/*test*) or run tests only in CI."
    fi
  fi
fi

allow
