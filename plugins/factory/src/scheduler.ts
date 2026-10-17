// One tick of the orchestrator: close runs that ended, plan the board, start
// what fits, and hand every stall to the orchestrator thread.
import { type BoardSummary, type Plan, planBoard, summarizeBoard } from "./board.js";
import type { Decision, Dispatch, DispatchStore } from "./dispatch-store.js";
import type { GateRun } from "./gate-store.js";
import { decideHandOver, needsPrHead, type PrHead } from "./hand-over.js";
import type { Board, BoardIssue } from "./linear-api.js";
import { type IssueLoop, issueLoops, parseRegistry, type Registry } from "./loop-registry.js";
import { machineEnvironment, type SchedulerConfig } from "./scheduler-config.js";
import type { SpawnRequest } from "./sessions.js";

const DAY_MS = 24 * 3600_000;

export interface SchedulerDeps {
  store: DispatchStore;
  /** The text of `factory.config.json` in the project checkout. Read on every tick. */
  loadRegistry(config: SchedulerConfig): Promise<string>;
  loadBoard(config: SchedulerConfig): Promise<Board>;
  moveIssue(issueId: string, stateId: string): Promise<void>;
  spawn(request: SpawnRequest): Promise<{ id: string }>;
  /** The thread's status, or null when the thread is gone. */
  threadStatus(threadId: string): Promise<string | null>;
  /** Whether a workflow run of the thread is active, and a line about its latest run. */
  workflowRuns(threadId: string): Promise<{ active: boolean; last: string | null }>;
  /** The newest review gate recorded for the issue since `since` (epoch ms), or null. */
  latestReviewGate(issue: string, since: number): GateRun | null;
  /** The pull request's head commit now, read on the machine the gate ran on. */
  prHead(hostId: string, repo: string, pr: number): Promise<string>;
  /** Adds one line under the workpad's Notes; false when the issue has no workpad. */
  noteOnWorkpad(issueId: string, heading: string, line: string): Promise<boolean>;
  /** Sends a message to the standing orchestrator thread. */
  notify(text: string): Promise<void>;
  getFocus(): Promise<string | null>;
  /** Moves a backlog issue to the Loop's state with its ready label and a comment. */
  promoteIssue(issue: BoardIssue, stateId: string, comment: string, label: string): Promise<void>;
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
  /** Why the registry was refused: nothing was planned or started. Null when it was read. */
  refusal: string | null;
  /** The registry this tick planned from; null when it was refused. */
  registry: Registry | null;
  /** What the tick wrote to the record of runs, empty when it recorded nothing. */
  recorded: Decision[];
}

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

function launcherPrompt(
  workflow: string,
  issue: string,
  machineId: string,
  resume: boolean,
): string {
  const args = JSON.stringify({ issue, ...(resume ? { resume: true } : {}), machine: machineId });
  return [
    `You are the launcher for ${issue}. Run this one command in the workspace root, in the foreground, exactly as written:`,
    "",
    `    bb workflows run --name ${workflow} --args ${shellQuote(args)} --json`,
    "",
    "Do not change the command and do not run anything else.",
    "Reply with the run id the command printed, or with its error output verbatim.",
  ].join("\n");
}

