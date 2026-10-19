import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/** Max's tick's stoppedRuns and receiptStall, from the tick's own source (self-contained functions above the IIFE). */
const { stoppedRuns, receiptStall } = (() => {
  const tick = readFileSync(
    join(fileURLToPath(new URL("../..", import.meta.url)), "staff/max/tick.js"),
    "utf8",
  );
  const from = tick.indexOf("function stoppedRuns(");
  const to = tick.indexOf("// end stoppedRuns");
  assert.ok(from >= 0 && to > from, "tick.js defines stoppedRuns");
  return new Function(`${tick.slice(from, to)}; return { stoppedRuns, receiptStall };`)();
})();

const NOW = Date.parse("2026-10-18T20:30:00Z");
const minutesAgo = (m) => new Date(NOW - m * 60000).toISOString();
const tickInput = (overrides = {}) => ({
  board: [{ key: "KIT-409", state: "In Progress" }],
  events: [
    { at: minutesAgo(190), event: "gate", issue: "KIT-409", gate: "session", outcome: "open" },
    { at: minutesAgo(187), event: "start", issue: "KIT-409" },
  ],
  prOf: () => undefined,
  skip: new Set(),
  now: NOW,
  runStuckMinutes: 120,
  maxStartsPerDay: 3,
  ...overrides,
});

test("the tick restarts a run that stopped before its PR (KIT-409, 2026-10-18)", () => {
  const { resume, loops } = stoppedRuns(tickInput());
  assert.deepEqual(resume, [{ issue: "KIT-409", mode: "restart", pr: null, quietMinutes: 187 }]);
  assert.deepEqual(loops, []);
});

test("the tick resumes a stopped run that has an open PR, as before", () => {
  const { resume } = stoppedRuns(
    tickInput({
      board: [{ key: "KIT-284", state: "In Review" }],
      events: [
        { at: minutesAgo(130), event: "reason", issue: "KIT-284", code: "runner-no-result" },
      ],
      prOf: (key) => (key === "KIT-284" ? { number: 301 } : undefined),
    }),
  );
  assert.deepEqual(resume, [{ issue: "KIT-284", mode: "resume", pr: 301, quietMinutes: 130 }]);
});

test("the tick leaves a run alone while it still logs, a landing, and issues it never ran", () => {
  const recent = tickInput({ events: [{ at: minutesAgo(30), event: "start", issue: "KIT-409" }] });
  assert.deepEqual(stoppedRuns(recent).resume, []);
  assert.deepEqual(stoppedRuns(tickInput({ skip: new Set(["KIT-409"]) })).resume, []);
  assert.deepEqual(stoppedRuns(tickInput({ events: [] })).resume, []);
  for (const state of ["To-do", "Approval", "Blocked", "Merging"])
    assert.deepEqual(stoppedRuns(tickInput({ board: [{ key: "KIT-409", state }] })).resume, []);
});

test("a stopped run at the attempt cap is a loop for Nicklas, never restarted, with or without a PR", () => {
  const starts = [400, 300, 190].map((m) => ({
    at: minutesAgo(m),
    event: "start",
    issue: "KIT-409",
  }));
  for (const prOf of [() => undefined, () => ({ number: 9 })]) {
    const { resume, loops } = stoppedRuns(tickInput({ events: starts, prOf }));
    assert.deepEqual(resume, []);
    assert.deepEqual(loops, ["KIT-409"]);
  }
});

