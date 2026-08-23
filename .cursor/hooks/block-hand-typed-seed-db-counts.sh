#!/usr/bin/env bash
# Factory ratchet (KIT-34): deny git commits that hand-type dev-Postgres squad/club proof
# counts without referencing the committed verify script output path.
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

# Only gate git commit messages on seed-proof branches/issues.
if ! printf '%s' "$COMMAND" | grep -qE 'git[[:space:]]+commit'; then
  allow
fi

if ! printf '%s' "$COMMAND" | grep -qiE 'KIT-34|seed.*proof|verify-dev-catalog|squad.?rows|/14 clubs'; then
  allow
fi

# Allow commits that reference the verify script or its artifact output.
if printf '%s' "$COMMAND" | grep -qE 'verify-dev-catalog|kit-34-verify-output\.json'; then
  allow
fi

# Block hand-typed numeric proof patterns in commit messages.
if printf '%s' "$COMMAND" | grep -qE '[0-9]{2,3}[[:space:]]*(squad[[:space:]]*)?rows|[0-9]{1,2}/14 clubs|fetched:[[:space:]]*0,[[:space:]]*skipped:[[:space:]]*14|[0-9]{3}[[:space:]]*/[[:space:]]*1[34][[:space:]]*clubs'; then
  deny "BLOCKED: do not hand-type dev-Postgres squad/club counts in git commit messages. Run seed/mcp/scripts/verify-dev-catalog.mjs and commit referencing kit-34-verify-output.json or verify-dev-catalog instead."
fi

allow
