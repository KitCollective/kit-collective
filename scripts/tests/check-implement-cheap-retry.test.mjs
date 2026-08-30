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

test("implement cheap-retry coverage fails when Gate drops Mechanical close ownership", () => {
  const sources = loadSources();
  sources.gate = "# empty gate\n";
  const missing = missingImplementCheapRetryCoverage(sources);
  assert.ok(
    missing.some((item) => /Mechanical close|format:check|superseded|do not spawn/i.test(item)),
  );
});

test("implement cheap-retry coverage fails when Mechanical close drops classifyCiFailure", () => {
  const sources = loadSources();
  sources.implementExit = sources.implementExit.replace(
    /export function classifyCiFailure/g,
    "function droppedClassify",
  );
  const missing = missingImplementCheapRetryCoverage(sources);
  assert.ok(missing.some((item) => item.includes("classifyCiFailure")));
});

test("implement cheap-retry coverage fails when Pi posts a retry-cap hold", () => {
  const sources = loadSources();
  sources.piJob = `${sources.piJob}\nretry-cap-hold implementRetryCapComment\n`;
  const missing = missingImplementCheapRetryCoverage(sources);
  assert.ok(missing.some((item) => item.includes("pi-job.mjs must not hold")));
});
