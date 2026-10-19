import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { append, extractUsage, logPath, readEvents, validateEvent } from "../lib/run-log.mjs";
import { buildReport, renderReport } from "../lib/run-report.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "run-log.mjs");
const tmp = () => join(mkdtempSync(join(tmpdir(), "run-log-")), "log.jsonl");

test("a valid event is appended with a timestamp; free text is refused", () => {
  const path = tmp();
  append({ event: "start", issue: "KIT-1" }, { path });
  assert.throws(
    () => append({ event: "reason", issue: "KIT-1", code: "he said no" }, { path }),
    /invalid code/,
  );
  assert.throws(
    () => append({ event: "start", issue: "KIT-1", note: "hello" }, { path }),
    /unknown field note/,
  );
  const events = readEvents(path);
  assert.equal(events.length, 1);
  assert.match(events[0].at, /^\d{4}-/);
});

test("validation: required fields, shapes, no secrets", () => {
  assert.deepEqual(
    validateEvent({ event: "spawn", issue: "KIT-1", step: "lead", thread: "thr_abc123" }),
    [],
  );
  assert.deepEqual(validateEvent({ event: "spawn", issue: "KIT-1", step: "lead" }), []); // a Task sub-agent has no thread id
  assert.ok(
    validateEvent({ event: "spawn", issue: "KIT-1", step: "lead", thread: "not a thread" }).length >
      0,
  );
  assert.ok(
    validateEvent({ event: "spawn", issue: "kit-1", step: "lead", thread: "thr_abc123" }).includes(
      "invalid issue",
    ),
  );
  assert.ok(
    validateEvent({ event: "audit", issue: "KIT-1", verdict: "red", round: 1, sha: "zz" }).includes(
      "invalid sha",
    ),
  );
  assert.ok(
    validateEvent({ event: "gate", issue: "KIT-1", gate: "land", outcome: "red" }).length > 0,
  );
  assert.deepEqual(
    validateEvent({
      event: "audit",
      issue: "KIT-1",
      verdict: "red",
      round: 1,
      sha: "abc1234",
      rows: ["spec-ac"],
    }),
    [],
  );
  assert.ok(
    validateEvent({
      event: "audit",
      issue: "KIT-1",
      verdict: "red",
      round: 1,
      sha: "abc1234",
      rows: ["nope"],
    }).length > 0,
  );
});

test("logPath: env wins, then config, then the default in the main checkout", () => {
  assert.equal(logPath({ env: { KC_RUN_LOG: "/x/y.jsonl" } }), "/x/y.jsonl");
  assert.equal(
    logPath({ env: {}, config: { flow: { runLog: "/abs/log.jsonl" } } }),
    "/abs/log.jsonl",
  );
  const fallback = logPath({ env: {}, config: {} });
  assert.ok(fallback.endsWith("/.factory/run-log.jsonl"));
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    encoding: "utf8",
  }).trim();
  assert.equal(fallback, join(dirname(common), ".factory/run-log.jsonl"));
});

test("extractUsage returns nulls when bb shows no usage, numbers when it does", () => {
  assert.deepEqual(extractUsage({ thread: { id: "thr_x" } }), { tokensIn: null, tokensOut: null });
  assert.deepEqual(extractUsage({ thread: { usage: { inputTokens: 10, outputTokens: 4 } } }), {
    tokensIn: 10,
    tokensOut: 4,
  });
});

