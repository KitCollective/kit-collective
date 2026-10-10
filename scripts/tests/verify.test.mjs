import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  dirtyPaths,
  mergeCache,
  nothingToDo,
  reuseKey,
  runSuites,
  suiteIsDirty,
  suiteKey,
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

test("a dirty suite is run, not reused, and its result is not cached", async () => {
  const cache = {};
  await runSuites({
    ...table(),
    capabilities: ["postgres"],
    cache,
    ...harness(() => "pass").options,
  });
  const dirtyWeb = harness(() => "pass");
  const rows = await runSuites({
    ...table(),
    capabilities: ["postgres"],
    cache,
    isDirty: (suite) => suite.id === "web",
    ...dirtyWeb.options,
    keyOf: () => "k-web",
  });
  assert.equal(dirtyWeb.calls[0][0], "web", "the dirty suite ran although its key had a green row");
  assert.equal(rows[0].uncached, true);
  assert.match(verdictOf(rows).line, /1 on uncommitted changes and not cached/);

  // a failing dirty run must not poison, and a passing dirty run must not seed, the committed key
  const fresh = {};
  await runSuites({
    ...table(),
    capabilities: ["postgres"],
    cache: fresh,
    isDirty: () => true,
    ...harness(() => "pass").options,
  });
  assert.deepEqual(fresh, {});
  assert.deepEqual(mergeCache({}, [{ id: "web", key: "k", status: "pass", uncached: true }]), {});
  const clean = harness(() => "pass");
  const again = await runSuites({
    ...table(),
    capabilities: ["postgres"],
    cache: fresh,
    ...clean.options,
  });
  assert.equal(clean.calls.length, 3, "nothing was cached, so a clean run executes everything");
  assert.ok(again.every((r) => r.status === "pass" || r.status === "skipped"));
});

test("dirtyPaths keeps both sides of a rename and needs no unquoting (-z)", () => {
  const z = (...entries) => `${entries.join("\0")}\0`;
  assert.deepEqual(
    dirtyPaths(
      z(" M apps/web/a.ts", "?? docs/new.md", "R  docs/a.ts", "apps/web/a.ts", " M pnpm-lock.yaml"),
    ),
    ["apps/web/a.ts", "docs/new.md", "docs/a.ts", "apps/web/a.ts", "pnpm-lock.yaml"],
  );
  assert.deepEqual(dirtyPaths(z("?? apps/web/blåbær.ts", "?? apps/web/with space.ts")), [
    "apps/web/blåbær.ts",
    "apps/web/with space.ts",
  ]);
  assert.deepEqual(dirtyPaths(z("C  copy.ts", "orig.ts")), ["copy.ts", "orig.ts"]);
  assert.deepEqual(dirtyPaths(""), []);
});

test("a rename across suites marks both suites dirty; non-ASCII and spaces match globs", () => {
  const web = { paths: ["apps/web/**"] };
  const docs = { paths: ["docs/**"] };
  const dirty = dirtyPaths("R  docs/a.ts\0apps/web/a.ts\0");
  assert.equal(suiteIsDirty(dirty, web), true, "the old path lives in the web suite");
  assert.equal(suiteIsDirty(dirty, docs), true);
  assert.equal(suiteIsDirty(dirtyPaths("?? apps/web/blåbær med mellemrum.ts\0"), web), true);
});

test("a changed global path selects every suite; --changed with no match is NOTHING TO DO, not OK", () => {
  const { suites } = table();
  assert.equal(suitesFor(["package.json"], suites, ["package.json"]).length, suites.length);
  assert.equal(suitesFor(["pnpm-lock.yaml"], suites, ["pnpm-lock.yaml"]).length, suites.length);
  assert.deepEqual(suitesFor(["package.json"], suites), [], "without globals nothing matches");
  const none = nothingToDo();
  assert.equal(none.code, VERIFY_EXIT.nothing);
  assert.notEqual(none.code, VERIFY_EXIT.ok);
  assert.match(none.line, /^VERIFY NOTHING TO DO/);
  assert.doesNotMatch(none.line, /VERIFY OK/);
});

test("a dirty run is named as not being for the commit", async () => {
  const rows = await runSuites({
    ...table(),
    capabilities: ["postgres"],
    cache: {},
    isDirty: (suite) => suite.id === "web",
    ...harness(() => "pass").options,
  });
  const v = verdictOf(rows, { head: "0123456789abcdef" });
  assert.equal(v.code, VERIFY_EXIT.ok);
  assert.match(v.line, /^VERIFY OK \(dirty: not for 01234567; /);
  assert.doesNotMatch(
    verdictOf(
      rows.map((r) => ({ ...r, uncached: false })),
      { head: "0123456789" },
    ).line,
    /dirty/,
  );
});

test("a global path or the node version invalidates every suite's key", () => {
  const suites = table().suites;
  const listing =
    "100644 blob aaa\tapps/web/a.ts\n100644 blob bbb\tpnpm-lock.yaml\n100644 blob ccc\tdocs/d.md";
  const keys = (full, nodeVersion = "v22") =>
    suites.map((suite) =>
      suiteKey({ suite, globalPaths: ["pnpm-lock.yaml"], fullListing: full, nodeVersion }),
    );
  const base = keys(listing);
  const lockChanged = keys(listing.replace("bbb", "zzz"));
  assert.ok(base.every((key, i) => key !== lockChanged[i]));
  assert.ok(base.every((key, i) => key !== keys(listing, "v24")[i]));
  const unrelated = keys(listing.replace("aaa", "yyy"));
  assert.equal(unrelated[2], base[2], "a change in apps/web leaves the docs suite key alone");
});

test("mergeCache keeps entries another run wrote and takes only this run's fresh results", () => {
  const current = { api: { key: "k-api", status: "pass" }, web: { key: "old", status: "pass" } };
  const merged = mergeCache(current, [
    { id: "web", key: "new", status: "pass" },
    { id: "docs", status: "skipped" },
    { id: "api", status: "reused", key: "k-api" },
  ]);
  assert.deepEqual(merged, {
    api: { key: "k-api", status: "pass" },
    web: { key: "new", status: "pass" },
  });
});

test("validateChecks checks globalPaths", () => {
  assert.match(validateChecks({ globalPaths: "x", suites: table().suites }).join(), /globalPaths/);
  assert.deepEqual(validateChecks({ globalPaths: ["a"], suites: table().suites }), []);
});

test("a failing dirty run and a NOTHING TO DO line are marked dirty; the head is never truncated text", async () => {
  const rows = await runSuites({
    ...table(),
    capabilities: ["postgres"],
    cache: {},
    isDirty: (suite) => suite.id === "web",
    ...harness((id) => (id === "web" ? "fail" : "pass")).options,
  });
  const failed = verdictOf(rows, { head: "0123456789abcdef" });
  assert.equal(failed.code, VERIFY_EXIT.failed);
  assert.match(failed.line, /^VERIFY FAIL \(dirty: not for 01234567\): web \(fail\)/);
  assert.match(
    verdictOf(rows.map((r) => ({ ...r, status: "pass" }))).line,
    /dirty: not for the checked commit;/,
  );
  assert.doesNotMatch(verdictOf(rows.map((r) => ({ ...r, status: "pass" }))).line, /the chec;/);
  assert.match(
    nothingToDo({ dirty: true, head: "0123456789abcdef" }).line,
    /^VERIFY NOTHING TO DO \(dirty: not for 01234567\)/,
  );
  assert.doesNotMatch(nothingToDo().line, /dirty/);
});
