import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)), "..");
const HOOK = join(ROOT, ".claude", "hooks", "holdout-guard.mjs");
const CLI = 'node scripts/scenarios.mjs read --project "Holdout Scenarios" --milestone Fixture';

/** Feeds the hook one PreToolUse payload (or raw stdin) and returns the exit status and stderr. */
function guard(input, { raw = false } = {}) {
  const result = spawnSync(process.execPath, [HOOK], {
    encoding: "utf8",
    input: raw ? input : JSON.stringify({ hook_event_name: "PreToolUse", cwd: ROOT, ...input }),
  });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

const read = (file_path, extra) =>
  guard({ tool_name: "Read", tool_input: { file_path }, ...extra });
const grep = (path, extra) =>
  guard({ tool_name: "Grep", tool_input: { pattern: "x", ...(path ? { path } : {}) }, ...extra });
const bash = (command, extra) => guard({ tool_name: "Bash", tool_input: { command }, ...extra });

const denied = (result, label) => {
  assert.equal(result.status, 2, `${label} should be denied`);
  assert.match(result.stderr, /scripts\/scenarios\.mjs/, `${label}: message names the CLI`);
};
const allowed = (result, label) => {
  assert.equal(result.status, 0, `${label} should be allowed: ${result.stderr}`);
  assert.equal(result.stderr, "", label);
};

test("Read: a path inside a Holdout clone is denied, other paths are allowed", () => {
  denied(read("/tmp/x/kit-scenarios/a.md"), "read in a clone");
  denied(read("/tmp/x/kit-scenarios"), "read of the clone dir");
  allowed(read(join(ROOT, "scripts", "scenarios.mjs")), "read of the CLI source");
  allowed(read("/tmp/x/kit-scenarios-notes.md"), "a file that only shares a prefix");
});

test("Read: a relative path resolves against cwd", () => {
  denied(read("a.md", { cwd: "/tmp/x/kit-scenarios" }), "relative path, cwd in a clone");
  denied(read("../kit-scenarios/a.md", { cwd: "/tmp/x/work" }), "relative path out to a clone");
});

test("Grep: a path or the cwd inside a clone is denied, elsewhere is allowed", () => {
  denied(grep("/tmp/x/kit-scenarios"), "grep path in a clone");
  denied(grep(undefined, { cwd: "/tmp/x/kit-scenarios" }), "grep with no path, cwd in a clone");
  allowed(grep("/tmp/x/docs"), "grep elsewhere");
  allowed(grep(undefined), "grep with no path in the repo");
});

test("Bash: gh and git commands that name the Holdout are denied", () => {
  denied(bash("gh api repos/KitCollective/kit-scenarios/contents/x"), "gh api");
  denied(bash("gh repo view KitCollective/kit-scenarios"), "gh repo view");
  denied(bash("git clone https://github.com/KitCollective/kit-scenarios.git"), "git clone");
  denied(bash("git -C /tmp/x/work fetch kit-scenarios"), "git fetch by name");
});

test("Bash: a path with a Holdout segment is denied, in any program", () => {
  denied(bash("cat ../kit-scenarios/x.md"), "cat");
  denied(bash("rg foo ~/src/kit-scenarios"), "rg");
  denied(bash("ls /tmp/x/kit-scenarios/"), "ls");
  denied(bash("ls", { cwd: "/tmp/x/kit-scenarios" }), "cwd inside a clone");
});

test("Bash: the scenarios CLI is the way in, alone", () => {
  allowed(bash(CLI), "read");
  allowed(bash(CLI.replace("read", "titles")), "titles");
  allowed(bash(`${CLI} --dir /tmp/kit-scenarios`), "read with --dir at a clone");
  denied(bash(`${CLI} && cat /tmp/kit-scenarios/x.md`), "CLI chained with a cat");
  denied(bash(`${CLI}; cat /tmp/kit-scenarios/x.md`), "CLI then cat");
  denied(bash(`${CLI} | cat /tmp/kit-scenarios/x.md`), "CLI piped");
  denied(bash(`${CLI} $(cat /tmp/kit-scenarios/x.md)`), "CLI with a substitution");
});

test("Bash: ordinary commands and a bare word are allowed, so the repo can grep its own docs", () => {
  allowed(bash("ls"), "ls");
  allowed(bash("rg kit-scenarios docs/"), "rg of the bare word");
  allowed(bash("git status"), "git status");
});

test("a payload the hook cannot read is denied (fail closed)", () => {
  denied(guard("not json", { raw: true }), "garbage stdin");
  denied(guard("", { raw: true }), "empty stdin");
});

test("a tool the guard does not watch is allowed", () => {
  allowed(guard({ tool_name: "Glob", tool_input: { pattern: "*.md" } }), "Glob");
});

test(".claude/settings.json registers the guard for Read, Grep and Bash next to the ratchet", () => {
  const settings = JSON.parse(readFileSync(join(ROOT, ".claude", "settings.json"), "utf8"));
  const entries = settings.hooks.PreToolUse;
  const commandsOf = (entry) => entry.hooks.map((h) => h.command);
  const ratchet = entries.find((e) => commandsOf(e).some((c) => c.includes("cursor-ratchet.mjs")));
  assert.ok(ratchet, "cursor-ratchet entry is still registered");
  assert.equal(ratchet.matcher, "Bash");
  const entry = entries.find((e) => commandsOf(e).some((c) => c.includes("holdout-guard.mjs")));
  assert.ok(entry, "holdout-guard entry is registered");
  const matcher = new RegExp(`^(?:${entry.matcher})$`);
  for (const tool of ["Read", "Grep", "Bash"]) {
    assert.ok(matcher.test(tool), `matcher covers ${tool}`);
  }
});

/** A temp folder holding a real `kit-scenarios` directory, as a clone's parent would. */
function cloneParent() {
  const parent = mkdtempSync(join(tmpdir(), "holdout-parent-"));
  mkdirSync(join(parent, "kit-scenarios"));
  mkdirSync(join(parent, "kit-scenarios.git"));
  return parent;
}

test("Bash: a bare word that is an existing Holdout directory in cwd is denied", () => {
  const cwd = cloneParent();
  denied(bash("cd kit-scenarios && cat a.md", { cwd }), "cd then cat");
  denied(bash("rg Collection kit-scenarios", { cwd }), "rg of the bare dir");
  denied(bash("ls kit-scenarios", { cwd }), "ls of the bare dir");
  denied(bash("ls kit-scenarios.git", { cwd }), "the .git form");
  denied(bash('ls "Kit-Scenarios"', { cwd }), "quoted, other case");
  denied(bash("rg x --path=kit-scenarios", { cwd }), "flag=value");
});

test("Bash: cd into the Holdout name is denied even when the directory is not there yet", () => {
  denied(bash("cd kit-scenarios", { cwd: ROOT }), "cd by name");
  denied(bash("cd ../kit-scenarios", { cwd: ROOT }), "cd by path");
});

test("Bash: a bare word with no such directory stays allowed", () => {
  allowed(bash("rg kit-scenarios docs/", { cwd: ROOT }), "rg of the word, no dir");
});

test("Bash: process substitution cannot smuggle a Holdout path past the CLI, and redirections carry no Holdout path", () => {
  const cli = "node scripts/scenarios.mjs titles --project a --milestone b";
  denied(bash(`${cli} >(cat /tmp/x/kit-scenarios/a.md)`), "output substitution");
  denied(bash(`${cli} <(cat /tmp/x/kit-scenarios/a.md)`), "input substitution");
  denied(bash("cat </tmp/x/kit-scenarios/a.md"), "input redirection");
  denied(bash("cat <<< /tmp/x/kit-scenarios/a.md"), "here-string");
  denied(bash("cp a.md >/tmp/x/kit-scenarios/a.md"), "output redirection");
  denied(bash("(cat /tmp/x/kit-scenarios/a.md)"), "subshell");
});

test("the Holdout name is compared case-insensitively", () => {
  denied(read("/tmp/x/Kit-Scenarios/a.md"), "read");
  denied(grep("/tmp/x/KIT-SCENARIOS"), "grep");
  denied(bash("cat /tmp/x/Kit-Scenarios/a.md"), "bash path");
  denied(bash("gh repo view KitCollective/Kit-Scenarios"), "gh");
});
