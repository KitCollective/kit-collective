import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = (name) => fileURLToPath(new URL(`../${name}`, import.meta.url));
const scratch = () => mkdtempSync(join(tmpdir(), "inject-"));

/** Runs a script with a ref that git would read as `--output=<file>`; the file must never appear. */
function refused(name, { env = {}, args = [] }) {
  const dir = scratch();
  const target = join(dir, "pwned");
  const sub = (value) => value.replace("TARGET", `--output=${target}`);
  const result = spawnSync("node", [script(name), ...args.map(sub)], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...Object.fromEntries(Object.entries(env).map(([k, v]) => [k, sub(v)])),
    },
  });
  assert.equal(result.status, 2, `${name}: ${result.stdout}${result.stderr}`);
  assert.equal(existsSync(target), false, `${name} wrote the file`);
  assert.match(result.stderr, /refused ref/);
}

test("check-pr-write-scope refuses an option-shaped BASE_REF (it used to pass and write the file)", () => {
  refused("check-pr-write-scope.mjs", { env: { BASE_REF: "TARGET", WRITE_SCOPE: "apps/web/**" } });
});

test("check-code-english and check-doc-references refuse it with exit 2, not 'nothing to compare'", () => {
  refused("check-code-english.mjs", { env: { BASE_REF: "TARGET" } });
  refused("check-doc-references.mjs", { env: { BASE_REF: "TARGET" } });
});

test("classify-fix-diff refuses an option-shaped from or head", () => {
  refused("classify-fix-diff.mjs", { args: ["TARGET"] });
  refused("classify-fix-diff.mjs", { args: ["HEAD", "TARGET"] });
});

test("the normal paths are unchanged", () => {
  const env = { ...process.env, BASE_REF: "HEAD" };
  assert.equal(spawnSync("node", [script("check-code-english.mjs")], { env }).status, 0);
  assert.equal(spawnSync("node", [script("check-doc-references.mjs")], { env }).status, 0);
  // an empty diff is `full` (exit 1) as before; the point is a verdict, not a usage refusal
  const classified = spawnSync("node", [script("classify-fix-diff.mjs"), "HEAD", "HEAD"], {
    env,
    encoding: "utf8",
  });
  assert.equal(classified.status, 1);
  assert.match(classified.stdout, /^full empty diff/);
  const scope = spawnSync("node", [script("check-pr-write-scope.mjs")], {
    env: { ...env, WRITE_SCOPE: "apps/web/**" },
    encoding: "utf8",
  });
  assert.equal(scope.status, 0, scope.stdout + scope.stderr);
});
