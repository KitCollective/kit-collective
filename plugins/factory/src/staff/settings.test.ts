import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import plugin from "../../server.js";
import type { rpcContract } from "../contract.js";
import type { Override } from "../settings/store.js";
import { parseStaffOverrides } from "./settings.js";

type Contract = typeof rpcContract;
type Rpc = <M extends keyof Contract & string>(
  method: M,
  input: unknown,
) => Promise<z.output<Contract[M]["output"]>>;

const charter = (extra: string[] = []) =>
  [
    "---",
    "name: Max",
    "title: Engineering Manager",
    "heartbeat: every 5 minutes, plus a daily status at 08:00",
    "model: claude-sonnet-5-5",
    ...extra,
    "limits:",
    "  live_runs: 3",
    "---",
    "",
    "# Max",
  ].join("\n");

async function load({
  files = { "staff/max.md": charter() },
  settings = {},
}: {
  files?: Record<string, string>;
  settings?: Record<string, unknown>;
} = {}) {
  const host = createFakePluginHost({
    pluginId: "optio",
    settings: { linearWebhookSecret: "whsec", ...settings },
    agentSkillIds: ["optio"],
    sdk: {
      threads: {
        spawn: async () => ({ id: "thr_chat1" }),
        get: async () => ({
          status: "idle",
          projectId: "proj_1",
          deletedAt: null,
          archivedAt: null,
        }),
        list: async () => [],
        timeline: async () => ({ rows: [] }),
        send: async () => ({}),
      },
      projects: {
        list: async () => [{ id: "proj_1", name: "acme" }],
        fileContent: async ({ path }: { path: string }) => {
          const content = files[path];
          if (content === undefined) throw new Error(`no ${path}`);
          return {
            content,
            contentEncoding: "utf8",
            mimeType: "text/markdown",
            sizeBytes: content.length,
          };
        },
      },
    },
  });
  await plugin(host.bb);
  // SAFETY: the fake host's callRpc parses every result with the method's output schema in rpcContract.
  const rpc = host.harness.behavior.callRpc as Rpc;
  const agent = async (id: string, name: string, enabled = true) => {
    const made = await rpc("agent_create", {
      name,
      description: "",
      projectId: "proj_1",
      instructions: "Do the work.",
      enabled,
      httpTrigger: false,
    });
    expect(made.id).toBe(id);
    return made;
  };
  const header = async () => {
    const chat = await rpc("staff_chat_open", { agentId: "max" });
    return rpc("staff_chat_header", { threadId: chat.threadId });
  };
  return { rpc, cli: host.harness.behavior.runCli, agent, header };
}

