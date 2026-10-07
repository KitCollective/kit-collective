import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  artifactKey,
  findArtifacts,
  parseArtifactName,
  runRecordKey,
  screenshotFromKey,
} from "../e2e/artifacts.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";

test("a screenshot name carries flow and step", () => {
  assert.deepEqual(parseArtifactName("kc__search-bid__03-foreign-detail.png"), {
    flow: "search-bid",
    step: "03-foreign-detail",
    kind: "screenshot",
  });
});

test("a recording name carries the flow only", () => {
  assert.deepEqual(parseArtifactName("kc__search-bid.mp4"), {
    flow: "search-bid",
    step: null,
    kind: "video",
  });
});

test("other files are not evidence", () => {
  for (const name of ["screenshot.png", "kc__flow.png", "kc__flow__step.mp4", "kc__Flow__1.png"]) {
    assert.equal(parseArtifactName(name), null, name);
  }
});

test("evidence is keyed by commit, flow and step", () => {
  assert.equal(
    artifactKey(SHA, { flow: "collection", step: "01-samling", kind: "screenshot" }),
    `e2e/${SHA}/collection/01-samling.png`,
  );
  assert.equal(
    artifactKey(SHA, { flow: "collection", step: null, kind: "video" }),
    `e2e/${SHA}/collection/video.mp4`,
  );
  assert.equal(runRecordKey(SHA), `e2e/${SHA}/run.json`);
});

test("a screenshot key maps back to flow and step; other keys do not", () => {
  assert.deepEqual(screenshotFromKey(SHA, `e2e/${SHA}/collection/01-samling.png`), {
    flow: "collection",
    step: "01-samling",
  });
  assert.equal(screenshotFromKey(SHA, `e2e/${SHA}/collection/video.mp4`), null);
  assert.equal(screenshotFromKey(SHA, `e2e/${SHA}/run.json`), null);
  assert.equal(screenshotFromKey(SHA, "e2e/other/collection/01-samling.png"), null);
});

test("findArtifacts walks the roots and keeps the newest copy of a retried step", () => {
  const root = mkdtempSync(join(tmpdir(), "kc-evidence-"));
  mkdirSync(join(root, "first", "nested"), { recursive: true });
  mkdirSync(join(root, "retry"));
  mkdirSync(join(root, "node_modules"));
  const old = join(root, "first", "nested", "kc__collection__01-samling.png");
  const fresh = join(root, "retry", "kc__collection__01-samling.png");
  writeFileSync(old, "old");
  writeFileSync(fresh, "fresh");
  utimesSync(old, new Date(1_000_000), new Date(1_000_000));
  writeFileSync(join(root, "first", "kc__collection.mp4"), "video");
  writeFileSync(join(root, "first", "notes.png"), "ignored");
  writeFileSync(join(root, "node_modules", "kc__collection__02-x.png"), "ignored");

  const artifacts = findArtifacts([root]);

  assert.deepEqual(
    artifacts.map((artifact) => [artifact.kind, artifact.flow, artifact.step, artifact.path]),
    [
      ["video", "collection", null, join(root, "first", "kc__collection.mp4")],
      ["screenshot", "collection", "01-samling", fresh],
    ],
  );
});
