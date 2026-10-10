import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { evaluateReceipt } from "../lib/audit-receipt.mjs";

const HEAD = "c0ffee1234567890c0ffee1234567890c0ffee12";
const thread = { id: "thr_rev12345", providerId: "codex", model: "gpt-x", createdAt: 2000 };
const green = `done\nAUDIT-RESULT KIT-7 green ${HEAD.slice(0, 12)} \n`;
const base = { thread, output: green, head: HEAD, headCommittedAt: 1000 };

test("a fresh thread that answered for this head earns a success receipt with provenance", () => {
  const r = evaluateReceipt(base);
  assert.equal(r.ok, true);
  assert.equal(r.state, "success");
  assert.equal(r.issue, "KIT-7");
  assert.match(r.description, /thr_rev12345 \(codex\/gpt-x\) at c0ffee1/);
});

test("red is a failure status and carries the failing rows", () => {
  const r = evaluateReceipt({
    ...base,
    output: `AUDIT-RESULT KIT-7 red ${HEAD.slice(0, 8)} spec-ac,mergeable`,
  });
  assert.equal(r.state, "failure");
  assert.deepEqual(r.rows, ["spec-ac", "mergeable"]);
});

test("refuses a thread that started before the head commit", () => {
  const r = evaluateReceipt({ ...base, headCommittedAt: 3000 });
  assert.equal(r.ok, false);
  assert.match(r.refusal, /started before the head commit/);
});

test("refuses a missing result line, a bad verdict and another sha", () => {
  assert.match(evaluateReceipt({ ...base, output: "looks fine to me" }).refusal, /no AUDIT-RESULT/);
  assert.match(
    evaluateReceipt({ ...base, output: `AUDIT-RESULT KIT-7 maybe ${HEAD.slice(0, 8)}` }).refusal,
    /not green/,
  );
  assert.match(
    evaluateReceipt({ ...base, output: "AUDIT-RESULT KIT-7 green deadbeef" }).refusal,
    /audited deadbeef/,
  );
  assert.match(evaluateReceipt({ ...base, output: "AUDIT-RESULT KIT-7 green" }).refusal, /no sha/);
  assert.match(
    evaluateReceipt({ ...base, output: `AUDIT-RESULT KIT-7 green abc` }).refusal,
    /audited abc/,
  );
});

test("refuses a thread id that is not a bb thread", () => {
  assert.match(
    evaluateReceipt({ ...base, thread: { ...thread, id: "me" } }).refusal,
    /not a bb thread/,
  );
});

test("different model is enforced only when asked, and only when both are known", () => {
  const same = { providerId: "codex", model: "gpt-x" };
  assert.equal(evaluateReceipt({ ...base, implementer: same }).ok, true);
  const refused = evaluateReceipt({ ...base, implementer: same, requireDifferentModel: true });
  assert.equal(refused.ok, false);
  assert.match(refused.refusal, /same provider and model/);
  assert.equal(
    evaluateReceipt({
      ...base,
      implementer: { providerId: "claude-code" },
      requireDifferentModel: true,
    }).ok,
    true,
  );
  assert.equal(
    evaluateReceipt({ ...base, implementer: null, requireDifferentModel: true }).ok,
    true,
  );
});

test("the description stays within GitHub's 140 characters", () => {
  const r = evaluateReceipt({
    ...base,
    thread: { ...thread, providerId: "p".repeat(60), model: "m".repeat(59) },
  });
  assert.ok(r.description.length <= 140);
});

test("CLI refuses bad usage with exit 2", () => {
  const cli = new URL("../audit-receipt.mjs", import.meta.url).pathname;
  assert.equal(spawnSync("node", [cli, "post", "12"], { encoding: "utf8" }).status, 2);
  assert.equal(spawnSync("node", [cli], { encoding: "utf8" }).status, 2);
});
