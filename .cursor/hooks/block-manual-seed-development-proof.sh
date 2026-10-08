#!/usr/bin/env bash
# Factory ratchet (KIT-34): deny forging seed development proof output files.
# Evidence must come from scripts/record-seed-development-proof.sh after a real run.
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

if printf '%s' "$COMMAND" | grep -qE 'scripts/record-seed-development-proof\.sh'; then
  allow
fi

if printf '%s' "$COMMAND" | grep -qE 'seed/mcp/proof-output/'; then
  deny "BLOCKED: do not write seed/mcp/proof-output/ manually. Run scripts/record-seed-development-proof.sh and attach its output to Linear Evidence."
fi

allow
