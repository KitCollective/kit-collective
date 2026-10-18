// The plan for one tick: which issues start where, and why the rest wait.
// Pure: Linear's board and the ledger go in, a plan comes out.
import type { BoardIssue } from "./linear-api.js";
import { issueLoops, type Registry } from "./loop-registry.js";
import type { Machine, SchedulerConfig } from "./scheduler-config.js";

/** What the ledger knows about an issue the scheduler has started before. */
export interface IssueHistory {
  /** The machine of the run that is active now, if any. */
  activeOn: string | null;
  /** The Loop of the run that is active now, if it was recorded. */
  activeLoop: string | null;
  /** The last run ended without a hand-over; only `resume` or `release` lifts this. */
  stalled: boolean;
  /** A run was started before, so the branch and PR may exist. */
  startedBefore: boolean;
}

export interface PlannedStart {
  issue: BoardIssue;
  /** The Loop whose trigger matched the issue. */
  loop: string;
  machineId: string;
  resume: boolean;
}

export interface Plan {
  focus: string | null;
  running: { identifier: string; machineId: string; loop: string | null }[];
  start: PlannedStart[];
  waiting: { identifier: string; loop: string; reason: string }[];
  /** Blocked issues whose blockers are all resolved. */
  unblock: BoardIssue[];
  /** Issues that match an enabled issue Loop's trigger and are not running: the queue. */
  ready: number;
  /** How many more issues the queue may hold: every machine's capacity, less running and ready. */
  room: number;
  /** Backlog issues that may be promoted: unblocked and without a skip label, best first. */
  promotable: BoardIssue[];
}

