import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  FACTORY_CHECKER_MEMORY_TOOLS,
  missingFactoryCheckerSpawnCoverage,
} from "../check-factory-checker-spawn.mjs";

function currentFiles() {
  return {
    piJob: readFileSync(new URL("../../harness/pi-job.mjs", import.meta.url), "utf8"),
    checkerSpawn: readFileSync(new URL("../../harness/checker-spawn.mjs", import.meta.url), "utf8"),
    checkerExit: readFileSync(new URL("../../harness/checker-exit.mjs", import.meta.url), "utf8"),
    dockerfile: readFileSync(new URL("../../harness/Dockerfile", import.meta.url), "utf8"),
    role: readFileSync(new URL("../../.pi/roles/factory-checker.md", import.meta.url), "utf8"),
    host: readFileSync(new URL("../../harness/host.md", import.meta.url), "utf8"),
    checkerHermes: readFileSync(
      new URL("../../.pi/agent-checker/hermes-memory-config.json", import.meta.url),
      "utf8",
    ),
    implementRole: readFileSync(new URL("../../.pi/roles/implement.md", import.meta.url), "utf8"),
    codeReviewSkill: readFileSync(
      new URL("../../.cursor/skills/code-review/SKILL.md", import.meta.url),
      "utf8",
    ),
  };
}

test("factory-checker spawn ratchet passes on current repo", () => {
  assert.deepEqual(missingFactoryCheckerSpawnCoverage(currentFiles()), []);
});

test("ratchet fails when factory-checker loses memory_search", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    checkerSpawn: files.checkerSpawn.replace('"memory_search",', ""),
  };
  const missing = missingFactoryCheckerSpawnCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("memory_search")));
});

test("ratchet fails when factory-checker regains repo write on allowlist", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    checkerSpawn: files.checkerSpawn.replace(
      "export const FACTORY_CHECKER_ALLOWED_TOOLS = [",
      'export const FACTORY_CHECKER_ALLOWED_TOOLS = ["write", ',
    ),
  };
  const missing = missingFactoryCheckerSpawnCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("write")));
});

test("ratchet fails when skill_manage appears on factory-checker allowlist", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    checkerSpawn: files.checkerSpawn.replace(
      "export const FACTORY_CHECKER_ALLOWED_TOOLS = [",
      'export const FACTORY_CHECKER_ALLOWED_TOOLS = ["skill_manage", ',
    ),
  };
  const missing = missingFactoryCheckerSpawnCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("skill_manage")));
});

test("ratchet fails when checker Hermes config disables review", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    checkerHermes: files.checkerHermes.replace('"reviewEnabled": true', '"reviewEnabled": false'),
  };
  const missing = missingFactoryCheckerSpawnCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("reviewEnabled")));
});

test("ratchet fails when factory-checker loses subagent on allowlist", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    checkerSpawn: files.checkerSpawn.replace('"subagent",', ""),
  };
  const missing = missingFactoryCheckerSpawnCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("subagent")));
});

test("ratchet fails when checker-exit loses missing Slop axis guard", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    checkerExit: files.checkerExit.replaceAll("reviewFeedbackMissingSlopAxis", "missingSlopGuard"),
  };
  const missing = missingFactoryCheckerSpawnCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("Slop axis")));
});

test("ratchet fails when pi-job loses Slop spawn wiring", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    piJob: files.piJob.replaceAll("applySlopAgentSpawnEnv", "applySlopSpawnEnv"),
  };
  const missing = missingFactoryCheckerSpawnCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("applySlopAgentSpawnEnv")));
});

test("ratchet fails when checker-exit reintroduces legacy bare - (none) pass line", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    checkerExit: `${files.checkerExit}\nconst LEGACY_PASS_LINE = /^-\\s*\\(none\\)\\s*$/i;\n`,
  };
  const missing = missingFactoryCheckerSpawnCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("legacy bare - (none)")));
});

test("ratchet fails when checker-exit loses harness incomplete fallback", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    checkerExit: files.checkerExit.replaceAll(
      "REVIEW_FEEDBACK_HARNESS_INCOMPLETE",
      "HARNESS_INCOMPLETE",
    ),
  };
  const missing = missingFactoryCheckerSpawnCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("REVIEW_FEEDBACK_HARNESS_INCOMPLETE")));
});

test("ratchet fails when checker-exit skips Slop sync on empty findings", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    checkerExit: files.checkerExit.replace(
      "await syncSlopReviewThreadsSafely(gh, {",
      "if (parseSlopFindings(workpadBody).length > 0) { await gh.syncSlopReviewThreads({",
    ),
  };
  const missing = missingFactoryCheckerSpawnCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("sync Slop threads on every checker fail")));
});

test("ratchet fails when checker-exit loses Slop sync error isolation", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    checkerExit: files.checkerExit.replaceAll(
      "syncSlopReviewThreadsSafely",
      "syncSlopReviewThreads",
    ),
  };
  const missing = missingFactoryCheckerSpawnCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("isolate GitHub Slop sync errors")));
});

test("exported memory tools match spec allowlist", () => {
  assert.deepEqual(FACTORY_CHECKER_MEMORY_TOOLS, [
    "memory_search",
    "session_search",
    "memory_add",
    "memory_replace",
    "memory_remove",
  ]);
});

test("code-review skill documents Worker memory class schema for Standards and Slop", () => {
  const skill = currentFiles().codeReviewSkill;
  assert.match(skill, /class → lesson|class -> lesson/);
  assert.match(skill, /Never.*memory_add.*Spec|never.*memory_add.*Spec/i);
  assert.match(skill, /memory_remove/);
});

test("implement role documents memory_search at resume and forbids memory writes", () => {
  const implement = currentFiles().implementRole;
  assert.match(implement, /memory_search/);
  assert.match(implement, /Scout stays without `memory_search`|Scout stays without memory_search/i);
  assert.match(implement, /never call `memory_add`|never call memory_add/i);
});

test("ratchet fails when SLOP_AGENT_PI_ARGS joins with NUL", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    checkerSpawn: files.checkerSpawn.replace('join("\\n")', 'join("\\0")'),
  };
  const missing = missingFactoryCheckerSpawnCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("NUL")));
});
