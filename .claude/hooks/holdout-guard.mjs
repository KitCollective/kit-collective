#!/usr/bin/env node
// PreToolUse guard for the Holdout (ADR-0060, KIT-348). Denies Read, Grep and Bash that reach the
// Holdout repo directly: a path inside a local clone, or a gh/git command that names it. The way
// in is `node scripts/scenarios.mjs titles|read`; `read` writes a run-log line. This is provenance,
// not unforgeability: it stops the ordinary route, and the log shows the rest. A command that builds
// the name at runtime (`node -e`, a script, a child process) gets past it. Docs: docs/agents/scenarios.md.
// Deny = exit 2 with the message on stderr. Allow = exit 0, no output. A payload or config the hook
// cannot read is a deny (fail closed), as in cursor-ratchet.mjs.
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function deny(reason) {
  process.stderr.write(
    `${reason}\nThe Holdout is read only through the Scenario CLI: ` +
      "node scripts/scenarios.mjs titles|read --project <name> --milestone <name>\n",
  );
  process.exit(2);
}

/** The Holdout's directory name, from `scenarios.holdoutRepo` (`Owner/name`). */
function holdoutName() {
  const config = JSON.parse(readFileSync(join(root, "factory.config.json"), "utf8"));
  const name = basename(String(config.scenarios.holdoutRepo));
  if (!name) {
    throw new Error("scenarios.holdoutRepo is empty");
  }
  return name;
}

/** True when a path has a segment that is the Holdout, or its `.git` form. */
const inHoldout = (path, name) =>
  path.split("/").some((segment) => segment === name || segment === `${name}.git`);

const resolveFrom = (cwd, path) => resolve(cwd || root, path);

// One `node scripts/scenarios.mjs ...` invocation and nothing chained to it.
const CLI = /^\s*node\s+(\S*scripts\/scenarios\.mjs)(?:\s|$)/;
const CHAINING = /[;&|`\n]|\$\(/;

function isScenarioCli(command, name) {
  const match = CLI.exec(command);
  return Boolean(match) && !CHAINING.test(command) && !inHoldout(match[1], name);
}

function decideBash(command, cwd, name) {
  if (cwd && inHoldout(resolve(cwd), name)) {
    return `Bash from inside the Holdout (${name}) is denied.`;
  }
  if (isScenarioCli(command, name)) {
    return null;
  }
  if (/(^|[\s;&|(`])(gh|git)\s/.test(command) && command.includes(name)) {
    return `gh/git commands that target the Holdout (${name}) are denied.`;
  }
  for (const token of command.split(/\s+/)) {
    const word = token.replace(/^["']+|["']+$/g, "");
    if (word.includes("/") && inHoldout(word, name)) {
      return `A path inside the Holdout (${name}) is denied: ${word}`;
    }
  }
  return null;
}

function decide(payload, name) {
  const input = payload.tool_input ?? {};
  const cwd = typeof payload.cwd === "string" ? payload.cwd : "";
  switch (payload.tool_name) {
    case "Read":
      return inHoldout(resolveFrom(cwd, String(input.file_path ?? "")), name)
        ? `Reading a file inside the Holdout (${name}) is denied.`
        : null;
    case "Grep":
      return inHoldout(resolveFrom(cwd, String(input.path ?? ".")), name)
        ? `Searching inside the Holdout (${name}) is denied.`
        : null;
    case "Bash":
      return decideBash(String(input.command ?? ""), cwd, name);
    default:
      return null;
  }
}

try {
  const payload = JSON.parse(readFileSync(0, "utf8"));
  if (typeof payload !== "object" || payload === null) {
    throw new Error("payload is not an object");
  }
  const reason = decide(payload, holdoutName());
  if (reason) {
    deny(reason);
  }
} catch (error) {
  deny(`Holdout guard could not read its input: ${error.message}`);
}
