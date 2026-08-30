/**
 * Pi session progress logs for Grafana/Loki.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createSessionLogCollector, PHASE_STOP } from "../pi-session-log.mjs";
import { PI_IMPLEMENT_FIXTURE } from "./pi-event-stream.test.mjs";

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

test("session collector logs draft subagent between scout and helpers", () => {
  const lines = [
    '{"type":"tool_execution_start","toolName":"subagent","args":{"agent":"draft"}}',
    '{"type":"tool_execution_end","toolName":"subagent","args":{"agent":"draft"},"isError":false}',
  ];
  const entries = collectSessionLogs({ role: "implement", identifier: "KIT-99", lines });
  const draftStart = entries.find((row) => row.phase === "draft" && row.detail === "draft started");
  assert.equal(draftStart?.stopPoint, PHASE_STOP.draft);
  assert.equal(draftStart?.gate, "yellow");
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
  const gateFail = entries.find(
    (row) => row.phase === "gate" && String(row.detail).includes("gate failed"),
  );
  assert.equal(gateFail?.gate, "yellow");
});

test("session collector keeps helper agent name on start and fail", () => {
  const lines = [
    '{"type":"tool_execution_start","toolName":"subagent","args":{"agent":"expo"}}',
    '{"type":"tool_execution_end","toolName":"subagent","args":{"agent":"expo"},"isError":true}',
  ];
  const entries = collectSessionLogs({ role: "implement", identifier: "KIT-99", lines });
  const start = entries.find((row) => row.phase === "helper" && row.detail === "expo started");
  assert.equal(start?.gate, "yellow");
  const fail = entries.find((row) => row.phase === "helper" && row.detail === "expo failed");
  assert.equal(fail?.gate, "red");
});

test("session collector keeps helper name when end omits args.agent", () => {
  const lines = [
    '{"type":"tool_execution_start","toolCallId":"t1","toolName":"subagent","args":{"agent":"ui-ux"}}',
    '{"type":"tool_execution_end","toolCallId":"t1","toolName":"subagent","isError":true}',
  ];
  const entries = collectSessionLogs({ role: "implement", identifier: "KIT-99", lines });
  const fail = entries.find((row) => row.phase === "helper" && row.detail === "ui-ux failed");
  assert.equal(fail?.gate, "red");
});

test("session collector marks bash non-zero yellow and keeps the command", () => {
  const lines = [
    JSON.stringify({
      type: "tool_execution_start",
      toolCallId: "b1",
      toolName: "bash",
      args: { command: "pnpm format:check" },
    }),
    JSON.stringify({
      type: "tool_execution_end",
      toolCallId: "b1",
      toolName: "bash",
      isError: true,
    }),
  ];
  const entries = collectSessionLogs({ role: "implement", identifier: "KIT-99", lines });
  const fail = entries.find((row) => row.tool === "bash" && row.error === "bash non-zero");
  assert.equal(fail?.gate, "yellow");
  assert.match(String(fail?.detail), /pnpm format:check/);
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

test("session collector logs memory_search query and omits lesson bodies", () => {
  const lines = [
    JSON.stringify({
      type: "tool_execution_start",
      toolName: "memory_search",
      args: {
        query: "raw fontSize in Expo chrome",
        text: "class → lesson dump must not appear",
      },
    }),
    JSON.stringify({
      type: "tool_execution_end",
      toolName: "memory_search",
      isError: false,
      result: { hits: "[correction] raw fontSize → use locked type roles" },
    }),
  ];
  const entries = collectSessionLogs({ role: "implement", identifier: "KIT-99", lines });
  const search = entries.find((row) => row.tool === "memory_search");
  assert.equal(search?.event, "tool");
  assert.equal(search?.gate, "green");
  assert.match(String(search?.detail), /raw fontSize in Expo chrome/);
  assert.equal(
    entries.some((row) => JSON.stringify(row).includes("class → lesson dump")),
    false,
  );
  assert.equal(
    entries.some((row) => JSON.stringify(row).includes("use locked type roles")),
    false,
  );
});

test("session collector logs memory writes as tool name and target only", () => {
  const lesson = "account delete must clear every user-scoped FK before user rows";
  const lines = [
    JSON.stringify({
      type: "tool_execution_start",
      toolName: "memory_add",
      args: { target: "failure", text: lesson, content: lesson },
    }),
    JSON.stringify({
      type: "tool_execution_start",
      toolName: "memory_remove",
      args: { target: "failure", text: lesson },
    }),
    JSON.stringify({
      type: "tool_execution_end",
      toolName: "memory_add",
      isError: true,
      result: { error: lesson },
    }),
  ];
  const entries = collectSessionLogs({ role: "factory-checker", identifier: "KIT-99", lines });
  const add = entries.find((row) => row.tool === "memory_add" && row.gate === "green");
  assert.equal(add?.detail, "failure");
  const remove = entries.find((row) => row.tool === "memory_remove");
  assert.equal(remove?.detail, "failure");
  const failed = entries.find((row) => row.tool === "memory_add" && row.gate === "red");
  assert.equal(failed?.error, "tool error");
  assert.equal(
    entries.some((row) => JSON.stringify(row).includes(lesson)),
    false,
  );
});
