#!/usr/bin/env bash
# Factory ratchet (KIT-17): deny Coolify REST service start/stop/restart.
# Season-range runs must use the Coolify MCP `control` tool (seed/coolify/mcp-call.sh),
# not POST /api/v1/services/{uuid}/start. Stdin: Cursor hook JSON.
# Stdout: {"permission":"allow"|"deny"}.

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

# Allow the MCP JSON-RPC path and helper scripts.
if printf '%s' "$COMMAND" | grep -qE 'seed/coolify/mcp-call\.sh|seed/coolify/start-apify-job\.sh|/mcp["[:space:]]'; then
  allow
fi

# Deny direct Coolify REST service lifecycle control (checker KIT-17 fail class 1).
if printf '%s' "$COMMAND" | grep -qE '/api/v1/services/[^[:space:]/]+/(start|stop|restart)'; then
  deny "BLOCKED: use Coolify MCP control (seed/coolify/start-apify-job.sh or mcp-call.sh), not Coolify REST /services/{uuid}/start."
fi

if printf '%s' "$COMMAND" | grep -qE 'curl[^;|&]*services/[^[:space:]/]+/(start|stop|restart)'; then
  deny "BLOCKED: use Coolify MCP control (seed/coolify/start-apify-job.sh or mcp-call.sh), not curl to Coolify REST service start/stop/restart."
fi

allow
