// The landing after an approval: a record per approved issue in the plugin's kv, and a driver that
// runs the repo's landing script on the runs machine through the host bundle, one slice at a time,
// and writes the phase each verdict says. The phase comes from the exit code and the verdict line,
// never from a model.
import type { LandStep, ScriptResult } from "../host-contract.js";
import type { InboxListCardDto, LandingPhase } from "./contract.js";

const PREFIX = "landing:";
/** The longest reason a stop hands to the script. */
const REASON_MAX = 900;
/** How long a landing waits after a slice and its hand-over both failed before it is tried again. */
export const RETRY_WAIT_MS = 5 * 60_000;

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
  /** What the last slice said: the verdict without its tag, or why Optio could not run it. */
  line: string | null;
  approvedAt: string;
  at: string;
  /** After a slice whose hand-over failed too: no driver starts before this time (ISO). */
  retryAt?: string;
}

/** The step the landing script takes next from a phase; null when the landing is over. */
export function nextStep(phase: LandingPhase): "start" | "finish" | null {
  if (phase === "approved") return "start";
  return phase === "queued" || phase === "merged" ? "finish" : null;
}

/** A landing script verdict line: `<KIND> (land-approved): <text>`; null for any other line. */
export function parseVerdict(line: string): { kind: string; text: string } | null {
  const match = /^([A-Z]+) \(land-approved\): (.*)$/.exec(line.trim());
  return match === null ? null : { kind: match[1] ?? "", text: match[2] ?? "" };
}

/**
 * What one slice means for the landing: a phase to write (`stopped` when the script handed the issue
 * to a person), `over` when the script refused because the issue is not landing any more (a person
 * moved it on, so nothing is written), or `failed` when nobody was told and Optio must hand it over.
 */
export type SliceOutcome =
  | { kind: "phase"; phase: LandingPhase; line: string }
  | { kind: "over"; line: string }
  | { kind: "failed"; why: string };

export function outcomeOf(
  step: LandStep,
  result: Pick<ScriptResult, "exitCode" | "lastLine">,
): SliceOutcome {
  const verdict = parseVerdict(result.lastLine);
  const kind = verdict?.kind;
  const text = verdict?.text ?? "";
  if (result.exitCode === 0 && step === "start" && kind === "QUEUED") {
    return { kind: "phase", phase: "queued", line: text };
  }
  if (result.exitCode === 0 && step === "finish" && kind === "LANDED") {
    return { kind: "phase", phase: "done", line: text };
  }
  if (result.exitCode === 3 && kind === "WAITING" && step !== "stop") {
    const phase = /^(approved|queued|merged): /.exec(text)?.[1];
    if (phase === "approved" || phase === "queued" || phase === "merged") {
      return { kind: "phase", phase, line: text };
    }
  }
  if (result.exitCode === 1 && kind === "STOPPED") {
    return { kind: "phase", phase: "stopped", line: text };
  }
  if (result.exitCode === 1 && kind === "REFUSED") return { kind: "over", line: text };
  const said = verdict === null ? result.lastLine.trim() : text;
  return {
    kind: "failed",
    why: `the landing script answered exit ${result.exitCode}${said === "" ? "" : `: ${said}`}`,
  };
}

/** A landing record as its own card, for an issue that is not in the Inbox state: no Inbox action. */
export function landingCard(record: LandingRecord, verdict: string | null): InboxListCardDto {
  return {
    // The issue's own id, as on its review card: an open card stays open once it is approved.
    id: record.identifier,
    identifier: record.identifier,
    title: record.title,
    url: record.url,
    pullRequest: record.pullRequest,
    kind: "landing",
    label: null,
    choices: [],
    waiting: null,
    review: { verdict, change: record.change },
    mention: null,
    alarm: null,
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
  /** One slice of the landing script on a machine. A thrown call means the machine did not answer. */
  runLand: (
    hostId: string,
    input: { cwd: string; step: LandStep; pr: number; issue: string; reason?: string },
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

  /** One slice on the record's machine; a call that throws is a failure with its message. */
  async function slice(record: LandingRecord, step: LandStep, reason?: string) {
    try {
      const result = await deps.runLand(record.hostId, {
        cwd: record.checkout,
        step,
        pr: record.pullRequest.number,
        issue: record.identifier,
        ...(reason === undefined ? {} : { reason: reason.slice(0, REASON_MAX) }),
      });
      return outcomeOf(step, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { kind: "failed", why: `the runs machine did not answer: ${message}` } as const;
    }
  }

  /**
   * What the record becomes after a slice: the phase it says, removed when the issue moved on, or,
   * when the slice failed with nobody told, the script's `stop` with the reason. When that fails too
   * the phase stays as it was with the reason on the card, and the driver ends: the first read of the
   * Inbox after the wait (`RETRY_WAIT_MS`) starts it again, so the slice is tried again.
   */
  async function settleSlice(record: LandingRecord, outcome: SliceOutcome) {
    if (outcome.kind !== "failed") return { outcome, retryLater: false };
    const handed = await slice(record, "stop", outcome.why);
    if (handed.kind !== "failed") return { outcome: handed, retryLater: false };
    return {
      outcome: {
        kind: "phase",
        phase: record.phase,
        line: `${outcome.why}; the hand-over failed too (${handed.why}), so the first read of the Inbox after ${RETRY_WAIT_MS / 60_000} minutes tries again`,
      } satisfies SliceOutcome,
      retryLater: true,
    };
  }

  /** Runs slices until the landing is done, stopped or over. Safe to call again: one driver per issue. */
  async function drive(identifier: string): Promise<void> {
    if (live.has(identifier)) return;
    live.add(identifier);
    try {
      for (;;) {
        const record = await get(identifier);
        const step = record === undefined ? null : nextStep(record.phase);
        if (record === undefined || step === null) return;
        const { outcome, retryLater } = await settleSlice(record, await slice(record, step));
        // A record removed or replaced while the slice ran is not overwritten.
        const current = await get(identifier);
        if (current === undefined || current.approvedAt !== record.approvedAt) return;
        if (outcome.kind === "over") {
          deps.log(`landing ${identifier} is over, the issue moved on: ${outcome.line}`);
          await remove(identifier);
        } else {
          const { phase, line } = outcome;
          const now = deps.now();
          const { retryAt: _, ...rest } = current;
          await save({
            ...rest,
            phase,
            line,
            at: new Date(now).toISOString(),
            // The page reads the Inbox again on `changed`; the wait keeps that read from retrying at once.
            ...(retryLater ? { retryAt: new Date(now + RETRY_WAIT_MS).toISOString() } : {}),
          });
        }
        deps.changed();
        if (retryLater || outcome.kind === "over") return;
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

  /**
   * Starts a driver for every landing that is not over, has none and is not waiting to be tried
   * again, as after a plugin reload or once a failed slice's wait is over.
   */
  function resume(records: LandingRecord[]): void {
    const now = deps.now();
    for (const record of records) {
      const waiting = record.retryAt !== undefined && Date.parse(record.retryAt) > now;
      if (nextStep(record.phase) !== null && !live.has(record.identifier) && !waiting) {
        start(record.identifier);
      }
    }
  }

  return { all, begin, resume, remove };
}
