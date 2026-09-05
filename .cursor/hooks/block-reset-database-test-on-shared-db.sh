#!/usr/bin/env bash
# Factory ratchet (KIT-73, tightened KIT-211): deny test runs that would DROP /
# resetDatabase while DATABASE_URL points at the shared development Postgres.
# Unfiltered `pnpm test` is also gated — matching only @kit/db in the command
# string missed repo-root turbo graphs (KIT-211).
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

if ! printf '%s' "$COMMAND" | grep -qE '[[:space:]]test([[:space:]]|$)|vitest[[:space:]]+run|turbo[[:space:]]+run[[:space:]]+test|turbo[[:space:]]+test'; then
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
    host.endsWith(".local") ||
    db.includes("test") ||
    db.endsWith("_test") ||
    db === "kit_test";
  process.stdout.write(testish ? "yes" : "no");
} catch {
  process.stdout.write("no");
}
' "$1" 2>/dev/null || echo "no"
}

DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ] || [ "$(is_test_db_url "$DB_URL")" = "yes" ]; then
  allow
fi

# Lane DATABASE_URL is injected. Only allow if the command cannot reset lane
# Postgres, or a dedicated disposable test URL is set for the packages in play.

dedicated_ok() {
  local env_name="$1"
  local value="${!env_name:-}"
  [ -n "$value" ] && [ "$(is_test_db_url "$value")" = "yes" ]
}

mentions() {
  printf '%s' "$COMMAND" | grep -qE "$1"
}

unfiltered_repo_test=0
if printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])(pnpm|npm|yarn)[[:space:]]+(run[[:space:]]+)?test([[:space:]]|$)' \
  && ! printf '%s' "$COMMAND" | grep -qE -- '--filter'; then
  unfiltered_repo_test=1
fi
if printf '%s' "$COMMAND" | grep -qE 'turbo[[:space:]]+(run[[:space:]]+)?test' \
  && ! printf '%s' "$COMMAND" | grep -qE -- '--filter'; then
  unfiltered_repo_test=1
fi

needs_fkapi=0
needs_apify=0
needs_db=0
needs_api=0

if [ "$unfiltered_repo_test" = 1 ]; then
  needs_fkapi=1
  needs_apify=1
  needs_db=1
  needs_api=1
fi
if mentions '@kit/seed-fkapi|seed/fkapi'; then needs_fkapi=1; fi
if mentions '@kit/seed-apify|seed/apify'; then needs_apify=1; fi
if mentions '@kit/db|packages/db'; then needs_db=1; fi
if mentions '@kit/api([^a-zA-Z-]|$)|apps/api'; then needs_api=1; fi

if [ "$needs_fkapi$needs_apify$needs_db$needs_api" = "0000" ]; then
  allow
fi

if [ "$needs_fkapi" = 1 ] && ! dedicated_ok SEED_FKAPI_TEST_DATABASE_URL; then
  deny "BLOCKED: FK seed tests must not run while DATABASE_URL points at the shared development Postgres. Set SEED_FKAPI_TEST_DATABASE_URL to localhost/*test* (never the lane URL)."
fi
if [ "$needs_apify" = 1 ] && ! dedicated_ok SEED_APIFY_TEST_DATABASE_URL; then
  deny "BLOCKED: @kit/seed-apify tests must not run while DATABASE_URL points at the shared development Postgres. Set SEED_APIFY_TEST_DATABASE_URL to localhost/*test* (never the lane URL)."
fi
if [ "$needs_db" = 1 ] && ! dedicated_ok KIT_DB_TEST_DATABASE_URL; then
  deny "BLOCKED: @kit/db tests must not run while DATABASE_URL points at the shared development Postgres. Set KIT_DB_TEST_DATABASE_URL to localhost/*test* (never the lane URL)."
fi
if [ "$needs_api" = 1 ] && ! dedicated_ok API_TEST_DATABASE_URL; then
  deny "BLOCKED: @kit/api tests must not run while DATABASE_URL points at the shared development Postgres. Set API_TEST_DATABASE_URL to localhost/*test* (never the lane URL)."
fi

allow
