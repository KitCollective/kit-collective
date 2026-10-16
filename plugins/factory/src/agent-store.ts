// Agents, their memory and their automations, in the plugin's database.
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";

export interface Agent {
  id: string;
  name: string;
  description: string;
  projectId: string;
  /** The agent's standing instructions: its area, its rules, what it may touch. */
  instructions: string;
  enabled: boolean;
  /** Whether `POST /trigger` may start this agent. */
  httpTrigger: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Memory {
  id: string;
  agentId: string;
  text: string;
  /** The thread the memory was saved from, when it came from an agent. */
  threadId: string | null;
  createdAt: number;
}

export interface Automation {
  id: string;
  agentId: string;
  name: string;
  /** Five-field cron, server-local time. */
  cron: string;
  /** The task the agent gets each time; unused when `workflow` is set. */
  prompt: string;
  /** A named bb workflow (`.bb/workflows/<name>.js`) to start instead of asking the agent. */
  workflow: string | null;
  workflowArgs: Record<string, string>;
  enabled: boolean;
  lastRunAt: number | null;
  createdAt: number;
}

/** A one-off task an agent (or the user) scheduled: a new thread that reports back. */
export interface FollowUp {
  id: string;
  agentId: string;
  task: string;
  dueAt: number;
  /** The thread that gets the report when the follow-up's thread finishes. */
  reportThreadId: string | null;
  status: "pending" | "started" | "reported" | "cancelled";
  threadId: string | null;
  createdAt: number;
}

export type LinearEvent = "created" | "state" | "label";

/** Starts an agent when an issue of a Linear team is created, changes state or gets a label. */
export interface LinearTrigger {
  id: string;
  agentId: string;
  teamKey: string;
  /** Linear project name; null means any project of the team. */
  project: string | null;
  event: LinearEvent;
  /** The state moved to, or the label added; null means any. Unused for `created`. */
  value: string | null;
  task: string;
  enabled: boolean;
  createdAt: number;
}

/** What the poller last saw of an issue: the base of the next diff. */
export interface SeenIssue {
  state: string;
  labels: string[];
}

/** Appended after the run and dispatch migrations; never reorder. */
export const AGENT_MIGRATIONS = [
  `CREATE TABLE agents (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     project_id TEXT NOT NULL,
     instructions TEXT NOT NULL DEFAULT '',
     enabled INTEGER NOT NULL DEFAULT 1,
     http_trigger INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE memories (
     id TEXT PRIMARY KEY,
     agent_id TEXT NOT NULL,
     text TEXT NOT NULL,
     thread_id TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX memories_agent ON memories (agent_id, created_at)`,
  `CREATE TABLE automations (
     id TEXT PRIMARY KEY,
     agent_id TEXT NOT NULL,
     name TEXT NOT NULL,
     cron TEXT NOT NULL,
     prompt TEXT NOT NULL,
     workflow TEXT,
     workflow_args TEXT NOT NULL DEFAULT '{}',
     enabled INTEGER NOT NULL DEFAULT 1,
     last_run_at INTEGER,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX automations_agent ON automations (agent_id)`,
  `CREATE TABLE follow_ups (
     id TEXT PRIMARY KEY,
     agent_id TEXT NOT NULL,
     task TEXT NOT NULL,
     due_at INTEGER NOT NULL,
     report_thread_id TEXT,
     status TEXT NOT NULL,
     thread_id TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX follow_ups_status ON follow_ups (status, due_at)`,
  `CREATE TABLE linear_triggers (
     id TEXT PRIMARY KEY,
     agent_id TEXT NOT NULL,
     team_key TEXT NOT NULL,
     project TEXT,
     event TEXT NOT NULL,
     value TEXT,
     task TEXT NOT NULL,
     enabled INTEGER NOT NULL DEFAULT 1,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE linear_seen (
     issue_id TEXT PRIMARY KEY,
     state TEXT NOT NULL,
     labels TEXT NOT NULL
   )`,
];

interface AgentRow {
  id: string;
  name: string;
  description: string;
  project_id: string;
  instructions: string;
  enabled: number;
  http_trigger: number;
  created_at: number;
  updated_at: number;
}
interface MemoryRow {
  id: string;
  agent_id: string;
  text: string;
  thread_id: string | null;
  created_at: number;
}
interface AutomationRow {
  id: string;
  agent_id: string;
  name: string;
  cron: string;
  prompt: string;
  workflow: string | null;
  workflow_args: string;
  enabled: number;
  last_run_at: number | null;
  created_at: number;
}

interface FollowUpRow {
  id: string;
  agent_id: string;
  task: string;
  due_at: number;
  report_thread_id: string | null;
  status: FollowUp["status"];
  thread_id: string | null;
  created_at: number;
}
interface LinearTriggerRow {
  id: string;
  agent_id: string;
  team_key: string;
  project: string | null;
  event: LinearEvent;
  value: string | null;
  task: string;
  enabled: number;
  created_at: number;
}
const toFollowUp = (row: FollowUpRow): FollowUp => ({
  id: row.id,
  agentId: row.agent_id,
  task: row.task,
  dueAt: row.due_at,
  reportThreadId: row.report_thread_id,
  status: row.status,
  threadId: row.thread_id,
  createdAt: row.created_at,
});
const toLinearTrigger = (row: LinearTriggerRow): LinearTrigger => ({
  id: row.id,
  agentId: row.agent_id,
  teamKey: row.team_key,
  project: row.project,
  event: row.event,
  value: row.value,
  task: row.task,
  enabled: row.enabled === 1,
  createdAt: row.created_at,
});

const toAgent = (row: AgentRow): Agent => ({
  id: row.id,
  name: row.name,
  description: row.description,
  projectId: row.project_id,
  instructions: row.instructions,
  enabled: row.enabled === 1,
  httpTrigger: row.http_trigger === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const toMemory = (row: MemoryRow): Memory => ({
  id: row.id,
  agentId: row.agent_id,
  text: row.text,
  threadId: row.thread_id,
  createdAt: row.created_at,
});
const toAutomation = (row: AutomationRow): Automation => ({
  id: row.id,
  agentId: row.agent_id,
  name: row.name,
  cron: row.cron,
  prompt: row.prompt,
  workflow: row.workflow,
  workflowArgs: JSON.parse(row.workflow_args) as Record<string, string>,
  enabled: row.enabled === 1,
  lastRunAt: row.last_run_at,
  createdAt: row.created_at,
});

/** "DevOps agent" -> "devops-agent". */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export type AgentInput = Pick<Agent, "name" | "description" | "projectId" | "instructions" | "enabled" | "httpTrigger">;

export function createAgentStore(db: Database) {
  const get = (id: string): Agent | null => {
    const row = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as AgentRow | undefined;
    return row === undefined ? null : toAgent(row);
  };
  const shortId = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

  return {
    get,
    list(): Agent[] {
      return (db.prepare(`SELECT * FROM agents ORDER BY name COLLATE NOCASE`).all() as AgentRow[]).map(toAgent);
    },
    /** Creates the agent under an id derived from its name; a taken id gets a suffix. */
    create(input: AgentInput, now: number, preferredId?: string): Agent {
      const base = preferredId ?? (slugify(input.name) || "agent");
      let id = base;
      for (let n = 2; get(id) !== null; n += 1) id = `${base}-${n}`;
      db.prepare(
        `INSERT INTO agents (id, name, description, project_id, instructions, enabled, http_trigger, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, input.name, input.description, input.projectId, input.instructions, input.enabled ? 1 : 0, input.httpTrigger ? 1 : 0, now, now);
      return get(id) as Agent;
    },
    update(id: string, input: AgentInput, now: number): Agent | null {
      db.prepare(
        `UPDATE agents SET name = ?, description = ?, project_id = ?, instructions = ?, enabled = ?, http_trigger = ?, updated_at = ?
         WHERE id = ?`,
      ).run(input.name, input.description, input.projectId, input.instructions, input.enabled ? 1 : 0, input.httpTrigger ? 1 : 0, now, id);
      return get(id);
    },
    /** Removes the agent with its memory, automations, follow-ups and triggers. */
    remove(id: string): boolean {
      return db.transaction(() => {
        db.prepare(`DELETE FROM follow_ups WHERE agent_id = ?`).run(id);
        db.prepare(`DELETE FROM linear_triggers WHERE agent_id = ?`).run(id);
        db.prepare(`DELETE FROM memories WHERE agent_id = ?`).run(id);
        db.prepare(`DELETE FROM automations WHERE agent_id = ?`).run(id);
        return db.prepare(`DELETE FROM agents WHERE id = ?`).run(id).changes > 0;
      })();
    },

    memories(agentId: string): Memory[] {
      return (
        db.prepare(`SELECT * FROM memories WHERE agent_id = ? ORDER BY created_at DESC, rowid DESC`).all(agentId) as MemoryRow[]
      ).map(toMemory);
    },
    remember(agentId: string, text: string, threadId: string | null, now: number): Memory {
      const id = shortId("mem");
      db.prepare(`INSERT INTO memories (id, agent_id, text, thread_id, created_at) VALUES (?, ?, ?, ?, ?)`).run(
        id,
        agentId,
        text,
        threadId,
        now,
      );
      return { id, agentId, text, threadId, createdAt: now };
    },
    forget(memoryId: string): boolean {
      return db.prepare(`DELETE FROM memories WHERE id = ?`).run(memoryId).changes > 0;
    },

    automations(agentId?: string): Automation[] {
      const rows =
        agentId === undefined
          ? db.prepare(`SELECT * FROM automations ORDER BY created_at`).all()
          : db.prepare(`SELECT * FROM automations WHERE agent_id = ? ORDER BY created_at`).all(agentId);
      return (rows as AutomationRow[]).map(toAutomation);
    },
    automation(id: string): Automation | null {
      const row = db.prepare(`SELECT * FROM automations WHERE id = ?`).get(id) as AutomationRow | undefined;
      return row === undefined ? null : toAutomation(row);
    },
    saveAutomation(
      input: Pick<Automation, "agentId" | "name" | "cron" | "prompt" | "workflow" | "workflowArgs" | "enabled"> & {
        id?: string;
      },
      now: number,
    ): Automation {
      const id = input.id ?? shortId("aut");
      db.prepare(
        `INSERT INTO automations (id, agent_id, name, cron, prompt, workflow, workflow_args, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, cron = excluded.cron, prompt = excluded.prompt,
           workflow = excluded.workflow, workflow_args = excluded.workflow_args, enabled = excluded.enabled`,
      ).run(
        id,
        input.agentId,
        input.name,
        input.cron,
        input.prompt,
        input.workflow,
        JSON.stringify(input.workflowArgs),
        input.enabled ? 1 : 0,
        now,
      );
      return toAutomation(db.prepare(`SELECT * FROM automations WHERE id = ?`).get(id) as AutomationRow);
    },
    removeAutomation(id: string): boolean {
      return db.prepare(`DELETE FROM automations WHERE id = ?`).run(id).changes > 0;
    },
    markAutomationRun(id: string, now: number): void {
      db.prepare(`UPDATE automations SET last_run_at = ? WHERE id = ?`).run(now, id);
    },

    addFollowUp(input: Pick<FollowUp, "agentId" | "task" | "dueAt" | "reportThreadId">, now: number): FollowUp {
      const id = shortId("fup");
      db.prepare(
        `INSERT INTO follow_ups (id, agent_id, task, due_at, report_thread_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      ).run(id, input.agentId, input.task, input.dueAt, input.reportThreadId, now);
      return { ...input, id, status: "pending", threadId: null, createdAt: now };
    },
    /** Pending and started follow-ups of one agent, or of all agents; soonest first. */
    openFollowUps(agentId?: string): FollowUp[] {
      const rows =
        agentId === undefined
          ? db.prepare(`SELECT * FROM follow_ups WHERE status IN ('pending', 'started') ORDER BY due_at`).all()
          : db
              .prepare(`SELECT * FROM follow_ups WHERE agent_id = ? AND status IN ('pending', 'started') ORDER BY due_at`)
              .all(agentId);
      return (rows as FollowUpRow[]).map(toFollowUp);
    },
    dueFollowUps(now: number): FollowUp[] {
      return (
        db.prepare(`SELECT * FROM follow_ups WHERE status = 'pending' AND due_at <= ? ORDER BY due_at`).all(now) as FollowUpRow[]
      ).map(toFollowUp);
    },
    /** Moves a follow-up on, only from the status it is expected to be in. */
    setFollowUp(id: string, from: FollowUp["status"], to: FollowUp["status"], threadId?: string): boolean {
      return (
        db
          .prepare(`UPDATE follow_ups SET status = ?, thread_id = COALESCE(?, thread_id) WHERE id = ? AND status = ?`)
          .run(to, threadId ?? null, id, from).changes > 0
      );
    },
    startedFollowUpByThread(threadId: string): FollowUp | null {
      const row = db.prepare(`SELECT * FROM follow_ups WHERE thread_id = ? AND status = 'started'`).get(threadId) as
        | FollowUpRow
        | undefined;
      return row === undefined ? null : toFollowUp(row);
    },

    linearTriggers(agentId?: string): LinearTrigger[] {
      const rows =
        agentId === undefined
          ? db.prepare(`SELECT * FROM linear_triggers ORDER BY created_at`).all()
          : db.prepare(`SELECT * FROM linear_triggers WHERE agent_id = ? ORDER BY created_at`).all(agentId);
      return (rows as LinearTriggerRow[]).map(toLinearTrigger);
    },
    addLinearTrigger(input: Omit<LinearTrigger, "id" | "createdAt">, now: number): LinearTrigger {
      const id = shortId("ltr");
      db.prepare(
        `INSERT INTO linear_triggers (id, agent_id, team_key, project, event, value, task, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, input.agentId, input.teamKey, input.project, input.event, input.value, input.task, input.enabled ? 1 : 0, now);
      return { ...input, id, createdAt: now };
    },
    setLinearTriggerEnabled(id: string, enabled: boolean): boolean {
      return db.prepare(`UPDATE linear_triggers SET enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, id).changes > 0;
    },
    removeLinearTrigger(id: string): boolean {
      return db.prepare(`DELETE FROM linear_triggers WHERE id = ?`).run(id).changes > 0;
    },
    seenIssue(issueId: string): SeenIssue | null {
      const row = db.prepare(`SELECT state, labels FROM linear_seen WHERE issue_id = ?`).get(issueId) as
        | { state: string; labels: string }
        | undefined;
      return row === undefined ? null : { state: row.state, labels: JSON.parse(row.labels) as string[] };
    },
    rememberIssue(issueId: string, seen: SeenIssue): void {
      db.prepare(
        `INSERT INTO linear_seen (issue_id, state, labels) VALUES (?, ?, ?)
         ON CONFLICT (issue_id) DO UPDATE SET state = excluded.state, labels = excluded.labels`,
      ).run(issueId, seen.state, JSON.stringify(seen.labels));
    },
  };
}
export type AgentStore = ReturnType<typeof createAgentStore>;