describe("a Staff member's Operating settings", () => {
  it("show the Charter's values, and a change is an override with who made it and a log row", async () => {
    const { rpc, agent } = await load();
    await agent("max", "Max");
    const before = await rpc("staff_settings", { agentId: "max" });
    expect(before.settings).toEqual({
      enabled: { value: true, file: true, override: null },
      paused: { value: false, file: false, override: null },
      model: { value: "claude-sonnet-5-5", file: "claude-sonnet-5-5", override: null },
      budget: { value: null, file: null, override: null },
      heartbeat: { value: null, file: null, override: null },
    });
    expect(before.charter).toEqual({
      heartbeat: "every 5 minutes, plus a daily status at 08:00",
    });
    expect(before.log).toEqual([]);

    await rpc("staff_settings_set", { agentId: "max", key: "paused", value: true, by: "Dana" });
    const after = await rpc("staff_settings", { agentId: "max" });
    expect(after.settings.paused.value).toBe(true);
    expect(after.settings.paused.file).toBe(false);
    expect(after.settings.paused.override?.by).toBe("Dana");
    expect(after.settings.paused.override?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(after.log).toHaveLength(1);
    expect(after.log[0]).toMatchObject({
      key: "paused",
      from: null,
      to: { value: true },
      by: "Dana",
    });

    await rpc("staff_settings_clear", { agentId: "max", key: "paused", by: "Dana" });
    const cleared = await rpc("staff_settings", { agentId: "max" });
    expect(cleared.settings.paused).toEqual({ value: false, file: false, override: null });
    expect(cleared.log).toHaveLength(2);
    expect(cleared.log[0]).toMatchObject({
      key: "paused",
      from: { value: true },
      to: null,
      by: "Dana",
    });
  });

  it("take the model, budget and Heartbeat window as overrides of the Charter", async () => {
    const { rpc, agent } = await load({
      files: { "staff/max.md": charter(["budget: 40 USD a day"]) },
    });
    await agent("max", "Max");
    const window = { from: "08:00", to: "18:00" };
    await rpc("staff_settings_set", {
      agentId: "max",
      key: "model",
      value: "claude-opus",
      by: "N",
    });
    await rpc("staff_settings_set", { agentId: "max", key: "budget", value: "10 USD", by: "N" });
    await rpc("staff_settings_set", { agentId: "max", key: "heartbeat", value: window, by: "N" });
    const { settings } = await rpc("staff_settings", { agentId: "max" });
    expect(settings.model).toMatchObject({ value: "claude-opus", file: "claude-sonnet-5-5" });
    expect(settings.budget).toMatchObject({ value: "10 USD", file: "40 USD a day" });
    expect(settings.heartbeat).toMatchObject({ value: window, file: null });
    await rpc("staff_settings_set", { agentId: "max", key: "heartbeat", value: null, by: "N" });
    // A null window is an override like any other: "as the Charter says" again, logged.
    expect((await rpc("staff_settings", { agentId: "max" })).settings.heartbeat.value).toBeNull();
  });

  it("are kept apart per Staff member", async () => {
    const { rpc, agent } = await load({
      files: { "staff/max.md": charter(), "staff/brad.md": charter() },
    });
    await agent("max", "Max");
    await agent("brad", "Brad");
    await rpc("staff_settings_set", { agentId: "max", key: "paused", value: true, by: "N" });
    expect((await rpc("staff_settings", { agentId: "brad" })).settings.paused.value).toBe(false);
    expect((await rpc("staff_settings", { agentId: "brad" })).log).toEqual([]);
  });

  it("are refused for an unknown agent, an agent without a Charter, an unknown key and a bad value", async () => {
    const { rpc, agent } = await load();
    await agent("max", "Max");
    await agent("orchestrator", "Orchestrator");
    await expect(rpc("staff_settings", { agentId: "nobody" })).rejects.toThrow(/no agent/);
    await expect(rpc("staff_settings", { agentId: "orchestrator" })).rejects.toThrow(/Charter/);
    await expect(
      rpc("staff_settings_set", { agentId: "orchestrator", key: "paused", value: true, by: "N" }),
    ).rejects.toThrow(/Charter/);
    await expect(
      rpc("staff_settings_set", { agentId: "max", key: "colour", value: true, by: "N" }),
    ).rejects.toThrow(/"colour" is not an Operating setting.*enabled, paused, model/);
    await expect(
      rpc("staff_settings_clear", { agentId: "max", key: "colour", by: "N" }),
    ).rejects.toThrow(/"colour"/);
    for (const [key, value] of [
      ["paused", "yes"],
      ["enabled", 1],
      ["model", ""],
      ["model", 3],
      ["budget", 3],
      ["heartbeat", { from: "08:00", to: "08:00" }],
      ["heartbeat", { from: "8am", to: "18:00" }],
    ] as const) {
      await expect(
        rpc("staff_settings_set", { agentId: "max", key, value, by: "N" }),
      ).rejects.toThrow(new RegExp(`^${key}: `));
    }
    expect((await rpc("staff_settings", { agentId: "max" })).log).toEqual([]);
    await expect(
      rpc("staff_settings_set", { agentId: "max", key: "paused", value: true, by: "N", extra: 1 }),
    ).rejects.toThrow();
  });
});

describe("the Staff chat header reads override or file", () => {
  it("says on, off for a switched-off setting, and paused for a pause setting", async () => {
    const { rpc, agent, header } = await load();
    await agent("max", "Max");
    expect(await header()).toMatchObject({ status: "on" });
    await rpc("staff_settings_set", { agentId: "max", key: "paused", value: true, by: "N" });
    expect(await header()).toMatchObject({ status: "paused" });
    // Off wins over paused.
    await rpc("staff_settings_set", { agentId: "max", key: "enabled", value: false, by: "N" });
    expect(await header()).toMatchObject({ status: "off" });
    await rpc("staff_settings_clear", { agentId: "max", key: "enabled", by: "N" });
    expect(await header()).toMatchObject({ status: "paused" });
    await rpc("staff_settings_clear", { agentId: "max", key: "paused", by: "N" });
    expect(await header()).toMatchObject({ status: "on" });
  });

  it("says off for a disabled agent row, and paused for the plugin-wide pause", async () => {
    const off = await load();
    await off.agent("max", "Max", false);
    expect(await off.header()).toMatchObject({ status: "off" });

    const paused = await load({ settings: { paused: true } });
    await paused.agent("max", "Max");
    expect(await paused.header()).toMatchObject({ status: "paused" });
    // The setting does not lift the plugin-wide pause.
    await paused.rpc("staff_settings_set", {
      agentId: "max",
      key: "paused",
      value: false,
      by: "N",
    });
    expect(await paused.header()).toMatchObject({ status: "paused" });
  });

  it("shows the budget override, else the Charter's", async () => {
    const { rpc, agent, header } = await load({
      files: { "staff/max.md": charter(["budget: 40 USD a day"]) },
    });
    await agent("max", "Max");
    expect((await header())?.budget).toEqual({ limit: "40 USD a day", used: null });
    await rpc("staff_settings_set", { agentId: "max", key: "budget", value: "5 USD", by: "N" });
    expect((await header())?.budget).toEqual({ limit: "5 USD", used: null });
    await rpc("staff_settings_set", { agentId: "max", key: "budget", value: null, by: "N" });
    expect((await header())?.budget).toEqual({ limit: null, used: null });
  });
});

describe("`bb optio settings`", () => {
  it("prints what the page reads, as JSON and as text", async () => {
    const { rpc, cli, agent } = await load();
    await agent("max", "Max");
    await rpc("staff_settings_set", { agentId: "max", key: "paused", value: true, by: "Dana" });
    const printed = await cli(["settings", "max", "--json"], { threadId: "thr_x" });
    expect(printed.exitCode).toBe(0);
    const parsed = JSON.parse(printed.stdout);
    expect(parsed).toEqual(await rpc("staff_settings", { agentId: "max" }));
    expect(parsed.status).toBe("paused");
    const text = await cli(["settings", "max"], { threadId: "thr_x" });
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain("paused: yes (file: no; set by Dana at ");
    expect(text.stdout).toContain("model: claude-sonnet-5-5");
    expect(text.stdout).toContain("heartbeat: as the Charter says");
  });

  it("exits 1 with the reason for an agent that is not Staff or does not exist", async () => {
    const { cli, agent } = await load();
    await agent("orchestrator", "Orchestrator");
    const notStaff = await cli(["settings", "orchestrator", "--json"], { threadId: "thr_x" });
    expect(notStaff.exitCode).toBe(1);
    expect(JSON.parse(notStaff.stdout).error).toMatch(/Charter/);
    const unknown = await cli(["settings", "nobody"], { threadId: "thr_x" });
    expect(unknown.exitCode).toBe(1);
    expect(unknown.stdout).toMatch(/no agent "nobody"/);
  });
});

describe("an override that no longer parses", () => {
  it("is ignored, so the Charter's value is in force", () => {
    const own = new Map<string, Override>([
      ["paused", { value: "yes", by: "N", at: 1 }],
      ["model", { value: "", by: "N", at: 1 }],
      ["heartbeat", { value: { from: "08:00", to: "08:00" }, by: "N", at: 1 }],
      ["budget", { value: null, by: "N", at: 1 }],
      ["enabled", { value: false, by: "N", at: 1 }],
    ]);
    expect(parseStaffOverrides(own)).toEqual({ budget: null, enabled: false });
    expect(parseStaffOverrides(undefined)).toEqual({});
  });
});
