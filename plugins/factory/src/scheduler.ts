// One tick of the orchestrator: close runs that ended, plan the board, start
// what fits, and hand every stall to the orchestrator thread.
import { type BoardSummary, type Plan, planBoard, summarizeBoard } from "./board.js";
import type { Dispatch, DispatchStore } from "./dispatch-store.js";
import type { Board, BoardIssue } from "./linear-api.js";
import { machineEnvironment, type SchedulerConfig } from "./scheduler-config.js";
import type { SpawnRequest } from "./sessions.js";

export interface SchedulerDeps {
  store: DispatchStore;
  loadBoard(config: SchedulerConfig): Promise<Board>;
  moveIssue(issueId: string, stateId: string): Promise<void>;
  spawn(request: SpawnRequest): Promise<{ id: string }>;
  /** The thread's status, or null when the thread is gone. */
  threadStatus(threadId: string): Promise<string | null>;
  /** Whether a workflow run of the thread is active, and a line about its latest run. */
  workflowRuns(threadId: string): Promise<{ active: boolean; last: string | null }>;
  /** Sends a message to the standing orchestrator thread. */
  notify(text: string): Promise<void>;
  getFocus(): Promise<string | null>;
  /** Moves a backlog issue to the dispatch state with the ready label and a comment. */
  promoteIssue(issue: BoardIssue, stateId: string, comment: string): Promise<void>;
  /** When the orchestrator was last asked to refill the queue (epoch ms), or null. */
  getLastRefill(): Promise<number | null>;
  setLastRefill(at: number): Promise<void>;
  now(): number;
  log(message: string): void;
}

export interface TickResult {
  plan: Plan;
  summary: BoardSummary;
  started: Dispatch[];
  stalled: Dispatch[];
  unblocked: string[];
  /** Whether this tick asked the orchestrator to promote from the backlog. */
  refillRequested: boolean;
}

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

function launcherPrompt(
  config: SchedulerConfig,
  issue: string,
  machineId: string,
  resume: boolean,
): string {
  const args = JSON.stringify({ issue, ...(resume ? { resume: true } : {}), machine: machineId });
  return [
    `You are the launcher for ${issue}. Run this one command in the workspace root, in the foreground, exactly as written:`,
    "",
    `    bb workflows run --name ${config.workflow} --args ${shellQuote(args)} --json`,
    "",
    "Do not change the command and do not run anything else.",
    "Reply with the run id the command printed, or with its error output verbatim.",
  ].join("\n");
}

