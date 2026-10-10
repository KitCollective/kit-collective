import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { EXIT, prArgument, verdict } from "../lib/pr-checks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "wait-for-checks.mjs");
const HOOK = join(HERE, "..", "..", ".cursor", "hooks", "block-pi-ci-sleep.sh");
const merge = { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" };
const check = (name, bucket) => ({ name, bucket });

test("all green and MERGEABLE is exit 0", () => {
  const result = verdict([check("test", "pass"), check("smoke", "skipping")], merge);
  assert.equal(result.code, EXIT.green);
});

test("a pending check holds the verdict even when another is red", () => {
  const result = verdict([check("test", "fail"), check("smoke", "pending")], merge);
  assert.equal(result.done, false);
  assert.equal(result.code, EXIT.pending);
});

test("fail-fast reports red while another check is pending", () => {
  const result = verdict([check("test", "fail"), check("smoke", "pending")], merge, {
    failFast: true,
  });
  assert.equal(result.code, EXIT.red);
});

test("red after everything finished lists every failure", () => {
  const result = verdict([check("a", "fail"), check("b", "fail"), check("c", "pass")], merge);
  assert.equal(result.code, EXIT.red);
  assert.match(result.line, /a, b/);
});

test("green but conflicting is exit 3, UNKNOWN mergeability keeps waiting", () => {
  const conflicting = verdict([check("test", "pass")], {
    mergeable: "CONFLICTING",
    mergeStateStatus: "DIRTY",
  });
  assert.equal(conflicting.code, EXIT.notMergeable);
  assert.equal(verdict([check("test", "pass")], { mergeable: "UNKNOWN" }).done, false);
});

test("no checks yet is not green", () => {
  assert.equal(verdict([], merge).done, false);
});

/** A fake `gh` on PATH that answers from canned JSON. */
function fakeGh(checksJson, viewJson) {
  const dir = mkdtempSync(join(tmpdir(), "fake-gh-"));
  const bin = join(dir, "gh");
  writeFileSync(
    bin,
    `#!/bin/sh\nif [ "$2" = "checks" ]; then echo '${checksJson}'; else echo '${viewJson}'; fi\n`,
  );
  chmodSync(bin, 0o755);
  return dir;
}

function wait(dir) {
  return spawnSync("node", [SCRIPT, "12", "--interval", "1", "--timeout", "2"], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    encoding: "utf8",
  });
}

test("CLI exits 0 once gh reports green", () => {
  const dir = fakeGh(
    '[{"name":"test","bucket":"pass","state":"SUCCESS"}]',
    '{"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}',
  );
  const result = wait(dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /GREEN/);
});

test("CLI exits 1 on a red required check", () => {
  const dir = fakeGh(
    '[{"name":"test","bucket":"fail","state":"FAILURE"}]',
    '{"mergeable":"MERGEABLE"}',
  );
  assert.equal(wait(dir).status, 1);
});

test("CLI exits 2 when checks stay pending past the timeout", () => {
  const dir = fakeGh(
    '[{"name":"test","bucket":"pending","state":"IN_PROGRESS"}]',
    '{"mergeable":"MERGEABLE"}',
  );
  const result = wait(dir);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /TIMEOUT/);
});

test("the CI-sleep hook lets the sanctioned command through", () => {
  const out = execFileSync("bash", [HOOK], {
    input: JSON.stringify({ command: "node scripts/wait-for-checks.mjs 285 --timeout 1800" }),
    encoding: "utf8",
  });
  assert.equal(JSON.parse(out).permission, "allow");
});

test("the PR argument is not the value of an option", () => {
  assert.equal(prArgument(["287", "--timeout", "1800"]), "287");
  assert.equal(prArgument(["--timeout", "1800", "287"]), "287");
  assert.equal(prArgument(["--also", "Device flows", "--interval", "30", "287"]), "287");
  assert.equal(prArgument(["https://github.com/o/r/pull/12"]), "https://github.com/o/r/pull/12");
  assert.equal(prArgument(["--timeout", "1800"]), undefined);
});
