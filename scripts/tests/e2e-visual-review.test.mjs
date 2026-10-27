import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { failureScreenshot, pairSteps, stepLabel } from "../e2e/visual-review.mjs";

const SCRIPT = new URL("../e2e/visual-review.mjs", import.meta.url).pathname;
const shot = (flow, step) => ({ flow, step, kind: "screenshot" });

test("a step label drops the number and the hyphens", () => {
  assert.equal(stepLabel("03-own-detail"), "Own detail");
  assert.equal(stepLabel("01"), "01");
});

test("steps pair by id, in step order, and keep the ones only one side has", () => {
  const steps = pairSteps({
    flow: "kit-509",
    after: [
      shot("kit-509", "02-new-sheet"),
      shot("kit-509", "01-collection"),
      shot("other", "01-x"),
    ],
    before: [shot("kit-509", "01-collection"), shot("kit-509", "03-gone")],
  });
  assert.deepEqual(steps, [
    {
      id: "01-collection",
      label: "Collection",
      after: "after/01-collection.png",
      before: "before/01-collection.png",
    },
    { id: "02-new-sheet", label: "New sheet", after: "after/02-new-sheet.png", before: null },
    { id: "03-gone", label: "Gone", after: null, before: "before/03-gone.png" },
  ]);
});

test("the failure screenshot is Maestro's last one, never a kc__ step", () => {
  const dir = mkdtempSync(join(tmpdir(), "vr-fail-"));
  const shots = join(dir, "kit-509", "screenshots");
  mkdirSync(shots, { recursive: true });
  writeFileSync(join(shots, "step-001-tapOn.png"), "a");
  writeFileSync(join(shots, "step-004-assertVisible.png"), "b");
  writeFileSync(join(shots, "kc__kit-509__01-x.png"), "c");
  assert.equal(failureScreenshot(dir), join(shots, "step-004-assertVisible.png"));
  assert.equal(failureScreenshot(join(dir, "missing")), null);
});

test("the CLI writes the manifest and the files of both passes", () => {
  const root = mkdtempSync(join(tmpdir(), "vr-cli-"));
  const after = join(root, "after-run", "kit-509");
  const before = join(root, "before-run", "kit-509");
  mkdirSync(after, { recursive: true });
  mkdirSync(join(before, "screenshots"), { recursive: true });
  writeFileSync(join(after, "kc__kit-509__01-collection.png"), "after-1");
  writeFileSync(join(after, "kc__kit-509__02-new-sheet.png"), "after-2");
  writeFileSync(join(before, "kc__kit-509__01-collection.png"), "before-1");
  writeFileSync(join(before, "screenshots", "step-003-tapOn.png"), "stopped");
  const out = join(root, "out");
  const run = spawnSync(
    process.execPath,
    [
      SCRIPT,
      "--flow",
      "kit-509",
      "--after",
      join(root, "after-run"),
      "--before",
      join(root, "before-run"),
      "--out",
      out,
      "--head",
      "a".repeat(40),
      "--base",
      "b".repeat(40),
      "--run-url",
      "https://github.com/o/r/actions/runs/1",
      "--after-status",
      "passed",
      "--before-status",
      "failed",
      "--before-note",
      "stopped on the base",
    ],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr);
  const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.before, {
    status: "failed",
    note: "stopped on the base",
    failure: "before/failure.png",
  });
  assert.deepEqual(
    manifest.steps.map((s) => [s.id, s.after, s.before]),
    [
      ["01-collection", "after/01-collection.png", "before/01-collection.png"],
      ["02-new-sheet", "after/02-new-sheet.png", null],
    ],
  );
  assert.deepEqual(manifest.videos, {});
  assert.equal(readFileSync(join(out, "before", "01-collection.png"), "utf8"), "before-1");
  assert.equal(readFileSync(join(out, "before", "failure.png"), "utf8"), "stopped");
  assert.ok(existsSync(join(out, "after", "02-new-sheet.png")));
});

test("a head run that stopped before any step still shows where it stopped", () => {
  const root = mkdtempSync(join(tmpdir(), "vr-head-"));
  mkdirSync(join(root, "after-run", "kit-509", "screenshots"), { recursive: true });
  writeFileSync(
    join(root, "after-run", "kit-509", "screenshots", "step-005-tapOn.png"),
    "head stop",
  );
  const out = join(root, "out");
  const run = spawnSync(
    process.execPath,
    [
      SCRIPT,
      "--flow",
      "kit-509",
      "--after",
      join(root, "after-run"),
      "--before",
      join(root, "none"),
      "--out",
      out,
      "--head",
      "a".repeat(40),
      "--base",
      "b".repeat(40),
      "--run-url",
      "https://github.com/o/r/actions/runs/1",
      "--after-status",
      "failed",
      "--before-status",
      "skipped",
    ],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr);
  const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.after, { status: "failed", failure: "after/failure.png" });
  assert.deepEqual(manifest.steps, []);
  assert.equal(readFileSync(join(out, "after", "failure.png"), "utf8"), "head stop");
});

test("the CLI refuses an unknown status", () => {
  const run = spawnSync(process.execPath, [SCRIPT, "--flow", "kit-1", "--after-status", "maybe"], {
    encoding: "utf8",
  });
  assert.equal(run.status, 2);
});
