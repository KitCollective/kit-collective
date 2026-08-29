/**
 * Pi session progress logs for Grafana/Loki.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PI_IMPLEMENT_FIXTURE } from "./pi-event-stream.test.mjs";
import { createSessionLogCollector, PHASE_STOP } from "../pi-session-log.mjs";

/**
 * @param {Parameters<typeof createSessionLogCollector>[0] & { lines?: string[] }} input
 */
function collectSessionLogs(input) {
  const entries = [];
  const collector = createSessionLogCollector({
    ...input,
    log: (payload) => {
      entries.push(payload);
    },
    now: () => 0,
    tokenLogIntervalMs: 0,
  });
  const lines = input.lines ?? PI_IMPLEMENT_FIXTURE.split("\n");
  for (const line of lines) {
    collector.consumeLine(line);
  }
  return entries;
}

test("session collector logs agent_start and read tool", () => {
  const entries = collectSessionLogs({ role: "implement", identifier: "KIT-99" });
  assert.ok(entries.some((row) => row.event === "phase" && row.phase === "session"));
  assert.ok(entries.some((row) => row.event === "tool" && row.tool === "read"));
});

test("session collector logs scout and gate subagent lifecycle", () => {
  const lines = [
    '{"type":"tool_execution_start","toolName":"subagent","args":{"agent":"scout"}}',
    '{"type":"tool_execution_end","toolName":"subagent","args":{"agent":"scout"},"isError":false}',
    '{"type":"tool_execution_start","toolName":"subagent","args":{"agent":"gate"}}',
    '{"type":"tool_execution_end","toolName":"subagent","args":{"agent":"gate"},"isError":true}',
  ];
  const entries = collectSessionLogs({ role: "implement", identifier: "KIT-99", lines });
  const scoutStart = entries.find((row) => row.phase === "scout" && row.detail === "scout started");
  assert.equal(scoutStart?.stopPoint, PHASE_STOP.scout);
  assert.equal(scoutStart?.gate, "yellow");
  const gateFail = entries.find((row) => row.phase === "gate" && row.detail === "gate failed");
  assert.equal(gateFail?.gate, "red");
});

test("session collector throttles token snapshots from message_update", () => {
  const lines = [
    '{"type":"message_update","usage":{"input":100,"output":10}}',
    '{"type":"message_update","usage":{"input":200,"output":20}}',
  ];
  let at = 0;
  const entries = [];
  const collector = createSessionLogCollector({
    role: "implement",
    identifier: "KIT-99",
    log: (payload) => entries.push(payload),
    now: () => {
      at += 60_000;
      return at;
    },
    tokenLogIntervalMs: 30_000,
  });
  for (const line of lines) {
    collector.consumeLine(line);
  }
  assert.equal(entries.filter((row) => row.event === "tokens").length, 2);
  assert.equal(entries[0]?.tokensIn, 100);
  assert.equal(entries[1]?.tokensIn, 200);
});
