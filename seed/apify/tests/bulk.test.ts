import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type BulkDeps,
  type BulkPlan,
  type BulkRecord,
  type BulkTask,
  type BulkTaskOutcome,
  clubSeasonTask,
  clubTask,
  expandSeasonRange,
  leagueSeasonTask,
  leagueTask,
  runBulk,
  runBulkFromCli,
  summarizeBulkRecords,
  synthesizeBulkPlanId,
} from "../src/bulk.js";
import {
  bulkCheckpointPath,
  createInMemoryBulkCheckpoint,
  createJsonlBulkCheckpoint,
  parseBulkRecords,
} from "../src/bulk-checkpoint.js";
import type { FetchAdapter } from "../src/fetch/adapter.js";
import { TransfermarktCircuitOpenError } from "../src/fetch/transfermarkt-rate-limit.js";

const AT = "2026-01-01T00:00:00.000Z";

/** `bulk status` reads the checkpoint only: a fetch from this adapter is the bug. */
function refusingFetchAdapter(): FetchAdapter {
  const refuse = async () => {
    throw new Error("bulk status must not fetch");
  };
  return {
    fetchLeague: refuse,
    fetchLeagueSeason: refuse,
    fetchClub: refuse,
    fetchNationalTeam: refuse,
    fetchNationalTeamSeason: refuse,
    fetchClubSeason: refuse,
    listClubSeasonPairs: refuse,
  };
}

function singleSeasonPlan(): BulkPlan {
  return {
    id: "dk1-2012-13",
    entries: [{ competition: "dk1", fromSeason: "2012/13", toSeason: "2012/13" }],
  };
}

interface RecordingDeps {
  deps: BulkDeps;
  executed: string[];
  checkpoint: ReturnType<typeof createInMemoryBulkCheckpoint>;
}

function recordingDeps(
  outcomes: (task: BulkTask) => Promise<BulkTaskOutcome>,
  seed: BulkRecord[] = [],
): RecordingDeps {
  const checkpoint = createInMemoryBulkCheckpoint(seed);
  const executed: string[] = [];
  return {
    checkpoint,
    executed,
    deps: {
      checkpoint,
      progress: () => {},
      executeTask: async (task) => {
        executed.push(task.id);
        return outcomes(task);
      },
    },
  };
}

describe("bulk season range", () => {
  it("expands an inclusive split-season range", () => {
    expect(expandSeasonRange("dk1", "2012/13", "2014/15")).toEqual([
      "2012/13",
      "2013/14",
      "2014/15",
    ]);
  });

  it("keeps the two-digit label style and resolves 0001 to the first season", () => {
    expect(expandSeasonRange("dk1", "22/23", "23/24")).toEqual(["22/23", "23/24"]);
    expect(expandSeasonRange("dk1", "0001", "1992/93")).toEqual(["1991/92", "1992/93"]);
  });

  it("resolves today against a fixed clock", () => {
    expect(expandSeasonRange("dk1", "2024/25", "today", new Date("2026-03-01T00:00:00Z"))).toEqual([
      "2024/25",
      "2025/26",
    ]);
  });

  it("rejects an inverted range", () => {
    expect(() => expandSeasonRange("dk1", "2015/16", "2014/15")).toThrow(/after to-season/);
  });
});

describe("bulk plan id", () => {
  it("collapses non-alphanumerics into a stable slug", () => {
    expect(synthesizeBulkPlanId("dk1", "2012/13", "2013/14")).toBe("dk1-2012-13-2013-14");
    expect(synthesizeBulkPlanId("DK1", "0001", "today")).toBe("dk1-0001-today");
  });
});

