import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  reuseKey,
  runSuites,
  suitesFor,
  treeListing,
  VERIFY_EXIT,
  validateChecks,
  verdictOf,
} from "../lib/verify.mjs";

const table = () => ({
  defaults: { timeoutSeconds: 10 },
  suites: [
    { id: "web", paths: ["apps/web/**"], command: "echo web" },
    { id: "api", paths: ["apps/api/**", "packages/**"], command: "echo api", needs: ["postgres"] },
    { id: "docs", paths: ["docs/**"], command: "echo docs", timeoutSeconds: 5 },
  ],
});

test("the repo's own checks table is valid", () => {
  const config = JSON.parse(readFileSync("factory.config.json", "utf8"));
  assert.deepEqual(validateChecks(config.checks), []);
  assert.ok(config.checks.suites.some((s) => s.needs?.includes("postgres")));
});

test("validation names every problem", () => {
  assert.ok(validateChecks(undefined).length > 0);
  const bad = {
    suites: [
      { id: "A b", paths: [], command: "" },
      { id: "x", paths: ["a"], command: "c", timeoutSeconds: 0, needs: "pg" },
      { id: "x", paths: ["a"], command: "c" },
    ],
  };
  const problems = validateChecks(bad).join("\n");
  assert.match(problems, /kebab-case/);
  assert.match(problems, /paths must be/);
  assert.match(problems, /command must be/);
  assert.match(problems, /timeoutSeconds/);
  assert.match(problems, /needs must be/);
  assert.match(problems, /duplicate id/);
});

test("suitesFor picks the suites a diff touches; null means all", () => {
  const { suites } = table();
  assert.deepEqual(
    suitesFor(["apps/web/a.ts"], suites).map((s) => s.id),
    ["web"],
  );
  assert.deepEqual(
    suitesFor(["packages/db/x.ts"], suites).map((s) => s.id),
    ["api"],
  );
  assert.equal(suitesFor(null, suites).length, 3);
  assert.deepEqual(suitesFor(["README.md"], suites), []);
});

test("treeListing keeps only matching paths, so another app's change does not alter the key", () => {
  const full =
    "100644 blob aaa\tapps/web/a.ts\n100644 blob bbb\tapps/api/b.ts\n100644 blob ccc\tREADME.md";
  assert.equal(treeListing(full, ["apps/web/**"]), "100644 blob aaa\tapps/web/a.ts");
  assert.equal(treeListing(full, ["*.md"]), "100644 blob ccc\tREADME.md");
  const changedApi = full.replace("bbb", "zzz");
  assert.equal(treeListing(changedApi, ["apps/web/**"]), treeListing(full, ["apps/web/**"]));
  assert.notEqual(treeListing(changedApi, ["apps/api/**"]), treeListing(full, ["apps/api/**"]));
});

test("reuseKey", () => {
  assert.notEqual(reuseKey("a", "tree"), reuseKey("b", "tree"));
  assert.notEqual(reuseKey("a", "tree1"), reuseKey("a", "tree2"));
  assert.equal(reuseKey("a", "t"), reuseKey("a", "t"));
});

function harness(statusOf, keys = {}) {
  const calls = [];
  return {
    calls,
    options: {
      keyOf: (s) => keys[s.id] ?? `k-${s.id}`,
      exec: async (s, timeout) => {
        calls.push([s.id, timeout]);
        return { status: statusOf(s.id), durationMs: 1 };
      },
    },
  };
}

test("runs suites one at a time, applies timeouts, skips missing capabilities", async () => {
  const h = harness(() => "pass");
  const rows = await runSuites({ ...table(), capabilities: [], cache: {}, ...h.options });
  assert.deepEqual(
    rows.map((r) => `${r.id}:${r.status}`),
    ["web:pass", "api:skipped", "docs:pass"],
  );
  assert.deepEqual(h.calls, [
    ["web", 10],
    ["docs", 5],
  ]);
  const v = verdictOf(rows);
  assert.equal(v.code, VERIFY_EXIT.incomplete);
  assert.match(v.line, /api \(needs postgres\)/);
});

test("a green row is reused while command and tree are unchanged, rerun when they change", async () => {
  const cache = {};
  const first = harness(() => "pass");
  await runSuites({ ...table(), capabilities: ["postgres"], cache, ...first.options });
  assert.equal(first.calls.length, 3);

  const second = harness(() => "pass");
  const rows = await runSuites({
    ...table(),
    capabilities: ["postgres"],
    cache,
    ...second.options,
  });
  assert.deepEqual(
    rows.map((r) => r.status),
    ["reused", "reused", "reused"],
  );
  assert.equal(second.calls.length, 0);
  assert.equal(verdictOf(rows).code, VERIFY_EXIT.ok);

  const third = harness(() => "pass", { web: "changed-tree" });
  await runSuites({ ...table(), capabilities: ["postgres"], cache, ...third.options });
  assert.deepEqual(
    third.calls.map((c) => c[0]),
    ["web"],
  );
});

test("a red row is never reused, and failure or timeout fails the verdict", async () => {
  const cache = {};
  const red = harness((id) => (id === "web" ? "fail" : id === "docs" ? "timeout" : "pass"));
  const rows = await runSuites({ ...table(), capabilities: ["postgres"], cache, ...red.options });
  const v = verdictOf(rows);
  assert.equal(v.code, VERIFY_EXIT.failed);
  assert.match(v.line, /web \(fail\), docs \(timeout\)/);
  const again = harness(() => "pass");
  await runSuites({ ...table(), capabilities: ["postgres"], cache, ...again.options });
  assert.deepEqual(
    again.calls.map((c) => c[0]),
    ["web", "docs"],
  );
});

test("--no-reuse reruns everything", async () => {
  const cache = {};
  await runSuites({
    ...table(),
    capabilities: ["postgres"],
    cache,
    ...harness(() => "pass").options,
  });
  const h = harness(() => "pass");
  await runSuites({ ...table(), capabilities: ["postgres"], cache, noReuse: true, ...h.options });
  assert.equal(h.calls.length, 3);
});
