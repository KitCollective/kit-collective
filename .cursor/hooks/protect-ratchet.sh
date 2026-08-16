#!/usr/bin/env bash
# Factory ratchet: never delete or empty hooks via shell.
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

PATTERNS=(
  'rm[[:space:]]+.*\.cursor/hooks'
  'rm[[:space:]]+-rf[[:space:]]+\.cursor/hooks'
  'rm[[:space:]]+.*\.cursor/hooks\.json'
  '>\s*\.cursor/hooks\.json'
  'truncate[[:space:]].*\.cursor/hooks'
  'mv[[:space:]]+.*\.cursor/hooks'
)

for pattern in "${PATTERNS[@]}"; do
  if printf '%s' "$COMMAND" | grep -qE "$pattern"; then
    deny "BLOCKED: cannot loosen the factory ratchet via shell. Open a signal-up Linear issue (docs/agents/signal-up.md)."
  fi
done

allow