export function createScheduler(deps: SchedulerDeps) {
  const { store } = deps;

  async function start(config: SchedulerConfig, issue: string, machineId: string, resume: boolean) {
    const machine = config.machines.find((candidate) => candidate.id === machineId);
    if (machine === undefined) throw new Error(`no machine "${machineId}"`);
    const dispatch = store.start({ issue, machineId, resume, now: deps.now() });
    try {
      const thread = await deps.spawn({
        projectId: config.projectId,
        prompt: launcherPrompt(config, issue, machineId, resume),
        title: `${issue} on ${machineId}${resume ? " (resume)" : ""}`,
        environment: machineEnvironment(machine),
        pluginMetadata: { dispatch: dispatch.id, issue, machine: machineId },
      });
      store.attach(dispatch.id, thread.id);
      deps.log(`scheduler: started ${issue} on ${machineId} in ${thread.id}`);
      return { ...dispatch, threadId: thread.id };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      store.end(dispatch.id, "stalled", `could not start: ${reason}`.slice(0, 500), deps.now());
      deps.log(`scheduler: could not start ${issue} on ${machineId}: ${reason}`);
      return { ...dispatch, status: "stalled" as const, outcome: `could not start: ${reason}` };
    }
  }

  /** Ends every active run whose workflow and launcher thread have both stopped. */
  async function reconcile(config: SchedulerConfig, board: Board): Promise<Dispatch[]> {
    const stalled: Dispatch[] = [];
    for (const dispatch of store.active()) {
      if (deps.now() - dispatch.startedAt < config.startGraceSeconds * 1000) continue;
      let last: string | null = "the launcher thread never started";
      if (dispatch.threadId !== null) {
        const runs = await deps.workflowRuns(dispatch.threadId);
        if (runs.active) continue;
        const status = await deps.threadStatus(dispatch.threadId);
        if (status !== null && status !== "idle" && status !== "error") continue;
        last = runs.last;
      }
      const issue = board.issues.find((candidate) => candidate.identifier === dispatch.issue);
      const working =
        issue !== undefined &&
        (issue.state === config.dispatchState || config.activeStates.includes(issue.state));
      if (!working) {
        store.end(dispatch.id, "handed-over", issue?.state ?? "closed", deps.now());
        continue;
      }
      const outcome = `${last ?? "no workflow run was recorded"}; the issue is in ${issue.state}`;
      store.end(dispatch.id, "stalled", outcome.slice(0, 500), deps.now());
      stalled.push({ ...dispatch, status: "stalled", outcome });
    }
    return stalled;
  }

  function stallMessage(config: SchedulerConfig, dispatch: Dispatch): string {
    const attempts = store.consecutiveStalls(dispatch.issue);
    const capped = attempts >= config.maxAttempts;
    return [
      `[optio] ${dispatch.issue} stopped without a hand-over (attempt ${attempts} of ${config.maxAttempts}).`,
      `Machine: ${dispatch.machineId}. Launcher thread: ${dispatch.threadId ?? "none"}.`,
      `What is known: ${dispatch.outcome ?? "nothing"}.`,
      "Find the gate that failed and why, then put the issue where it belongs in the process.",
      capped
        ? `The attempt cap is reached, so \`bb optio resume ${dispatch.issue}\` is refused: park the issue for a person, then run \`bb optio release ${dispatch.issue}\`.`
        : `When another run can fix it: \`bb optio resume ${dispatch.issue}\`. When a person is needed: park the issue, then \`bb optio release ${dispatch.issue}\`.`,
    ].join("\n");
  }

  function refillMessage(config: SchedulerConfig, plan: Plan): string {
    const shown = plan.promotable.slice(0, 30);
    return [
      `[optio] The ready queue has room for ${plan.room} more issue${plan.room === 1 ? "" : "s"} (${plan.running.length} running, ${plan.ready} ready). Focus: ${plan.focus ?? "none"}.`,
      `Choose what to promote from ${config.backlogState}. These ${shown.length} of ${plan.promotable.length} are unblocked, best first by focus, priority and age:`,
      ...shown.map(
        (issue) =>
          `- ${issue.identifier}  P${issue.priority}  ${issue.milestone ?? "no milestone"}  ${issue.title}`,
      ),
      "Read the ones you consider before you choose. Promote an issue only when it is well-formed (what to build, acceptance criteria, a write-scope line, one milestone) and it is the right next step: it finishes a milestone that is under way, it unblocks other issues, or it is in the focus milestone.",
      `Promote with \`bb optio promote <issue> --reason "<why now>"\`, at most ${plan.room}. Promote fewer, or none, when nothing is ready: say what each rejected candidate is missing.`,
    ].join("\n");
  }

  return {
    /**
     * Plans the board. With `apply`, also closes ended runs, moves unblocked
     * issues back to the dispatch state, starts the planned runs and reports
     * stalls; without it nothing is written anywhere.
     */
    async tick(config: SchedulerConfig, apply: boolean): Promise<TickResult> {
      const board = await deps.loadBoard(config);
      const stalled = apply ? await reconcile(config, board) : [];
      const plan = planBoard({
        issues: board.issues,
        config,
        focus: await deps.getFocus(),
        history: store.history(),
      });
      const result: TickResult = {
        plan,
        summary: summarizeBoard(board.issues, config),
        started: [],
        stalled,
        unblocked: [],
        refillRequested: false,
      };
      if (!apply) return result;

      const dispatchStateId = board.states[config.dispatchState];
      for (const issue of plan.unblock) {
        if (dispatchStateId === undefined) break;
        await deps.moveIssue(issue.id, dispatchStateId);
        result.unblocked.push(issue.identifier);
        deps.log(`scheduler: ${issue.identifier} is unblocked, moved to ${config.dispatchState}`);
      }
      for (const planned of plan.start) {
        const dispatch = await start(
          config,
          planned.issue.identifier,
          planned.machineId,
          planned.resume,
        );
        (dispatch.status === "stalled" ? result.stalled : result.started).push(dispatch);
      }
      for (const dispatch of result.stalled) {
        await deps.notify(stallMessage(config, dispatch)).catch((error: unknown) => {
          deps.log(
            `scheduler: could not tell the orchestrator about ${dispatch.issue}: ${String(error)}`,
          );
        });
      }
      if (config.autoPromote && plan.room > 0 && plan.promotable.length > 0) {
        const last = await deps.getLastRefill();
        if (last === null || deps.now() - last >= config.refillMinutes * 60_000) {
          // Stamped first: a slow or failed message must not be repeated every minute.
          await deps.setLastRefill(deps.now());
          await deps.notify(refillMessage(config, plan)).then(
            () => {
              result.refillRequested = true;
            },
            (error: unknown) => deps.log(`scheduler: could not ask for a refill: ${String(error)}`),
          );
        }
      }
      return result;
    },

    /**
     * Promotes one backlog issue to the dispatch state with the ready label.
     * The orchestrator chooses the issue; this enforces what may be promoted
     * and that the queue never grows past what the machines can take.
     */
    async promote(
      config: SchedulerConfig,
      identifier: string,
      reason: string,
    ): Promise<BoardIssue> {
      const board = await deps.loadBoard(config);
      const plan = planBoard({
        issues: board.issues,
        config,
        focus: await deps.getFocus(),
        history: store.history(),
      });
      const issue = board.issues.find((candidate) => candidate.identifier === identifier);
      if (issue === undefined)
        throw new Error(`${identifier} is not an open issue of team ${config.teamKey}`);
      if (issue.state !== config.backlogState) {
        throw new Error(
          `${identifier} is in ${issue.state}; only ${config.backlogState} issues are promoted`,
        );
      }
      if (issue.blockedBy.length > 0)
        throw new Error(`${identifier} is blocked by ${issue.blockedBy.join(", ")}`);
      const skip = config.skipLabels.find((label) => issue.labels.includes(label));
      if (skip !== undefined) throw new Error(`${identifier} is labelled ${skip}`);
      if (plan.room === 0) {
        throw new Error(
          `the queue is full: ${plan.running.length} running and ${plan.ready} ready against the machines' capacity. Promote when something finishes`,
        );
      }
      const stateId = board.states[config.dispatchState];
      if (stateId === undefined)
        throw new Error(`team ${config.teamKey} has no state "${config.dispatchState}"`);
      await deps.promoteIssue(
        issue,
        stateId,
        `Orchestrator: promoted from ${config.backlogState} to ${config.dispatchState} with ${config.readyLabel}.\n\nWhy now: ${reason}`,
      );
      deps.log(`scheduler: promoted ${identifier}: ${reason}`);
      return issue;
    },

    /** Restarts a stalled issue with `resume`, within the attempt cap and the machine's capacity. */
    async resume(config: SchedulerConfig, issue: string, machineId?: string): Promise<Dispatch> {
      const latest = store.latest(issue);
      if (latest === null || latest.status !== "stalled") {
        throw new Error(`${issue} has no stalled run to resume`);
      }
      const attempts = store.consecutiveStalls(issue);
      if (attempts >= config.maxAttempts) {
        throw new Error(
          `${issue} reached the cap of ${config.maxAttempts} attempts: park it for a person, then release it`,
        );
      }
      const target = machineId ?? latest.machineId;
      const machine = config.machines.find((candidate) => candidate.id === target);
      if (machine === undefined) throw new Error(`no machine "${target}"`);
      const busy = store.active().filter((dispatch) => dispatch.machineId === target).length;
      if (busy >= machine.cap)
        throw new Error(`no free slot on ${target} (${busy} of ${machine.cap} in use)`);
      const dispatch = await start(config, issue, target, true);
      if (dispatch.status === "stalled") throw new Error(dispatch.outcome ?? "could not start");
      return dispatch;
    },
  };
}
export type Scheduler = ReturnType<typeof createScheduler>;
