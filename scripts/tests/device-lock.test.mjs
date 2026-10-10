import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const lockScript = fileURLToPath(
  new URL("../../apps/mobile/.maestro/device-lock.sh", import.meta.url),
);

/** A throwaway git repository holding a copy of the lock script. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), "device-lock-"));
  execFileSync("git", ["init", "-q", dir]);
  copyFileSync(lockScript, join(dir, "device-lock.sh"));
  return dir;
}

/** Runs `device_lock_run <label> <command>` in a bash of its own; resolves with its exit code. */
function run(dir, label, command) {
  const child = spawn(
    "bash",
    ["-c", `source ./device-lock.sh; device_lock_run "${label}" bash -c '${command}'`],
    { cwd: dir, env: { ...process.env, E2E_LOCK_POLL_SECONDS: "1" } },
  );
  let output = "";
  child.stderr.on("data", (chunk) => (output += chunk));
  return new Promise((resolve) => child.on("close", (code) => resolve({ code, output })));
}

test("a second run waits for the first and runs after it", async () => {
  const dir = repo();
  const log = join(dir, "order.txt");
  const first = run(dir, "first", `echo first-start >> ${log}; sleep 3; echo first-end >> ${log}`);
  await new Promise((resolve) => setTimeout(resolve, 800));
  const second = await run(dir, "second", `echo second >> ${log}`);
  await first;
  assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), [
    "first-start",
    "first-end",
    "second",
  ]);
  assert.match(second.output, /waiting for "first"/);
});

test("the lock is released when the command fails, and its exit code is kept", async () => {
  const dir = repo();
  const failed = await run(dir, "failing", "exit 7");
  assert.equal(failed.code, 7);
  const next = await run(dir, "next", "true");
  assert.equal(next.code, 0);
});

test("a lock whose owner has stopped is taken over", async () => {
  const dir = repo();
  const lock = join(dir, ".git", "kit-device-flows.lock");
  mkdirSync(lock);
  writeFileSync(join(lock, "pid"), "999999\n");
  writeFileSync(join(lock, "label"), "gone\n");
  const result = await run(dir, "late", "true");
  assert.equal(result.code, 0);
  assert.match(result.output, /Took over/);
  assert.equal(existsSync(lock), false);
});
