import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const stampScript = fileURLToPath(
  new URL("../../apps/mobile/.maestro/source-stamp.sh", import.meta.url),
);
const MAESTRO = "apps/mobile/.maestro";

/** @param {string} dir @param {string[]} args */
function git(dir, args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

/** A throwaway git repository holding a committed copy of the stamp script and one flow script. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), "source-stamp-"));
  git(dir, ["init", "-q", "-b", "development"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "t"]);
  mkdirSync(join(dir, MAESTRO), { recursive: true });
  copyFileSync(stampScript, join(dir, MAESTRO, "source-stamp.sh"));
  writeFileSync(join(dir, MAESTRO, "x.sh"), "echo x\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "seed"]);
  return dir;
}

/** Runs `refuse_uncommitted apps/mobile` in a bash of its own. */
function refuseUncommitted(dir) {
  return spawnSync(
    "bash",
    ["-c", `source ${MAESTRO}/source-stamp.sh; refuse_uncommitted apps/mobile`],
    { cwd: dir, encoding: "utf8" },
  );
}

test("refuse_uncommitted passes a clean tree and an edit under .maestro", () => {
  const dir = repo();
  assert.equal(refuseUncommitted(dir).status, 0);
  writeFileSync(join(dir, MAESTRO, "x.sh"), "echo y\n");
  assert.equal(refuseUncommitted(dir).status, 0);
});

test("refuse_uncommitted refuses a file moved out of .maestro into the build sources", () => {
  const dir = repo();
  git(dir, ["mv", `${MAESTRO}/x.sh`, "apps/mobile/x.sh"]);
  const result = refuseUncommitted(dir);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stderr, /Uncommitted changes under apps\/mobile/);
});
