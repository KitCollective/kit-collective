import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  foldReview,
  GATE_EXIT,
  headChanged,
  landGate,
  parseResultLine,
  sessionCheck,
} from "../lib/gates.mjs";

const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);
const GATE = join(fileURLToPath(new URL("..", import.meta.url)), "gate.mjs");

test("head-changed: a head audited red is closed, a new head or a green audit is open", () => {
  const red = [{ event: "audit", issue: "KIT-1", verdict: "red", sha: "aaaaaaa", round: 1 }];
  assert.equal(headChanged({ head: HEAD, issue: "KIT-1", events: red }).code, GATE_EXIT.closed);
  assert.equal(headChanged({ head: OTHER, issue: "KIT-1", events: red }).code, GATE_EXIT.open);
  assert.equal(headChanged({ head: HEAD, issue: "KIT-2", events: red }).code, GATE_EXIT.open);
  const green = [{ event: "audit", issue: "KIT-1", verdict: "green", sha: "aaaaaaa", round: 1 }];
  assert.equal(headChanged({ head: HEAD, issue: "KIT-1", events: green }).code, GATE_EXIT.open);
});

test("head-changed: only the last audit counts, and an unreadable head fails closed", () => {
  const events = [
    { event: "audit", issue: "KIT-1", verdict: "red", sha: "aaaaaaa", round: 1 },
    { event: "audit", issue: "KIT-1", verdict: "green", sha: "bbbbbbb", round: 2 },
  ];
  assert.equal(headChanged({ head: HEAD, issue: "KIT-1", events }).code, GATE_EXIT.open);
  assert.equal(headChanged({ head: "", issue: "KIT-1", events }).code, GATE_EXIT.closed);
});

test("head-changed: the workpad's lastReviewSha with open feedback also closes it", () => {
  const workpad =
    "### Loop counters\n- lastReviewSha: aaaaaaa\n### Review feedback\n- fix the thing\n### Evidence\n";
  assert.equal(
    headChanged({ head: HEAD, issue: "KIT-1", events: [], workpad }).code,
    GATE_EXIT.closed,
  );
  const cleared = workpad.replace("- fix the thing", "- (none)");
  assert.equal(
    headChanged({ head: HEAD, issue: "KIT-1", events: [], workpad: cleared }).code,
    GATE_EXIT.open,
  );
});

const free = {
  issue: "KIT-1",
  linear: { state: "Backlog", labels: [] },
  branches: [],
  openPrs: [],
  events: [],
};

test("session-check: a free issue is open", () => {
  assert.equal(sessionCheck(free).code, GATE_EXIT.open);
});

test("session-check: open PR, remote branch, claimed state each refuse; resume joins", () => {
  assert.equal(sessionCheck({ ...free, openPrs: [5] }).code, GATE_EXIT.closed);
  assert.equal(sessionCheck({ ...free, branches: ["claude/kit-1-x"] }).code, GATE_EXIT.closed);
  const claimed = { ...free, linear: { state: "Implementing", labels: [] } };
  assert.equal(sessionCheck(claimed).code, GATE_EXIT.closed);
  assert.equal(sessionCheck({ ...claimed, resume: true }).code, GATE_EXIT.open);
});

test("session-check: stop labels and finished states refuse even on resume", () => {
  assert.equal(
    sessionCheck({ ...free, resume: true, linear: { state: "Backlog", labels: ["needs-info"] } })
      .code,
    GATE_EXIT.closed,
  );
  assert.equal(
    sessionCheck({ ...free, resume: true, linear: { state: "Done", labels: [] } }).code,
    GATE_EXIT.closed,
  );
});

