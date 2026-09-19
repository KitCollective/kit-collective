#!/usr/bin/env bash
# Factory ratchet (KIT-102): issue PRs must target development.
# gh pr create without --base used to inherit the repo default (was production).
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

if ! printf '%s' "$COMMAND" | grep -qE 'gh[[:space:]]+pr[[:space:]]+create\b'; then
  allow
fi

if printf '%s' "$COMMAND" | grep -qE -- '--base(=|[[:space:]]+)development([[:space:]]|$)'; then
  allow
fi

if printf '%s' "$COMMAND" | grep -qE -- '--base(=|[[:space:]]+)staging([[:space:]]|$)' \
  && printf '%s' "$COMMAND" | grep -qE -- '--head(=|[[:space:]]+)(origin/)?development([[:space:]]|$)'; then
  allow
fi

if printf '%s' "$COMMAND" | grep -qE -- '--base(=|[[:space:]]+)production([[:space:]]|$)' \
  && printf '%s' "$COMMAND" | grep -qE -- '--head(=|[[:space:]]+)(origin/)?staging([[:space:]]|$)'; then
  allow
fi

deny "BLOCKED: gh pr create requires --base development. Promotion is --base staging --head development or --base production --head staging only."
