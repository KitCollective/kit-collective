import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { planBoard } from "../board.js";
import {
  applyOverrides,
  fileSettings,
  inSchedule,
  parseRegistry,
  type Registry,
} from "../loop-registry.js";
import { parseScheduler } from "../scheduler-config.js";
import { createSettingsStore } from "../settings/store.js";

const loop = {
  name: "Issue run",
  enabled: true,
  workflow: "issue-run",
  trigger: { kind: "issue", state: "Ready", label: "agent-ready", unblocked: true },
  machines: ["mac"],
  maxLive: 2,
};
const registryOf = (
  extra: { schedule?: { from: string; to: string } } = {},
  flow: { maxRunsPerDay: number } | null = { maxRunsPerDay: 3 },
): Registry => {
  const parsed = parseRegistry(
    JSON.stringify({ loops: [{ ...loop, ...extra }], ...(flow === null ? {} : { flow }) }),
  );
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.registry;
};
const firstLoop = (registry: Registry) => {
  const first = registry.loops[0];
  if (first === undefined) throw new Error("no Loop");
  return first;
};

describe("the schedule window", () => {
  const at = (time: string) => Date.parse(`2026-10-18T${time}:00Z`);
  it("is open from its start up to, not including, its end, in UTC", () => {
    const window = { from: "08:00", to: "18:00" };
    expect(inSchedule(window, at("07:59"))).toBe(false);
    expect(inSchedule(window, at("08:00"))).toBe(true);
    expect(inSchedule(window, at("17:59"))).toBe(true);
    expect(inSchedule(window, at("18:00"))).toBe(false);
  });
  it("runs past midnight when it ends before it starts, and no window is any time", () => {
    const night = { from: "22:00", to: "06:00" };
    expect(inSchedule(night, at("23:30"))).toBe(true);
    expect(inSchedule(night, at("05:59"))).toBe(true);
    expect(inSchedule(night, at("12:00"))).toBe(false);
    expect(inSchedule(null, at("12:00"))).toBe(true);
    expect(inSchedule(undefined, at("12:00"))).toBe(true);
  });
  it("is optional in the file, and a bad window refuses the registry", () => {
    expect(firstLoop(registryOf()).schedule).toBeUndefined();
    expect(firstLoop(registryOf({ schedule: { from: "08:00", to: "18:00" } })).schedule).toEqual({
      from: "08:00",
      to: "18:00",
    });
    const bad = parseRegistry(
      JSON.stringify({ loops: [{ ...loop, schedule: { from: "8:00", to: "18:00" } }] }),
    );
    expect(bad.ok).toBe(false);
  });
});

describe("override-or-file", () => {
  it("the file's starts per day is flow.maxRunsPerDay, and none when the file sets none", () => {
    const registry = registryOf();
    expect(fileSettings(registry, firstLoop(registry))).toEqual({
      enabled: true,
      maxLive: 2,
      startsPerDay: 3,
      schedule: null,
    });
    const bare = registryOf({}, null);
    expect(fileSettings(bare, firstLoop(bare)).startsPerDay).toBeNull();
  });

  it("an override replaces the file's value for its Loop only, and the file is not touched", () => {
    const registry = registryOf();
    const applied = applyOverrides(registry, { "Issue run": { enabled: false, maxLive: 1 } });
    expect(firstLoop(applied)).toMatchObject({ enabled: false, maxLive: 1 });
    expect(firstLoop(registry)).toMatchObject({ enabled: true, maxLive: 2 });
    expect(firstLoop(applyOverrides(registry, { Other: { enabled: false } })).enabled).toBe(true);
  });
});

describe("a Loop's starts per day in the plan", () => {
  const config = (() => {
    const parsed = parseScheduler(
      JSON.stringify({
        mode: "live",
        projectId: "proj_1",
        teamKey: "ENG",
        backlogState: "Icebox",
        activeStates: ["Doing"],
        blockedState: null,
        machines: [{ id: "mac", cap: 2, hostId: "host_1", branch: "origin/main" }],
      }),
    );
    if (!parsed.ok || parsed.config === null) throw new Error("config");
    return parsed.config;
  })();
  const ready = {
    id: "id-1",
    identifier: "ENG-1",
    title: "ENG-1",
    priority: 2,
    createdAt: "2026-10-01T00:00:00Z",
    state: "Ready",
    labels: ["agent-ready"],
    milestone: null,
    project: null,
    blockedBy: [],
    writeScope: [],
    pullRequest: null,
  };
  const plan = (registry: Registry) =>
    planBoard({
      issues: [ready],
      config,
      registry,
      focus: null,
      history: new Map(),
      recentStarts: new Map([["ENG-1", 2]]),
    });

  it("the file's cap applies until an override replaces it, and null lifts it", () => {
    const registry = registryOf({}, { maxRunsPerDay: 2 });
    expect(plan(registry).waiting).toEqual([
      { identifier: "ENG-1", loop: "Issue run", reason: "started 2 times in 24 h (cap 2)" },
    ]);
    const withCap = (startsPerDay: number | null) =>
      plan(applyOverrides(registry, { "Issue run": { startsPerDay } }));
    expect(withCap(3).start).toHaveLength(1);
    expect(withCap(null).start).toHaveLength(1);
    expect(withCap(1).waiting[0]?.reason).toBe("started 2 times in 24 h (cap 1)");
  });
});

describe("the settings store", () => {
  const open = () => createSettingsStore(new Database(":memory:"));

  it("keeps one override per subject and key, with who and when, and logs each change", () => {
    const store = open();
    expect(store.set("loop:A", "maxLive", 1, "Dana", 100)).toBe(true);
    expect(store.set("loop:A", "maxLive", 1, "Ida", 200)).toBe(false);
    expect(store.set("loop:A", "maxLive", 2, "Ida", 300)).toBe(true);
    expect(store.set("staff:max", "model", "x", "Ida", 400)).toBe(true);
    expect(store.overrides("loop:").get("loop:A")?.get("maxLive")).toEqual({
      value: 2,
      by: "Ida",
      at: 300,
    });
    expect(store.overrides("loop:").has("staff:max")).toBe(false);
    expect(store.clear("loop:A", "maxLive", "Dana", 500)).toBe(true);
    expect(store.clear("loop:A", "maxLive", "Dana", 600)).toBe(false);
    expect(store.overrides("loop:").size).toBe(0);
    expect(store.log("loop:", 10).map((change) => [change.from, change.to, change.by])).toEqual([
      [{ value: 2 }, undefined, "Dana"],
      [{ value: 1 }, { value: 2 }, "Ida"],
      [undefined, { value: 1 }, "Dana"],
    ]);
    expect(store.log("loop:", 1)).toHaveLength(1);
  });

  it("holds an override of null apart from no override", () => {
    const store = open();
    store.set("loop:A", "schedule", null, "Dana", 100);
    expect(store.overrides("loop:").get("loop:A")?.get("schedule")?.value).toBeNull();
    expect(store.log("loop:", 5)[0]?.to).toEqual({ value: null });
  });

  it("is safe to open twice on one database", () => {
    const db = new Database(":memory:");
    createSettingsStore(db).set("loop:A", "enabled", false, "Dana", 1);
    expect(createSettingsStore(db).overrides("loop:").size).toBe(1);
  });
});
