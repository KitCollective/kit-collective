import assert from "node:assert/strict";
import { test } from "node:test";
import {
  logFactoryExitDone,
  logFactoryExitStart,
  logFactoryGatePoll,
} from "../factory-exit-log.mjs";

test("factory exit logs emit phase and wait events for Grafana", () => {
  const lines = [];
  const original = console.error;
  console.error = (line) => {
    lines.push(String(line));
  };
  try {
    logFactoryExitStart({
      role: "factory-checker",
      identifier: "KIT-119",
      phase: "checker-exit",
      linked: { number: 117 },
      skipped: [{ number: 118 }],
    });
    logFactoryGatePoll({
      role: "factory-checker",
      identifier: "KIT-119",
      phase: "checker-exit",
      attempt: 1,
      pr: { number: 117, mergeable: "MERGEABLE" },
      checksGreen: true,
    });
    logFactoryExitDone({
      role: "factory-checker",
      identifier: "KIT-119",
      phase: "checker-exit",
      passed: true,
      nextStatus: "Ready for merge",
    });
  } finally {
    console.error = original;
  }

  assert.equal(lines.length, 3);
  const start = JSON.parse(lines[0]);
  const wait = JSON.parse(lines[1]);
  const done = JSON.parse(lines[2]);
  assert.equal(start.event, "phase");
  assert.equal(start.phase, "checker-exit");
  assert.match(start.detail, /linked PR #117/);
  assert.match(start.detail, /#118/);
  assert.equal(wait.event, "wait");
  assert.match(wait.detail, /mergeable=MERGEABLE checks=green/);
  assert.equal(done.phase, "checker-exit-done");
});
