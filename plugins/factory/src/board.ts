// The plan for one tick: which issues start where, and why the rest wait.
// Pure: Linear's board and the ledger go in, a plan comes out.
import type { BoardIssue } from "./linear-api.js";
import type { Machine, SchedulerConfig } from "./scheduler-config.js";

/** What the ledger knows about an issue the scheduler has started before. */
export interface IssueHistory {
  /** The machine of the run that is active now, if any. */
  activeOn: string | null;
  /** The last run ended without a hand-over; only `resume` or `release` lifts this. */
  stalled: boolean;
  /** A run was started before, so the branch and PR may exist. */
  startedBefore: boolean;
}

export interface PlannedStart {
  issue: BoardIssue;
  machineId: string;
  resume: boolean;
}

export interface Plan {
  focus: string | null;
  running: { identifier: string; machineId: string }[];
  start: PlannedStart[];
  waiting: { identifier: string; reason: string }[];
  /** Blocked issues whose blockers are all resolved. */
  unblock: BoardIssue[];
  /** Issues in the dispatch state with the ready label that are not running: the queue. */
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

/** Two globs may match a common path when one static prefix contains the other. */
export function scopesOverlap(a: string[], b: string[]): boolean {
  return a.some((left) =>
    b.some((right) => {
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
  focus: string | null;
  history: Map<string, IssueHistory>;
}): Plan {
  const { issues, config, focus, history } = input;
  const plan: Plan = { focus, running: [], start: [], waiting: [], unblock: [], ready: 0, room: 0, promotable: [] };

  const used = new Map<string, number>(config.machines.map((machine) => [machine.id, 0]));
  /** Issues being worked on: each holds its declared write scope. */
  const holders: BoardIssue[] = [];
  for (const issue of issues) {
    const activeOn = history.get(issue.identifier)?.activeOn ?? null;
    if (activeOn !== null) {
      plan.running.push({ identifier: issue.identifier, machineId: activeOn });
      used.set(activeOn, (used.get(activeOn) ?? 0) + 1);
    }
    if (activeOn !== null || config.activeStates.includes(issue.state)) holders.push(issue);
    if (issue.state === config.blockedState && issue.blockedBy.length === 0) plan.unblock.push(issue);
  }

  const rank = (issue: BoardIssue) => {
    const index = config.priorityOrder.indexOf(issue.priority);
    return index === -1 ? config.priorityOrder.length : index;
  };
  const byOrder = (a: BoardIssue, b: BoardIssue) =>
    Number(sameName(b.milestone, focus)) - Number(sameName(a.milestone, focus)) ||
    rank(a) - rank(b) ||
    a.createdAt.localeCompare(b.createdAt);
  plan.promotable = issues
    .filter(
      (issue) =>
        issue.state === config.backlogState &&
        issue.blockedBy.length === 0 &&
        !config.skipLabels.some((label) => issue.labels.includes(label)),
    )
    .sort(byOrder);

  const candidates = issues
    .filter(
      (issue) =>
        issue.state === config.dispatchState &&
        issue.labels.includes(config.readyLabel) &&
        (history.get(issue.identifier)?.activeOn ?? null) === null,
    )
    .sort(byOrder);
  plan.ready = candidates.length;
  const capacity = config.machines.reduce((sum, machine) => sum + machine.cap, 0);
  plan.room = Math.max(0, capacity - plan.running.length - plan.ready);

  // Machines with the fewest capabilities first, so the one that can do
  // everything stays free for the issues that need it.
  const machines = [...config.machines].sort((a, b) => a.capabilities.length - b.capabilities.length);

  for (const issue of candidates) {
    const wait = (reason: string) => plan.waiting.push({ identifier: issue.identifier, reason });
    const past = history.get(issue.identifier);
    const skip = config.skipLabels.find((label) => issue.labels.includes(label));
    if (skip !== undefined) {
      wait(`labelled ${skip}`);
      continue;
    }
    if (issue.blockedBy.length > 0) {
      wait(`blocked by ${issue.blockedBy.join(", ")}`);
      continue;
    }
    if (past?.stalled === true) {
      wait("last run ended without a hand-over; the orchestrator must resume or release it");
      continue;
    }
    const clash = holders.find(
      (holder) => holder.identifier !== issue.identifier && scopesOverlap(issue.writeScope, holder.writeScope),
    );
    if (clash !== undefined) {
      wait(`write scope overlaps ${clash.identifier}`);
      continue;
    }
    const needs = neededCapabilities(issue, config);
    const able = machines.filter((machine: Machine) =>
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
    holders.push(issue);
    plan.start.push({ issue, machineId: machine.id, resume: past?.startedBefore === true });
  }
  return plan;
}

export interface BoardSummary {
  /** Open issues per state. */
  states: Record<string, number>;
  /** Per milestone: open issues, and how many are ready in the dispatch state. */
  milestones: Record<string, { open: number; ready: number }>;
}

export function summarizeBoard(issues: BoardIssue[], config: SchedulerConfig): BoardSummary {
  const summary: BoardSummary = { states: {}, milestones: {} };
  for (const issue of issues) {
    summary.states[issue.state] = (summary.states[issue.state] ?? 0) + 1;
    const milestone = (summary.milestones[issue.milestone ?? "(no milestone)"] ??= { open: 0, ready: 0 });
    milestone.open += 1;
    if (issue.state === config.dispatchState && issue.labels.includes(config.readyLabel)) milestone.ready += 1;
  }
  return summary;
}
