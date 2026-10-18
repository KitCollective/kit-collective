// The board area: the Board page's server side. The orchestrator's plan, its setup, machines and
// requirements, and the `bb optio` commands that steer it.

import type { PluginRpcHandlers } from "@get-bb/plugin-sdk";
import { cliCommand, PluginCliError } from "@get-bb/plugin-sdk";
import type { BoardSummary, Plan } from "../board.js";
import type { Core } from "../core.js";
import { probeThread, renderProbe } from "../host-probe.js";
import { fetchBoard } from "../linear-api.js";
import type { SchedulerConfig } from "../scheduler-config.js";
import { cliFailure, json } from "../shared/cli.js";
import type { BoardDto, boardContract } from "./contract.js";

function describePlan(
  plan: Plan,
  summary: BoardSummary,
  mode: string,
  loops: { name: string; workflow: string; enabled: boolean; maxLive: number }[],
): string {
  const lines = [
    `Mode: ${mode}. Focus: ${plan.focus ?? "none"}.`,
    `Loops: ${loops.map((loop) => `${loop.name} (${loop.workflow}, ${loop.enabled ? `up to ${loop.maxLive} live` : "disabled"})`).join("; ")}.`,
    `Open issues: ${
      Object.entries(summary.states)
        .map(([state, count]) => `${state} ${count}`)
        .join(", ") || "none"
    }.`,
    "Milestones (open / ready to start):",
    ...Object.entries(summary.milestones).map(
      ([name, count]) => `  ${name}: ${count.open} / ${count.ready}`,
    ),
  ];
  const section = (title: string, rows: string[]) => {
    lines.push("", `${title} (${rows.length})`, ...rows.map((row) => `  ${row}`));
  };
  lines.push(
    `Queue: ${plan.ready} ready, room for ${plan.room} more; ${plan.promotable.length} backlog issues could be promoted.`,
  );
  section(
    "Running",
    plan.running.map(
      (run) =>
        `${run.identifier}  on ${run.machineId}${run.loop === null ? "" : `  [${run.loop}]`}`,
    ),
  );
  section(
    mode === "live" ? "Starting now" : "Would start",
    plan.start.map(
      ({ issue, loop, machineId, resume }) =>
        `${issue.identifier}  [${loop}]  on ${machineId}${resume ? " (resume)" : ""}  P${issue.priority}  ${issue.milestone ?? "no milestone"}  ${issue.title}`,
    ),
  );
  section(
    "Waiting",
    plan.waiting.map((wait) => `${wait.identifier}  [${wait.loop}]  ${wait.reason}`),
  );
  section(
    "Unblocked, moving back",
    plan.unblock.map((issue) => issue.identifier),
  );
  return lines.join("\n");
}

