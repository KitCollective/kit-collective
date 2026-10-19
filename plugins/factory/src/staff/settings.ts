// A Staff member's Operating settings: on/off, pause, model, budget and Heartbeat window. Each is the
// Charter's value (staff/<agent id>.md) or an override stored in Optio, with who set it and when, as
// the Loops' settings are (ADR-0065: Operating settings live in Optio, rules in the repo). The
// Charter file is never changed here. `effectiveSettings` is what the Staff chat header and Max's
// dispatch tick read, so the page, the header and the tick agree.
import { cliCommand } from "@get-bb/plugin-sdk";
import { z } from "zod";
import type { Agent } from "../agent-store.js";
import type { Core } from "../core.js";
import { scheduleSchema } from "../loop-registry.js";
import type { Override, SettingsStore } from "../settings/store.js";
import { json } from "../shared/cli.js";
import { type Charter, charterPath } from "./charter.js";
import type { StaffSettingsDto } from "./contract.js";

/** The store subject of a Staff member's overrides; the Loops use `loop:<name>`. */
export const staffSubject = (agentId: string) => `staff:${agentId}`;

/** What each setting accepts. A null budget states none; a null Heartbeat window is "as the Charter says". */
export const staffSettingSchemas = {
  enabled: z.boolean(),
  paused: z.boolean(),
  model: z.string().trim().min(1).max(100),
  budget: z.string().trim().min(1).max(200).nullable(),
  heartbeat: scheduleSchema.nullable(),
} as const;

export const STAFF_SETTING_KEYS = ["enabled", "paused", "model", "budget", "heartbeat"] as const;
export type StaffSettingKey = (typeof STAFF_SETTING_KEYS)[number];

export type StaffSettingValues = {
  [K in StaffSettingKey]: z.output<(typeof staffSettingSchemas)[K]>;
};

/** The overrides that hold a value the setting still accepts; one that no longer parses is ignored. */
export function parseStaffOverrides(
  own: Map<string, Override> | undefined,
): Partial<StaffSettingValues> {
  const values: Partial<StaffSettingValues> = {};
  const enabled = staffSettingSchemas.enabled.safeParse(own?.get("enabled")?.value);
  if (enabled.success) values.enabled = enabled.data;
  const paused = staffSettingSchemas.paused.safeParse(own?.get("paused")?.value);
  if (paused.success) values.paused = paused.data;
  const model = staffSettingSchemas.model.safeParse(own?.get("model")?.value);
  if (model.success) values.model = model.data;
  const budget = staffSettingSchemas.budget.safeParse(own?.get("budget")?.value);
  if (budget.success) values.budget = budget.data;
  const heartbeat = staffSettingSchemas.heartbeat.safeParse(own?.get("heartbeat")?.value);
  if (heartbeat.success) values.heartbeat = heartbeat.data;
  return values;
}

/** The Charter's value of each setting: what is in force while nothing is overridden. */
export function fileStaffSettings(charter: Charter): {
  [K in StaffSettingKey]: StaffSettingsDto["settings"][K]["file"];
} {
  return {
    enabled: true,
    paused: false,
    model: charter.model,
    budget: charter.budget,
    // The Charter's Heartbeat is prose; a window is only ever an override.
    heartbeat: null,
  };
}

const iso = (ms: number) => new Date(ms).toISOString();

const setting = <T>(file: T, value: T | undefined, override: Override | undefined) => ({
  value: value === undefined ? file : value,
  file,
  override:
    value === undefined || override === undefined
      ? null
      : { by: override.by, at: iso(override.at) },
});

/** Each setting in force, with the Charter's value and the override behind it. */
export function effectiveSettings(
  charter: Charter,
  own: Map<string, Override> | undefined,
): StaffSettingsDto["settings"] {
  const file = fileStaffSettings(charter);
  const values = parseStaffOverrides(own);
  return {
    enabled: setting(file.enabled, values.enabled, own?.get("enabled")),
    paused: setting(file.paused, values.paused, own?.get("paused")),
    model: setting(file.model, values.model, own?.get("model")),
    budget: setting(file.budget, values.budget, own?.get("budget")),
    heartbeat: setting(file.heartbeat, values.heartbeat, own?.get("heartbeat")),
  };
}

/**
 * Whether the member is working: off when the agent is disabled or its `enabled` setting is off,
 * else paused by its `paused` setting or the plugin-wide pause, else on.
 */
export function statusOf(
  agentEnabled: boolean,
  settings: StaffSettingsDto["settings"],
  pluginPaused: boolean,
): "on" | "off" | "paused" {
  if (!agentEnabled || !settings.enabled.value) return "off";
  return settings.paused.value || pluginPaused ? "paused" : "on";
}

/** The overrides of one Staff member. */
export const overridesOf = (store: SettingsStore, agentId: string) =>
  store.overrides(staffSubject(agentId)).get(staffSubject(agentId));

const LOG_LIMIT = 100;

/** The newest changes to one member's settings, newest first. The store filters by prefix, so `staff:max` also reads `staff:maxine`. */
export function logOf(store: SettingsStore, agentId: string): StaffSettingsDto["log"] {
  const subject = staffSubject(agentId);
  return store
    .log(subject, LOG_LIMIT * 10)
    .filter((change) => change.subject === subject)
    .slice(0, LOG_LIMIT)
    .map((change) => ({
      key: change.key,
      from: change.from ?? null,
      to: change.to ?? null,
      by: change.by,
      at: iso(change.at),
    }));
}

