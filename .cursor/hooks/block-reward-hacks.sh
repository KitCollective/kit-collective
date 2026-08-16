#!/usr/bin/env bash
# Factory ratchet: deny CI/test reward-hacks via shell.
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
  'rm[[:space:]]+.*\.(test|spec)\.(ts|tsx|js|jsx)\b'
  'rm[[:space:]]+-rf[[:space:]]+.*test'
  '>\s*[^|]*\.(test|spec)\.(ts|tsx|js|jsx)\b'
  'rm[[:space:]]+.*\.github/workflows'
  'rm[[:space:]]+-rf[[:space:]]+\.github'
  'mv[[:space:]]+.*\.github/workflows'
)

for pattern in "${PATTERNS[@]}"; do
  if printf '%s' "$COMMAND" | grep -qE "$pattern"; then
    deny "BLOCKED: looks like a CI/test reward-hack. Fix the failure instead of deleting tests or workflows."
  fi
done

allow
