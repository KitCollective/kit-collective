#!/usr/bin/env bash
# Factory ratchet: deny git add/commit that introduces Danish *identifier* names.
# UI copy and shipped Expo route slugs are not this gate. Stdin: Cursor hook JSON.
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

if ! printf '%s' "$COMMAND" | grep -qE 'git[[:space:]]+(add|commit)\b'; then
  allow
fi

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
[ -z "${ROOT}" ] && allow

DIFF=$(git -C "$ROOT" diff HEAD -- '*.ts' '*.tsx' '*.js' '*.mjs' '*.cts' '*.mts' 2>/dev/null || true)

HITS=$(printf '%s' "$DIFF" | node "$ROOT/.cursor/hooks/lib/danish-code-identifiers.mjs" 2>/dev/null || true)

if [ -n "${HITS}" ]; then
  deny "BLOCKED: Danish code identifiers ($HITS). Use English for function/const/class/type names. UI copy may stay Danish. See .cursor/rules/code-english.mdc."
fi

allow
