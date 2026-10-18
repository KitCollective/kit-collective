// The runs area: the Runs page's server side. Every run of a Loop, from start to hand-over.
import type { PluginRpcHandlers } from "@get-bb/plugin-sdk";
import type { Core } from "../core.js";
import { parseRegistry, type Registry } from "../loop-registry.js";
import type { runsContract } from "./contract.js";

export function createRuns(core: Core) {
  const { dispatches, storedScheduler, registryText } = core;

  const RUNS_PAGE = 100;

  /** The runs page: every run of the record, per Loop and state, with the links of each. */
  async function runsDto(input: {
    loop: string | null;
    state: "running" | "stopped" | "handed-over" | null;
  }) {
    const config = await storedScheduler();
    // A registry that is refused or unreadable still leaves the record of runs to list.
    let registry: Registry | null = null;
    if (config !== null) {
      const parsed = parseRegistry(await registryText(config).catch(() => ""));
      if (parsed.ok) registry = parsed.registry;
    }
    const repo = registry?.repo ?? null;
    const found = dispatches.runs({ ...input, limit: RUNS_PAGE + 1 });
    const known = new Set(registry?.loops.map((loop) => loop.name));
    for (const run of dispatches.runs({ loop: null, state: null, limit: 200 })) {
      if (run.loop !== null) known.add(run.loop);
    }
    return {
      loops: [...known],
      truncated: found.length > RUNS_PAGE,
      runs: found.slice(0, RUNS_PAGE).map((run) => ({
        id: run.id,
        loop: run.loop,
        issue: run.issue,
        machineId: run.machineId,
        state: run.state,
        resume: run.resume,
        step: run.step,
        stopReason: run.state === "stopped" ? run.outcome : null,
        handedOverTo: run.state === "handed-over" ? run.outcome : null,
        gates: run.gates.map(({ threadId: _thread, ...gate }) => gate),
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        threadId: run.threadId,
        workflowRunId: run.workflowRunId,
        prNumber: run.prNumber,
        prUrl:
          run.prNumber === null || repo === null
            ? null
            : `https://github.com/${repo}/pull/${run.prNumber}`,
      })),
    };
  }

  const rpc: PluginRpcHandlers<typeof runsContract> = { runs_list: runsDto };

  return { rpc };
}
