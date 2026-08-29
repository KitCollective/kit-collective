import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { harnessDockerCursorPaths } from "../../harness/implement-context.mjs";
import {
  missingHarnessDockerCursorContextCoverage,
  missingHarnessDockerCursorPaths,
  REQUIRED_FILES,
} from "../check-harness-docker-cursor-context.mjs";

function loadSources() {
  /** @type {Record<string, string>} */
  const sources = {};
  for (const [key, relative] of Object.entries(REQUIRED_FILES)) {
    sources[key] = readFileSync(relative, "utf8");
  }
  return sources;
}

test("harness docker cursor context coverage is present", () => {
  assert.deepEqual(missingHarnessDockerCursorContextCoverage(loadSources()), []);
});

test("harness docker cursor paths include design-system and implement skills", () => {
  const { skills, rules } = harnessDockerCursorPaths();
  assert.ok(skills.includes(".cursor/skills/tdd/SKILL.md"));
  assert.ok(skills.includes(".cursor/skills/implement/SKILL.md"));
  assert.ok(skills.includes(".cursor/skills/expo/expo-overview/SKILL.md"));
  assert.ok(rules.includes(".cursor/rules/design-system.mdc"));
  assert.deepEqual(missingHarnessDockerCursorPaths("."), []);
});

test("harness docker cursor context coverage fails when Dockerfile omits .cursor COPY", () => {
  const sources = loadSources();
  sources.dockerfile = sources.dockerfile.replace("COPY .cursor/rules ", "COPY .pi/rules ");
  const missing = missingHarnessDockerCursorContextCoverage(sources);
  assert.ok(missing.some((item) => item.includes("COPY .cursor/rules")));
});
