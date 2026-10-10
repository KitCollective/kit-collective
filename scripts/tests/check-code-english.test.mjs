import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  findDanishCodeIdentifiers,
  findDanishFileNames,
} from "../../.cursor/hooks/lib/danish-code-identifiers.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "check-code-english.mjs");

test("flags the KIT-272 review 4 name that the first stem list missed", () => {
  const hits = findDanishCodeIdentifiers("+function KomIGangFace() {}");
  assert.deepEqual(
    hits.map((hit) => hit.name),
    ["KomIGangFace"],
  );
});

test("flags Danish letters in a declared name but not in a string literal", () => {
  assert.equal(findDanishCodeIdentifiers("+const trøjeCount = 1;").length, 1);
  assert.equal(findDanishCodeIdentifiers("+const label = 'Tilføj trøje';").length, 0);
});

test("flags Danish stems in file names, skips shipped Expo route slugs", () => {
  const hits = findDanishFileNames([
    "apps/mobile/src/KomIGangSheet.tsx",
    "apps/mobile/app/indstillinger.tsx",
    "apps/mobile/src/door-sheet.tsx",
    "docs/komigang.md",
  ]);
  assert.deepEqual(
    hits.map((hit) => hit.path),
    ["apps/mobile/src/KomIGangSheet.tsx"],
  );
});

/** @param {string} dir @param {string[]} args */
function git(dir, args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

function repoWith(file, content) {
  const dir = mkdtempSync(join(tmpdir(), "code-english-"));
  git(dir, ["init", "-q", "-b", "development"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "t"]);
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "seed"]);
  git(dir, ["checkout", "-q", "-b", "feature"]);
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), content);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "change"]);
  return dir;
}

function run(dir) {
  try {
    execFileSync("node", [SCRIPT], {
      cwd: dir,
      env: { ...process.env, BASE_REF: "development" },
      encoding: "utf8",
      stdio: "pipe",
    });
    return 0;
  } catch (error) {
    return error.status;
  }
}

test("CLI fails a branch that adds a Danish identifier and passes an English one", () => {
  assert.equal(run(repoWith("src/a.tsx", "export function KomIGangFace() {}\n")), 1);
  assert.equal(run(repoWith("src/a.tsx", "export function DoorFace() {}\n")), 0);
});
