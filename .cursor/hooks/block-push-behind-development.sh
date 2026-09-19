#!/usr/bin/env bash
# Factory ratchet (KIT-23): deny git push when the current branch is behind origin/development.
# Prevents repeating checker fails from unmergeable PRs (branch never rebased after development moved).
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

# Only gate git push (not fetch, pull, or other git commands).
if ! printf '%s' "$COMMAND" | grep -qE 'git[[:space:]]+push\b'; then
  allow
fi

# Never block pushes to the integration lane itself.
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
if [ "$CURRENT_BRANCH" = "development" ] || [ "$CURRENT_BRANCH" = "staging" ] || [ "$CURRENT_BRANCH" = "production" ]; then
  allow
fi

# Fetch latest development ref (quiet, best-effort).
git fetch origin development --quiet 2>/dev/null || allow

# If origin/development does not exist locally, allow.
if ! git rev-parse --verify origin/development >/dev/null 2>&1; then
  allow
fi

# Count commits on origin/development not reachable from HEAD.
BEHIND=$(git rev-list --count HEAD..origin/development 2>/dev/null || echo "0")

if [ "$BEHIND" -gt 0 ]; then
  deny "BLOCKED: branch is ${BEHIND} commit(s) behind origin/development. Merge or rebase origin/development before pushing to avoid unmergeable PRs."
fi

allow