test("a stopped run holds no live slot, and the tick restarts it with resume:true (the session check refuses a fresh run In Progress)", () => {
  const tick = readFileSync(
    join(fileURLToPath(new URL("../..", import.meta.url)), "staff/max/tick.js"),
    "utf8",
  );
  assert.match(
    tick,
    /issue\.touchedMinutesAgo < liveWindowMinutes &&\s*!stoppedKeys\.has\(issue\.key\)/,
  );
  assert.ok(
    tick.indexOf("const live = ") > tick.indexOf("stoppedRuns({"),
    "live is counted after the stopped runs are known",
  );
  assert.match(tick, /mode restart \(no open PR[^\n]*still passes \\`"resume":true\\`/);
  assert.doesNotMatch(tick, /if \(!pr\) continue;\n\s*const starts/);
});

// A run that returned writes an `end` line (.bb/workflows/afk-developer.js), so the tick resumes it on
// its next tick: 2026-10-18 KIT-298's run hit the round cap with an amber review at 22:55 and nothing
// resumed it for two hours, because only a log quiet for runStuckMinutes counted as stopped.
const ended = (m, status, extra = {}) => ({
  at: minutesAgo(m),
  event: "end",
  issue: "KIT-409",
  status,
  stoppedAt: "reviewer",
  reason: "ci-pending",
  ...extra,
});

test("an end line makes a run that ended In Progress or In Review resumable on the next tick (KIT-298)", () => {
  for (const [state, status] of [
    ["In Review", "In Review"],
    ["In Progress", "In Progress"],
    ["In Progress", "stopped"],
  ]) {
    const { resume, loops } = stoppedRuns(
      tickInput({
        board: [{ key: "KIT-409", state }],
        events: [{ at: minutesAgo(40), event: "start", issue: "KIT-409" }, ended(5, status)],
        prOf: () => ({ number: 312 }),
      }),
    );
    assert.deepEqual(resume, [{ issue: "KIT-409", mode: "resume", pr: 312, quietMinutes: 5 }]);
    assert.deepEqual(loops, []);
  }
});

test("without an end line a quiet run still waits runStuckMinutes: a live run can be silent for a long round", () => {
  const silent = tickInput({
    events: [
      { at: minutesAgo(100), event: "start", issue: "KIT-409" },
      { at: minutesAgo(90), event: "spawn", issue: "KIT-409", step: "engineer" },
    ],
  });
  assert.deepEqual(stoppedRuns(silent).resume, []);
  // An end line of an earlier run followed by a new start is a live run again.
  const restarted = tickInput({
    events: [ended(30, "In Review"), { at: minutesAgo(10), event: "start", issue: "KIT-409" }],
  });
  assert.deepEqual(stoppedRuns(restarted).resume, []);
});

test("an end line of a landing or a person's stop is not resumed early", () => {
  for (const status of ["Merging", "Done", "unknown", "Approval", "Blocked"]) {
    const { resume } = stoppedRuns(
      tickInput({
        board: [{ key: "KIT-409", state: "In Review" }],
        events: [{ at: minutesAgo(40), event: "start", issue: "KIT-409" }, ended(5, status)],
      }),
    );
    assert.deepEqual(resume, [], status);
  }
});

test("an end line still counts toward the loop guard: at maxStartsPerDay starts it is a loop, not a resume", () => {
  const events = [
    { at: minutesAgo(60), event: "start", issue: "KIT-409" },
    ended(50, "In Review"),
    { at: minutesAgo(30), event: "start", issue: "KIT-409" },
    ended(25, "In Review"),
    { at: minutesAgo(10), event: "start", issue: "KIT-409" },
    ended(2, "In Review"),
  ];
  const { resume, loops } = stoppedRuns(tickInput({ events }));
  assert.deepEqual(resume, []);
  assert.deepEqual(loops, ["KIT-409"]);
});

test("the tick's landing check reads an end line as a run that has returned", () => {
  const tick = readFileSync(
    join(fileURLToPath(new URL("../..", import.meta.url)), "staff/max/tick.js"),
    "utf8",
  );
  assert.match(
    tick,
    /const ended =\s*last\?\.event === "end" \|\| \(last\?\.event === "reason" && last\.code === "runner-no-result"\);/,
  );
});

// KIT-404 (PR #431), 2026-10-18: the GLM Reviewer reviewed green, the ask for its AUDIT-RESULT line got
// JSON back, and the run stopped at the receipt. The tick listed it as a landing, retried only the
// receipt, was refused, and the unchanged board kept Max silent for 17 hours.
const receiptStop = (m, extra = {}) =>
  ended(m, "In Review", {
    stoppedAt: "receipt",
    reason: "unspecified",
    verdict: "green",
    ...extra,
  });
const stallEvents = (code) => [
  { at: minutesAgo(60), event: "start", issue: "KIT-409" },
  { at: minutesAgo(20), event: "gate", issue: "KIT-409", gate: "review", outcome: "open" },
  { at: minutesAgo(19), event: "result", issue: "KIT-409", step: "reviewer", outcome: "green" },
  { at: minutesAgo(10), event: "reason", issue: "KIT-409", code },
  receiptStop(5),
];

test("a run that stopped at the receipt on no-result-line or evidence-gap is resumed, marked after receipt (KIT-404)", () => {
  for (const code of ["no-result-line", "evidence-gap"]) {
    const events = stallEvents(code);
    assert.equal(receiptStall(events), true, code);
    const { resume, loops } = stoppedRuns(
      tickInput({
        board: [{ key: "KIT-409", state: "In Review" }],
        events,
        prOf: () => ({ number: 431 }),
      }),
    );
    assert.deepEqual(resume, [
      { issue: "KIT-409", mode: "resume", pr: 431, quietMinutes: 5, after: "receipt" },
    ]);
    assert.deepEqual(loops, []);
  }
});

test("a receipt stall is a stall only after its own run's reason, and only at the receipt", () => {
  // The reason belongs to an earlier run: this run stopped at the receipt for another cause.
  const earlier = [
    { at: minutesAgo(90), event: "reason", issue: "KIT-409", code: "no-result-line" },
    { at: minutesAgo(60), event: "start", issue: "KIT-409" },
    receiptStop(5),
  ];
  assert.equal(receiptStall(earlier), false);
  // Another stop, or a run still going after the reason, is no receipt stall.
  assert.equal(
    receiptStall([...stallEvents("evidence-gap").slice(0, -1), ended(5, "In Review")]),
    false,
  );
  assert.equal(receiptStall(stallEvents("evidence-gap").slice(0, -1)), false);
});

test("a receipt stall still counts toward maxStartsPerDay: the third one is a loop for Nicklas", () => {
  const events = [
    { at: minutesAgo(300), event: "start", issue: "KIT-409" },
    { at: minutesAgo(200), event: "start", issue: "KIT-409" },
    ...stallEvents("no-result-line"),
  ];
  const { resume, loops } = stoppedRuns(
    tickInput({ board: [{ key: "KIT-409", state: "In Review" }], events }),
  );
  assert.deepEqual(resume, []);
  assert.deepEqual(loops, ["KIT-409"]);
});

test("the landing check leaves a receipt stall to stoppedRuns instead of retrying the receipt (KIT-404)", () => {
  const tick = readFileSync(
    join(fileURLToPath(new URL("../..", import.meta.url)), "staff/max/tick.js"),
    "utf8",
  );
  const check = tick.indexOf('if (step === "start" && receiptStall(own)) continue;');
  assert.ok(check > 0, "the landing loop skips a receipt stall");
  assert.ok(check < tick.indexOf("landingKeys.add(issue.key);"), "before it is kept as a landing");
  assert.match(tick, /An entry with after "receipt" is a green review/);
});
