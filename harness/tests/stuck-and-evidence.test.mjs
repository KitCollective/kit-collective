/**
 * Stuck-loop park + Spec evidence floor (P3.1 / P3.3).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyStuckLoopWorkpad,
  completeChecker,
  evaluateSpecEvidenceFloor,
  PARKED,
  parseStuckLoopStreak,
  READY_FOR_HUMAN_LABEL,
  STUCK_FEEDBACK_CAP,
} from "../checker-exit.mjs";
import {
  evaluateStuckFeedback,
  STUCK_FEEDBACK_CAP as EXIT_CAP,
  WORKPAD_HEADING,
} from "../implement-exit.mjs";
import { ECONOMY_PINNED_AGENTS } from "../model-router.mjs";

test("ECONOMY_PINNED_AGENTS includes optimizer.md", () => {
  assert.ok(ECONOMY_PINNED_AGENTS.includes("optimizer.md"));
});

test("STUCK_FEEDBACK_CAP is exported from checker-exit and implement-exit", () => {
  assert.equal(STUCK_FEEDBACK_CAP, 3);
  assert.equal(EXIT_CAP, STUCK_FEEDBACK_CAP);
});

test("evaluateStuckFeedback marks stuck at cap", () => {
  const body = `${WORKPAD_HEADING}

### Review feedback

- Spec: missing badge
- Standards: (none)
- Slop: (none)
`;
  const first = evaluateStuckFeedback("", body, 0);
  assert.equal(first.stuck, false);
  assert.equal(first.streak, 1);

  const second = evaluateStuckFeedback(body, body, first.streak);
  assert.equal(second.stuck, false);
  assert.equal(second.streak, 2);

  const third = evaluateStuckFeedback(body, body, second.streak);
  assert.equal(third.stuck, true);
  assert.equal(third.streak, 3);
});

test("parseStuckLoopStreak / applyStuckLoopWorkpad round-trip", () => {
  const next = applyStuckLoopWorkpad(WORKPAD_HEADING, {
    streak: 2,
    fingerprint: "spec: missing badge",
  });
  assert.equal(parseStuckLoopStreak(next), 2);
  assert.match(next, /### Stuck loop/);
});

test("evaluateSpecEvidenceFloor fails Spec green without Evidence/Validation/AC ticks", () => {
  const body = `${WORKPAD_HEADING}

### Review feedback

- Spec: (none)
- Standards: (none)
- Slop: (none)
`;
  const result = evaluateSpecEvidenceFloor(body);
  assert.equal(result.ok, false);
  assert.ok(result.feedback.some((line) => /evidence floor/i.test(line)));
});

test("evaluateSpecEvidenceFloor passes with ### Evidence content", () => {
  const body = `${WORKPAD_HEADING}

### Evidence

- Screenshot: empty state on iPhone SE

### Review feedback

- Spec: (none)
- Standards: (none)
- Slop: (none)
`;
  assert.equal(evaluateSpecEvidenceFloor(body).ok, true);
});

test("evaluateSpecEvidenceFloor passes with AC checkbox tick", () => {
  const body = `${WORKPAD_HEADING}

### Notes

- [x] Empty state copy matches design lock

### Review feedback

- Spec: (none)
- Standards: (none)
- Slop: (none)
`;
  assert.equal(evaluateSpecEvidenceFloor(body).ok, true);
});

test("evaluateSpecEvidenceFloor skips when Spec has findings", () => {
  const body = `${WORKPAD_HEADING}

### Review feedback

- Spec: badge missing
- Standards: (none)
- Slop: (none)
`;
  assert.equal(evaluateSpecEvidenceFloor(body).ok, true);
});

function fakeLinear(workpadBody) {
  const comments = [{ id: "c1", body: workpadBody }];
  const calls = [];
  return {
    calls,
    comments,
    async getIssue() {
      return {
        status: "In Review",
        identifier: "KIT-200",
        description: "What to build\n\n- [ ] AC one",
        attachments: [{ url: "https://github.com/KitCollective/kit-collective/pull/200" }],
      };
    },
    async listComments() {
      return comments;
    },
    async updateWorkpad(input) {
      calls.push(["updateWorkpad", input]);
      comments[0].body = input.body;
    },
    async setStatus(input) {
      calls.push(["setStatus", input]);
    },
    async commentIssue(input) {
      calls.push(["commentIssue", input]);
    },
    async addLabels(input) {
      calls.push(["addLabels", input]);
    },
  };
}

function fakeGh() {
  return {
    async viewPr() {
      return {
        url: "https://github.com/KitCollective/kit-collective/pull/200",
        mergeable: "MERGEABLE",
        checks: [{ name: "test", conclusion: "success", isRequired: true }],
      };
    },
  };
}

test("completeChecker parks on stuck feedback fingerprint at STUCK_FEEDBACK_CAP", async () => {
  const findings = `- Spec: missing badge
- Standards: (none)
- Slop: (none)`;
  const workpad = `${WORKPAD_HEADING}

### Stuck loop

- streak: 2
- fingerprint: spec: missing badge

### Loop counters

- ciFailCycles: 0
- reviewLoops: 2

### Review feedback

${findings}
`;
  const linear = fakeLinear(workpad);
  const result = await completeChecker({
    job: { issueId: "issue-200", identifier: "KIT-200" },
    linear,
    gh: fakeGh(),
    waitIntervalMs: 0,
    waitTimeoutMs: 1000,
  });
  assert.equal(result.stuckParked, true);
  assert.equal(result.nextStatus, PARKED);
  assert.ok(linear.calls.some((call) => call[0] === "setStatus" && call[1].status === PARKED));
  assert.ok(
    linear.calls.some(
      (call) =>
        call[0] === "addLabels" && call[1].labelNames.includes(READY_FOR_HUMAN_LABEL),
    ),
  );
});

test("completeChecker fails Spec green without evidence floor", async () => {
  const workpad = `${WORKPAD_HEADING}

### Loop counters

- ciFailCycles: 0
- reviewLoops: 0

### Review feedback

- Spec: (none)
- Standards: (none)
- Slop: (none)
`;
  const linear = fakeLinear(workpad);
  const result = await completeChecker({
    job: { issueId: "issue-201", identifier: "KIT-201" },
    linear,
    gh: fakeGh(),
    waitIntervalMs: 0,
    waitTimeoutMs: 1000,
  });
  assert.equal(result.passed, false);
  assert.equal(result.nextStatus, "Implementing");
  const workpadUpdate = linear.calls.find((call) => call[0] === "updateWorkpad");
  assert.match(String(workpadUpdate?.[1]?.body ?? ""), /evidence floor/i);
});
