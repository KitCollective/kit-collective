import assert from "node:assert/strict";
import { test } from "node:test";
import { matchRoles, parseRisk, parseWriteScope, startDecision } from "../lib/start-decision.mjs";

const small = "write-scope: apps/web/**\n\n## Testing\nunit";

test("a small single-area issue with Testing needs no plan", () => {
  const d = startDecision({ body: small });
  assert.equal(d.plan, false);
  assert.equal(d.engineerModel, "sonnet");
  assert.deepEqual(d.roles, ["frontend"]);
});

test("no Testing section means plan", () => {
  assert.equal(startDecision({ body: "write-scope: apps/web/**" }).plan, true);
});

test("write-scope over two apps means plan with both roles", () => {
  const d = startDecision({ body: `write-scope: apps/web/**, apps/api/**\n## Testing\nx` });
  assert.equal(d.plan, true);
  assert.deepEqual(d.roles.sort(), ["backend", "frontend"]);
});

test("Risk line and high-risk paths force plan and the strong model", () => {
  assert.equal(startDecision({ body: `Risk: medium\n${small}` }).plan, true);
  const high = startDecision({ body: "write-scope: packages/db/**\n## Testing\nx" });
  assert.equal(high.plan, true);
  assert.equal(high.engineerModel, "opus");
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
  assert.equal(parseRisk("nothing"), "");
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
