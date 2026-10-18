// The Loops area: every Loop of the registry with its Operating settings, each the file's value or
// an override stored in Optio. `createLoops` gives the area's RPC handlers and CLI command;
// server.ts registers them with a few lines, and src/contract.ts spreads `loopsContract`. The
// Board and the dispatch tick read the same override-or-file values: the scheduler applies the
// overrides to every registry it reads, and Max's tick calls `bb optio loops --json`.
import { cliCommand } from "@get-bb/plugin-sdk";
import type { z } from "zod";
import type { Core } from "../core.js";
import {
  fileSettings,
  type Loop,
  type LoopOverrides,
  parseRegistry,
  type Registry,
  SETTING_KEYS,
  type SettingKey,
  type SettingValues,
  settingSchemas,
} from "../loop-registry.js";
import { createSettingsStore, type Override } from "../settings/store.js";
import { json } from "../shared/cli.js";
import type { LoopChangeDto, LoopDto, LoopsDto } from "./contract.js";
import { formatSetting } from "./format.js";

const SUBJECT = "loop:";
const LOG_LIMIT = 100;

const iso = (ms: number) => new Date(ms).toISOString();

function triggerSummary(loop: Loop): LoopDto["trigger"] {
  const { trigger } = loop;
  return trigger.kind === "issue"
    ? {
        kind: "issue",
        summary: `${trigger.state} with ${trigger.label}${trigger.unblocked ? ", unblocked" : ""}`,
      }
    : {
        kind: "milestone-done",
        summary: `every issue of a milestone is ${trigger.states.join(" or ")}`,
      };
}

/** The overrides that hold a value the setting still accepts; one that no longer parses is ignored. */
function parseOverrides(own: Map<string, Override> | undefined): Partial<SettingValues> {
  const values: Partial<SettingValues> = {};
  const enabled = settingSchemas.enabled.safeParse(own?.get("enabled")?.value);
  if (enabled.success) values.enabled = enabled.data;
  const maxLive = settingSchemas.maxLive.safeParse(own?.get("maxLive")?.value);
  if (maxLive.success) values.maxLive = maxLive.data;
  const startsPerDay = settingSchemas.startsPerDay.safeParse(own?.get("startsPerDay")?.value);
  if (startsPerDay.success) values.startsPerDay = startsPerDay.data;
  const schedule = settingSchemas.schedule.safeParse(own?.get("schedule")?.value);
  if (schedule.success) values.schedule = schedule.data;
  return values;
}

const setting = <T>(file: T, value: T | undefined, override: Override | undefined) => ({
  value: value === undefined ? file : value,
  file,
  override:
    value === undefined || override === undefined
      ? null
      : { by: override.by, at: iso(override.at) },
});

function loopDto(registry: Registry, loop: Loop, own: Map<string, Override> | undefined): LoopDto {
  const file = fileSettings(registry, loop);
  const values = parseOverrides(own);
  return {
    name: loop.name,
    workflow: loop.workflow,
    trigger: triggerSummary(loop),
    settings: {
      enabled: setting(file.enabled, values.enabled, own?.get("enabled")),
      maxLive: setting(file.maxLive, values.maxLive, own?.get("maxLive")),
      startsPerDay: setting(file.startsPerDay, values.startsPerDay, own?.get("startsPerDay")),
      schedule: setting(file.schedule, values.schedule, own?.get("schedule")),
    },
  };
}

function describe(loops: LoopDto[]): string {
  return loops
    .map((loop) => {
      const lines = SETTING_KEYS.map((key) => {
        const { value, file, override } = loop.settings[key];
        const tail =
          override === null
            ? ""
            : ` (file: ${formatSetting(key, file)}; set by ${override.by} at ${override.at})`;
        return `  ${key}: ${formatSetting(key, value)}${tail}`;
      });
      return [
        `${loop.name} (${loop.workflow}; starts from ${loop.trigger.summary})`,
        ...lines,
      ].join("\n");
    })
    .join("\n");
}