export function createScheduler(deps: SchedulerDeps) {
  const { store } = deps;

  /** Reads and validates the registry; a file that cannot be read is a refusal too. */
  async function readRegistry(
    config: SchedulerConfig,
  ): Promise<{ ok: true; registry: Registry } | { ok: false; error: string }> {
    let text: string;
    try {
      text = await deps.loadRegistry(config);
    } catch (error) {
      return {
        ok: false,
        error: `could not read factory.config.json: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    return parseRegistry(text);
  }

  const emptyPlan = (focus: string | null): Plan => ({
    focus,
    running: [],
    start: [],
    waiting: [],
    unblock: [],
    ready: 0,
    room: 0,
    promotable: [],
  });

  const planFor = async (config: SchedulerConfig, board: Board, registry: Registry) =>
    planBoard({
      issues: board.issues,
      config,
      registry,
      focus: await deps.getFocus(),
      history: store.history(),
      recentStarts: store.startsSince(deps.now() - DAY_MS),
    });

  async function start(
    config: SchedulerConfig,
    loop: { name: string; workflow: string },
    issue: string,
    machineId: string,
    resume: boolean,
  ) {
    const machine = config.machines.find((candidate) => candidate.id === machineId);
    if (machine === undefined) throw new Error(`no machine "${machineId}"`);
    const dispatch = store.start({ issue, loop: loop.name, machineId, resume, now: deps.now() });
    try {
      const thread = await deps.spawn({
        projectId: config.projectId,
        prompt: launcherPrompt(loop.workflow, issue, machineId, resume),
        title: `${issue} on ${machineId}${resume ? " (resume)" : ""}`,
        environment: machineEnvironment(machine),
        pluginMetadata: { dispatch: dispatch.id, issue, machine: machineId, loop: loop.name },
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

  /**
   * The hand-over of an ended run whose issue is in the review state: to the approval state only
   * when the review gate is recorded green on the PR's current head; otherwise the issue stays in
   * review, or goes to the blocked state, and the reason goes on the workpad. Returns null after a
   * move to approval, else the outcome of the stall.
   */
  async function handOver(
    config: SchedulerConfig,
    registry: Registry,
    board: Board,
    dispatch: Dispatch,
    issue: BoardIssue,
  ): Promise<string | null> {
    const states = config.handOver;
    if (states === undefined) return null;
    const record = deps.latestReviewGate(dispatch.issue, dispatch.startedAt);
    let head: PrHead | null = null;
    if (record !== null && needsPrHead(record)) {
      try {
        if (registry.repo === null) throw new Error("factory.config.json has no github.ownerRepo");
        if (record.hostId === null || typeof record.pr !== "number") {
          throw new Error("the gate record names no machine or pull request");
        }
        head = { ok: true, sha: await deps.prHead(record.hostId, registry.repo, record.pr) };
      } catch (error) {
        head = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
    const decision = decideHandOver({ record, head });
    const target =
      decision.move === "approval"
        ? states.approvalState
        : decision.move === "blocked" && config.blockedState !== null
          ? config.blockedState
          : null;
    let landed: string = states.reviewState;
    if (target !== null) {
      const stateId = board.states[target];
      try {
        if (stateId === undefined)
          throw new Error(`team ${config.teamKey} has no state "${target}"`);
        await deps.moveIssue(issue.id, stateId);
        landed = target;
        deps.log(`scheduler: ${dispatch.issue} moved to ${target}: ${decision.reason}`);
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        decision.reason = `${decision.reason}; it could not be moved to ${target}: ${why}`;
      }
    }
    if (landed === states.approvalState) return null;
    // The reason goes on the workpad. No workpad, or no heading to find it by, is not a reason to
    // lose it: the stall report below carries it as well.
    if (registry.workpadHeading !== null) {
      const date = new Date(deps.now()).toISOString().slice(0, 10);
      await deps
        .noteOnWorkpad(
          issue.id,
          registry.workpadHeading,
          `- ${date} Optio (hand-over): ${decision.reason}`,
        )
        .catch((error: unknown) =>
          deps.log(`scheduler: could not write the note for ${dispatch.issue}: ${String(error)}`),
        );
    }
    return `${decision.reason}; the issue is in ${landed}`;
  }

  /** Ends every active run whose workflow and launcher thread have both stopped. */
  async function reconcile(
    config: SchedulerConfig,
    registry: Registry,
    board: Board,
  ): Promise<Dispatch[]> {
    const stalled: Dispatch[] = [];
    const dispatchStates = registry.loops.flatMap((loop) =>
      loop.trigger.kind === "issue" ? [loop.trigger.state] : [],
    );
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
      if (
        issue !== undefined &&
        config.handOver !== undefined &&
        issue.state === config.handOver.reviewState
      ) {
        const outcome = await handOver(config, registry, board, dispatch, issue);
        if (outcome === null)
          store.end(dispatch.id, "handed-over", `${config.handOver.approvalState}`, deps.now());
        else {
          store.end(dispatch.id, "stalled", outcome.slice(0, 500), deps.now());
          stalled.push({ ...dispatch, status: "stalled", outcome });
        }
        continue;
      }
      const working =
        issue !== undefined &&
        (dispatchStates.includes(issue.state) || config.activeStates.includes(issue.state));
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
     * Plans the board from the registry in the project checkout, which it
     * reads first: a registry that does not parse is refused and nothing is
     * planned, started or moved. With `apply`, also closes ended runs, moves
     * unblocked issues back to the dispatch state, starts the planned runs and
     * reports stalls. With `record` (the default when applying), every start,
     * skip and refusal is written to the record of runs. Without both, nothing
     * is written anywhere.
     */
    async tick(config: SchedulerConfig, apply: boolean, record = apply): Promise<TickResult> {
      const mode = apply ? "live" : "dry-run";
      const read = await readRegistry(config);
      if (!read.ok) {
        deps.log(`scheduler: registry refused: ${read.error}`);
        return {
          plan: emptyPlan(await deps.getFocus()),
          summary: { states: {}, milestones: {} },
          started: [],
          stalled: [],
          unblocked: [],
          refillRequested: false,
          refusal: read.error,
          registry: null,
          recorded: record
            ? store.record(deps.now(), mode, [
                { loop: null, issue: null, kind: "refusal", reason: read.error },
              ])
            : [],
        };
      }
      const { registry } = read;
      const board = await deps.loadBoard(config);
      const stalled = apply ? await reconcile(config, registry, board) : [];
      const plan = await planFor(config, board, registry);
      const result: TickResult = {
        plan,
        summary: summarizeBoard(board.issues, registry),
        started: [],
        stalled,
        unblocked: [],
        refillRequested: false,
        refusal: null,
        registry,
        recorded: [],
      };
      const decisions: Parameters<DispatchStore["record"]>[2] = plan.waiting.map((waiting) => ({
        loop: waiting.loop,
        issue: waiting.identifier,
        kind: "skip",
        reason: waiting.reason,
      }));
      if (!apply) {
        if (record) {
          decisions.push(
            ...plan.start.map((planned) => ({
              loop: planned.loop,
              issue: planned.issue.identifier,
              kind: "start" as const,
              reason: `would start on ${planned.machineId}${planned.resume ? " (resume)" : ""}`,
            })),
          );
          result.recorded = store.record(deps.now(), mode, decisions);
        }
        return result;
      }

      const unblockLoop = issueLoops(registry)[0];
      const dispatchStateId =
        unblockLoop === undefined ? undefined : board.states[unblockLoop.trigger.state];
      for (const issue of plan.unblock) {
        if (unblockLoop === undefined || dispatchStateId === undefined) break;
        await deps.moveIssue(issue.id, dispatchStateId);
        result.unblocked.push(issue.identifier);
        deps.log(
          `scheduler: ${issue.identifier} is unblocked, moved to ${unblockLoop.trigger.state}`,
        );
      }
      for (const planned of plan.start) {
        const loop = registry.loops.find((candidate) => candidate.name === planned.loop);
        if (loop === undefined) continue;
        const dispatch = await start(
          config,
          loop,
          planned.issue.identifier,
          planned.machineId,
          planned.resume,
        );
        const failed = dispatch.status === "stalled";
        (failed ? result.stalled : result.started).push(dispatch);
        decisions.push({
          loop: loop.name,
          issue: planned.issue.identifier,
          kind: failed ? "skip" : "start",
          reason: failed
            ? (dispatch.outcome ?? "could not start")
            : `started on ${planned.machineId}${planned.resume ? " (resume)" : ""}`,
        });
      }
      if (record) result.recorded = store.record(deps.now(), mode, decisions);
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
     * Promotes one backlog issue to the first enabled issue Loop's state with
     * its ready label. The orchestrator chooses the issue; this enforces what
     * may be promoted and that the queue never grows past what the machines
     * can take.
     */
    async promote(
      config: SchedulerConfig,
      identifier: string,
      reason: string,
    ): Promise<{ issue: BoardIssue; state: string }> {
      const read = await readRegistry(config);
      if (!read.ok) throw new Error(`the registry is refused: ${read.error}`);
      const loop: IssueLoop | undefined = issueLoops(read.registry)[0];
      if (loop === undefined) throw new Error("no enabled Loop starts from an issue");
      const board = await deps.loadBoard(config);
      const plan = await planFor(config, board, read.registry);
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
      const skip = loop.trigger.skipLabels.find((label) => issue.labels.includes(label));
      if (skip !== undefined) throw new Error(`${identifier} is labelled ${skip}`);
      if (plan.room === 0) {
        throw new Error(
          `the queue is full: ${plan.running.length} running and ${plan.ready} ready against the machines' capacity. Promote when something finishes`,
        );
      }
      const { state, label } = loop.trigger;
      const stateId = board.states[state];
      if (stateId === undefined) throw new Error(`team ${config.teamKey} has no state "${state}"`);
      await deps.promoteIssue(
        issue,
        stateId,
        `Orchestrator: promoted from ${config.backlogState} to ${state} with ${label}.\n\nWhy now: ${reason}`,
        label,
      );
      deps.log(`scheduler: promoted ${identifier}: ${reason}`);
      return { issue, state };
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
      const read = await readRegistry(config);
      if (!read.ok) throw new Error(`the registry is refused: ${read.error}`);
      const loop =
        read.registry.loops.find((candidate) => candidate.name === latest.loop) ??
        issueLoops(read.registry)[0];
      if (loop === undefined) throw new Error("no enabled Loop starts from an issue");
      const target = machineId ?? latest.machineId;
      const machine = config.machines.find((candidate) => candidate.id === target);
      if (machine === undefined) throw new Error(`no machine "${target}"`);
      if (!loop.machines.includes(target))
        throw new Error(`Loop "${loop.name}" may not use machine "${target}"`);
      const busy = store.active().filter((dispatch) => dispatch.machineId === target).length;
      if (busy >= machine.cap)
        throw new Error(`no free slot on ${target} (${busy} of ${machine.cap} in use)`);
      const dispatch = await start(config, loop, issue, target, true);
      if (dispatch.status === "stalled") throw new Error(dispatch.outcome ?? "could not start");
      return dispatch;
    },
  };
}
export type Scheduler = ReturnType<typeof createScheduler>;
