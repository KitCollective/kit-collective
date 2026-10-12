import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  declaresScope,
  foldReview,
  GATE_EXIT,
  headChanged,
  landGate,
  matchesIssueKey,
  parseResultLine,
  prBound,
  remainingWaitSeconds,
  resolveHead,
  scopeEnv,
  scopeSource,
  sessionCheck,
  shouldLogGate,
  workpadHasPlan,
} from "../lib/gates.mjs";
import { append, readEvents } from "../lib/run-log.mjs";

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
  linear: { state: "To-do", labels: [] },
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
  const claimed = { ...free, linear: { state: "In Progress", labels: [] } };
  assert.equal(sessionCheck(claimed).code, GATE_EXIT.closed);
  for (const state of ["In Review", "Approval", "Merging", "Post-Merge"]) {
    assert.equal(sessionCheck({ ...free, linear: { state, labels: [] } }).code, GATE_EXIT.closed);
  }
  assert.equal(sessionCheck({ ...claimed, resume: true }).code, GATE_EXIT.open);
});

test("session-check: signal-up, wontfix and finished states refuse even on resume", () => {
  for (const labels of [["signal-up"], ["wontfix"]]) {
    assert.equal(
      sessionCheck({ ...free, resume: true, linear: { state: "To-do", labels } }).code,
      GATE_EXIT.closed,
    );
  }
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

test("prBound: only the PR's own head is valid, a different checkout is unknown", () => {
  assert.equal(prBound({ head: HEAD, prHead: HEAD.toUpperCase() }).ok, true);
  const other = prBound({ head: OTHER, prHead: HEAD });
  assert.equal(other.ok, false);
  assert.equal(
    other.line,
    "UNKNOWN: run this gate from the PR's worktree at aaaaaaaa (HEAD is bbbbbbbb)",
  );
  assert.equal(prBound({ head: "", prHead: HEAD }).ok, false);
});

test("resolveHead: explicit, then the PR head, never the checkout when a PR is named", () => {
  assert.equal(resolveHead({ explicit: "x", prHead: "y", checkoutHead: "z" }), "x");
  assert.equal(resolveHead({ prHead: "y", checkoutHead: "z" }), "y");
  assert.equal(resolveHead({ checkoutHead: "z" }), "z");
  assert.equal(resolveHead({}), "");
});

test("scopeEnv carries the PR text and never leaves PR_BODY empty", () => {
  assert.deepEqual(
    scopeEnv({ title: "KIT-1: t", body: "write-scope: apps/web/**", headRefName: "claude/kit-1" }),
    {
      PR_TITLE: "KIT-1: t",
      PR_BODY: "write-scope: apps/web/**",
      PR_HEAD_REF: "claude/kit-1",
    },
  );
  assert.equal(scopeEnv({ title: "t", body: "" }).PR_BODY, " ");
});

test("declaresScope sees a write-scope line in the PR text only", () => {
  assert.equal(
    declaresScope({ title: "t", body: "write-scope: apps/web/**", headRefName: "b" }),
    true,
  );
  assert.equal(declaresScope({ title: "t", body: "nothing here", headRefName: "b" }), false);
});

test("the scope step receives the PR_* env (gate.mjs wires scopeEnv into it)", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(GATE, "utf8");
  assert.match(source, /check-pr-write-scope\.mjs", \[\], \{ \.\.\.base, \.\.\.scope\.env \}/);
  assert.match(source, /prBound\(\{ head: await git/);
});

test("matchesIssueKey: a boundary after the number", () => {
  assert.equal(matchesIssueKey("claude/kit-27-d7ad5f", "KIT-27"), true);
  assert.equal(matchesIssueKey("claude/kit-276-d7ad5f", "KIT-27"), false);
  assert.equal(matchesIssueKey("KIT-27: title", "KIT-27"), true);
  assert.equal(matchesIssueKey("claude/kit-276-d7ad5f", "KIT-276"), true);
  assert.equal(matchesIssueKey("claude/xkit-27", "KIT-27"), false);
  assert.equal(matchesIssueKey("kit-27", "KIT-27"), true);
});

test("review fold after an early stop names only the steps that ran", () => {
  const folded = foldReview([
    { name: "review-gate", code: 0, line: "ok" },
    { name: "doc-references", code: 1, line: "names a removed path" },
  ]);
  assert.equal(folded.code, GATE_EXIT.closed);
  assert.equal(folded.line, "CLOSED (review): doc-references: names a removed path");
});

test("skills and ADRs call the gate CLIs in their current form", async () => {
  const { readdirSync, readFileSync: read } = await import("node:fs");
  const files = [
    ...["bb-orchestrate", "issue-session", "code-review", "implement"].map(
      (name) => `.cursor/skills/${name}/SKILL.md`,
    ),
    ...readdirSync("docs/adr")
      .filter((f) => /^005[3-6]/.test(f))
      .map((f) => `docs/adr/${f}`),
  ];
  for (const file of files) {
    const text = read(file, "utf8");
    for (const [, call] of text.matchAll(/`(node scripts\/head-changed\.mjs [^`]*)`/g)) {
      assert.match(call, /--(pr|head) /, `${file}: ${call}`);
    }
    for (const [, call] of text.matchAll(/`(node scripts\/sync-pr\.mjs valid [^`]*)`/g)) {
      assert.match(call, /--pr /, `${file}: ${call}`);
    }
  }
});

test("generic result line: the last non-empty line, free trailing sentence, whole-line wrapper", () => {
  const line = "LEAD-RESULT KIT-7 plan the plan is in the workpad";
  assert.deepEqual(parseResultLine("LEAD-RESULT", `notes\n\n${line}  \n\n`), {
    issue: "KIT-7",
    outcome: "plan",
    rest: "the plan is in the workpad",
  });
  assert.equal(parseResultLine("LEAD-RESULT", `${line}\nExample: LEAD-RESULT KIT-7 stop x`), null);
  assert.equal(parseResultLine("LEAD-RESULT", `**${line}**`)?.outcome, "plan");
  assert.equal(parseResultLine("LEAD-RESULT", `see **${line}** above`), null);
  assert.equal(parseResultLine("LEAD-RESULT", `${line}\fdo not trust this`), null);
});

test("session-check: Blocked is closed while a blocker is unresolved, open once all are Done or Canceled", () => {
  const blocked = (blockedBy) => ({ ...free, linear: { state: "Blocked", labels: [], blockedBy } });
  const closedRun = sessionCheck(
    blocked([
      { identifier: "KIT-2", state: "Done" },
      { identifier: "KIT-3", state: "In Progress" },
    ]),
  );
  assert.equal(closedRun.code, GATE_EXIT.closed);
  assert.match(closedRun.line, /blocked by KIT-3/);
  assert.equal(
    sessionCheck({ ...blocked([{ identifier: "KIT-3", state: "In Review" }]), resume: true }).code,
    GATE_EXIT.closed,
  );
  const resolved = sessionCheck(
    blocked([
      { identifier: "KIT-2", state: "Done" },
      { identifier: "KIT-3", state: "Canceled" },
    ]),
  );
  assert.equal(resolved.code, GATE_EXIT.open);
  assert.match(resolved.line, /move it to To-do first/);
  assert.equal(sessionCheck(blocked([])).code, GATE_EXIT.closed);
});

test("session-check: needs-info / ready-for-human stop in Approval but mean answered in To-do", () => {
  for (const label of ["needs-info", "ready-for-human"]) {
    for (const state of ["Approval", "Backlog", "Triage", "In Progress"]) {
      assert.equal(
        sessionCheck({ ...free, resume: true, linear: { state, labels: [label] } }).code,
        GATE_EXIT.closed,
        `${label} in ${state}`,
      );
    }
    const answered = sessionCheck({
      ...free,
      resume: true,
      linear: { state: "To-do", labels: [label] },
    });
    assert.equal(answered.code, GATE_EXIT.open);
    assert.match(answered.line, new RegExp(`answered.*swap ${label} ready-for-agent`));
    assert.equal(
      sessionCheck({ ...free, linear: { state: "To-do", labels: [label] }, openPrs: [5] }).code,
      GATE_EXIT.open,
    );
  }
});

test("session-check: an unresolved blocker closes any unfinished state but Blocked's own rule, also on resume", () => {
  const blockedBy = [
    { identifier: "KIT-2", state: "Done" },
    { identifier: "KIT-3", state: "In Review" },
  ];
  for (const state of ["To-do", "Backlog", "In Progress", "Approval"]) {
    const run = sessionCheck({ ...free, resume: true, linear: { state, labels: [], blockedBy } });
    assert.equal(run.code, GATE_EXIT.closed, state);
    assert.match(run.line, /blocked by KIT-3/);
  }
  const resolved = [{ identifier: "KIT-2", state: "Canceled" }];
  assert.equal(
    sessionCheck({ ...free, linear: { state: "To-do", labels: [], blockedBy: resolved } }).code,
    GATE_EXIT.open,
  );
  assert.equal(
    sessionCheck({ ...free, linear: { state: "To-do", labels: ["needs-info"], blockedBy } }).code,
    GATE_EXIT.closed,
  );
});

test("scopeSource: the PR text wins, the issue stands in, and an issue scope missing from the PR is a named problem", () => {
  const view = { title: "KIT-1: t", body: "write-scope: apps/web/**", headRefName: "claude/kit-1" };
  const fromPr = scopeSource(view, "write-scope: other/**");
  assert.equal(fromPr.source, "pr");
  assert.deepEqual(fromPr.globs, ["apps/web/**"]);
  assert.equal(fromPr.problem, null);

  const bare = { title: "KIT-1: t", body: "no scope here", headRefName: "claude/kit-1" };
  const fromIssue = scopeSource(
    bare,
    "## What\nwrite-scope: scripts/tests/\\*\\*, docs/adr/\\*\\*\n",
  );
  assert.equal(fromIssue.source, "issue");
  assert.deepEqual(fromIssue.globs, ["scripts/tests/**", "docs/adr/**"]);
  assert.equal(fromIssue.env.WRITE_SCOPE, "scripts/tests/**, docs/adr/**");
  assert.match(fromIssue.problem, /^scope-missing-in-pr:/);

  const none = scopeSource(bare, "no scope either");
  assert.equal(none.source, "none");
  assert.equal(none.problem, null);
  assert.equal(scopeSource(bare, null).source, "none");
});

test("gate.mjs: pre-review never reads the matrix, review does, and both use the scope source", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(GATE, "utf8");
  assert.match(source, /\["review", "pre-review", "land"\]/);
  assert.match(source, /full\s*\?\s*\[\(\) => step\("matrix"/);
  assert.match(source, /scopeSource\(view, linear\.description\)/);
  assert.match(source, /name: "scope-in-pr"/);
});

test("skills order the gates: pre-review before the reviewer, the full review gate after it", async () => {
  const { readFileSync: read } = await import("node:fs");
  for (const file of [
    ".cursor/skills/issue-session/SKILL.md",
    ".cursor/skills/bb-orchestrate/SKILL.md",
  ]) {
    const text = read(file, "utf8");
    assert.match(text, /gate\.mjs pre-review <pr> --issue <KIT-n>/, file);
    assert.match(text, /gate\.mjs review <pr> --issue <KIT-n>/, file);
    assert.ok(
      text.indexOf("gate.mjs pre-review") < text.indexOf("gate.mjs review <pr>"),
      `${file}: pre-review comes first`,
    );
  }
  const implement = read(".cursor/skills/implement/SKILL.md", "utf8");
  assert.match(implement, /wait-for-checks\.mjs <pr> --timeout/);
  assert.match(implement, /Wait in the foreground/);
  assert.match(implement, /write-scope:` line verbatim into the PR body/);
});

test("foldReview: gh unusable (exit 5 from checks) is UNKNOWN, not closed", () => {
  const result = foldReview([
    { name: "scope", code: 0, line: "ok" },
    { name: "checks", code: 5, line: "UNKNOWN: gh too old, needs a gh whose pr checks has --json" },
  ]);
  assert.equal(result.code, GATE_EXIT.unknown);
  assert.match(result.line, /^UNKNOWN \(review\): checks: UNKNOWN: gh too old/);
});

test("workpadHasPlan: a Plan heading counts, a mention does not", () => {
  assert.equal(workpadHasPlan("## Workpad\n\n### Plan\n- step\n"), true);
  assert.equal(workpadHasPlan("## Workpad\nsee the ### Plan later\n"), false);
  assert.equal(workpadHasPlan("### Planning notes\n"), false);
  assert.equal(workpadHasPlan(""), false);
});

test("remainingWaitSeconds: the mechanical steps are subtracted from the total budget", () => {
  assert.equal(remainingWaitSeconds("480", 0), 480);
  assert.equal(remainingWaitSeconds("480", 100_000), 380);
  // A slow mechanical step (451 s of 480) leaves too little to wait: the gate answers waiting at once.
  assert.equal(remainingWaitSeconds("480", 451_000), null);
  assert.equal(remainingWaitSeconds("480", 600_000), null);
  assert.equal(remainingWaitSeconds("nonsense", 0), null);
  // Whatever the mechanical time, mechanical + wait never exceeds the total.
  for (const elapsed of [0, 90_000, 300_000, 449_000]) {
    const left = remainingWaitSeconds(480, elapsed);
    if (left !== null) assert.ok(elapsed / 1000 + left <= 480);
  }
});

test("gate.mjs passes the remaining budget to wait-for-checks and logs no waiting verdict", async () => {
  const src = readFileSync(GATE, "utf8");
  assert.match(
    src,
    /remainingWaitSeconds\(opt\("--timeout"\) \?\? "1800", Date\.now\(\) - startedAt\)/,
  );
  assert.match(src, /\[pr, "--timeout", String\(budget\)\]/);
  assert.equal((src.match(/if \(shouldLogGate\(result\)\)/g) ?? []).length, 2);
});

test("a waiting slice writes no gate event; only the final open or closed one does", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-log-"));
  const path = join(dir, "run-log.jsonl");
  const slices = [
    { code: GATE_EXIT.waiting, line: "WAITING" },
    { code: GATE_EXIT.waiting, line: "WAITING" },
    { code: GATE_EXIT.waiting, line: "WAITING" },
    { code: GATE_EXIT.open, line: "OPEN" },
  ];
  for (const result of slices) {
    if (shouldLogGate(result)) {
      append(
        {
          event: "gate",
          issue: "KIT-1",
          gate: "pre-review",
          outcome: result.code === 0 ? "open" : "closed",
        },
        { path },
      );
    }
  }
  const events = readEvents(path);
  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, "open");
  assert.equal(shouldLogGate({ code: GATE_EXIT.closed }), true);
});
