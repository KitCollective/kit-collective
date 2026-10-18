import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import plugin from "../../server.js";
import type { rpcContract } from "../contract.js";

type Contract = typeof rpcContract;
type Rpc = <M extends keyof Contract & string>(
  method: M,
  input: unknown,
) => Promise<z.output<Contract[M]["output"]>>;

const issueLoop = {
  name: "Issue run",
  enabled: true,
  workflow: "issue-run",
  trigger: {
    kind: "issue",
    state: "Ready",
    label: "agent-ready",
    unblocked: true,
    skipLabels: ["on-hold"],
    priorityOrder: [1, 2, 3, 4, 0],
  },
  machines: ["mac"],
  maxLive: 3,
};
const milestoneLoop = {
  name: "Milestone check",
  enabled: false,
  workflow: "milestone-check",
  trigger: { kind: "milestone-done", states: ["Done", "Canceled"] },
  machines: ["mac"],
  maxLive: 1,
};
const registry = (loops: unknown[] = [issueLoop, milestoneLoop]) =>
  JSON.stringify({ loops, flow: { maxRunsPerDay: 5 } });

/** A Linear board with one ready issue, ENG-1, and one waiting behind the label on-hold. */
const linearBoard = () =>
  vi.fn(async () => {
    const node = (identifier: string, labels: string[]) => ({
      id: `id-${identifier}`,
      identifier,
      title: `Title of ${identifier}`,
      priority: 2,
      createdAt: "2026-10-01T00:00:00Z",
      description: "",
      state: { name: "Ready" },
      labels: { nodes: labels.map((name) => ({ name })) },
      projectMilestone: null,
      project: null,
      attachments: { nodes: [] },
      inverseRelations: { nodes: [] },
    });
    return new Response(
      JSON.stringify({
        data: {
          teams: { nodes: [{ states: { nodes: [{ id: "s1", name: "Ready" }] } }] },
          issues: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [node("ENG-1", ["agent-ready"]), node("ENG-2", ["agent-ready", "on-hold"])],
          },
        },
      }),
    );
  });

async function load(registryText = registry(), { board = true } = {}) {
  let threads = 0;
  const host = createFakePluginHost({
    pluginId: "optio",
    settings: { linearApiKey: "lin_key" },
    agentSkillIds: ["optio"],
    sdk: {
      threads: {
        spawn: async () => {
          threads += 1;
          return { id: `thr_${threads}` };
        },
        get: async () => ({ status: "active", archivedAt: null }),
      },
      projects: {
        list: async () => [{ id: "proj_1", name: "acme" }],
        fileContent: async () => ({
          content: registryText,
          contentEncoding: "utf8",
          mimeType: "application/json",
          sizeBytes: registryText.length,
        }),
      },
      hosts: { list: async () => [{ id: "host_1", name: "Mac" }] },
    },
  });
  await plugin(host.bb);
  // SAFETY: the fake host's callRpc parses every result with the method's output schema in rpcContract;
  // the input stays unknown so a test can send what the contract refuses.
  const rpc = host.harness.behavior.callRpc as Rpc;
  if (board) await setUpBoard(rpc);
  const spawns = () => host.harness.inspection.sdk.callsTo("threads.spawn");
  const tick = () => host.harness.behavior.runSchedule("orchestrator-tick");
  const cli = host.harness.behavior.runCli;
  return { rpc, spawns, tick, cli };
}

async function setUpBoard(rpc: Rpc) {
  await rpc("board_setup", {
    projectId: "proj_1",
    teamKey: "ENG",
    backlogState: "Icebox",
    activeStates: ["Doing"],
    blockedState: null,
  });
  await rpc("board_update", {
    mode: "live",
    machines: [{ id: "mac", hostId: "host_1", branch: "origin/main", cap: 2, capabilities: [] }],
  });
}

