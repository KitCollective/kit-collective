import { readFile, stat } from "node:fs/promises";
import type { Db } from "@kit/db";
import { resolveSeasonRef } from "@kit/seed-shared";
import { bulkCheckpointPath, createJsonlBulkCheckpoint } from "./bulk-checkpoint.js";
import type { FetchAdapter } from "./fetch/adapter.js";
import { TransfermarktCircuitOpenError } from "./fetch/transfermarkt-rate-limit.js";
import { parseLane, resolveDatabaseUrl } from "./lane.js";
import type { PortraitStore } from "./map/index.js";
import { describeSeedError, seedProgress } from "./progress.js";
import type { Lane, TransfermarktRawPayload } from "./types.js";

export type BulkTaskKind = "league" | "league_season" | "club" | "club_season";

export type BulkTaskStatus = "pending" | "done" | "failed" | "skipped";

export interface BulkTask {
  id: string;
  kind: BulkTaskKind;
  competition: string;
  season?: string;
  clubExternalId?: string;
}

export interface BulkRecord {
  taskId: string;
  kind: BulkTaskKind;
  status: BulkTaskStatus;
  at: string;
  reason?: string;
  task?: BulkTask;
}

export interface BulkCheckpoint {
  read(): Promise<BulkRecord[]>;
  append(record: BulkRecord): Promise<void>;
}

export interface BulkPlanEntry {
  competition: string;
  fromSeason: string;
  toSeason: string;
}

export interface BulkPlan {
  id: string;
  entries: BulkPlanEntry[];
}

export interface BulkTaskOutcome {
  status: "done" | "skipped";
  /** League-season outcomes carry the clubs the page listed, so the queue can expand. */
  clubs?: string[];
  reason?: string;
}

export interface BulkFailure {
  taskId: string;
  reason: string;
}

export interface BulkSummary {
  planId: string;
  total: number;
  done: number;
  skipped: number;
  failed: number;
  pending: number;
  failures: BulkFailure[];
  stopped?: "circuit_open";
}

export interface BulkDeps {
  executeTask: (task: BulkTask) => Promise<BulkTaskOutcome>;
  checkpoint: BulkCheckpoint;
  progress?: (line: string) => void;
}

export function bulkTaskId(task: Omit<BulkTask, "id">): string {
  const parts = [task.kind, task.competition, task.clubExternalId, task.season].filter(
    (part): part is string => Boolean(part),
  );
  return parts.join(":");
}

function makeTask(task: Omit<BulkTask, "id">): BulkTask {
  return { id: bulkTaskId(task), ...task };
}

export function leagueTask(competition: string): BulkTask {
  return makeTask({ kind: "league", competition });
}

export function leagueSeasonTask(competition: string, season: string): BulkTask {
  return makeTask({ kind: "league_season", competition, season });
}

export function clubTask(competition: string, clubExternalId: string): BulkTask {
  return makeTask({ kind: "club", competition, clubExternalId });
}

export function clubSeasonTask(
  competition: string,
  clubExternalId: string,
  season: string,
): BulkTask {
  return makeTask({ kind: "club_season", competition, clubExternalId, season });
}

