#!/usr/bin/env bash
# Factory ratchet (KIT-17): deny forging GetMcpTools catalog evidence files.
# Evidence must come from scripts/record-getmcptools-evidence.sh after an in-session GetMcpTools call.
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

if printf '%s' "$COMMAND" | grep -qE 'scripts/record-getmcptools-evidence\.sh'; then
  allow
fi

if printf '%s' "$COMMAND" | grep -qE '\.cursor/getmcptools-evidence/'; then
  deny "BLOCKED: do not write .cursor/getmcptools-evidence/ manually. Pipe this session's GetMcpTools JSON through scripts/record-getmcptools-evidence.sh <server>."
fi

allow
