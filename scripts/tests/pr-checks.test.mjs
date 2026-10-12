import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { EXIT, isPermanentGhError, prArgument, verdict } from "../lib/pr-checks.mjs";

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

/** A fake `gh` on PATH that answers from canned JSON; `--help` advertises --json. */
function fakeGh(checksJson, viewJson) {
  return fakeGhScript(
    `if [ "$2" = "checks" ]; then echo '${checksJson}'; else echo '${viewJson}'; fi`,
  );
}

/** A fake `gh` on PATH running `body` (a sh script) after the `--help` probe is answered. */
function fakeGhScript(
  body,
  { help = "      --json fields   Output JSON with the specified fields" } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "fake-gh-"));
  const bin = join(dir, "gh");
  writeFileSync(bin, `#!/bin/sh\ncase "$*" in *--help*) echo '${help}'; exit 0;; esac\n${body}\n`);
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

test("gh too old for --json is exit 5 at once, naming the requirement", () => {
  const dir = fakeGhScript('echo "unknown flag: --json" >&2; exit 1', {
    help: "no such option here",
  });
  const started = Date.now();
  const result = spawnSync("node", [SCRIPT, "12", "--interval", "1", "--timeout", "600"], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    encoding: "utf8",
  });
  assert.equal(result.status, EXIT.ghBroken);
  assert.match(result.stdout, /^UNKNOWN: gh too old, needs .*--json/m);
  assert.ok(Date.now() - started < 10_000, "it must not wait for the timeout");
});

test("a permanent gh error mid-run fails at once with the real cause", () => {
  const dir = fakeGhScript('echo "unknown flag: --required" >&2; exit 1');
  const started = Date.now();
  const result = spawnSync("node", [SCRIPT, "12", "--interval", "1", "--timeout", "600"], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    encoding: "utf8",
  });
  assert.equal(result.status, EXIT.ghBroken);
  assert.match(result.stdout, /UNKNOWN: gh failed, retrying cannot help: unknown flag: --required/);
  assert.ok(Date.now() - started < 10_000);
});

test("an auth failure and invalid JSON are permanent too", () => {
  const auth = fakeGhScript(
    'echo "To get started with GitHub CLI, please run:  gh auth login" >&2; exit 4',
  );
  assert.equal(wait(auth).status, EXIT.ghBroken);
  const bad = fakeGhScript("echo 'not json at all'");
  const result = wait(bad);
  assert.equal(result.status, EXIT.ghBroken);
  assert.match(result.stdout, /UNKNOWN: gh failed/);
});

test("a network blip is retried, then green", () => {
  const counter = join(mkdtempSync(join(tmpdir(), "gh-count-")), "n");
  const dir = fakeGhScript(
    `n=$(cat "${counter}" 2>/dev/null || echo 0)
if [ "$2" = "view" ]; then echo '{"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}'; exit 0; fi
if [ "$n" -lt 1 ]; then echo $((n+1)) > "${counter}"; echo "error connecting to api.github.com" >&2; exit 1; fi
echo '[{"name":"test","bucket":"pass","state":"SUCCESS"}]'`,
  );
  const result = spawnSync("node", [SCRIPT, "12", "--interval", "1", "--timeout", "20"], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /gh failed/);
  assert.match(result.stdout, /GREEN/);
});

test("a rate limit is transient, so it times out as unknown rather than exit 5", () => {
  const dir = fakeGhScript('echo "API rate limit exceeded for user" >&2; exit 1');
  const result = wait(dir);
  assert.equal(result.status, EXIT.unknown);
  assert.match(result.stdout, /TIMEOUT/);
});

test("isPermanentGhError separates usage and auth errors from transient ones", () => {
  const permanent = [
    "unknown flag: --json",
    "HTTP 401: Bad credentials",
    "Could not resolve to a PullRequest with the number of 9",
    "no pull requests found for branch",
  ];
  for (const stderr of permanent) assert.equal(isPermanentGhError({ stderr }), true, stderr);
  const transient = [
    "API rate limit exceeded",
    "HTTP 502: Bad Gateway",
    "dial tcp: lookup api.github.com: no such host ENOTFOUND",
    "HTTP 403: secondary rate limit",
  ];
  for (const stderr of transient) assert.equal(isPermanentGhError({ stderr }), false, stderr);
  assert.equal(isPermanentGhError(new SyntaxError("Unexpected token")), true);
});