export function synthesizeBulkPlanId(
  competition: string,
  fromSeason: string,
  toSeason: string,
): string {
  return `${competition}-${fromSeason}-${toSeason}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type SeasonLabelFormat = { kind: "split"; width: 2 | 4 } | { kind: "calendar" };

interface ParsedSeasonLabel {
  format: SeasonLabelFormat;
  startYear: number;
}

function parseSeasonLabel(label: string): ParsedSeasonLabel {
  const wideSplit = /^(\d{4})\/\d{2}$/.exec(label);
  if (wideSplit?.[1]) {
    return {
      format: { kind: "split", width: 4 },
      startYear: Number.parseInt(wideSplit[1], 10),
    };
  }

  const narrowSplit = /^(\d{2})\/\d{2}$/.exec(label);
  if (narrowSplit?.[1]) {
    const twoDigit = Number.parseInt(narrowSplit[1], 10);
    // Transfermarkt writes the 1990s as 91/92, so only 50+ can mean the previous century.
    return {
      format: { kind: "split", width: 2 },
      startYear: twoDigit >= 50 ? 1900 + twoDigit : 2000 + twoDigit,
    };
  }

  const calendar = /^(\d{4})$/.exec(label);
  if (calendar?.[1]) {
    return { format: { kind: "calendar" }, startYear: Number.parseInt(calendar[1], 10) };
  }

  throw new Error(
    `Unsupported season label '${label}'. Expected 2015/16, 15/16, or a calendar year like 2010.`,
  );
}

function formatSeasonLabel(format: SeasonLabelFormat, startYear: number): string {
  if (format.kind === "calendar") {
    return String(startYear);
  }
  const endTwoDigit = String((startYear + 1) % 100).padStart(2, "0");
  if (format.width === 2) {
    return `${String(startYear % 100).padStart(2, "0")}/${endTwoDigit}`;
  }
  return `${startYear}/${endTwoDigit}`;
}

function currentSeasonStartYear(now: Date): number {
  // A split season is named after the year it kicks off, and Transfermarkt rolls over in July.
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export function expandSeasonRange(
  competition: string,
  fromSeason: string,
  toSeason: string,
  now: Date = new Date(),
): string[] {
  const fromRef = resolveSeasonRef(competition, fromSeason);
  const toRef = resolveSeasonRef(competition, toSeason);
  const currentYear = currentSeasonStartYear(now);

  const from = fromRef === "today" ? undefined : parseSeasonLabel(fromRef);
  const to = toRef === "today" ? undefined : parseSeasonLabel(toRef);

  if (from && to && from.format.kind !== to.format.kind) {
    throw new Error(
      `Season range '${fromSeason}'..'${toSeason}' mixes a split season with a calendar season.`,
    );
  }

  // `today` carries no label format, so the named end of the range decides how labels are written.
  const format: SeasonLabelFormat = from?.format ?? to?.format ?? { kind: "split", width: 4 };
  const fromYear = from?.startYear ?? currentYear;
  const toYear = to?.startYear ?? currentYear;

  if (fromYear > toYear) {
    throw new Error(`from-season ${fromSeason} is after to-season ${toSeason}`);
  }

  const labels: string[] = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    labels.push(formatSeasonLabel(format, year));
  }
  return labels;
}

function bulkProgressLine(index: number, total: number, task: BulkTask, status: string): string {
  const target = [task.competition.toUpperCase(), task.clubExternalId, task.season]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  return `${index}/${total} ${task.kind} ${target} ${status}`;
}

function emptySummary(planId: string): BulkSummary {
  return { planId, total: 0, done: 0, skipped: 0, failed: 0, pending: 0, failures: [] };
}

export function summarizeBulkRecords(planId: string, records: BulkRecord[]): BulkSummary {
  const summary = emptySummary(planId);
  const lastByTask = new Map<string, BulkRecord>();
  for (const record of records) {
    lastByTask.set(record.taskId, record);
  }

  summary.total = lastByTask.size;
  for (const record of lastByTask.values()) {
    if (record.status === "done") {
      summary.done += 1;
    } else if (record.status === "skipped") {
      summary.skipped += 1;
    } else if (record.status === "failed") {
      summary.failed += 1;
      summary.failures.push({ taskId: record.taskId, reason: record.reason ?? "unknown" });
    } else {
      summary.pending += 1;
    }
  }
  return summary;
}

export async function runBulk(plan: BulkPlan, deps: BulkDeps): Promise<BulkSummary> {
  if (plan.entries.length === 0) {
    throw new Error(`Bulk plan '${plan.id}' has no entries`);
  }

  const progress = deps.progress ?? seedProgress;
  const priorRecords = await deps.checkpoint.read();
  const lastByTask = new Map<string, BulkRecord>();
  const checkpointedTasks = new Map<string, BulkTask>();
  for (const record of priorRecords) {
    lastByTask.set(record.taskId, record);
    if (record.task && !checkpointedTasks.has(record.taskId)) {
      checkpointedTasks.set(record.taskId, record.task);
    }
  }

  const queue: BulkTask[] = [];
  const queuedIds = new Set<string>();
  const recordedIds = new Set(lastByTask.keys());

  const enqueue = async (task: BulkTask): Promise<void> => {
    if (queuedIds.has(task.id)) {
      return;
    }
    queuedIds.add(task.id);
    queue.push(task);
    if (!recordedIds.has(task.id)) {
      recordedIds.add(task.id);
      await deps.checkpoint.append({
        taskId: task.id,
        kind: task.kind,
        status: "pending",
        at: new Date().toISOString(),
        task,
      });
    }
  };

  for (const entry of plan.entries) {
    await enqueue(leagueTask(entry.competition));
    for (const season of expandSeasonRange(entry.competition, entry.fromSeason, entry.toSeason)) {
      await enqueue(leagueSeasonTask(entry.competition, season));
    }
  }

  // Clubs are only known after a league-season fetch, so a resumed run replays the
  // expansion the crashed run already wrote instead of re-fetching those pages.
  for (const task of checkpointedTasks.values()) {
    await enqueue(task);
  }

  const summary = emptySummary(plan.id);
  progress(`bulk ${plan.id} tasks=${queue.length}`);

  let index = 0;
  let resumed = 0;
  while (index < queue.length) {
    const task = queue[index];
    index += 1;
    if (!task) {
      continue;
    }

    const previous = lastByTask.get(task.id);
    if (previous?.status === "done") {
      summary.done += 1;
      resumed += 1;
      continue;
    }
    if (previous?.status === "skipped") {
      summary.skipped += 1;
      resumed += 1;
      continue;
    }

    try {
      const outcome = await deps.executeTask(task);
      await deps.checkpoint.append({
        taskId: task.id,
        kind: task.kind,
        status: outcome.status,
        at: new Date().toISOString(),
        reason: outcome.reason,
        task,
      });

      if (outcome.status === "skipped") {
        summary.skipped += 1;
        progress(bulkProgressLine(index, queue.length, task, "skipped"));
        continue;
      }

      summary.done += 1;
      progress(bulkProgressLine(index, queue.length, task, "done"));

      if (task.kind === "league_season" && task.season && outcome.clubs?.length) {
        for (const clubExternalId of outcome.clubs) {
          await enqueue(clubTask(task.competition, clubExternalId));
        }
        for (const clubExternalId of outcome.clubs) {
          await enqueue(clubSeasonTask(task.competition, clubExternalId, task.season));
        }
      }
    } catch (error: unknown) {
      const reason = describeSeedError(error);
      await deps.checkpoint.append({
        taskId: task.id,
        kind: task.kind,
        status: "failed",
        at: new Date().toISOString(),
        reason,
        task,
      });
      summary.failed += 1;
      summary.failures.push({ taskId: task.id, reason });
      progress(bulkProgressLine(index, queue.length, task, "failed"));

      if (error instanceof TransfermarktCircuitOpenError) {
        summary.stopped = "circuit_open";
        progress(`bulk ${plan.id} stopped circuit_open`);
        break;
      }
    }
  }

  summary.total = queue.length;
  summary.pending = summary.total - summary.done - summary.skipped - summary.failed;
  if (resumed > 0) {
    progress(`bulk ${plan.id} resumed=${resumed}`);
  }
  return summary;
}

export interface DefaultBulkDepsOptions {
  db: Db;
  fetchAdapter: FetchAdapter;
  checkpoint: BulkCheckpoint;
  portraitStore?: PortraitStore;
  progress?: (line: string) => void;
}

/**
 * One league-season page answers both the club discovery and the league-season grain map,
 * so the second read must not cost Transfermarkt another request.
 */
function withLeagueSeasonMemo(adapter: FetchAdapter): FetchAdapter {
  let cached: { key: string; payload: TransfermarktRawPayload } | undefined;
  return {
    ...adapter,
    async fetchLeagueSeason(params) {
      const key = `${params.competition}:${params.season}`;
      if (cached?.key === key) {
        return cached.payload;
      }
      const payload = await adapter.fetchLeagueSeason(params);
      cached = { key, payload };
      return payload;
    },
  };
}

function requireSeason(task: BulkTask): string {
  if (!task.season?.trim()) {
    throw new Error(`${task.kind} task ${task.id} requires a season`);
  }
  return task.season;
}

function requireClubExternalId(task: BulkTask): string {
  if (!task.clubExternalId?.trim()) {
    throw new Error(`${task.kind} task ${task.id} requires a club id`);
  }
  return task.clubExternalId;
}

/**
 * Heavy wiring is loaded here, not at module scope, so the queue tests import `runBulk`
 * without pulling in `@kit/db` or the undici transport.
 */
export async function createDefaultBulkDeps(options: DefaultBulkDepsOptions): Promise<BulkDeps> {
  const { executeHierarchyGrain } = await import("./run.js");
  const { isClubSeasonAlreadySeeded } = await import("./seeded.js");
  const fetchAdapter = withLeagueSeasonMemo(options.fetchAdapter);
  const db = options.db;

  const executeTask = async (task: BulkTask): Promise<BulkTaskOutcome> => {
    if (task.kind === "league") {
      await executeHierarchyGrain(db, {
        kind: "league",
        competition: task.competition,
        fetchAdapter,
      });
      return { status: "done" };
    }

    if (task.kind === "league_season") {
      const season = requireSeason(task);
      const payload = await fetchAdapter.fetchLeagueSeason({
        competition: task.competition,
        season,
      });
      await executeHierarchyGrain(db, {
        kind: "league_season",
        competition: task.competition,
        season,
        fetchAdapter,
      });
      const clubs = (payload.seasons[0]?.clubs ?? []).map((clubRow) => clubRow.id);
      return { status: "done", clubs };
    }

    if (task.kind === "club") {
      await executeHierarchyGrain(db, {
        kind: "club",
        competition: task.competition,
        clubExternalId: requireClubExternalId(task),
        fetchAdapter,
      });
      return { status: "done" };
    }

    const season = requireSeason(task);
    const clubExternalId = requireClubExternalId(task);
    const alreadySeeded = await isClubSeasonAlreadySeeded(
      db,
      task.competition,
      clubExternalId,
      season,
    );
    if (alreadySeeded) {
      return { status: "skipped", reason: "already-seeded" };
    }

    await executeHierarchyGrain(db, {
      kind: "club_season",
      competition: task.competition,
      clubExternalId,
      season,
      fetchAdapter,
      portraitStore: options.portraitStore,
    });
    return { status: "done" };
  };

  return { executeTask, checkpoint: options.checkpoint, progress: options.progress };
}

export function parseBulkPlan(contents: string, source: string): BulkPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error(`Bulk plan ${source} is not valid JSON`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Bulk plan ${source} must be an object with id and entries`);
  }

  const id = "id" in parsed && typeof parsed.id === "string" ? parsed.id.trim() : "";
  if (!id) {
    throw new Error(`Bulk plan ${source} requires a non-empty string id`);
  }
  if (!("entries" in parsed) || !Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error(`Bulk plan ${source} requires at least one entry`);
  }

  const entries = parsed.entries.map((raw, position) => {
    if (!raw || typeof raw !== "object") {
      throw new Error(
        `Bulk plan ${source} entry ${position} requires competition, fromSeason, and toSeason`,
      );
    }
    const competition =
      "competition" in raw && typeof raw.competition === "string" ? raw.competition.trim() : "";
    const fromSeason =
      "fromSeason" in raw && typeof raw.fromSeason === "string" ? raw.fromSeason.trim() : "";
    const toSeason =
      "toSeason" in raw && typeof raw.toSeason === "string" ? raw.toSeason.trim() : "";
    if (!competition || !fromSeason || !toSeason) {
      throw new Error(
        `Bulk plan ${source} entry ${position} requires competition, fromSeason, and toSeason`,
      );
    }
    return { competition, fromSeason, toSeason };
  });

  return { id, entries };
}