function sample() {
  const e = (event) => ({ at: "2026-10-10T00:00:00Z", ...event });
  return [
    e({ event: "spawn", issue: "KIT-1", step: "lead", thread: "thr_aaaa1" }),
    e({
      event: "result",
      issue: "KIT-1",
      step: "lead",
      outcome: "plan",
      tokensIn: 100,
      tokensOut: 50,
    }),
    e({
      event: "result",
      issue: "KIT-1",
      step: "engineer",
      outcome: "ready",
      tokensIn: 400,
      tokensOut: 100,
    }),
    e({ event: "audit", issue: "KIT-1", verdict: "green", round: 1, sha: "abc1234" }),
    e({
      event: "result",
      issue: "KIT-1",
      step: "lander",
      outcome: "landed",
      tokensIn: null,
      tokensOut: null,
    }),
    e({
      event: "result",
      issue: "KIT-2",
      step: "engineer",
      outcome: "ready",
      tokensIn: 300,
      tokensOut: 100,
    }),
    e({ event: "audit", issue: "KIT-2", verdict: "red", round: 1, sha: "abc1234" }),
    e({
      event: "result",
      issue: "KIT-2",
      step: "engineer",
      outcome: "ready",
      tokensIn: 200,
      tokensOut: 100,
    }),
    e({ event: "audit", issue: "KIT-2", verdict: "green", round: 2, sha: "def5678" }),
  ];
}

test("report splits issues by Lead and measures rework", () => {
  const report = buildReport(sample());
  assert.equal(report.withLead.issues, 1);
  assert.equal(report.withLead.meanRounds, 1);
  assert.equal(report.withLead.firstAuditRedShare, 0);
  assert.equal(report.withLead.landed, 1);
  assert.equal(report.withoutLead.meanRounds, 2);
  assert.equal(report.withoutLead.firstAuditRedShare, 1);
  assert.equal(report.withoutLead.reworkTokenShare, 0.43); // 300 of 700 after the first red
  assert.equal(report.tokensByStep.engineer, 1200);
  assert.match(
    renderReport(report),
    /with Lead \(n=1, SMALL SAMPLE \(under 10\): not a result\): 1 issues/,
  );
});

test("a log with no tokens reports n/a, never zero", () => {
  const report = buildReport([
    { event: "audit", issue: "KIT-3", verdict: "red", round: 1, sha: "abc1234" },
  ]);
  assert.equal(report.withoutLead.meanTokensPerIssue, null);
  assert.equal(report.withoutLead.issuesWithoutTokens, 1);
});

