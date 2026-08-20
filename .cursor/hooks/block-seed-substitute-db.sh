#!/usr/bin/env bash
# Factory ratchet (KIT-16): deny development-lane seed runs against substitute Postgres.
# Prevents proof runs landing on localhost / kit_test when AC requires real development DATABASE_URL.
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

# Only gate seed CLI / MCP invocations (not unit tests with SEED_APIFY_FIXTURE).
if ! printf '%s' "$COMMAND" | grep -qE 'seed/apify/dist/cli\.js|seed/fkapi/dist/cli\.js|@kit/seed-apify|seed-apify|seed_fk|seed_apify'; then
  allow
fi

# Fixture / recording modes are hermetic by design — not development proof runs.
if printf '%s' "$COMMAND" | grep -qE 'SEED_APIFY_FIXTURE=|SEED_APIFY_RECORDINGS='; then
  allow
fi

# Explicit staging lane uses a different env var contract.
if printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])staging([[:space:]]|$)'; then
  allow
fi

# Inline override to a substitute host in the same shell command.
if printf '%s' "$COMMAND" | grep -qE 'DATABASE_URL=(postgresql|postgres)://[^[:space:]]*(localhost|127\.0\.0\.1|kit_test)'; then
  deny "BLOCKED: development seed proof must use the real development DATABASE_URL from the environment — not an inline localhost/kit_test override."
fi

# Spinning up throwaway Postgres then seeding in one command.
if printf '%s' "$COMMAND" | grep -qE 'docker[[:space:]]+run.*postgres' && printf '%s' "$COMMAND" | grep -qE 'seed/apify/dist/cli\.js|seed/fkapi/dist/cli\.js'; then
  deny "BLOCKED: do not pair docker postgres with a seed proof run. Use the lane DATABASE_URL from the agent environment."
fi

DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ]; then
  allow
fi

IS_SUBSTITUTE=$(node -e '
const url = process.env.DATABASE_URL ?? "";
try {
  const u = new URL(url.replace(/^postgres:/, "postgresql:"));
  const host = (u.hostname || "").toLowerCase();
  const db = (u.pathname || "").replace(/^\//, "").toLowerCase();
  const substitute =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local") ||
    db.includes("test") ||
    db === "kit_test";
  process.stdout.write(substitute ? "yes" : "no");
} catch {
  process.stdout.write("no");
}
' 2>/dev/null || echo "no")

if [ "$IS_SUBSTITUTE" = "yes" ]; then
  deny "BLOCKED: DATABASE_URL points at a substitute/local database. Development seed proof runs must use the real CX33 development Postgres from the agent environment."
fi

allow