export function createLoops(core: Core) {
  const store = createSettingsStore(core.bb.storage.database());

  /** Every Loop's overrides by name, as the scheduler applies them. */
  function overrides(): LoopOverrides {
    const result: LoopOverrides = {};
    for (const [subject, own] of store.overrides(SUBJECT)) {
      result[subject.slice(SUBJECT.length)] = parseOverrides(own);
    }
    return result;
  }
  core.scheduler.useLoopOverrides(overrides);

  /** The registry as the project checkout holds it now, without any override. */
  async function fileRegistry(): Promise<Registry> {
    const parsed = parseRegistry(await core.registryText(await core.requireScheduler()));
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.registry;
  }

  async function list(): Promise<LoopsDto> {
    try {
      const registry = await fileRegistry();
      const own = store.overrides(SUBJECT);
      const log = store.log(SUBJECT, LOG_LIMIT).map(
        (change): LoopChangeDto => ({
          loop: change.subject.slice(SUBJECT.length),
          key: change.key,
          from: change.from ?? null,
          to: change.to ?? null,
          by: change.by,
          at: iso(change.at),
        }),
      );
      return {
        error: null,
        loops: registry.loops.map((loop) =>
          loopDto(registry, loop, own.get(`${SUBJECT}${loop.name}`)),
        ),
        log,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), loops: [], log: [] };
    }
  }

  /** The Loop and the setting a request names, or why the request is refused. */
  async function target(loopName: string, name: string): Promise<{ loop: Loop; key: SettingKey }> {
    const key = SETTING_KEYS.find((known) => known === name);
    if (key === undefined) {
      throw new Error(
        `"${name}" is not an Operating setting of a Loop: ${SETTING_KEYS.join(", ")}`,
      );
    }
    const registry = await fileRegistry();
    const loop = registry.loops.find((candidate) => candidate.name === loopName);
    if (loop === undefined) throw new Error(`no Loop "${loopName}" in factory.config.json`);
    return { loop, key };
  }

  function check(schema: z.ZodType, key: SettingKey, value: unknown): unknown {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new Error(`${key}: ${parsed.error.issues[0]?.message ?? "invalid value"}`);
    }
    return parsed.data;
  }

  const rpc = {
    loops_list: list,
    async loops_set(input: { loop: string; key: string; value: unknown; by: string }) {
      const { loop, key } = await target(input.loop, input.key);
      const value = check(settingSchemas[key], key, input.value);
      if (key === "enabled" && value === true && loop.trigger.kind === "milestone-done") {
        throw new Error("the milestone-done trigger is not supported yet: it ships disabled");
      }
      if (store.set(`${SUBJECT}${loop.name}`, key, value, input.by, Date.now())) {
        core.changed();
      }
      return { ok: true as const };
    },
    async loops_clear(input: { loop: string; key: string; by: string }) {
      const { loop, key } = await target(input.loop, input.key);
      if (store.clear(`${SUBJECT}${loop.name}`, key, input.by, Date.now())) core.changed();
      return { ok: true as const };
    },
  };

  const command = cliCommand({
    summary: "Show every Loop with its Operating settings: the file's value or an override",
    description:
      "Prints each Loop's trigger and workflow, and whether it is on, its live-run cap, its starts per day and its schedule. A value changed on the Loops page shows with the file's value beside it. With --json it prints what the page reads, which Max's dispatch tick uses. Exits 1 with the reason when the Loops cannot be read.",
    options: { json },
    async run({ options }) {
      const listed = await list();
      if (listed.error !== null) {
        return {
          exitCode: 1,
          stdout: options.json ? JSON.stringify(listed) : listed.error,
        };
      }
      return {
        exitCode: 0,
        stdout: options.json ? JSON.stringify(listed) : describe(listed.loops),
      };
    },
  });

  return { rpc, command };
}