const issueRun = async (rpc: Rpc) =>
  (await rpc("loops_list", null)).loops.find((loop) => loop.name === "Issue run");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the Loops page", () => {
  it("lists every Loop of the registry with its trigger, workflow and the four settings from the file", async () => {
    const { rpc } = await load();
    const listed = await rpc("loops_list", null);
    expect(listed.error).toBeNull();
    expect(listed.loops.map((loop) => loop.name)).toEqual(["Issue run", "Milestone check"]);
    expect(listed.loops[0]).toEqual({
      name: "Issue run",
      workflow: "issue-run",
      trigger: { kind: "issue", summary: "Ready with agent-ready, unblocked" },
      machines: ["mac"],
      settings: {
        enabled: { value: true, file: true, override: null },
        maxLive: { value: 3, file: 3, override: null },
        // The file's starts per day is flow.maxRunsPerDay.
        startsPerDay: { value: 5, file: 5, override: null },
        schedule: { value: null, file: null, override: null },
      },
    });
    expect(listed.loops[1]).toMatchObject({
      workflow: "milestone-check",
      trigger: {
        kind: "milestone-done",
        summary: "every issue of a milestone is Done or Canceled",
      },
      settings: { enabled: { value: false, file: false, override: null } },
    });
    expect(listed.log).toEqual([]);
  });

  it("stores an override with who and when, and shows it next to the file's value", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-18T09:00:00Z"), toFake: ["Date"] });
    const { rpc } = await load();
    await rpc("loops_set", { loop: "Issue run", key: "maxLive", value: 1, by: "Dana" });
    const loop = await issueRun(rpc);
    expect(loop?.settings.maxLive).toEqual({
      value: 1,
      file: 3,
      override: { by: "Dana", at: "2026-10-18T09:00:00.000Z" },
    });
    expect(loop?.settings.enabled.override).toBeNull();
  });

  it("clearing an override falls back to the file", async () => {
    const { rpc } = await load();
    await rpc("loops_set", { loop: "Issue run", key: "enabled", value: false, by: "Dana" });
    await rpc("loops_set", { loop: "Issue run", key: "startsPerDay", value: 2, by: "Dana" });
    await rpc("loops_clear", { loop: "Issue run", key: "enabled", by: "Dana" });
    const loop = await issueRun(rpc);
    expect(loop?.settings.enabled).toEqual({ value: true, file: true, override: null });
    expect(loop?.settings.startsPerDay).toMatchObject({ value: 2, file: 5 });
  });

  it("lists every change in a log, newest first, with what it was and what it became", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-18T09:00:00Z"), toFake: ["Date"] });
    const { rpc } = await load();
    await rpc("loops_set", { loop: "Issue run", key: "maxLive", value: 1, by: "Dana" });
    vi.setSystemTime(new Date("2026-10-18T09:05:00Z"));
    await rpc("loops_set", { loop: "Issue run", key: "maxLive", value: 2, by: "Ida" });
    vi.setSystemTime(new Date("2026-10-18T09:10:00Z"));
    await rpc("loops_clear", { loop: "Issue run", key: "maxLive", by: "Dana" });
    // Setting the value the override already holds, or clearing nothing, changes nothing.
    await rpc("loops_clear", { loop: "Issue run", key: "maxLive", by: "Dana" });
    const { log } = await rpc("loops_list", null);
    expect(log).toEqual([
      {
        loop: "Issue run",
        key: "maxLive",
        from: { value: 2 },
        to: null,
        by: "Dana",
        at: "2026-10-18T09:10:00.000Z",
      },
      {
        loop: "Issue run",
        key: "maxLive",
        from: { value: 1 },
        to: { value: 2 },
        by: "Ida",
        at: "2026-10-18T09:05:00.000Z",
      },
      {
        loop: "Issue run",
        key: "maxLive",
        from: null,
        to: { value: 1 },
        by: "Dana",
        at: "2026-10-18T09:00:00.000Z",
      },
    ]);
  });

  it("refuses an unknown Loop, an unknown setting and a value out of range, and logs nothing", async () => {
    const { rpc } = await load();
    const set = (input: { loop: string; key: string; value: unknown; by?: string }) =>
      rpc("loops_set", { by: "Dana", ...input });
    await expect(set({ loop: "No such", key: "enabled", value: false })).rejects.toThrow(
      /no Loop "No such"/,
    );
    await expect(set({ loop: "Issue run", key: "machines", value: [] })).rejects.toThrow();
    await expect(set({ loop: "Issue run", key: "maxLive", value: 17 })).rejects.toThrow();
    await expect(set({ loop: "Issue run", key: "maxLive", value: 1.5 })).rejects.toThrow();
    await expect(set({ loop: "Issue run", key: "enabled", value: "no" })).rejects.toThrow();
    await expect(set({ loop: "Issue run", key: "startsPerDay", value: 0 })).rejects.toThrow();
    await expect(
      set({ loop: "Issue run", key: "schedule", value: { from: "9:00", to: "17:00" } }),
    ).rejects.toThrow();
    await expect(
      set({ loop: "Issue run", key: "schedule", value: { from: "09:00", to: "09:00" } }),
    ).rejects.toThrow();
    await expect(set({ loop: "Issue run", key: "maxLive", value: 1, by: " " })).rejects.toThrow();
    // The milestone check ships disabled because its trigger is not supported yet.
    await expect(set({ loop: "Milestone check", key: "enabled", value: true })).rejects.toThrow(
      /not supported yet/,
    );
    const listed = await rpc("loops_list", null);
    expect(listed.log).toEqual([]);
    expect(
      listed.loops.every((loop) => Object.values(loop.settings).every((s) => s.override === null)),
    ).toBe(true);
  });

  it("says why it cannot list when the registry does not parse", async () => {
    const { rpc } = await load("{ not json");
    const listed = await rpc("loops_list", null);
    expect(listed.loops).toEqual([]);
    expect(listed.error).toContain("factory.config.json is not valid JSON");
  });
});