test("CLI appends, reports and refuses bad input", () => {
  const path = tmp();
  const env = { ...process.env, KC_RUN_LOG: path };
  const run = (...args) => spawnSync("node", [CLI, ...args], { env, encoding: "utf8" });
  assert.equal(run("start", "--issue", "KIT-9").status, 0);
  assert.equal(
    run(
      "result",
      "--issue",
      "KIT-9",
      "--step",
      "engineer",
      "--outcome",
      "ready",
      "--tokens-in",
      "null",
      "--tokens-out",
      "5",
    ).status,
    0,
  );
  assert.equal(
    run(
      "audit",
      "--issue",
      "KIT-9",
      "--verdict",
      "red",
      "--round",
      "1",
      "--sha",
      "abc1234",
      "--rows",
      "spec-ac,mergeable",
    ).status,
    0,
  );
  assert.equal(run("reason", "--issue", "KIT-9", "--code", "free text here").status, 2);
  assert.equal(readFileSync(path, "utf8").trim().split("\n").length, 3);
  assert.match(run("report").stdout, /without Lead \(n=1, SMALL SAMPLE/);
  assert.equal(run("path").stdout.trim(), path);
});

test("an engineer or reviewer spawn must carry thread, provider and model; a lead may omit them", () => {
  for (const step of ["engineer", "reviewer"]) {
    const bare = validateEvent({ event: "spawn", issue: "KIT-1", step });
    assert.deepEqual(bare, [
      `spawn ${step} needs thread`,
      `spawn ${step} needs provider`,
      `spawn ${step} needs model`,
    ]);
    assert.deepEqual(
      validateEvent({
        event: "spawn",
        issue: "KIT-1",
        step,
        thread: "thr_abc123",
        provider: "codex",
        model: "gpt-x",
      }),
      [],
    );
  }
  assert.deepEqual(validateEvent({ event: "spawn", issue: "KIT-1", step: "lead" }), []);
});

test("a holdout read event is valid; it needs the milestone path and a fixed reason code", () => {
  const read = {
    event: "holdout",
    code: "holdout-read",
    holdout: "holdout-scenarios/holdout.md",
    thread: "thr_abcd1234",
  };
  assert.deepEqual(validateEvent(read), []);
  const { thread: _thread, ...threadless } = read;
  assert.deepEqual(validateEvent(threadless), []);
  const { holdout: _holdout, ...noPath } = read;
  assert.ok(validateEvent(noPath).includes("holdout needs holdout"));
  assert.ok(validateEvent({ ...read, holdout: "../secret.md" }).includes("invalid holdout"));
  assert.ok(validateEvent({ ...read, holdout: "some free text" }).includes("invalid holdout"));
  assert.ok(validateEvent({ ...read, code: "he read it" }).includes("invalid code"));
});

// ---- Milestone scenarios (KIT-353): events that belong to a milestone, not an issue ------------

const MILESTONE = "holdout-scenarios/fixture";

test("a milestone event stands in for the issue; neither, both, or a malformed milestone is refused", () => {
  for (const event of [
    { event: "start", milestone: MILESTONE },
    {
      event: "spawn",
      milestone: MILESTONE,
      step: "scenario-judge",
      thread: "thr_judge001",
      provider: "claude-code",
      model: "claude-opus-5-5",
    },
    { event: "result", milestone: MILESTONE, step: "scenario-judge", outcome: "satisfied" },
    { event: "result", milestone: MILESTONE, step: "scenario-judge", outcome: "not-satisfied" },
    { event: "result", milestone: MILESTONE, step: "scenario-judge", outcome: "written" },
    {
      event: "result",
      milestone: MILESTONE,
      step: "scenario-judge",
      outcome: "not-met",
      sha: "a".repeat(40),
    },
    { event: "reason", milestone: MILESTONE, code: "development-moved" },
    { event: "reason", milestone: MILESTONE, code: "runner-no-result" },
  ]) {
    assert.deepEqual(validateEvent(event), [], JSON.stringify(event));
  }
  assert.ok(validateEvent({ event: "start" }).includes("start needs issue or milestone"));
  assert.ok(
    validateEvent({ event: "start", issue: "KIT-1", milestone: MILESTONE }).includes(
      "start takes issue or milestone, not both",
    ),
  );
  for (const bad of ["holdout-scenarios/fixture.md", "../x/y", "Holdout Scenarios/Fixture", "x"]) {
    assert.ok(validateEvent({ event: "start", milestone: bad }).includes("invalid milestone"), bad);
  }
  // Gates, audits and auto-land stay per issue.
  assert.ok(
    validateEvent({
      event: "gate",
      milestone: MILESTONE,
      gate: "review",
      outcome: "open",
    }).includes("gate needs issue"),
  );
});

test("the run-log CLI writes milestone events, and the report ignores them", () => {
  const path = tmp();
  const env = { ...process.env, KC_RUN_LOG: path };
  const cli = (...args) => spawnSync("node", [CLI, ...args], { env, encoding: "utf8" });
  assert.equal(cli("start", "--milestone", MILESTONE).status, 0);
  assert.equal(
    cli("result", "--milestone", MILESTONE, "--step", "scenario-judge", "--outcome", "satisfied")
      .status,
    0,
  );
  assert.equal(cli("start").status, 2);
  const events = readEvents(path);
  assert.equal(events.length, 2);
  assert.equal(events[0].milestone, MILESTONE);
  const withMilestone = buildReport([...sample(), ...events]);
  assert.deepEqual(withMilestone, buildReport(sample()));
});

test("an end line takes a fixed status, stop point and reason code, never free text", () => {
  const end = {
    event: "end",
    issue: "KIT-298",
    status: "In Review",
    stoppedAt: "review gate",
    reason: "round-cap",
    verdict: "amber",
    round: 5,
  };
  assert.deepEqual(validateEvent(end), []);
  assert.deepEqual(validateEvent({ ...end, status: "Shipped" }), ["invalid status"]);
  assert.deepEqual(validateEvent({ ...end, stoppedAt: "anywhere" }), ["invalid stoppedAt"]);
  assert.deepEqual(validateEvent({ ...end, reason: "the CI was slow" }), ["invalid reason"]);
  const { reason, ...noReason } = end;
  assert.deepEqual(validateEvent(noReason), ["end needs reason"]);
});
