import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { IMPLEMENT_MEMORY_EXCLUDED_TOOLS } from "../pi-job.mjs";
import {
  formatWorkerMemoryEntry,
  isRatchetPath,
  isValidWorkerMemoryLesson,
  listRatchetPaths,
  roleMayWriteWorkerMemory,
  shouldRecordWorkerMemoryFinding,
  WORKER_MEMORY_NON_WRITER_ROLES,
  workerMemorySearchQuery,
} from "../worker-memory.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function agentFrontmatter(relative) {
  const raw = readFileSync(join(ROOT, relative), "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : "";
}

test("Standards hard finding may become a Worker memory class", () => {
  assert.equal(
    shouldRecordWorkerMemoryFinding({
      axis: "Standards",
      finding: "inline imports in Nest modules",
    }),
    true,
  );
  const entry = formatWorkerMemoryEntry({
    className: "inline imports in Nest modules",
    lesson: "keep imports at top of file per no-inline-imports rule",
  });
  assert.match(entry.text, /inline imports in Nest modules →/);
  assert.equal(entry.target, "failure");
});

test("Slop hard finding uses the same class schema as Standards", () => {
  assert.equal(
    shouldRecordWorkerMemoryFinding({
      axis: "Slop",
      finding: "narrating comments in harness tests",
    }),
    true,
  );
  const entry = formatWorkerMemoryEntry({
    className: "narrating comments in harness tests",
    lesson: "delete comments that restate the next line of code",
  });
  assert.match(entry.text, /narrating comments in harness tests →/);
});

test("Spec miss is never written to Worker memory", () => {
  assert.equal(
    shouldRecordWorkerMemoryFinding({
      axis: "Spec",
      finding: "missing acceptance criterion for memory_search",
    }),
    false,
  );
  assert.equal(
    shouldRecordWorkerMemoryFinding({
      axis: "Spec",
      finding: "AC not ticked on issue description",
    }),
    false,
  );
});

test("reject hunk citations and KIT identifiers in lessons", () => {
  assert.equal(isValidWorkerMemoryLesson("harness/foo.mjs:12 narrating comment"), false);
  assert.equal(isValidWorkerMemoryLesson("fix KIT-128 before merge"), false);
  assert.throws(
    () =>
      formatWorkerMemoryEntry({
        className: "KIT-128 lesson",
        lesson: "do the thing",
      }),
    /KIT identifier/,
  );
});

test("ratchet paths are detectable for memory_remove promotion", () => {
  assert.equal(isRatchetPath(".cursor/hooks/block-dangerous-git.sh"), true);
  assert.equal(isRatchetPath("scripts/check-factory-checker-spawn.mjs"), true);
  assert.equal(isRatchetPath("harness/worker-memory.mjs"), false);
  assert.deepEqual(listRatchetPaths(["harness/foo.mjs", ".cursor/rules/secrets.mdc"]), [
    ".cursor/rules/secrets.mdc",
  ]);
});

test("implement spawn still excludes memory writes", () => {
  for (const tool of IMPLEMENT_MEMORY_EXCLUDED_TOOLS) {
    assert.ok(["memory_add", "memory_replace", "memory_remove", "skill_manage"].includes(tool));
  }
  assert.equal(roleMayWriteWorkerMemory("implement"), false);
});

test("Scout spawn still omits memory_search", () => {
  const scout = agentFrontmatter(".pi/agents/scout.md");
  assert.match(scout, /^tools:\s+read,\s*grep,\s*find,\s*ls\s*$/m);
  assert.doesNotMatch(scout, /memory_search/);
  assert.ok(WORKER_MEMORY_NON_WRITER_ROLES.includes("scout"));
});

test("workerMemorySearchQuery returns the class string for implement resume", () => {
  assert.equal(
    workerMemorySearchQuery("narrating comments in harness tests"),
    "narrating comments in harness tests",
  );
});
