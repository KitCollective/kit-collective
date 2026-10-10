import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { append } from "../lib/run-log.mjs";

const CLI = fileURLToPath(new URL("../audit-receipt.mjs", import.meta.url));
const HEAD = "c0ffee1234567890c0ffee1234567890c0ffee12";

/** Fake `gh` and `bb` on PATH; the status POST is recorded in `calls`. */
function world({ output, postFails = false }) {
  const dir = mkdtempSync(join(tmpdir(), "receipt-"));
  const calls = join(dir, "calls.txt");
  const script = (name, body) => {
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  script(
    "gh",
    `case "$*" in
  *"pr view"*) echo '{"headRefOid":"${HEAD}"}';;
  *"/statuses/"*) echo "POST $*" >> "${calls}"; ${postFails ? 'echo "gh: Resource not accessible by personal access token (HTTP 403)" >&2; exit 1' : "echo '{}'"};;
  *"/statuses"*) echo '[]';;
  *"/commits/"*) echo '{"date":"2020-01-01T00:00:00Z"}';;
esac`,
  );
  script(
    "bb",
    `case "$*" in
  *"thread show"*) echo '{"thread":{"id":"thr_rev12345","providerId":"codex","createdAt":1800000000000}}';;
  *"thread output"*) printf '%s' '{"output":${JSON.stringify(output)}}';;
esac`,
  );
  const log = join(dir, "run-log.jsonl");
  const spawn = (extra) => append({ event: "spawn", issue: "KIT-7", ...extra }, { path: log });
  spawn({ step: "engineer", thread: "thr_eng12345", provider: "claude-code", model: "sonnet" });
  spawn({ step: "reviewer", thread: "thr_rev12345", provider: "codex", model: "gpt-x" });
  const run = (envLog = log) =>
    spawnSync("node", [CLI, "post", "304", "--thread", "thr_rev12345"], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, KC_RUN_LOG: envLog },
    });
  return { dir, calls, log, run };
}

const green = `AUDIT-RESULT KIT-7 green ${HEAD.slice(0, 12)}`;

test("a good result posts the status, then logs the audit", () => {
  const w = world({ output: green });
  const result = w.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(readFileSync(w.calls, "utf8"), /state=success/);
  assert.match(readFileSync(w.log, "utf8"), /"event":"audit".*"verdict":"green"/);
});

test("an audit event that would be invalid is refused BEFORE anything is posted", () => {
  const w = world({ output: green });
  for (let round = 1; round <= 100; round += 1) {
    append(
      {
        event: "audit",
        issue: "KIT-7",
        verdict: "red",
        round: Math.min(round, 99),
        sha: "abc1234",
      },
      { path: w.log },
    );
  }
  const result = w.run();
  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    /REFUSED \(receipt\): the audit event would be invalid.*nothing posted/,
  );
  assert.equal(existsSync(w.calls), false, "no status was posted");
});

test("when the status is posted but the log write fails the exit is non-zero and says so", () => {
  const w = world({ output: green });
  chmodSync(w.log, 0o444); // readable (the spawn events are there) but not appendable
  const result = w.run();
  assert.equal(result.status, 5, result.stdout + result.stderr);
  assert.match(result.stdout, /^POSTED but not logged \(/);
  assert.match(readFileSync(w.calls, "utf8"), /state=success/, "the status was posted");
});

test("a refused post reports the permission problem, not the raw command", () => {
  const w = world({ output: green, postFails: true });
  const result = w.run();
  assert.equal(result.status, 4);
  assert.match(result.stdout, /UNKNOWN \(receipt\): token lacks Commit statuses write/);
  assert.doesNotMatch(result.stdout, /Command failed|description=/);
});
