import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  describe,
  evaluateReceipt,
  ghMessage,
  statusPermissionLine,
} from "../lib/audit-receipt.mjs";
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
  assert.match(
    evaluateReceipt({ ...base, output: "looks fine to me" }).refusal,
    /exact AUDIT-RESULT/,
  );
  assert.match(
    evaluateReceipt({ ...base, output: `AUDIT-RESULT KIT-7 maybe ${HEAD.slice(0, 8)}` }).refusal,
    /exact AUDIT-RESULT/,
  );
  assert.match(
    evaluateReceipt({ ...base, output: "AUDIT-RESULT KIT-7 green deadbeef" }).refusal,
    /audited deadbeef/,
  );
  assert.match(
    evaluateReceipt({ ...base, output: "AUDIT-RESULT KIT-7 green" }).refusal,
    /exact AUDIT-RESULT/,
  );
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
  const identical = spawns.map((e) => ({ ...e, provider: "codex", model: "gpt-x" }));
  const refused = evaluateReceipt({ ...base, spawns: identical, requireDifferentModel: true });
  assert.match(refused.refusal, /the same as an engineer spawn/);
  assert.equal(evaluateReceipt({ ...base, spawns: identical }).ok, true, "not asked, not enforced");
});

test("same provider, different model is allowed (claude-code twice on sonnet and opus)", () => {
  const sameProvider = [
    {
      issue: "KIT-7",
      step: "engineer",
      thread: "thr_eng12345",
      provider: "claude-code",
      model: "sonnet",
    },
    {
      issue: "KIT-7",
      step: "reviewer",
      thread: "thr_rev12345",
      provider: "claude-code",
      model: "opus",
    },
  ];
  const claude = { ...thread, providerId: "claude-code" };
  const ok = evaluateReceipt({
    ...base,
    thread: claude,
    spawns: sameProvider,
    requireDifferentModel: true,
  });
  assert.equal(ok.ok, true);
  const sameModel = sameProvider.map((e) => ({ ...e, model: "sonnet" }));
  assert.equal(
    evaluateReceipt({ ...base, thread: claude, spawns: sameModel, requireDifferentModel: true }).ok,
    false,
  );
});

test("incomplete logging cannot bypass the different-model check", () => {
  const ask = (list) => evaluateReceipt({ ...base, spawns: list, requireDifferentModel: true });
  // an engineer spawn logged without a thread still counts against the reviewer
  const noThread = [
    { issue: "KIT-7", step: "engineer", provider: "codex", model: "gpt-x" },
    spawns[1],
  ];
  assert.match(ask(noThread).refusal, /the same as an engineer spawn/);
  // one engineer without a model, another with: refused, not skipped
  const partial = [
    { issue: "KIT-7", step: "engineer", thread: "thr_eng1aaaa", provider: "codex" },
    spawns[0],
    spawns[1],
  ];
  assert.match(ask(partial).refusal, /not logged for every engineer spawn/);
  assert.match(ask([spawns[1]]).refusal, /not logged for every engineer spawn/);
  assert.match(
    ask([spawns[0], { ...spawns[1], model: undefined }]).refusal,
    /not logged for the reviewer/,
  );
});

test("a short sha in the result line is refused", () => {
  assert.match(
    evaluateReceipt({ ...base, output: "AUDIT-RESULT KIT-7 green abc" }).refusal,
    /exact AUDIT-RESULT/,
  );
  assert.match(
    evaluateReceipt({ ...base, output: "AUDIT-RESULT KIT-7 green c0ffee" }).refusal,
    /exact AUDIT-RESULT/,
  );
  assert.equal(evaluateReceipt({ ...base, output: "AUDIT-RESULT KIT-7 green c0ffee1" }).ok, true);
  assert.equal(
    evaluateReceipt({ ...base, output: `AUDIT-RESULT KIT-7 green ${HEAD.toUpperCase()}` }).ok,
    true,
  );
});

test("rows are exact lock-row ids, comma separated, and only on amber or red", () => {
  const line = (rest) => evaluateReceipt({ ...base, output: `AUDIT-RESULT KIT-7 ${rest}` });
  const sha = HEAD.slice(0, 8);
  assert.deepEqual(line(`red ${sha} spec-ac,mergeable,docs-sync`).rows, [
    "spec-ac",
    "mergeable",
    "docs-sync",
  ]);
  assert.equal(line(`amber ${sha} state-machine`).ok, true);
  for (const bad of [
    `red ${sha} spec-ac, slop`, // a space after the comma, and `slop` is not a lock row
    `red ${sha} slop`,
    `red ${sha} spec-ac,spec-ac`,
    `green ${sha} spec-ac`,
  ]) {
    assert.equal(line(bad).ok, false, bad);
  }
});

