import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LIVE_CHECKS, liveCheckSteps, parseLiveChecks } from "../lib/live-checks.mjs";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "live-check.mjs");

test("parseLiveChecks reads the live-check line, plain, in backticks or escaped, without repeats", () => {
  assert.deepEqual(parseLiveChecks("## AC\n\nlive-check: optio-reload, optio-host-probe\n"), [
    "optio-reload",
    "optio-host-probe",
  ]);
  assert.deepEqual(parseLiveChecks("`live-check:` `optio-board`, optio-board"), ["optio-board"]);
  assert.deepEqual(parseLiveChecks("live-check: optio\\-reload"), ["optio-reload"]);
  assert.deepEqual(parseLiveChecks("no line here"), []);
});

test("optio-inbox asks the Inbox for its cards", () => {
  assert.deepEqual(liveCheckSteps("optio-inbox"), [["bb", "optio", "inbox", "--json"]]);
});

test("liveCheckSteps runs only listed checks and fills only a valid thread id", () => {
  assert.deepEqual(liveCheckSteps("optio-host-probe", { thread: "thr_abc123" }), [
    ["bb", "optio", "host-probe", "thr_abc123"],
  ]);
  assert.throws(() => liveCheckSteps("rm-rf"), /unknown live check/);
  assert.throws(() => liveCheckSteps("constructor"), /unknown live check/);
  assert.throws(
    () => liveCheckSteps("optio-host-probe", { thread: "thr_x; rm -rf /" }),
    /needs a runs-machine thread/,
  );
  assert.throws(() => liveCheckSteps("optio-host-probe"), /needs a runs-machine thread/);
  for (const [name, check] of Object.entries(LIVE_CHECKS)) {
    assert.ok(check.what && check.steps.length > 0, name);
    for (const step of check.steps)
      assert.ok(
        step.every((arg) => typeof arg === "string"),
        name,
      );
  }
});

test("the CLI exits 2 with a usage verdict on an unknown check, and lists the checks", () => {
  let status = 0;
  let out = "";
  try {
    execFileSync("node", [cli, "run", "nope"], { encoding: "utf8" });
  } catch (error) {
    status = error.status;
    out = error.stdout;
  }
  assert.equal(status, 2);
  assert.match(out, /^LIVE-CHECK nope usage unknown live check nope/);
  assert.match(execFileSync("node", [cli, "list"], { encoding: "utf8" }), /optio-reload: /);
});
