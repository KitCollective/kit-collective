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
    const optimizerPath = join(dir, "optimizer.md");
    const original =
      "<!-- Generated -->\n---\nname: nest\nmodel: cursor/composer-2.5\ninheritProjectContext: false\n---\n\nBody\n";
    const optimizerOriginal =
      "---\nname: optimizer\nmodel: cursor/composer-2.5\ninheritProjectContext: false\n---\n\nBody\n";
    writeFileSync(nestPath, original, "utf8");
    writeFileSync(optimizerPath, optimizerOriginal, "utf8");
    const restore = applyEconomyAgentPins(dir, 0);
    const pinned = readFileSync(nestPath, "utf8");
    assert.match(pinned, /^---/m);
    assert.doesNotMatch(pinned, /^<!--/m);
    assert.match(pinned, /^model:\s+openrouter\/tencent\/hy3/m);
    assert.doesNotMatch(pinned, /composer/i);
    assert.match(pinned, /^fallbackModels:\s+openrouter\//m);
    const pinnedOpt = readFileSync(optimizerPath, "utf8");
    assert.match(pinnedOpt, /^model:\s+openrouter\/tencent\/hy3/m);
    assert.doesNotMatch(pinnedOpt, /composer/i);
    restore();
    assert.equal(readFileSync(nestPath, "utf8"), original);
    assert.equal(readFileSync(optimizerPath, "utf8"), optimizerOriginal);
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
