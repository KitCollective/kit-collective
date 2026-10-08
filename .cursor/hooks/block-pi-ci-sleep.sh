#!/usr/bin/env bash
# Factory ratchet: deny Pi sleeping or polling GitHub checks.
# The harness waits for required checks. Stdin: Cursor hook JSON.
# Stdout: {"permission":"allow"|"deny"}. Exit 2 = deny.

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

MSG="BLOCKED: do not sleep or poll GitHub. The harness waits for required checks. Exit after a single gh pr checks snapshot."

if printf '%s' "$COMMAND" | grep -qE 'gh[[:space:]]+pr[[:space:]]+checks' && printf '%s' "$COMMAND" | grep -qE -- '--watch'; then
  deny "$MSG"
fi

if printf '%s' "$COMMAND" | grep -qE 'sleep[[:space:]]+[0-9]+' && printf '%s' "$COMMAND" | grep -qE 'gh[[:space:]]+pr[[:space:]]+checks'; then
  deny "$MSG"
fi

if printf '%s' "$COMMAND" | grep -qE 'sleep[[:space:]]+([1-9][0-9]+|10)(s|[[:space:]]|$)'; then
  deny "$MSG"
fi

if printf '%s' "$COMMAND" | grep -qE '(for|while)[[:space:]]' && printf '%s' "$COMMAND" | grep -qE 'gh[[:space:]]+pr[[:space:]]+checks'; then
  deny "$MSG"
fi

allow
