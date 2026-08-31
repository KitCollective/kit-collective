/**
 * Economy agent pin apply/restore.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { applyEconomyAgentPins } from "../economy-agents.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("applyEconomyAgentPins rewrites helpers to OpenRouter and restores", () => {
  const dir = mkdtempSync(join(tmpdir(), "kc-economy-agents-"));
  try {
    const nestPath = join(dir, "nest.md");
    const original =
      "---\nname: nest\nmodel: cursor/composer-2.5\ninheritProjectContext: false\n---\n\nBody\n";
    writeFileSync(nestPath, original, "utf8");
    const restore = applyEconomyAgentPins(dir, 0);
    const pinned = readFileSync(nestPath, "utf8");
    assert.match(pinned, /^model:\s+openrouter\//m);
    assert.doesNotMatch(pinned, /composer/i);
    assert.match(pinned, /^fallbackModels:\s+openrouter\//m);
    restore();
    assert.equal(readFileSync(nestPath, "utf8"), original);
    restore(); // idempotent
    assert.equal(readFileSync(nestPath, "utf8"), original);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pi-job restores economy pins before implement-exit git", () => {
  const src = readFileSync(join(ROOT, "harness/pi-job.mjs"), "utf8");
  const marker = "Restore before implement-exit / checker git";
  const restoreIdx = src.indexOf(marker);
  assert.ok(restoreIdx > 0, "early restore comment missing");
  const exitIdx = src.indexOf("await completeImplementAdw({", restoreIdx);
  assert.ok(exitIdx > restoreIdx, "restore must run before completeImplementAdw");
});