/** The part of a glob before its first wildcard. */
function staticPrefix(glob: string): string {
  const cut = glob.search(/[*?[{]/);
  return cut === -1 ? glob : glob.slice(0, cut);
}

/**
 * A test glob under apps/ or packages/: a companion path every slice may write (ADR-0064), so it
 * does not hold a write scope. Two slices editing one test file meet as a merge conflict instead.
 */
export function isTestGlob(glob: string): boolean {
  return /^(apps|packages)\//.test(glob) && (/\/tests\//.test(glob) || /\.test\.[^/]*$/.test(glob));
}

/**
 * Optio's three registration files: each area adds one line to them and nothing else, so no slice
 * holds a write scope on them. Two slices editing one line apart meet as a merge conflict instead.
 */
const REGISTRATION_FILES = [
  "plugins/factory/app.tsx",
  "plugins/factory/server.ts",
  "plugins/factory/src/contract.ts",
];

/** Two globs may match a common path when one static prefix contains the other. Test globs and registration files never clash. */
export function scopesOverlap(a: string[], b: string[]): boolean {
  const held = (globs: string[]) =>
    globs.filter((glob) => !isTestGlob(glob) && !REGISTRATION_FILES.includes(glob));
  return held(a).some((left) =>
    held(b).some((right) => {
      const [x, y] = [staticPrefix(left), staticPrefix(right)];
      return x.startsWith(y) || y.startsWith(x);
    }),
  );
}

function neededCapabilities(issue: BoardIssue, config: SchedulerConfig): string[] {
  return config.requirements
    .filter(
      (rule) =>
        rule.labels.some((label) => issue.labels.includes(label)) ||
        (rule.scope.length > 0 && scopesOverlap(issue.writeScope, rule.scope)),
    )
    .map((rule) => rule.capability);
}

const sameName = (a: string | null, b: string | null) =>
  a !== null && b !== null && a.trim().toLowerCase() === b.trim().toLowerCase();

export function planBoard(input: {
  issues: BoardIssue[];
  config: SchedulerConfig;
  registry: Registry;
  focus: string | null;
  history: Map<string, IssueHistory>;
  /** Starts of each issue in the last 24 h, for `flow.maxRunsPerDay`. */
  recentStarts?: Map<string, number>;
}): Plan {
  const { issues, config, registry, focus, history } = input;
  const recentStarts = input.recentStarts ?? new Map<string, number>();
  const loops = issueLoops(registry);
  const plan: Plan = {
    focus,
    running: [],
    start: [],
    waiting: [],
    unblock: [],
    ready: 0,
    room: 0,
    promotable: [],
  };

  const used = new Map<string, number>(config.machines.map((machine) => [machine.id, 0]));
  const live = new Map<string, number>();
  /** Issues being worked on: each holds its declared write scope. */
  const holders: BoardIssue[] = [];
  for (const issue of issues) {
    const past = history.get(issue.identifier);
    const activeOn = past?.activeOn ?? null;
    if (activeOn !== null) {
      const loop = past?.activeLoop ?? null;
      plan.running.push({ identifier: issue.identifier, machineId: activeOn, loop });
      used.set(activeOn, (used.get(activeOn) ?? 0) + 1);
      if (loop !== null) live.set(loop, (live.get(loop) ?? 0) + 1);
    }
    if (activeOn !== null || config.activeStates.includes(issue.state)) holders.push(issue);
    // A stalled issue that was parked in Blocked stays there: moving it back would undo the park
    // on the next tick, and the orchestrator must resume or release it first.
    if (
      issue.state === config.blockedState &&
      issue.blockedBy.length === 0 &&
      past?.stalled !== true
    )
      plan.unblock.push(issue);
  }

  const orderBy = (priorityOrder: number[]) => {
    const rank = (issue: BoardIssue) => {
      const index = priorityOrder.indexOf(issue.priority);
      return index === -1 ? priorityOrder.length : index;
    };
    return (a: BoardIssue, b: BoardIssue) =>
      Number(sameName(b.milestone, focus)) - Number(sameName(a.milestone, focus)) ||
      rank(a) - rank(b) ||
      a.createdAt.localeCompare(b.createdAt);
  };
  const skipLabels = new Set(loops.flatMap((loop) => loop.trigger.skipLabels));
  plan.promotable = issues
    .filter(
      (issue) =>
        issue.state === config.backlogState &&
        issue.blockedBy.length === 0 &&
        !issue.labels.some((label) => skipLabels.has(label)),
    )
    .sort(orderBy(loops[0]?.trigger.priorityOrder ?? []));

  // Machines with the fewest capabilities first, so the one that can do
  // everything stays free for the issues that need it.
  const machines = [...config.machines].sort(
    (a, b) => a.capabilities.length - b.capabilities.length,
  );

  const claimed = new Set<string>();
  for (const loop of loops) {
    const { trigger } = loop;
    const candidates = issues
      .filter(
        (issue) =>
          !claimed.has(issue.identifier) &&
          issue.state === trigger.state &&
          issue.labels.includes(trigger.label) &&
          (history.get(issue.identifier)?.activeOn ?? null) === null,
      )
      .sort(orderBy(trigger.priorityOrder));
    plan.ready += candidates.length;
    const allowed = machines.filter((machine) => loop.machines.includes(machine.id));

    for (const issue of candidates) {
      claimed.add(issue.identifier);
      const wait = (reason: string) =>
        plan.waiting.push({ identifier: issue.identifier, loop: loop.name, reason });
      const past = history.get(issue.identifier);
      const skip = trigger.skipLabels.find((label) => issue.labels.includes(label));
      if (skip !== undefined) {
        wait(`labelled ${skip}`);
        continue;
      }
      if (trigger.unblocked && issue.blockedBy.length > 0) {
        wait(`blocked by ${issue.blockedBy.join(", ")}`);
        continue;
      }
      if (past?.stalled === true) {
        wait("last run ended without a hand-over; the orchestrator must resume or release it");
        continue;
      }
      const starts = recentStarts.get(issue.identifier) ?? 0;
      if (registry.maxRunsPerDay !== null && starts >= registry.maxRunsPerDay) {
        wait(`started ${starts} times in 24 h (cap ${registry.maxRunsPerDay})`);
        continue;
      }
      const running = live.get(loop.name) ?? 0;
      if (running >= loop.maxLive) {
        wait(`${loop.name} has ${running} of ${loop.maxLive} live runs`);
        continue;
      }
      const clash = holders.find(
        (holder) =>
          holder.identifier !== issue.identifier &&
          scopesOverlap(issue.writeScope, holder.writeScope),
      );
      if (clash !== undefined) {
        wait(`write scope overlaps ${clash.identifier}`);
        continue;
      }
      if (allowed.length === 0) {
        wait(`no machine ${loop.machines.map((id) => `"${id}"`).join(" or ")}`);
        continue;
      }
      const needs = neededCapabilities(issue, config);
      const able = allowed.filter((machine: Machine) =>
        needs.every((capability) => machine.capabilities.includes(capability)),
      );
      const machine = able.find((candidate) => (used.get(candidate.id) ?? 0) < candidate.cap);
      if (machine === undefined) {
        wait(
          able.length === 0
            ? `no machine has ${needs.join(" + ")}`
            : `no free slot on ${able.map((candidate) => candidate.id).join(" or ")}`,
        );
        continue;
      }
      used.set(machine.id, (used.get(machine.id) ?? 0) + 1);
      live.set(loop.name, running + 1);
      holders.push(issue);
      plan.start.push({
        issue,
        loop: loop.name,
        machineId: machine.id,
        resume: past?.startedBefore === true,
      });
    }
  }
  const capacity = config.machines.reduce((sum, machine) => sum + machine.cap, 0);
  plan.room = Math.max(0, capacity - plan.running.length - plan.ready);
  return plan;
}

export interface BoardSummary {
  /** Open issues per state. */
  states: Record<string, number>;
  /** Per milestone: open issues, and how many are ready in the dispatch state. */
  milestones: Record<string, { open: number; ready: number }>;
}

export function summarizeBoard(issues: BoardIssue[], registry: Registry): BoardSummary {
  const loops = issueLoops(registry);
  const summary: BoardSummary = { states: {}, milestones: {} };
  for (const issue of issues) {
    summary.states[issue.state] = (summary.states[issue.state] ?? 0) + 1;
    const key = issue.milestone ?? "(no milestone)";
    const milestone = summary.milestones[key] ?? { open: 0, ready: 0 };
    summary.milestones[key] = milestone;
    milestone.open += 1;
    if (
      loops.some(
        (loop) => issue.state === loop.trigger.state && issue.labels.includes(loop.trigger.label),
      )
    )
      milestone.ready += 1;
  }
  return summary;
}
