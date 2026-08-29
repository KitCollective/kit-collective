/**
 * Structured harness logs for Loki/Promtail.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  harnessLog,
  loopRiskForGate,
  loopRiskForRetry,
  redactHarnessError,
  resolveExitGate,
} from "../harness-log.mjs";

test("redactHarnessError strips bearer tokens and long secrets", () => {
  const redacted = redactHarnessError(
    "auth failed Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret payload",
  );
  assert.match(redacted ?? "", /\[redacted\]/);
  assert.doesNotMatch(redacted ?? "", /eyJhbGci/);
});

test("redactHarnessError strips gh and linear token prefixes", () => {
  const redacted = redactHarnessError("ghp_abcdefghijklmnopqrstuvwxyz1234567890");
  assert.equal(redacted, "[redacted]");
});

test("harnessLog emits one JSON object on stderr with gate and loopRisk", () => {
  const lines = [];
  const original = console.error;
  console.error = (line) => {
    lines.push(line);
  };
  try {
    harnessLog({
      role: "implement",
      identifier: "KIT-99",
      event: "fail",
      gate: "red",
      error: "pi exited 1",
      loopRisk: 8,
    });
  } finally {
    console.error = original;
  }
  assert.equal(lines.length, 1);
  const payload = JSON.parse(String(lines[0]));
  assert.equal(payload.source, "harness");
  assert.equal(payload.role, "implement");
  assert.equal(payload.identifier, "KIT-99");
  assert.equal(payload.event, "fail");
  assert.equal(payload.gate, "red");
  assert.equal(payload.loopRisk, 8);
  assert.equal(payload.error, "pi exited 1");
  assert.match(payload.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("harnessLog defaults loopRisk from gate when omitted", () => {
  const lines = [];
  const original = console.error;
  console.error = (line) => {
    lines.push(line);
  };
  try {
    harnessLog({
      role: "implement",
      identifier: "KIT-1",
      event: "retry",
      gate: "yellow",
      reason: "ci",
      attempt: 2,
    });
  } finally {
    console.error = original;
  }
  const payload = JSON.parse(String(lines[0]));
  assert.equal(payload.gate, "yellow");
  assert.equal(payload.loopRisk, loopRiskForGate("yellow"));
  assert.equal(payload.attempt, 2);
});

test("loopRiskForRetry scales with attempt toward cap", () => {
  assert.equal(loopRiskForRetry(1), 3);
  assert.equal(loopRiskForRetry(2), 5);
  assert.equal(loopRiskForRetry(3), 6);
  assert.equal(loopRiskForRetry(5), 9);
});

test("resolveExitGate maps factory outcomes", () => {
  assert.equal(resolveExitGate({ status: "In Review" }, { role: "implement" }), "green");
  assert.equal(resolveExitGate({ passed: true }, { role: "factory-checker" }), "green");
  assert.equal(resolveExitGate({ passed: false }, { role: "factory-checker" }), "red");
  assert.equal(
    resolveExitGate({ status: "Implementing", ciRetry: true }, { role: "implement" }),
    "yellow",
  );
  assert.equal(resolveExitGate({ status: "Implementing" }, { role: "implement" }), "yellow");
});
