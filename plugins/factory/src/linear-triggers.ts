// Linear triggers: the poller that turns what changed on a team's issues into
// agent sessions. Linear cannot reach bb with a webhook, so the plugin asks.
import type { AgentStore, LinearEvent, LinearTrigger, SeenIssue } from "./agent-store.js";
import type { LinearIssue } from "./linear-api.js";
import { taskWithPayload, type Sessions } from "./sessions.js";

export interface IssueEvent {
  event: LinearEvent;
  /** The state moved to, or the label added; null for `created`. */
  value: string | null;
}

/**
 * What happened to an issue since it was last seen. An issue seen for the
 * first time yields `created` only when it was created after the previous
 * poll; an older one is recorded and yields nothing, because its previous
 * state is unknown.
 */
export function deriveEvents(previous: SeenIssue | null, issue: LinearIssue, lastPoll: string): IssueEvent[] {
  if (previous === null) {
    return issue.createdAt > lastPoll ? [{ event: "created", value: null }] : [];
  }
  const events: IssueEvent[] = [];
  if (previous.state !== issue.state) events.push({ event: "state", value: issue.state });
  for (const label of issue.labels) {
    if (!previous.labels.includes(label)) events.push({ event: "label", value: label });
  }
  return events;
}

const same = (a: string | null, b: string | null) =>
  a !== null && b !== null && a.trim().toLowerCase() === b.trim().toLowerCase();

export function triggerMatches(trigger: LinearTrigger, issue: LinearIssue, event: IssueEvent): boolean {
  if (!trigger.enabled || trigger.event !== event.event) return false;
  if (!same(trigger.teamKey, issue.teamKey)) return false;
  if (trigger.project !== null && !same(trigger.project, issue.project)) return false;
  return trigger.event === "created" || trigger.value === null || same(trigger.value, event.value);
}

export interface PollerDeps {
  agents: AgentStore;
  sessions: Sessions;
  fetchUpdated(teamKeys: string[], since: string): Promise<LinearIssue[]>;
  getCursor(): Promise<string | null>;
  setCursor(cursor: string): Promise<void>;
  now(): number;
  log(message: string): void;
}

export function createLinearPoller(deps: PollerDeps) {
  return {
    /** Reads what changed since the last poll and starts the agents whose triggers match. */
    async poll(): Promise<number> {
      const triggers = deps.agents.linearTriggers().filter((trigger) => trigger.enabled);
      if (triggers.length === 0) return 0;
      const teamKeys = [...new Set(triggers.map((trigger) => trigger.teamKey))];
      const lastPoll = await deps.getCursor();
      if (lastPoll === null) {
        // First poll: everything that exists is the baseline, nothing fires.
        for (const issue of await deps.fetchUpdated(teamKeys, "1970-01-01T00:00:00.000Z")) {
          deps.agents.rememberIssue(issue.id, { state: issue.state, labels: issue.labels });
        }
        await deps.setCursor(new Date(deps.now()).toISOString());
        return 0;
      }
      const issues = await deps.fetchUpdated(teamKeys, lastPoll);
      let started = 0;
      let cursor = lastPoll;
      for (const issue of issues) {
        const events = deriveEvents(deps.agents.seenIssue(issue.id), issue, lastPoll);
        deps.agents.rememberIssue(issue.id, { state: issue.state, labels: issue.labels });
        if (issue.updatedAt > cursor) cursor = issue.updatedAt;
        for (const event of events) {
          for (const trigger of triggers) {
            if (!triggerMatches(trigger, issue, event)) continue;
            const agent = deps.agents.get(trigger.agentId);
            if (agent === null || !agent.enabled) continue;
            const run = await deps.sessions.start(agent, {
              source: "linear",
              task: taskWithPayload(trigger.task, { event: event.event, value: event.value, issue }),
              deliveryId: `${trigger.id}:${issue.id}:${event.event}:${event.value ?? ""}:${issue.updatedAt}`,
              label: `${issue.identifier} ${event.event === "created" ? "created" : event.value}`,
            });
            if (run !== null) started += 1;
          }
        }
      }
      if (cursor !== lastPoll) await deps.setCursor(cursor);
      return started;
    },
  };
}
