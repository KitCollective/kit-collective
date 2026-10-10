import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { evaluateReceipt, statusPermissionLine } from "../lib/audit-receipt.mjs";
import { parseResultLine } from "../lib/gates.mjs";

const HEAD = "c0ffee1234567890c0ffee1234567890c0ffee12";
// bb shows the provider and the creation time, not the model.
const thread = { id: "thr_rev12345", providerId: "codex", createdAt: 2000 };
const green = `done\nAUDIT-RESULT KIT-7 green ${HEAD.slice(0, 12)} \n`;
const spawns = [
  {
    issue: "KIT-7",
    step: "engineer",
    thread: "thr_eng12345",
    provider: "claude-code",
    model: "sonnet",
  },
  { issue: "KIT-7", step: "reviewer", thread: "thr_rev12345", provider: "codex", model: "gpt-x" },
];
const base = { thread, output: green, head: HEAD, headCommittedAt: 1000, spawns };

test("a fresh logged reviewer that answered for this head earns a success receipt", () => {
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
});

test("refuses a thread id that is not a bb thread", () => {
  assert.match(
    evaluateReceipt({ ...base, thread: { ...thread, id: "me" } }).refusal,
    /not a bb thread/,
  );
});

test("the reviewer thread being an engineer thread is refused", () => {
  const asEngineer = [
    ...spawns,
    { issue: "KIT-7", step: "engineer", thread: "thr_rev12345", provider: "codex", model: "gpt-x" },
  ];
  assert.match(evaluateReceipt({ ...base, spawns: asEngineer }).refusal, /implementer thread/);
  assert.match(
    evaluateReceipt({ ...base, implementerThread: "thr_rev12345" }).refusal,
    /implementer thread/,
  );
});

test("a thread with no spawn reviewer event in the run log is refused", () => {
  assert.match(
    evaluateReceipt({ ...base, spawns: spawns.slice(0, 1) }).refusal,
    /no spawn reviewer event for thr_rev12345 on KIT-7/,
  );
  const otherIssue = spawns.map((e) => ({ ...e, issue: "KIT-8" }));
  assert.equal(evaluateReceipt({ ...base, spawns: otherIssue }).ok, false);
});

test("a logged provider that bb contradicts is refused", () => {
  const lied = spawns.map((e) => (e.step === "reviewer" ? { ...e, provider: "claude-code" } : e));
  assert.match(evaluateReceipt({ ...base, spawns: lied }).refusal, /run log says provider/);
});

test("different model is judged from the run log, only when asked", () => {
  assert.equal(evaluateReceipt({ ...base, requireDifferentModel: true }).ok, true);
  // same provider, other model: allowed (this is the claude-code twice case)
  const sameProvider = [
    {
      issue: "KIT-7",
      step: "engineer",
      thread: "thr_eng12345",
      provider: "claude-code",
      model: "sonnet",
    },
    { issue: "KIT-7", step: "reviewer", thread: "thr_rev12345", provider: "codex", model: "opus" },
  ];
  const claudeThread = { ...thread, providerId: "codex" };
  assert.equal(
    evaluateReceipt({
      ...base,
      thread: claudeThread,
      spawns: sameProvider,
      requireDifferentModel: true,
    }).ok,
    true,
  );
  const identical = spawns.map((e) => ({ ...e, provider: "codex", model: "gpt-x" }));
  const refused = evaluateReceipt({ ...base, spawns: identical, requireDifferentModel: true });
  assert.match(refused.refusal, /the same as an engineer thread/);
  assert.equal(evaluateReceipt({ ...base, spawns: identical }).ok, true, "not asked, not enforced");
  const unlogged = spawns.map(({ model, ...e }) => e);
  assert.match(
    evaluateReceipt({ ...base, spawns: unlogged, requireDifferentModel: true }).refusal,
    /not logged for both/,
  );
});

test("the description stays within GitHub's 140 characters", () => {
  const long = spawns.map((e) =>
    e.step === "reviewer" ? { ...e, provider: "codex", model: "m".repeat(200) } : e,
  );
  const r = evaluateReceipt({ ...base, spawns: long });
  assert.ok(r.description.length <= 140);
});

test("a refused status post says the token lacks the permission", () => {
  assert.equal(
    statusPermissionLine({
      stderr: "gh: Resource not accessible by personal access token (HTTP 403)",
    }),
    "token lacks Commit statuses write",
  );
  assert.equal(
    statusPermissionLine({ message: "gh: Not Found (HTTP 404)" }),
    "token lacks Commit statuses write",
  );
  assert.equal(statusPermissionLine({ message: "network down" }), null);
});

test("the last AUDIT-RESULT line wins over a quoted example", () => {
  const output = `Format: AUDIT-RESULT KIT-1 green <sha>\nAUDIT-RESULT KIT-1 green <sha>\nwork...\nAUDIT-RESULT KIT-7 red ${HEAD.slice(0, 8)} spec-ac`;
  const parsed = parseResultLine("AUDIT-RESULT", output);
  assert.equal(parsed.issue, "KIT-7");
  assert.equal(parsed.outcome, "red");
});

test("CLI refuses bad usage with exit 2", () => {
  const cli = new URL("../audit-receipt.mjs", import.meta.url).pathname;
  assert.equal(spawnSync("node", [cli, "post", "12"], { encoding: "utf8" }).status, 2);
  assert.equal(spawnSync("node", [cli], { encoding: "utf8" }).status, 2);
});