export function createBoard(core: Core) {
  const {
    bb,
    settings,
    dispatches,
    gateRuns,
    changed,
    scheduler,
    probeDeps,
    linearApiKey,
    storedScheduler,
    requireScheduler,
    saveScheduler,
    setSchedulerConfig,
  } = core;

  async function boardDto(): Promise<BoardDto> {
    const paused = (await settings.get()).paused;
    const empty: BoardDto = {
      configured: false,
      error: null,
      mode: "off",
      paused,
      focus: (await bb.storage.kv.get<string>("focus")) ?? null,
      projectId: "",
      teamKey: "",
      registryError: null,
      loops: [],
      decisions: [],
      maxAttempts: 2,
      autoPromote: false,
      handOver: null,
      room: 0,
      promotable: 0,
      machines: [],
      requirements: [],
      states: [],
      milestones: [],
      running: [],
      start: [],
      waiting: [],
      stalled: [],
    };
    let config: SchedulerConfig | null;
    try {
      config = await storedScheduler();
    } catch (error) {
      return { ...empty, error: String(error instanceof Error ? error.message : error) };
    }
    if (config === null) return empty;
    const base: BoardDto = {
      ...empty,
      configured: true,
      mode: config.mode,
      projectId: config.projectId,
      teamKey: config.teamKey,
      decisions: dispatches.decisions(20),
      maxAttempts: config.maxAttempts,
      autoPromote: config.autoPromote,
      handOver: config.handOver ?? null,
      machines: config.machines,
      requirements: config.requirements,
      stalled: dispatches
        .list(200)
        .filter(
          (dispatch) =>
            dispatch.status === "stalled" && dispatches.latest(dispatch.issue)?.id === dispatch.id,
        )
        .map((dispatch) => ({
          issue: dispatch.issue,
          machineId: dispatch.machineId,
          outcome: dispatch.outcome,
        })),
    };
    try {
      const { plan, summary, registry, refusal } = await scheduler.tick(config, false);
      if (registry === null) return { ...base, registryError: refusal };
      return {
        ...base,
        loops: registry.loops.map((loop) => ({
          name: loop.name,
          workflow: loop.workflow,
          kind: loop.trigger.kind,
          enabled: loop.enabled,
          machines: loop.machines,
          maxLive: loop.maxLive,
          running: plan.running.filter((run) => run.loop === loop.name).length,
        })),
        states: Object.entries(summary.states).map(([name, count]) => ({ name, count })),
        milestones: Object.entries(summary.milestones).map(([name, count]) => ({ name, ...count })),
        room: plan.room,
        promotable: plan.promotable.length,
        running: plan.running,
        start: plan.start.map(({ issue, loop, machineId, resume }) => ({
          identifier: issue.identifier,
          loop,
          title: issue.title,
          machineId,
          resume,
          priority: issue.priority,
          milestone: issue.milestone,
        })),
        waiting: plan.waiting,
      };
    } catch (error) {
      return { ...base, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const rpc: PluginRpcHandlers<typeof boardContract> = {
    async hosts_list() {
      const hosts = await bb.sdk.hosts.list();
      return { hosts: hosts.map((host) => ({ id: host.id, name: host.name ?? host.id })) };
    },
    board_get: boardDto,
    async board_setup(input) {
      if ((await storedScheduler()) !== null) throw new Error("the board is already set up");
      await saveScheduler({ ...input, mode: "dry-run" });
      return { ok: true as const };
    },
    async board_update({ focus, handOver, ...patch }) {
      if (focus !== undefined) {
        if (focus === null) await bb.storage.kv.delete("focus");
        else await bb.storage.kv.set("focus", focus);
      }
      if (handOver !== undefined || Object.keys(patch).length > 0) {
        const { handOver: stored, ...current } = await requireScheduler();
        // Undefined keeps what is stored; null switches the hand-over off.
        const next = handOver === undefined ? stored : (handOver ?? undefined);
        await saveScheduler({
          ...current,
          ...(next === undefined ? {} : { handOver: next }),
          ...patch,
        });
      }
      changed();
      return { ok: true as const };
    },
  };

  const cli = {
    board: cliCommand({
      summary: "Show the orchestrator's plan: running, starting next, and why the rest wait",
      options: { json },
      async run(input) {
        const config = await requireScheduler().catch(cliFailure("board_unavailable"));
        const { plan, summary, registry, refusal } = await scheduler
          .tick(config, false)
          .catch(cliFailure("board_unavailable"));
        const mode = (await settings.get()).paused ? "paused" : config.mode;
        if (registry === null) {
          return {
            exitCode: 1,
            stdout: input.options.json
              ? JSON.stringify({ mode, refusal })
              : `Mode: ${mode}. The registry was refused, so nothing is planned or started: ${refusal}`,
          };
        }
        const loops = registry.loops.map((loop) => ({
          name: loop.name,
          workflow: loop.workflow,
          kind: loop.trigger.kind,
          enabled: loop.enabled,
          machines: loop.machines,
          maxLive: loop.maxLive,
        }));
        return {
          exitCode: 0,
          stdout: input.options.json
            ? JSON.stringify({
                mode,
                loops,
                summary,
                ...plan,
                start: plan.start.map(({ issue, ...rest }) => ({
                  ...rest,
                  identifier: issue.identifier,
                })),
                decisions: dispatches.decisions(20),
              })
            : describePlan(plan, summary, mode, loops),
        };
      },
    }),
    "focus set": cliCommand({
      summary: "Take a milestone's issues first; other issues fill the capacity that is left",
      positionals: [
        { name: "milestone", description: "Milestone name as Linear shows it", required: true },
      ],
      options: {
        force: { type: "boolean", description: "Accept a name no open issue carries" },
      },
      async run(input) {
        const name = input.positionals.milestone.trim();
        if (!input.options.force) {
          const config = await requireScheduler().catch(cliFailure("board_unavailable"));
          const board = await fetchBoard(await linearApiKey(), config.teamKey).catch(
            cliFailure("board_unavailable"),
          );
          const known = [...new Set(board.issues.flatMap((issue) => issue.milestone ?? []))];
          if (!known.some((milestone) => milestone.toLowerCase() === name.toLowerCase())) {
            throw new PluginCliError(`no open issue is in a milestone named "${name}"`, {
              code: "milestone_not_found",
              hint: `Milestones with open issues: ${known.join(", ") || "none"}. Add --force to set it anyway.`,
            });
          }
        }
        await bb.storage.kv.set("focus", name);
        changed();
        return { exitCode: 0, stdout: `Focus: ${name}` };
      },
    }),
    "focus clear": cliCommand({
      summary: "Go back to plain priority order",
      async run() {
        await bb.storage.kv.delete("focus");
        changed();
        return { exitCode: 0, stdout: "Focus: none" };
      },
    }),
    resume: cliCommand({
      summary: "Start a stalled issue's workflow again with resume, within the attempt cap",
      positionals: [{ name: "issue", description: "Issue key, e.g. ENG-12", required: true }],
      options: {
        machine: {
          type: "string",
          description: "Machine id; defaults to the machine of the stalled run",
        },
      },
      async run(input) {
        const config = await requireScheduler().catch(cliFailure("board_unavailable"));
        if (config.mode !== "live") {
          throw new PluginCliError(`the board is in ${config.mode} mode and starts nothing`);
        }
        setSchedulerConfig(config);
        const dispatch = await scheduler
          .resume(config, input.positionals.issue, input.options.machine)
          .catch(cliFailure("resume_refused"));
        changed();
        return {
          exitCode: 0,
          stdout: `Resumed ${dispatch.issue} on ${dispatch.machineId} in ${dispatch.threadId}`,
        };
      },
    }),
    promote: cliCommand({
      summary:
        "Move a backlog issue to the dispatch state with the ready label, so the board starts it",
      description:
        "Refused when the issue is not in the backlog, is blocked, carries a skip label, or the ready queue is already as long as the machines' capacity.",
      positionals: [{ name: "issue", description: "Issue key, e.g. ENG-12", required: true }],
      options: {
        reason: {
          type: "string",
          required: true,
          description: "Why this issue is the right next step; written as a comment on the issue",
        },
      },
      async run(input) {
        const config = await requireScheduler().catch(cliFailure("board_unavailable"));
        if (config.mode !== "live") {
          throw new PluginCliError(`the board is in ${config.mode} mode: nothing would start it`, {
            code: "not_live",
          });
        }
        setSchedulerConfig(config);
        const { issue, state } = await scheduler
          .promote(config, input.positionals.issue, input.options.reason)
          .catch(cliFailure("promote_refused"));
        changed();
        return {
          exitCode: 0,
          stdout: `Promoted ${issue.identifier} to ${state}: ${issue.title}`,
        };
      },
    }),
    "hand-over": cliCommand({
      summary:
        "Set the states an ended run's issue moves between on the recorded review gate, or switch the hand-over off",
      description:
        "With the hand-over on, the board moves an ended run's issue from the review state to the approval state only when the review gate is recorded green on the pull request's current head. Without --review and --approval it shows the current setting.",
      options: {
        review: { type: "string", description: "Where a ready run leaves its issue" },
        approval: { type: "string", description: "Where a green review gate sends it" },
        off: { type: "boolean", description: "Switch the hand-over off" },
      },
      async run(input) {
        const config = await requireScheduler().catch(cliFailure("board_unavailable"));
        const { review, approval, off } = input.options;
        if (off === true) {
          const { handOver: _off, ...rest } = config;
          await saveScheduler(rest).catch(cliFailure("invalid_config"));
          return { exitCode: 0, stdout: "Hand-over is off" };
        }
        if (review === undefined && approval === undefined) {
          return {
            exitCode: 0,
            stdout:
              config.handOver === undefined
                ? "Hand-over is off"
                : `Hand-over: ${config.handOver.reviewState} -> ${config.handOver.approvalState} on a green review gate`,
          };
        }
        if (review === undefined || approval === undefined) {
          throw new PluginCliError("give both --review and --approval", {
            code: "missing_option",
          });
        }
        await saveScheduler({
          ...config,
          handOver: { reviewState: review, approvalState: approval },
        }).catch(cliFailure("invalid_config"));
        return {
          exitCode: 0,
          stdout: `Hand-over: ${review} -> ${approval} on a green review gate`,
        };
      },
    }),
    release: cliCommand({
      summary:
        "Clear an issue's stall, so it is planned again once it is back in the dispatch state",
      positionals: [{ name: "issue", description: "Issue key, e.g. ENG-12", required: true }],
      run(input) {
        if (!dispatches.release(input.positionals.issue)) {
          throw new PluginCliError(`${input.positionals.issue} is not stalled`, {
            code: "not_stalled",
          });
        }
        changed();
        return { exitCode: 0, stdout: `Released ${input.positionals.issue}` };
      },
    }),
    dispatches: cliCommand({
      summary: "Show the workflow runs the board started, newest first",
      options: {
        limit: {
          type: "integer",
          min: 1,
          max: 200,
          default: 20,
          description: "How many to show (1-200, default 20)",
        },
        json,
      },
      run(input) {
        const rows = dispatches.list(input.options.limit);
        if (input.options.json) return { exitCode: 0, stdout: JSON.stringify(rows) };
        return {
          exitCode: 0,
          stdout:
            rows.length === 0
              ? "No dispatches."
              : rows
                  .map((row) =>
                    [
                      new Date(row.startedAt).toISOString(),
                      row.issue,
                      row.machineId,
                      row.status,
                      row.threadId ?? "-",
                      row.outcome ?? "",
                    ]
                      .join("  ")
                      .trimEnd(),
                  )
                  .join("\n"),
        };
      },
    }),
    gates: cliCommand({
      summary: "Show the gate runs the gate tool recorded, newest first",
      options: {
        limit: {
          type: "integer",
          min: 1,
          max: 200,
          default: 20,
          description: "How many to show (1-200, default 20)",
        },
        json,
      },
      run(input) {
        const rows = gateRuns.list(input.options.limit);
        if (input.options.json) return { exitCode: 0, stdout: JSON.stringify(rows) };
        return {
          exitCode: 0,
          stdout:
            rows.length === 0
              ? "No gate runs."
              : rows
                  .map((row) =>
                    [
                      new Date(row.at).toISOString(),
                      row.threadId,
                      row.gate,
                      row.pr ?? "-",
                      row.issue ?? "-",
                      row.outcome,
                      row.exitCode ?? "-",
                      row.sha?.slice(0, 8) ?? "-",
                      row.verdictLine ?? row.reason ?? "",
                    ].join("  "),
                  )
                  .join("\n"),
        };
      },
    }),
    "host-probe": cliCommand({
      summary: "Spike: run the fixed probe script in a thread's worktree through the host bundle",
      positionals: [{ name: "thread", description: "Thread id", required: true }],
      options: { json },
      async run(input) {
        try {
          const record = await probeThread(probeDeps, input.positionals.thread);
          return {
            exitCode: record.exitCode,
            stdout: input.options.json ? JSON.stringify(record) : renderProbe(record),
          };
        } catch (error) {
          throw new PluginCliError(error instanceof Error ? error.message : String(error), {
            code: "host_probe_failed",
          });
        }
      },
    }),
  };

  return { rpc, cli };
}