test("session-check: a fresh start in the run log with no result is a live run; a result or age frees it", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  const started = { event: "start", issue: "KIT-1", at: "2026-10-10T11:50:00Z" };
  assert.equal(sessionCheck({ ...free, now, events: [started] }).code, GATE_EXIT.closed);
  const finished = { event: "result", issue: "KIT-1", at: "2026-10-10T11:55:00Z" };
  assert.equal(sessionCheck({ ...free, now, events: [started, finished] }).code, GATE_EXIT.open);
  assert.equal(
    sessionCheck({ ...free, now: now + 3600_000, events: [started] }).code,
    GATE_EXIT.open,
  );
});

const merged = { state: "MERGED", mergeCommit: HEAD, headSha: OTHER };
const ok = [
  { name: "test", conclusion: "success" },
  { name: "smoke", conclusion: "skipped" },
];

test("land gate: merged, on the lane, green is the only open", () => {
  assert.equal(landGate({ pr: merged, onIntegration: true, checks: ok }).code, GATE_EXIT.open);
  assert.equal(
    landGate({
      pr: { ...merged, state: "OPEN", mergeCommit: null },
      onIntegration: false,
      checks: null,
    }).code,
    GATE_EXIT.closed,
  );
  assert.equal(landGate({ pr: merged, onIntegration: false, checks: ok }).code, GATE_EXIT.waiting);
});

test("land gate: pending or missing integration checks wait, red closes", () => {
  assert.equal(landGate({ pr: merged, onIntegration: true, checks: [] }).code, GATE_EXIT.waiting);
  assert.equal(
    landGate({ pr: merged, onIntegration: true, checks: [{ name: "test" }] }).code,
    GATE_EXIT.waiting,
  );
  const red = landGate({
    pr: merged,
    onIntegration: true,
    checks: [{ name: "test", conclusion: "failure" }],
  });
  assert.equal(red.code, GATE_EXIT.closed);
  assert.match(red.line, /test/);
});

test("result line: found or missing", () => {
  const text = "thinking...\nLEAD-RESULT KIT-12 plan the plan is in the workpad\n";
  assert.deepEqual(parseResultLine("LEAD-RESULT", text), {
    issue: "KIT-12",
    outcome: "plan",
    rest: "the plan is in the workpad",
  });
  assert.equal(parseResultLine("LEAD-RESULT", "I am done."), null);
  assert.equal(parseResultLine("AUDIT-RESULT", text), null);
});

test("gate.mjs result: exit 0 on a line, 1 NO-RESULT without one", () => {
  const found = spawnSync("node", [GATE, "result", "LEAD-RESULT", "-"], {
    input: "LEAD-RESULT KIT-1 stop no access",
    encoding: "utf8",
  });
  assert.equal(found.status, 0);
  const none = spawnSync("node", [GATE, "result", "LEAD-RESULT", "-"], {
    input: "done",
    encoding: "utf8",
  });
  assert.equal(none.status, 1);
  assert.match(none.stdout, /^NO-RESULT/);
  assert.equal(spawnSync("node", [GATE, "review"], { encoding: "utf8" }).status, 2);
});

test("review fold: one verdict line, mechanical red outranks pending checks", () => {
  const clean = [
    { name: "review-gate", code: 0, line: "ok" },
    { name: "checks", code: 0, line: "GREEN" },
  ];
  assert.equal(foldReview(clean).code, GATE_EXIT.open);
  const mixed = [
    { name: "matrix", code: 1, line: "row `spec-ac` is missing" },
    { name: "checks", code: 2, line: "PENDING" },
  ];
  const folded = foldReview(mixed);
  assert.equal(folded.code, GATE_EXIT.closed);
  assert.match(folded.line, /matrix.*\+1 more: checks/);
  assert.equal(foldReview([{ name: "checks", code: 2, line: "PENDING" }]).code, GATE_EXIT.waiting);
  assert.equal(foldReview([{ name: "checks", code: 4, line: "?" }]).code, GATE_EXIT.unknown);
  assert.equal(foldReview([{ name: "checks", code: 3, line: "behind" }]).code, GATE_EXIT.closed);
});
