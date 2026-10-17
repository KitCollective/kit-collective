// The scheduler's ledger: one row per workflow run it started for an issue.
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { IssueHistory } from "./board.js";

/**
 * active: the run is going. handed-over: it ended and the issue left the
 * working states. stalled: it ended and the issue did not move on.
 * released: a stall that a person or the orchestrator cleared.
 */
export type DispatchStatus = "active" | "handed-over" | "stalled" | "released";

export interface Dispatch {
  id: string;
  issue: string;
  /** The Loop that started the run; null for a run started before Loops existed. */
  loop: string | null;
  machineId: string;
  threadId: string | null;
  resume: boolean;
  status: DispatchStatus;
  outcome: string | null;
  startedAt: number;
  endedAt: number | null;
  /** The workflow run the launcher started, once the board has seen it. */
  workflowRunId: string | null;
  /** The workflow's current phase, or the last one it reached. */
  step: string | null;
  /** The run's pull request, once the workflow or the issue names one. */
  prNumber: number | null;
}

/** Appended to the run ledger's migrations; never reorder. */
export const DISPATCH_MIGRATIONS = [
  `CREATE TABLE dispatches (
     id TEXT PRIMARY KEY,
     issue TEXT NOT NULL,
     machine_id TEXT NOT NULL,
     thread_id TEXT,
     resume INTEGER NOT NULL,
     status TEXT NOT NULL,
     outcome TEXT,
     started_at INTEGER NOT NULL,
     ended_at INTEGER
   )`,
  `CREATE INDEX dispatches_issue ON dispatches (issue, started_at)`,
];

/**
 * Appended after the run, dispatch and agent migrations (RUN_MIGRATIONS
 * follow it), because the lists run as one sequence and an insert in the
 * middle would move the ones after it.
 */
export const LOOP_MIGRATIONS = [
  `ALTER TABLE dispatches ADD COLUMN loop TEXT`,
  `CREATE TABLE decisions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     at INTEGER NOT NULL,
     mode TEXT NOT NULL,
     loop TEXT,
     issue TEXT,
     kind TEXT NOT NULL,
     reason TEXT NOT NULL
   )`,
  `CREATE INDEX decisions_subject ON decisions (loop, issue, id)`,
];

/**
 * Appended after the Loop migrations, for the runs page: what the board has
 * seen of a run's workflow, and the gate verdicts Optio ran for it.
 */
export const RUN_MIGRATIONS = [
  `ALTER TABLE dispatches ADD COLUMN workflow_run_id TEXT`,
  `ALTER TABLE dispatches ADD COLUMN step TEXT`,
  `ALTER TABLE dispatches ADD COLUMN pr_number INTEGER`,
  `CREATE TABLE gate_verdicts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     dispatch_id TEXT NOT NULL,
     at INTEGER NOT NULL,
     gate TEXT NOT NULL,
     exit_code INTEGER NOT NULL,
     verdict TEXT NOT NULL,
     commit_sha TEXT,
     thread_id TEXT
   )`,
  `CREATE INDEX gate_verdicts_dispatch ON gate_verdicts (dispatch_id, id)`,
];

/** What the Board decided about an issue (or, for a refusal, about the whole registry). */
export type DecisionKind = "start" | "skip" | "refusal";

export interface Decision {
  id: number;
  at: number;
  /** `live` applied the decision; `dry-run` only recorded what it would do. */
  mode: string;
  loop: string | null;
  issue: string | null;
  kind: DecisionKind;
  reason: string;
}

/** A gate Optio ran for a run: its exit code, its verdict line and the commit it judged. */
export interface GateVerdict {
  at: number;
  gate: string;
  exitCode: number;
  verdict: string;
  commit: string | null;
  threadId: string | null;
}

/** The runs page's states: a stall that was released is still a run that stopped. */
export type RunState = "running" | "stopped" | "handed-over";

export interface Run extends Dispatch {
  state: RunState;
  gates: GateVerdict[];
}

interface DecisionRow {
  id: number;
  at: number;
  mode: string;
  loop: string | null;
  issue: string | null;
  kind: DecisionKind;
  reason: string;
}

interface Row {
  id: string;
  issue: string;
  loop: string | null;
  machine_id: string;
  thread_id: string | null;
  resume: number;
  status: DispatchStatus;
  outcome: string | null;
  started_at: number;
  ended_at: number | null;
  workflow_run_id: string | null;
  step: string | null;
  pr_number: number | null;
}

interface GateRow {
  dispatch_id: string;
  at: number;
  gate: string;
  exit_code: number;
  verdict: string;
  commit_sha: string | null;
  thread_id: string | null;
}

const runState = (status: DispatchStatus): RunState =>
  status === "active" ? "running" : status === "handed-over" ? "handed-over" : "stopped";

