#!/usr/bin/env bash
# Factory ratchet: deny destructive git commands (beforeShellExecution).
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

PATTERNS=(
  'git[[:space:]]+push[[:space:]]+.*--force'
  'git[[:space:]]+push[[:space:]]+-f\b'
  'push[[:space:]]+--force'
  'git[[:space:]]+reset[[:space:]]+--hard'
  'reset[[:space:]]+--hard'
  'git[[:space:]]+clean[[:space:]]+-fd'
  'git[[:space:]]+clean[[:space:]]+-f\b'
  'git[[:space:]]+branch[[:space:]]+-D\b'
  'git[[:space:]]+checkout[[:space:]]+\.'
  'git[[:space:]]+restore[[:space:]]+\.'
)

for pattern in "${PATTERNS[@]}"; do
  if printf '%s' "$COMMAND" | grep -qE "$pattern"; then
    deny "BLOCKED: destructive git. Do not force-push, hard-reset, clean -f, or delete branches. File a signal-up Linear issue if this block is wrong."
  fi
done

allow
