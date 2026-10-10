import assert from "node:assert/strict";
import { test } from "node:test";
import { matchRoles, parseWriteScope, startDecision } from "../lib/start-decision.mjs";

const ticket = (scope, { seams = true } = {}) =>
  [
    "## Parent",
    "KIT-1",
    "## What to build",
    "A small thing.",
    "## Acceptance criteria",
    "- [ ] it works",
    ...(seams ? ["## Seams", "unit test at the service"] : []),
    "## Blocked by",
    "None",
    ...(scope ? [`write-scope: ${scope}`] : []),
  ].join("\n");
const small = ticket("apps/web/**");

test("a small single-area issue with Seams needs no plan", () => {
  const d = startDecision({ body: small });
  assert.equal(d.plan, false);
  assert.equal(d.engineerModel, "sonnet");
  assert.deepEqual(d.roles, ["frontend"]);
});

test("a real-template issue: Seams gives no plan, no Seams gives a plan", () => {
  assert.equal(startDecision({ body: ticket("apps/web/**") }).plan, false);
  const without = startDecision({ body: ticket("apps/web/**", { seams: false }) });
  assert.equal(without.plan, true);
  assert.match(without.planWhy, /no Seams section/);
  assert.equal(startDecision({ body: "## Testing\nx\nwrite-scope: apps/web/**" }).plan, false);
});

test("write-scope over two apps means plan with both roles", () => {
  const d = startDecision({ body: ticket("apps/web/**, apps/api/**") });
  assert.equal(d.plan, true);
  assert.deepEqual(d.roles.sort(), ["backend", "frontend"]);
});

test("high-risk paths force a plan and the strong model; ordinary paths do not", () => {
  const risk = (scope) => startDecision({ body: ticket(scope) });
  for (const scope of [
    "packages/db/**",
    ".github/workflows/**",
    "apps/api/src/identity/**",
    "apps/api/src/billing/iap.ts",
    "apps/api/**", // a parent of a high-risk path
  ]) {
    assert.equal(risk(scope).engineerModel, "opus", scope);
    assert.equal(risk(scope).modelWhy, "high-risk path", scope);
  }
  for (const scope of [
    "apps/api/src/catalog/**",
    "apps/api/src/search/**",
    "apps/admin/**",
    "apps/mobile/app/**",
  ]) {
    assert.equal(risk(scope).engineerModel, "sonnet", scope);
    assert.equal(risk(scope).plan, false, scope);
  }
});

test("an approval-plan label always plans", () => {
  assert.equal(startDecision({ body: small, labels: ["human-approves-plan"] }).plan, true);
});

test("strong model after two red audits or on replan, not after one", () => {
  assert.equal(startDecision({ body: small, redAudits: 1 }).engineerModel, "sonnet");
  assert.equal(startDecision({ body: small, redAudits: 2 }).engineerModel, "opus");
  assert.equal(startDecision({ body: small, replan: true }).engineerModel, "opus");
});

test("parsers tolerate missing lines", () => {
  assert.deepEqual(parseWriteScope(""), []);
  assert.deepEqual(matchRoles([]), []);
  assert.deepEqual(parseWriteScope("write-scope: `a/**`, b/**"), ["a/**", "b/**"]);
});

test("workflow or eas paths match devops", () => {
  assert.ok(matchRoles([".github/workflows/ci.yml"]).includes("devops"));
});

test("CLI prints one JSON line and exits 2 on bad input", async () => {
  const { spawnSync } = await import("node:child_process");
  const cli = new URL("../start-decision.mjs", import.meta.url).pathname;
  const ok = spawnSync("node", [cli, "--red-audits", "2"], {
    input: JSON.stringify({ body: small, labels: [] }),
    encoding: "utf8",
  });
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.stdout).engineerModel, "opus");
  assert.equal(spawnSync("node", [cli], { input: "{", encoding: "utf8" }).status, 2);
});
