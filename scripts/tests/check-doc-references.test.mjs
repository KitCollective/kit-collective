import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  addedMarkdownLines,
  backtickedPaths,
  isLivingDoc,
  pathExists,
  removedNames,
} from "../lib/doc-references.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "check-doc-references.mjs");

test("removedNames reads declarations, props and flow step names, not generic names", () => {
  const diff = [
    "+++ b/apps/mobile/src/door.tsx",
    "-export function KomIGangFace() {}",
    "-  titleContent?: ReactNode;",
    "-  value: string;",
    "+++ b/apps/mobile/.maestro/regression/first-session.yaml",
    "-    - takeScreenshot: kc__first-session__03-door-register",
  ].join("\n");
  assert.deepEqual(removedNames(diff).sort(), ["03-door-register", "KomIGangFace", "titleContent"]);
});

test("backtickedPaths keeps repo paths, drops globs, URLs and placeholders", () => {
  const text =
    "see `scripts/reset-test-data.js` and `apps/**/x.ts` and `https://a.b/c.md` and `<dir>/f.ts`";
  assert.deepEqual(backtickedPaths(text), ["scripts/reset-test-data.js"]);
});

test("pathExists accepts a tracked tail, rejects a wrong directory", () => {
  const tracked = ["apps/mobile/.maestro/scripts/reset-test-data.js"];
  assert.equal(pathExists("scripts/reset-test-data.js", tracked), true);
  assert.equal(pathExists("subflows/reset-test-data.js", tracked), false);
});

test("ADRs and frozen specs are not living docs", () => {
  assert.equal(isLivingDoc("docs/design-system.md"), true);
  assert.equal(isLivingDoc("docs/adr/0049-x.md"), false);
  assert.equal(isLivingDoc(".scratch/a/spec.md"), false);
});

test("addedMarkdownLines groups added lines per markdown file", () => {
  const diff = ["+++ b/docs/a.md", "+one", "+++ b/x.ts", "+two", "+++ b/docs/a.md", "+three"].join(
    "\n",
  );
  assert.deepEqual(addedMarkdownLines(diff), [{ file: "docs/a.md", text: "one\nthree" }]);
});

/** @param {string} dir @param {string[]} args */
function git(dir, args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

/** @param {Record<string, string>} before @param {Record<string, string>} after */
function repo(before, after) {
  const dir = mkdtempSync(join(tmpdir(), "doc-refs-"));
  git(dir, ["init", "-q", "-b", "development"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "t"]);
  const write = (files) => {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), content);
    }
    git(dir, ["add", "."]);
  };
  write(before);
  git(dir, ["commit", "-q", "-m", "base"]);
  git(dir, ["checkout", "-q", "-b", "feature"]);
  write(after);
  git(dir, ["commit", "-q", "-m", "change"]);
  return dir;
}

function run(dir) {
  try {
    execFileSync("node", [SCRIPT], {
      cwd: dir,
      env: { ...process.env, BASE_REF: "development" },
      stdio: "pipe",
    });
    return 0;
  } catch (error) {
    return error.status;
  }
}

test("CLI fails when a doc still names a renamed symbol", () => {
  const dir = repo(
    {
      "src/a.ts": "export function KomIGangFace() {}\n",
      "docs/d.md": "The `KomIGangFace` shows.\n",
    },
    { "src/a.ts": "export function DoorFace() {}\n" },
  );
  assert.equal(run(dir), 1);
});

test("CLI passes when the doc was updated with the rename", () => {
  const dir = repo(
    {
      "src/a.ts": "export function KomIGangFace() {}\n",
      "docs/d.md": "The `KomIGangFace` shows.\n",
    },
    { "src/a.ts": "export function DoorFace() {}\n", "docs/d.md": "The `DoorFace` shows.\n" },
  );
  assert.equal(run(dir), 0);
});

test("CLI fails an added doc line naming a path that does not exist", () => {
  const dir = repo(
    { "scripts/real.js": "x\n" },
    { "docs/d.md": "Run `subflows/real.js` first.\n" },
  );
  assert.equal(run(dir), 1);
});

test("CLI passes an added doc line naming an existing path", () => {
  const dir = repo({ "scripts/real.js": "x\n" }, { "docs/d.md": "Run `scripts/real.js` first.\n" });
  assert.equal(run(dir), 0);
});

/** Runs the CLI with BASE_REF set to `baseRef`, or removed from the child env when undefined. */
function runWithBase(dir, baseRef) {
  const env = { ...process.env };
  delete env.BASE_REF;
  if (baseRef !== undefined) {
    env.BASE_REF = baseRef;
  }
  return spawnSync("node", [SCRIPT], { cwd: dir, env, encoding: "utf8" });
}

const staleDoc = () =>
  repo(
    {
      "src/a.ts": "export function KomIGangFace() {}\n",
      "docs/d.md": "The `KomIGangFace` shows.\n",
    },
    { "src/a.ts": "export function DoorFace() {}\n" },
  );

test("CLI fails an explicit BASE_REF that cannot be resolved, naming the ref", () => {
  const result = runWithBase(staleDoc(), "origin/nope");
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stderr, /origin\/nope/);
});

test("CLI keeps the skip when BASE_REF is not set and the default ref is absent, with a note", () => {
  const result = runWithBase(staleDoc(), undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /BASE_REF is not set and origin\/development/);
});
