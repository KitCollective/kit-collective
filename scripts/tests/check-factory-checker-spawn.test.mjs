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

test("exported memory tools match spec allowlist", () => {
  assert.deepEqual(FACTORY_CHECKER_MEMORY_TOOLS, [
    "memory_search",
    "session_search",
    "memory_add",
    "memory_replace",
    "memory_remove",
  ]);
});