describe("runBulk queue", () => {
  it("expands a league-season outcome into club and club-season tasks and runs them", async () => {
    const { deps, executed, checkpoint } = recordingDeps(async (task) =>
      task.kind === "league_season"
        ? { status: "done", clubs: ["190", "191"] }
        : { status: "done" },
    );

    const summary = await runBulk(singleSeasonPlan(), deps);

    expect(executed).toEqual([
      "league:dk1",
      "league_season:dk1:2012/13",
      "club:dk1:190",
      "club:dk1:191",
      "club_season:dk1:190:2012/13",
      "club_season:dk1:191:2012/13",
    ]);
    expect(summary.total).toBe(6);
    expect(summary.done).toBe(6);
    expect(summary.pending).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.stopped).toBeUndefined();

    const pendingRecords = checkpoint.records.filter((record) => record.status === "pending");
    expect(pendingRecords.map((record) => record.taskId)).toEqual(executed);
    expect(pendingRecords.every((record) => Boolean(record.task))).toBe(true);
  });

  it("records a club-season skip from the executor without failing the queue", async () => {
    const { deps, executed } = recordingDeps(async (task) => {
      if (task.kind === "league_season") {
        return { status: "done", clubs: ["190"] };
      }
      if (task.kind === "club_season") {
        return { status: "skipped", reason: "already-seeded" };
      }
      return { status: "done" };
    });

    const summary = await runBulk(singleSeasonPlan(), deps);

    expect(executed).toContain("club_season:dk1:190:2012/13");
    expect(summary.skipped).toBe(1);
    expect(summary.done).toBe(3);
    expect(summary.pending).toBe(0);
  });

  it("does not re-execute tasks the checkpoint already marks done", async () => {
    const seed: BulkRecord[] = [
      {
        taskId: "league:dk1",
        kind: "league",
        status: "done",
        at: AT,
        task: leagueTask("dk1"),
      },
      {
        taskId: "league_season:dk1:2012/13",
        kind: "league_season",
        status: "done",
        at: AT,
        task: leagueSeasonTask("dk1", "2012/13"),
      },
      {
        taskId: "club:dk1:190",
        kind: "club",
        status: "done",
        at: AT,
        task: clubTask("dk1", "190"),
      },
      {
        taskId: "club_season:dk1:190:2012/13",
        kind: "club_season",
        status: "pending",
        at: AT,
        task: clubSeasonTask("dk1", "190", "2012/13"),
      },
    ];

    const { deps, executed } = recordingDeps(async () => ({ status: "done" }), seed);

    const summary = await runBulk(singleSeasonPlan(), deps);

    expect(executed).toEqual(["club_season:dk1:190:2012/13"]);
    expect(summary.total).toBe(4);
    expect(summary.done).toBe(4);
    expect(summary.pending).toBe(0);
  });

  it("continues the queue after a failing task", async () => {
    const { deps, executed } = recordingDeps(async (task) => {
      if (task.kind === "league_season") {
        return { status: "done", clubs: ["190", "191"] };
      }
      if (task.id === "club:dk1:190") {
        throw new Error("Missing club page for 190");
      }
      return { status: "done" };
    });

    const summary = await runBulk(singleSeasonPlan(), deps);

    expect(executed).toEqual([
      "league:dk1",
      "league_season:dk1:2012/13",
      "club:dk1:190",
      "club:dk1:191",
      "club_season:dk1:190:2012/13",
      "club_season:dk1:191:2012/13",
    ]);
    expect(summary.failed).toBe(1);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]?.taskId).toBe("club:dk1:190");
    expect(summary.failures[0]?.reason).toMatch(/Missing club page for 190/);
    expect(summary.done).toBe(5);
    expect(summary.pending).toBe(0);
  });

  it("stops on an open Transfermarkt circuit and leaves the rest pending", async () => {
    const { deps, executed, checkpoint } = recordingDeps(async (task) => {
      if (task.kind === "league_season") {
        return { status: "done", clubs: ["190", "191"] };
      }
      if (task.id === "club:dk1:190") {
        throw new TransfermarktCircuitOpenError();
      }
      return { status: "done" };
    });

    const summary = await runBulk(singleSeasonPlan(), deps);

    expect(executed).toEqual(["league:dk1", "league_season:dk1:2012/13", "club:dk1:190"]);
    expect(summary.stopped).toBe("circuit_open");
    expect(summary.total).toBe(6);
    expect(summary.done).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.pending).toBe(3);
    expect(summary.failures[0]?.reason).toMatch(/circuit open/i);

    const replay = summarizeBulkRecords(summary.planId, checkpoint.records);
    expect(replay.pending).toBe(3);
    expect(replay.failed).toBe(1);
    expect(replay.done).toBe(2);
  });

  it("resumes a circuit-stopped run without refetching the discovered league season", async () => {
    const first = recordingDeps(async (task) => {
      if (task.kind === "league_season") {
        return { status: "done", clubs: ["190", "191"] };
      }
      if (task.id === "club:dk1:190") {
        throw new TransfermarktCircuitOpenError();
      }
      return { status: "done" };
    });
    await runBulk(singleSeasonPlan(), first.deps);

    const second = recordingDeps(async () => ({ status: "done" }), first.checkpoint.records);
    const summary = await runBulk(singleSeasonPlan(), second.deps);

    expect(second.executed).toEqual([
      "club:dk1:190",
      "club:dk1:191",
      "club_season:dk1:190:2012/13",
      "club_season:dk1:191:2012/13",
    ]);
    expect(summary.done).toBe(6);
    expect(summary.pending).toBe(0);
    expect(summary.failed).toBe(0);
  });
});

