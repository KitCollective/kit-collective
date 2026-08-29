import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  missingImplementCheapRetryCoverage,
  REQUIRED_FILES,
} from "../check-implement-cheap-retry.mjs";

function loadSources() {
  /** @type {Record<string, string>} */
  const sources = {};
  for (const [key, relative] of Object.entries(REQUIRED_FILES)) {
    sources[key] = readFileSync(relative, "utf8");
  }
  return sources;
}

test("implement cheap-retry coverage is present", () => {
  assert.deepEqual(missingImplementCheapRetryCoverage(loadSources()), []);
});

test("implement cheap-retry coverage fails when Gate drops format:check", () => {
  const sources = loadSources();
  sources.gate = sources.gate.replace(/format:check/g, "lint-only").replace(/biome ci/g, "skipped");
  const missing = missingImplementCheapRetryCoverage(sources);
  assert.ok(missing.some((item) => item.includes("format:check")));
});

test("implement cheap-retry coverage fails when resume drop the cap skip", () => {
  const sources = loadSources();
  sources.resume = sources.resume.replace(/implement retry cap/g, "busy");
  const missing = missingImplementCheapRetryCoverage(sources);
  assert.ok(missing.some((item) => item.includes("resume.mjs")));
});