describe("the Board and the tick read override-or-file", () => {
  it("a paused Loop starts nothing at the next tick, and clearing the pause resumes it", async () => {
    vi.stubGlobal("fetch", linearBoard());
    const { rpc, spawns, tick } = await load();
    await rpc("loops_set", { loop: "Issue run", key: "enabled", value: false, by: "Dana" });
    await tick();
    expect(spawns()).toHaveLength(0);
    // The Board shows the Loop as off and starts nothing.
    const paused = await rpc("board_get", null);
    expect(paused.loops).toMatchObject([
      { name: "Issue run", enabled: false },
      { name: "Milestone check" },
    ]);
    expect(paused.start).toEqual([]);

    await rpc("loops_clear", { loop: "Issue run", key: "enabled", by: "Dana" });
    await tick();
    expect(spawns()).toHaveLength(1);
  });

  it("a live-run cap of 0 starts nothing, and the Board says why", async () => {
    vi.stubGlobal("fetch", linearBoard());
    const { rpc, spawns, tick } = await load();
    await rpc("loops_set", { loop: "Issue run", key: "maxLive", value: 0, by: "Dana" });
    await tick();
    expect(spawns()).toHaveLength(0);
    expect((await rpc("board_get", null)).waiting).toContainEqual({
      identifier: "ENG-1",
      loop: "Issue run",
      reason: "Issue run has 0 of 0 live runs",
    });
    await rpc("loops_clear", { loop: "Issue run", key: "maxLive", by: "Dana" });
    await tick();
    expect(spawns()).toHaveLength(1);
  });

  it("a Loop outside its schedule window starts nothing until the window opens", async () => {
    vi.stubGlobal("fetch", linearBoard());
    vi.useFakeTimers({ now: new Date("2026-10-18T03:00:00Z"), toFake: ["Date"] });
    const { rpc, spawns, tick } = await load();
    await rpc("loops_set", {
      loop: "Issue run",
      key: "schedule",
      value: { from: "08:00", to: "18:00" },
      by: "Dana",
    });
    await tick();
    expect(spawns()).toHaveLength(0);
    expect((await rpc("board_get", null)).waiting).toContainEqual({
      identifier: "ENG-1",
      loop: "Issue run",
      reason: "Issue run is outside its schedule 08:00–18:00 UTC",
    });
    vi.setSystemTime(new Date("2026-10-18T09:00:00Z"));
    await tick();
    expect(spawns()).toHaveLength(1);
  });

  it("`bb optio loops --json` prints the effective values the dispatch tick reads", async () => {
    const { rpc, cli } = await load();
    await rpc("loops_set", { loop: "Issue run", key: "enabled", value: false, by: "Dana" });
    const printed = await cli(["loops", "--json"], { threadId: "thr_x" });
    expect(printed.exitCode).toBe(0);
    const parsed = JSON.parse(printed.stdout);
    expect(parsed.error).toBeNull();
    expect(parsed.loops[0]).toMatchObject({
      workflow: "issue-run",
      settings: { enabled: { value: false, file: true, override: { by: "Dana" } } },
    });
    const text = await cli(["loops"], { threadId: "thr_x" });
    expect(text.stdout).toContain("Issue run");
    expect(text.stdout).toContain("off (file: on; set by Dana");
  });

  it("`bb optio loops` fails with the reason when the registry does not parse", async () => {
    const { cli } = await load("{ not json");
    const printed = await cli(["loops", "--json"], { threadId: "thr_x" });
    expect(printed.exitCode).toBe(1);
    expect(JSON.parse(printed.stdout).error).toContain("factory.config.json");
  });

  it("without a Board it needs --project, and reads no other area's setting", async () => {
    const { rpc, cli } = await load(registry(), { board: false });
    const unset = await rpc("loops_list", null);
    expect(unset.loops).toEqual([]);
    expect(unset.error).toContain("pass --project");
    await expect(
      rpc("loops_set", { loop: "Issue run", key: "enabled", value: false, by: "Dana" }),
    ).rejects.toThrow("pass --project");

    const named = await cli(["loops", "--json", "--project", "proj_1"], { threadId: "thr_x" });
    expect(named.exitCode).toBe(0);
    expect(JSON.parse(named.stdout).loops).toHaveLength(2);

    // The Inbox's project does not stand in for the Board's.
    await cli(["inbox", "--state", "Approval", "--labels", "question", "--project", "proj_1"], {
      threadId: "thr_x",
    });
    expect((await rpc("loops_list", null)).error).toContain("pass --project");
  });

  it("says where a starts-per-day override stops applying", async () => {
    const { cli } = await load();
    const text = await cli(["loops"], { threadId: "thr_x" });
    expect(text.stdout).toContain("scripts/session-check.mjs reads flow.maxRunsPerDay");
  });
});
