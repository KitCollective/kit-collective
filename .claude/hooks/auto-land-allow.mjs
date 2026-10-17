#!/usr/bin/env node
// PreToolUse pre-approval for the auto-land CLI (ADR-0061, ADR-0063). In permission mode `auto` the
// classifier denied `node scripts/auto-land.mjs start <pr> --issue KIT-n --handoff --force-enabled`
// as a safety bypass (2026-10-17, KIT-384, KIT-319, KIT-372): the Haiku command runner never ran it,
// returned no result, and every Max-started run stopped at auto-land with runner-no-result. The
// override of `flow.autoLand.enabled` is decided by Nicklas in ADR-0063, and auto-land re-checks the
// kill switches, the risk class, the receipt and the gates itself, so the command is approved here.
// Only one exact shape is approved: `start|finish`, a PR number, `--issue KIT-n` and auto-land's own
// flags, optionally in the runner's `( ... ); echo "KIT-EXIT:$?"` wrapper. Anything else, including
// a chained command or another path to the script, gets no opinion and goes on to the classifier.
// Allow = exit 0 with the decision as JSON on stdout. No opinion = exit 0, no output. Never denies.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SCRIPT = `(?:scripts/auto-land\\.mjs|${escapeRegExp(join(root, "scripts", "auto-land.mjs"))})`;
const COMMAND = new RegExp(
  `^node +${SCRIPT} +(start|finish) +[1-9]\\d{0,6} +--issue +KIT-[1-9]\\d{0,5}((?: +--[a-z-]+(?: +\\d{1,5})?)*)$`,
);
const WRAPPED = /^\( *(.+?) *\); *echo +"KIT-EXIT:\$\?"$/;
const FLAGS = { start: ["--handoff", "--force-enabled", "--dry-run"], finish: ["--timeout"] };

/** True when the command is exactly one auto-land start or finish call. */
export function isAutoLandCommand(command) {
  const text = String(command ?? "").trim();
  if (/[\n\r]/.test(text)) {
    return false;
  }
  const inner = WRAPPED.exec(text)?.[1] ?? text;
  const match = COMMAND.exec(inner);
  if (!match) {
    return false;
  }
  const [, sub, rest] = match;
  const tokens = rest.trim() ? rest.trim().split(/ +/) : [];
  const seen = new Set();
  for (let i = 0; i < tokens.length; i += 1) {
    const flag = tokens[i];
    if (!FLAGS[sub].includes(flag) || seen.has(flag)) {
      return false;
    }
    seen.add(flag);
    const takesValue = flag === "--timeout";
    if (takesValue !== /^\d+$/.test(tokens[i + 1] ?? "")) {
      return false;
    }
    if (takesValue) {
      i += 1;
    }
  }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const payload = JSON.parse(readFileSync(0, "utf8"));
    if (payload?.tool_name === "Bash" && isAutoLandCommand(payload.tool_input?.command)) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "allow",
            permissionDecisionReason:
              "auto-land start/finish is approved by ADR-0063; the script re-checks every condition itself",
          },
        }),
      );
    }
  } catch {
    // No opinion: the normal permission flow decides.
  }
}