const STATUSES: Record<RunState, DispatchStatus[]> = {
  running: ["active"],
  stopped: ["stalled", "released"],
  "handed-over": ["handed-over"],
};

const toDispatch = (row: Row): Dispatch => ({
  id: row.id,
  issue: row.issue,
  loop: row.loop,
  machineId: row.machine_id,
  threadId: row.thread_id,
  resume: row.resume === 1,
  status: row.status,
  outcome: row.outcome,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  workflowRunId: row.workflow_run_id,
  step: row.step,
  prNumber: row.pr_number,
});

export function createDispatchStore(db: Database) {
  const forIssue = (issue: string) =>
    // SAFETY: the query reads a table this store's own migrations create; the row type mirrors its columns.
    (
      db
        .prepare(`SELECT * FROM dispatches WHERE issue = ? ORDER BY started_at DESC, rowid DESC`)
        .all(issue) as Row[]
    ).map(toDispatch);

  return {
    start(input: {
      issue: string;
      loop: string | null;
      machineId: string;
      resume: boolean;
      now: number;
    }): Dispatch {
      const id = `dsp_${randomUUID().slice(0, 12)}`;
      db.prepare(
        `INSERT INTO dispatches (id, issue, loop, machine_id, resume, status, started_at) VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      ).run(id, input.issue, input.loop, input.machineId, input.resume ? 1 : 0, input.now);
      return {
        id,
        issue: input.issue,
        loop: input.loop,
        machineId: input.machineId,
        threadId: null,
        resume: input.resume,
        status: "active",
        outcome: null,
        startedAt: input.now,
        endedAt: null,
        workflowRunId: null,
        step: null,
        prNumber: null,
      };
    },
    /** Keeps what the board has seen of a run's workflow; a value it did not see leaves the last one. */
    /** Whether the look showed something new: a run, a step or a PR the record did not hold. */
    observe(
      id: string,
      seen: { workflowRunId: string | null; step: string | null; prNumber: number | null },
    ): boolean {
      return (
        db
          .prepare(
            `UPDATE dispatches SET workflow_run_id = COALESCE(@run, workflow_run_id), step = COALESCE(@step, step), pr_number = COALESCE(@pr, pr_number)
             WHERE id = @id AND ((@run IS NOT NULL AND workflow_run_id IS NOT @run) OR (@step IS NOT NULL AND step IS NOT @step) OR (@pr IS NOT NULL AND pr_number IS NOT @pr))`,
          )
          .run({ run: seen.workflowRunId, step: seen.step, pr: seen.prNumber, id }).changes > 0
      );
    },
    /** Writes a gate Optio ran to the record of the run it judged. */
    recordGate(dispatchId: string, gate: Omit<GateVerdict, "at">, now: number): void {
      db.prepare(
        `INSERT INTO gate_verdicts (dispatch_id, at, gate, exit_code, verdict, commit_sha, thread_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(dispatchId, now, gate.gate, gate.exitCode, gate.verdict, gate.commit, gate.threadId);
    },
    /**
     * The runs page's list, newest first: every run of every Loop, optionally
     * of one Loop and one state, each with the gate verdicts recorded for it.
     */
    runs(filter: { loop: string | null; state: RunState | null; limit: number }): Run[] {
      const where: string[] = [];
      const params: (string | number)[] = [];
      if (filter.loop !== null) {
        where.push(`loop = ?`);
        params.push(filter.loop);
      }
      if (filter.state !== null) {
        const statuses = STATUSES[filter.state];
        where.push(`status IN (${statuses.map(() => "?").join(", ")})`);
        params.push(...statuses);
      }
      // SAFETY: the query reads a table this store's own migrations create; the row type mirrors its columns.
      const rows = db
        .prepare(
          `SELECT * FROM dispatches${where.length === 0 ? "" : ` WHERE ${where.join(" AND ")}`} ORDER BY started_at DESC, rowid DESC LIMIT ?`,
        )
        .all(...params, filter.limit) as Row[];
      const gates = db.prepare(`SELECT * FROM gate_verdicts WHERE dispatch_id = ? ORDER BY id ASC`);
      return rows.map((row) => ({
        ...toDispatch(row),
        state: runState(row.status),
        // SAFETY: the query reads a table this store's own migrations create; the row type mirrors its columns.
        gates: (gates.all(row.id) as GateRow[]).map((gate) => ({
          at: gate.at,
          gate: gate.gate,
          exitCode: gate.exit_code,
          verdict: gate.verdict,
          commit: gate.commit_sha,
          threadId: gate.thread_id,
        })),
      }));
    },
    attach(id: string, threadId: string): void {
      db.prepare(`UPDATE dispatches SET thread_id = ? WHERE id = ?`).run(threadId, id);
    },
    end(id: string, status: "handed-over" | "stalled", outcome: string | null, now: number): void {
      db.prepare(
        `UPDATE dispatches SET status = ?, outcome = ?, ended_at = ? WHERE id = ? AND status = 'active'`,
      ).run(status, outcome, now, id);
    },
    /** Lifts a stall so the issue is planned again. Returns false when there was none. */
    release(issue: string): boolean {
      return (
        db
          .prepare(
            `UPDATE dispatches SET status = 'released' WHERE issue = ? AND status = 'stalled'`,
          )
          .run(issue).changes > 0
      );
    },
    active(): Dispatch[] {
      // SAFETY: the query reads a table this store's own migrations create; the row type mirrors its columns.
      return (db.prepare(`SELECT * FROM dispatches WHERE status = 'active'`).all() as Row[]).map(
        toDispatch,
      );
    },
    latest: (issue: string): Dispatch | null => forIssue(issue)[0] ?? null,
    /** Runs in a row, newest first, that ended stalled. */
    consecutiveStalls(issue: string): number {
      const rows = forIssue(issue);
      const firstOther = rows.findIndex((row) => row.status !== "stalled");
      return firstOther === -1 ? rows.length : firstOther;
    },
    history(): Map<string, IssueHistory> {
      const history = new Map<string, IssueHistory>();
      // SAFETY: the query reads a table this store's own migrations create; the row type mirrors its columns.
      const rows = db
        .prepare(`SELECT * FROM dispatches ORDER BY started_at ASC, rowid ASC`)
        .all() as Row[];
      for (const row of rows) {
        // Rows arrive oldest first, so the last one written per issue is its latest run.
        history.set(row.issue, {
          activeOn: row.status === "active" ? row.machine_id : null,
          activeLoop: row.status === "active" ? row.loop : null,
          stalled: row.status === "stalled",
          startedBefore: true,
        });
      }
      return history;
    },
    /** Runs started per issue since `since` (epoch ms), resumes included. */
    startsSince(since: number): Map<string, number> {
      const counts = new Map<string, number>();
      // SAFETY: the query reads a table this store's own migrations create; the row type mirrors the selected columns.
      const rows = db
        .prepare(`SELECT issue, COUNT(*) AS n FROM dispatches WHERE started_at >= ? GROUP BY issue`)
        .all(since) as { issue: string; n: number }[];
      for (const row of rows) counts.set(row.issue, row.n);
      return counts;
    },
    /**
     * Writes the Board's decisions to the record of runs. A skip or refusal
     * is written only when its reason differs from the last one recorded for
     * the same Loop and issue, so a tick every minute does not repeat a wait.
     * Returns the decisions that were written.
     */
    record(
      now: number,
      mode: string,
      decisions: {
        loop: string | null;
        issue: string | null;
        kind: DecisionKind;
        reason: string;
      }[],
    ): Decision[] {
      const last = db.prepare(
        `SELECT kind, reason FROM decisions WHERE loop IS ? AND issue IS ? ORDER BY id DESC LIMIT 1`,
      );
      const insert = db.prepare(
        `INSERT INTO decisions (at, mode, loop, issue, kind, reason) VALUES (?, ?, ?, ?, ?, ?)`,
      );
      const written: Decision[] = [];
      for (const decision of decisions) {
        if (decision.kind !== "start") {
          // SAFETY: the query reads a table this store's own migrations create; the row type mirrors the selected columns.
          const previous = last.get(decision.loop, decision.issue) as
            | { kind: DecisionKind; reason: string }
            | undefined;
          if (previous?.kind === decision.kind && previous.reason === decision.reason) continue;
        }
        const result = insert.run(
          now,
          mode,
          decision.loop,
          decision.issue,
          decision.kind,
          decision.reason,
        );
        written.push({ id: Number(result.lastInsertRowid), at: now, mode, ...decision });
      }
      return written;
    },
    decisions(limit: number): Decision[] {
      // SAFETY: the query reads a table this store's own migrations create; the row type mirrors its columns.
      return db
        .prepare(`SELECT * FROM decisions ORDER BY id DESC LIMIT ?`)
        .all(limit) as DecisionRow[];
    },
    list(limit: number): Dispatch[] {
      return (
        // SAFETY: the query reads a table this store's own migrations create; the row type mirrors its columns.
        (
          db
            .prepare(`SELECT * FROM dispatches ORDER BY started_at DESC, rowid DESC LIMIT ?`)
            .all(limit) as Row[]
        ).map(toDispatch)
      );
    },
  };
}
export type DispatchStore = ReturnType<typeof createDispatchStore>;