test("a caveat on the same line or after it is never accepted as a result", () => {
  const sha = HEAD.slice(0, 8);
  const refused = (output) => evaluateReceipt({ ...base, output }).ok === false;
  assert.ok(refused(`AUDIT-RESULT KIT-7 green ${sha} (but do not merge: blocking bug)`));
  assert.ok(refused(`AUDIT-RESULT KIT-7 green ${sha}\nactually wait, do not merge`));
  for (const separator of ["\f", "\v", "\u0085", "\u2028", "\u2029", "\r"]) {
    assert.ok(
      refused(`AUDIT-RESULT KIT-7 green ${sha}${separator}do not merge`),
      JSON.stringify(separator),
    );
  }
  assert.equal(
    evaluateReceipt({ ...base, output: `**AUDIT-RESULT KIT-7 green ${sha}**` }).ok,
    true,
  );
  assert.equal(
    evaluateReceipt({ ...base, output: `\`AUDIT-RESULT KIT-7 green ${sha}\`` }).ok,
    true,
  );
  assert.ok(refused(`see **AUDIT-RESULT KIT-7 green ${sha}** here`));
});

test("only a permission refusal is called a missing permission, judged on stderr alone", () => {
  const perm = "token lacks Commit statuses write";
  assert.equal(
    statusPermissionLine({
      stderr: "gh: Resource not accessible by personal access token (HTTP 403)",
    }),
    perm,
  );
  assert.equal(statusPermissionLine({ stderr: "gh: Forbidden (HTTP 403)" }), perm);
  assert.equal(statusPermissionLine({ stderr: "gh: API rate limit exceeded (HTTP 403)" }), null);
  assert.equal(statusPermissionLine({ stderr: "gh: secondary rate limit (HTTP 403)" }), null);
  assert.equal(statusPermissionLine({ stderr: "gh: Not Found (HTTP 404)" }), null);
  assert.equal(statusPermissionLine({ message: "network down" }), null);
  // the command line (error.message) holds the description; a model called "secondary" must not decide
  assert.equal(
    statusPermissionLine({
      message: "Command failed: gh api -f description=audit green by thr_x (codex/secondary-abuse)",
      stderr: "gh: Resource not accessible by personal access token (HTTP 403)",
    }),
    perm,
  );
});

test("ghMessage is gh's own first stderr line and never the command line", () => {
  const error = {
    message: "Command failed: gh api repos/o/r/statuses/abc -f description=secret-model-name",
    stderr: "gh: Not Found (HTTP 404)\nmore",
  };
  assert.equal(ghMessage(error), "gh: Not Found (HTTP 404)");
  assert.doesNotMatch(ghMessage(error), /secret-model-name/);
  assert.equal(ghMessage({ message: "x" }), "x");
  assert.equal(
    ghMessage({ message: "Command failed: gh api -f description=zzz" }),
    "command failed",
  );
});

test("model comparison ignores case and surrounding whitespace, and does not resolve aliases", () => {
  const asked = (model) =>
    evaluateReceipt({
      ...base,
      spawns: [spawns[0], { ...spawns[1], provider: "claude-code", model }].map((e) =>
        e.step === "engineer" ? { ...e, provider: "claude-code", model: "sonnet" } : e,
      ),
      thread: { ...thread, providerId: "claude-code" },
      requireDifferentModel: true,
    });
  assert.equal(asked(" Sonnet ").ok, false);
  assert.equal(asked("SONNET").ok, false);
  assert.equal(
    asked("claude-sonnet-5-5").ok,
    true,
    "aliases are not resolved: only as good as the log",
  );
});

test("a quoted example before the real final line does not win, and one after it is refused", () => {
  const real = `AUDIT-RESULT KIT-7 red ${HEAD.slice(0, 8)} spec-ac`;
  const before = `Format: AUDIT-RESULT KIT-1 green <sha>\n${real}`;
  assert.equal(parseResultLine("AUDIT-RESULT", before).outcome, "red");
  const after = `${real}\nExample: AUDIT-RESULT KIT-7 green ${HEAD.slice(0, 8)}`;
  assert.equal(parseResultLine("AUDIT-RESULT", after), null);
});

test("CLI refuses bad usage with exit 2", () => {
  const cli = new URL("../audit-receipt.mjs", import.meta.url).pathname;
  assert.equal(spawnSync("node", [cli, "post", "12"], { encoding: "utf8" }).status, 2);
  assert.equal(spawnSync("node", [cli], { encoding: "utf8" }).status, 2);
});

test("describe never exceeds 140 characters and keeps the sha whole", () => {
  const head = "c0ffee1234567890";
  const make = (thread, model) =>
    describe({ verdict: "green", thread, provider: "codex", model, head });
  const short = make("thr_abc12345", "gpt-x");
  assert.equal(short, "audit green by thr_abc12345 (codex/gpt-x) at c0ffee1");
  const longModel = make("thr_abc12345", "m".repeat(300));
  assert.equal(longModel.length, 140);
  assert.match(longModel, /^audit green by thr_abc12345 \(codex\/m+…\) at c0ffee1$/);
  for (const model of ["gpt-x", "m".repeat(300)]) {
    const absurd = make(`thr_${"x".repeat(150)}`, model);
    assert.ok(absurd.length <= 140, `${absurd.length}`);
    assert.ok(absurd.endsWith(" at c0ffee1"));
    assert.ok(absurd.startsWith("audit green by thr_x"));
  }
});
