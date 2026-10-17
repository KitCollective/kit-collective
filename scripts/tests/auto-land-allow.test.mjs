import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { isAutoLandCommand } from "../../.claude/hooks/auto-land-allow.mjs";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)), "..");
const HOOK = join(ROOT, ".claude", "hooks", "auto-land-allow.mjs");

/** Feeds the hook one PreToolUse payload and returns its exit status and stdout. */
function hook(command, toolName = "Bash") {
  const result = spawnSync(process.execPath, [HOOK], {
    encoding: "utf8",
    input: JSON.stringify({ hook_event_name: "PreToolUse", cwd: ROOT, tool_name: toolName, tool_input: { command } }),
  });
  return { status: result.status, stdout: result.stdout };
}

test("the runner's wrapped auto-land start is approved (KIT-384, 2026-10-17)", () => {
  const out = hook('( node scripts/auto-land.mjs start 382 --issue KIT-384 --handoff --force-enabled ); echo "KIT-EXIT:$?"');
  assert.equal(out.status, 0);
  assert.equal(JSON.parse(out.stdout).hookSpecificOutput.permissionDecision, "allow");
});

test("start and finish in the shapes the workflow and Max use are approved", () => {
  for (const command of [
    "node scripts/auto-land.mjs start 382 --issue KIT-384",
    "node scripts/auto-land.mjs start 382 --issue KIT-384 --force-enabled --handoff",
    "node scripts/auto-land.mjs start 382 --issue KIT-384 --dry-run",
    '( node scripts/auto-land.mjs finish 382 --issue KIT-384 ); echo "KIT-EXIT:$?"',
    "node scripts/auto-land.mjs finish 382 --issue KIT-384 --timeout 480",
    `node ${join(ROOT, "scripts", "auto-land.mjs")} start 382 --issue KIT-384 --force-enabled --handoff`,
  ]) {
    assert.equal(isAutoLandCommand(command), true, command);
  }
});

test("anything else gets no opinion", () => {
  for (const command of [
    "node scripts/auto-land.mjs start 382 --issue KIT-384; rm -rf .",
    "node scripts/auto-land.mjs start 382 --issue KIT-384 && gh pr merge 382",
    '( node scripts/auto-land.mjs start 382 --issue KIT-384 ); echo "KIT-EXIT:$?"; gh pr merge 382',
    "node scripts/auto-land.mjs start 382 --issue KIT-384 $(gh pr merge 382)",
    "node scripts/auto-land.mjs start 382 --issue KIT-384 --handoff --handoff",
    "node scripts/auto-land.mjs start 382 --issue KIT-384 --timeout 480",
    "node scripts/auto-land.mjs finish 382 --issue KIT-384 --force-enabled",
    "node scripts/auto-land.mjs finish 382 --issue KIT-384 --timeout",
    "node scripts/auto-land.mjs enabled",
    "node /tmp/x/scripts/auto-land.mjs start 382 --issue KIT-384",
    "node scripts/auto-land.mjs start 382 --issue KIT-384\ngh pr merge 382",
    "gh pr merge 382",
  ]) {
    assert.equal(isAutoLandCommand(command), false, command);
  }
  assert.deepEqual(hook("gh pr merge 382"), { status: 0, stdout: "" });
  assert.deepEqual(hook("node scripts/auto-land.mjs start 382 --issue KIT-384", "Read"), { status: 0, stdout: "" });
});