/** The key a request names, or why it is refused. */
export function settingKey(name: string): StaffSettingKey {
  const key = STAFF_SETTING_KEYS.find((known) => known === name);
  if (key === undefined) {
    throw new Error(
      `"${name}" is not an Operating setting of a Staff member: ${STAFF_SETTING_KEYS.join(", ")}`,
    );
  }
  return key;
}

/** The value a setting accepts, or the refusal `key: message`. */
export function checkSetting(key: StaffSettingKey, value: unknown): unknown {
  const parsed = staffSettingSchemas[key].safeParse(value);
  if (!parsed.success) {
    throw new Error(`${key}: ${parsed.error.issues[0]?.message ?? "invalid value"}`);
  }
  return parsed.data;
}

const flag = (value: boolean, labels: [string, string]) => labels[value ? 0 : 1];

function format(key: StaffSettingKey, value: unknown): string {
  if (value === null || value === undefined) {
    return key === "heartbeat" ? "as the Charter says" : "none";
  }
  if (typeof value === "boolean") {
    return key === "enabled" ? flag(value, ["on", "off"]) : flag(value, ["yes", "no"]);
  }
  if (typeof value === "string") return value;
  const window = scheduleSchema.safeParse(value);
  return window.success ? `${window.data.from}-${window.data.to} UTC` : JSON.stringify(value);
}

/** The text `bb optio settings` prints. */
export function describeSettings(name: string, dto: StaffSettingsDto): string {
  const lines = STAFF_SETTING_KEYS.map((key) => {
    const { value, file, override } = dto.settings[key];
    const tail =
      override === null
        ? ""
        : ` (file: ${format(key, file)}; set by ${override.by} at ${override.at})`;
    return `  ${key}: ${format(key, value)}${tail}`;
  });
  return [
    `${name} (${dto.status})`,
    ...lines,
    ...(dto.charter.heartbeat === null ? [] : [`  Charter heartbeat: ${dto.charter.heartbeat}`]),
  ].join("\n");
}

/**
 * The RPC handlers and the CLI command of the Operating settings. `charterOf` is the Staff chats'
 * reader, so the page, the header and the tick all take the same Charter for the member.
 */
export function createStaffSettings(
  core: Core,
  store: SettingsStore,
  charterOf: (agent: Agent) => Promise<Charter | null>,
) {
  /** The member and its Charter, or why the agent has no Operating settings. */
  async function member(agentId: string): Promise<{ agent: Agent; charter: Charter }> {
    const agent = core.agents.get(agentId);
    if (agent === null) throw new Error(`no agent "${agentId}"`);
    const charter = await charterOf(agent);
    if (charter === null) {
      throw new Error(
        `${agent.name} has no Charter (${charterPath(agent.id)} in its project, or it cannot be read), so it is not Staff and has no Operating settings`,
      );
    }
    return { agent, charter };
  }

  async function read(agentId: string): Promise<{ name: string; dto: StaffSettingsDto }> {
    const { agent, charter } = await member(agentId);
    const settings = effectiveSettings(charter, overridesOf(store, agent.id));
    return {
      name: agent.name,
      dto: {
        status: statusOf(agent.enabled, settings, (await core.settings.get()).paused),
        settings,
        charter: { heartbeat: charter.heartbeat },
        log: logOf(store, agent.id),
      },
    };
  }

  const rpc = {
    staff_settings: async ({ agentId }: { agentId: string }) => (await read(agentId)).dto,
    async staff_settings_set(input: { agentId: string; key: string; value: unknown; by: string }) {
      const { agent } = await member(input.agentId);
      const key = settingKey(input.key);
      const value = checkSetting(key, input.value);
      if (store.set(staffSubject(agent.id), key, value, input.by, Date.now())) core.changed();
      return { ok: true as const };
    },
    async staff_settings_clear(input: { agentId: string; key: string; by: string }) {
      const { agent } = await member(input.agentId);
      const key = settingKey(input.key);
      if (store.clear(staffSubject(agent.id), key, input.by, Date.now())) core.changed();
      return { ok: true as const };
    },
  };

  const command = cliCommand({
    summary: "Show a Staff member's Operating settings: the Charter's value or an override",
    description:
      "Prints whether the Staff member is on, paused, which model it uses, its budget and the daily UTC window in which Max's dispatch tick may wake it. A value changed on the member's page shows with the Charter's value beside it. With --json it prints what the page reads, which Max's dispatch tick and watchdog use. Exits 1 with the reason when the agent has no Charter or it cannot be read.",
    positionals: [{ name: "agent", description: "Agent id", required: true }],
    options: { json },
    async run({ positionals, options }) {
      try {
        const { name, dto } = await read(positionals.agent);
        return {
          exitCode: 0,
          stdout: options.json ? JSON.stringify(dto) : describeSettings(name, dto),
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return { exitCode: 1, stdout: options.json ? JSON.stringify({ error: reason }) : reason };
      }
    },
  });

  return { rpc, cli: { settings: command } };
}