describe("bulk status counts", () => {
  it("reports done, failed, skipped, and pending from a checkpoint file", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "kit-bulk-status-"));
    const file = bulkCheckpointPath("big-five-2015-2024", stateDir);
    const lines: BulkRecord[] = [
      { taskId: "league:gb1", kind: "league", status: "pending", at: AT },
      { taskId: "league:gb1", kind: "league", status: "done", at: AT },
      { taskId: "league_season:gb1:2015/16", kind: "league_season", status: "done", at: AT },
      { taskId: "club:gb1:11", kind: "club", status: "failed", at: AT, reason: "HTTP 404" },
      { taskId: "club_season:gb1:11:2015/16", kind: "club_season", status: "skipped", at: AT },
      { taskId: "club_season:gb1:31:2015/16", kind: "club_season", status: "pending", at: AT },
    ];
    await writeFile(file, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");

    const checkpoint = createJsonlBulkCheckpoint(file);
    const summary = summarizeBulkRecords("big-five-2015-2024", await checkpoint.read());

    expect(summary).toMatchObject({
      planId: "big-five-2015-2024",
      total: 5,
      done: 2,
      failed: 1,
      skipped: 1,
      pending: 1,
    });
    expect(summary.failures).toEqual([{ taskId: "club:gb1:11", reason: "HTTP 404" }]);
  });

  it("treats a missing checkpoint file as an empty run", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "kit-bulk-missing-"));
    const checkpoint = createJsonlBulkCheckpoint(bulkCheckpointPath("nothing-here", stateDir));
    expect(await checkpoint.read()).toEqual([]);
  });
});

describe("runBulkFromCli status", () => {
  it("resolves a plan file to its id and reports checkpoint counts", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kit-bulk-cli-"));
    const planFile = path.join(dir, "big-five.json");
    await writeFile(
      planFile,
      JSON.stringify({
        id: "big-five-2015-2024",
        entries: [{ competition: "gb1", fromSeason: "2015/16", toSeason: "2016/17" }],
      }),
      "utf8",
    );
    const stateDir = path.join(dir, "state");
    const checkpoint = createJsonlBulkCheckpoint(
      bulkCheckpointPath("big-five-2015-2024", stateDir),
    );
    await checkpoint.append({ taskId: "league:gb1", kind: "league", status: "done", at: AT });

    const result = await runBulkFromCli({
      request: { command: "status", target: planFile },
      lane: "development",
      fetchAdapter: refusingFetchAdapter(),
      stateDir,
    });

    expect(result.command).toBe("status");
    expect(result.planId).toBe("big-five-2015-2024");
    expect(result.checkpointFile).toBe(bulkCheckpointPath("big-five-2015-2024", stateDir));
    expect(result.summary).toMatchObject({ total: 1, done: 1, pending: 0 });
  });

  it("treats a target that is not a file as a plan id", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "kit-bulk-cli-id-"));
    const result = await runBulkFromCli({
      request: { command: "status", target: "dk1-2012-13-2013-14" },
      lane: "development",
      fetchAdapter: refusingFetchAdapter(),
      stateDir,
    });

    expect(result.planId).toBe("dk1-2012-13-2013-14");
    expect(result.summary).toMatchObject({ total: 0, done: 0, pending: 0 });
  });
});

describe("JSONL bulk checkpoint", () => {
  it("appends one line per transition and replays last record wins", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "kit-bulk-jsonl-"));
    const file = bulkCheckpointPath("dk1-2012-13", stateDir);
    const checkpoint = createJsonlBulkCheckpoint(file);

    const task = clubSeasonTask("dk1", "190", "2012/13");
    await checkpoint.append({ taskId: task.id, kind: task.kind, status: "pending", at: AT, task });
    await checkpoint.append({
      taskId: task.id,
      kind: task.kind,
      status: "failed",
      at: AT,
      reason: "HTTP 429",
      task,
    });
    await checkpoint.append({ taskId: task.id, kind: task.kind, status: "done", at: AT, task });

    const contents = await readFile(file, "utf8");
    expect(contents.trimEnd().split("\n")).toHaveLength(3);

    const records = await checkpoint.read();
    expect(records).toHaveLength(3);
    expect(records[0]?.task).toEqual(task);

    const summary = summarizeBulkRecords("dk1-2012-13", records);
    expect(summary).toMatchObject({ total: 1, done: 1, failed: 0, pending: 0 });
  });

  it("ignores a line torn by a crash mid-append", () => {
    const records = parseBulkRecords(
      `{"taskId":"league:dk1","kind":"league","status":"done","at":"${AT}"}\n{"taskId":"club:dk1:1`,
    );
    expect(records).toHaveLength(1);
    expect(records[0]?.taskId).toBe("league:dk1");
  });
});
