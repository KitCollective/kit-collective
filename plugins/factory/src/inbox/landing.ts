// The landing after an approval: a record per approved issue in the plugin's kv, and a driver that
// runs the repo's landing script on the runs machine through the host bundle, one slice at a time,
// and writes the phase each verdict says. The phase comes from the exit code and the verdict line,
// never from a model.
import type { ScriptResult } from "../host-contract.js";
import type { InboxCardDto, LandingPhase } from "./contract.js";

const PREFIX = "landing:";

/** One approved issue on its way to done. */
export interface LandingRecord {
  identifier: string;
  title: string;
  url: string;
  pullRequest: { number: number; url: string };
  /** The pull request's title, for the card. */
  change: string | null;
  /** Where the landing script runs: the runs machine and its main checkout. */
  hostId: string;
  checkout: string;
  phase: LandingPhase;
  line: string | null;
  approvedAt: string;
  at: string;
}

/** The step the landing script takes next from a phase; null when the landing is over. */
export function nextStep(phase: LandingPhase): "start" | "finish" | null {
  if (phase === "approved") return "start";
  return phase === "queued" || phase === "merged" ? "finish" : null;
}

/**
 * The phase after one slice of the landing script: exit 0 is queued (start) or done (finish), exit 3
 * keeps waiting in the phase its line names, anything else stopped the landing.
 */
export function phaseAfter(
  step: "start" | "finish",
  result: Pick<ScriptResult, "exitCode" | "lastLine">,
): LandingPhase {
  if (result.exitCode === 0) {
    if (step === "start" && /^QUEUED \(land-approved\):/.test(result.lastLine)) return "queued";
    if (step === "finish" && /^LANDED \(land-approved\):/.test(result.lastLine)) return "done";
    return "stopped";
  }
  if (result.exitCode === 3) {
    const waiting = /^WAITING \(land-approved\): (approved|queued|merged):/.exec(result.lastLine);
    if (waiting?.[1] === "approved" || waiting?.[1] === "queued" || waiting?.[1] === "merged") {
      return waiting[1];
    }
    return step === "start" ? "approved" : "queued";
  }
  return "stopped";
}

/** A landing record as the Inbox card shows it when the issue is no longer in the Inbox state. */
export function landingCard(record: LandingRecord, verdict: string | null): InboxCardDto {
  return {
    identifier: record.identifier,
    title: record.title,
    url: record.url,
    pullRequest: record.pullRequest,
    kind: "review",
    label: null,
    choices: [],
    waiting: null,
    review: { verdict, change: record.change },
    since: record.approvedAt,
    landing: { phase: record.phase, line: record.line, at: record.at },
  };
}

export interface LandingDeps {
  kv: {
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
    list(prefix?: string): Promise<string[]>;
  };
  /** One slice of the landing script on a machine. A thrown call stops the landing with its message. */
  runLand: (
    hostId: string,
    input: { cwd: string; step: "start" | "finish"; pr: number; issue: string },
  ) => Promise<ScriptResult>;
  /** Tells open pages to read again. */
  changed: () => void;
  now: () => number;
  log: (message: string) => void;
}

export function createLandings(deps: LandingDeps) {
  /** The issues a driver is running for in this process; a reload starts with none. */
  const live = new Set<string>();

  const get = (identifier: string) => deps.kv.get<LandingRecord>(`${PREFIX}${identifier}`);
  const save = (record: LandingRecord) => deps.kv.set(`${PREFIX}${record.identifier}`, record);
  const remove = (identifier: string) => deps.kv.delete(`${PREFIX}${identifier}`);

  async function all(): Promise<LandingRecord[]> {
    const keys = await deps.kv.list(PREFIX);
    const records = await Promise.all(keys.map((key) => deps.kv.get<LandingRecord>(key)));
    return records.filter((record): record is LandingRecord => record !== undefined);
  }

  /** Runs slices until the landing is done or stopped. Safe to call again: one driver per issue. */
  async function drive(identifier: string): Promise<void> {
    if (live.has(identifier)) return;
    live.add(identifier);
    try {
      for (;;) {
        const record = await get(identifier);
        const step = record === undefined ? null : nextStep(record.phase);
        if (record === undefined || step === null) return;
        let next: Pick<LandingRecord, "phase" | "line">;
        try {
          const result = await deps.runLand(record.hostId, {
            cwd: record.checkout,
            step,
            pr: record.pullRequest.number,
            issue: identifier,
          });
          next = { phase: phaseAfter(step, result), line: result.lastLine };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          next = { phase: "stopped", line: `the runs machine did not answer: ${message}` };
        }
        // A record removed or replaced while the slice ran is not overwritten.
        const current = await get(identifier);
        if (current === undefined || current.approvedAt !== record.approvedAt) return;
        await save({ ...current, ...next, at: new Date(deps.now()).toISOString() });
        deps.changed();
      }
    } finally {
      live.delete(identifier);
    }
  }

  /** Starts a driver in the background; its failures go to the log. */
  function start(identifier: string): void {
    void drive(identifier).catch((error: unknown) =>
      deps.log(`landing ${identifier} failed: ${String(error)}`),
    );
  }

  /** Records a new landing (replacing an old one) and starts it. */
  async function begin(record: LandingRecord): Promise<void> {
    await save(record);
    start(record.identifier);
  }

  /** Starts a driver for every landing that is not over and has none, as after a plugin reload. */
  function resume(records: LandingRecord[]): void {
    for (const record of records) {
      if (nextStep(record.phase) !== null && !live.has(record.identifier)) start(record.identifier);
    }
  }

  return { all, begin, resume, remove, drive };
}