export async function loadBulkPlan(filePath: string): Promise<BulkPlan> {
  return parseBulkPlan(await readFile(filePath, "utf8"), filePath);
}

async function isExistingFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

export type BulkCliRequest =
  | { command: "run"; plan: BulkPlan }
  | { command: "run-plan-file"; planFile: string }
  | { command: "status"; target: string };

export interface RunBulkFromCliOptions {
  request: BulkCliRequest;
  lane: Lane;
  fetchAdapter: FetchAdapter;
  databaseUrl?: string;
  stateDir?: string;
  portraitStore?: PortraitStore;
}

export interface BulkCliResult {
  command: "run" | "status";
  planId: string;
  lane: Lane;
  checkpointFile: string;
  plan?: BulkPlan;
  summary: BulkSummary;
}

export async function runBulkFromCli(options: RunBulkFromCliOptions): Promise<BulkCliResult> {
  if (options.request.command === "status") {
    const target = options.request.target;
    const planId = (await isExistingFile(target)) ? (await loadBulkPlan(target)).id : target;
    const checkpointFile = bulkCheckpointPath(planId, options.stateDir);
    const checkpoint = createJsonlBulkCheckpoint(checkpointFile);
    return {
      command: "status",
      planId,
      lane: options.lane,
      checkpointFile,
      summary: summarizeBulkRecords(planId, await checkpoint.read()),
    };
  }

  const plan =
    options.request.command === "run"
      ? options.request.plan
      : await loadBulkPlan(options.request.planFile);

  const lane = parseLane(options.lane);
  const databaseUrl = options.databaseUrl ?? resolveDatabaseUrl(lane);
  const checkpointFile = bulkCheckpointPath(plan.id, options.stateDir);
  const checkpoint = createJsonlBulkCheckpoint(checkpointFile);

  const { createDb, SEED_CREATE_DB_OPTIONS } = await import("@kit/db");
  const { db, pool } = createDb(databaseUrl, SEED_CREATE_DB_OPTIONS);
  try {
    const deps = await createDefaultBulkDeps({
      db,
      fetchAdapter: options.fetchAdapter,
      checkpoint,
      portraitStore: options.portraitStore,
    });
    const summary = await runBulk(plan, deps);
    return { command: "run", planId: plan.id, lane, checkpointFile, plan, summary };
  } finally {
    await pool.end();
  }
}
