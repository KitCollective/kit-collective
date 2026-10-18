import type { VisionJobResponse, VisionSuggestRequest } from "@kit/api-contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisionRequestError } from "../src/api/vision";
import { IDENTITY_TIMEOUT_ERROR } from "../src/capture/identityDraftQueue";
import { IDENTITY_PHOTOS_EMPTY } from "../src/capture/identitySuggestRequest";
import { type IdentityReadDeps, runIdentityRead } from "../src/capture/use-confirm-vision";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

const DRAFT = "draft-1";
const JOB = "550e8400-e29b-41d4-a716-446655440010";
const PREFIX = `[identity] ${DRAFT}:`;

const request: VisionSuggestRequest = {
  draftId: DRAFT,
  photos: [{ role: "front", contentBase64: "AAAA" }],
};
const pending: VisionJobResponse = { jobId: JOB, status: "pending" };
const ready: VisionJobResponse = {
  jobId: JOB,
  status: "ready",
  suggestions: { clubLabel: "FC Barcelona", type: "home" },
};

function harness(overrides: Partial<IdentityReadDeps> = {}) {
  const events: string[] = [];
  const deps = {
    draftId: DRAFT,
    buildRequest: vi.fn(async () => request),
    startJob: vi.fn(async (_payload: VisionSuggestRequest): Promise<string | null> => JOB),
    fetchJob: vi.fn(async (_jobId: string) => ready),
    onJobStarted: vi.fn((jobId: string) => {
      events.push(`onJobStarted ${jobId}`);
    }),
    applyReady: vi.fn(async (job: VisionJobResponse) => {
      events.push(`applyReady ${job.status}`);
    }),
    settleIdle: vi.fn(() => {
      events.push("settleIdle");
    }),
    log: {
      info: vi.fn((line: string) => {
        events.push(`info ${line}`);
      }),
      error: vi.fn((line: string) => {
        events.push(`error ${line}`);
      }),
    },
    ...overrides,
  };
  return { deps, events };
}

async function run(deps: IdentityReadDeps, advanceMs = 0): Promise<void> {
  const done = runIdentityRead(deps);
  await vi.advanceTimersByTimeAsync(advanceMs);
  await done;
}

function errorLines(events: string[]): string[] {
  return events.filter((event) => event.startsWith("error "));
}

describe("runIdentityRead outcome lines", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs request built, job started and job ready on the happy path", async () => {
    const { deps, events } = harness();
    await run(deps);

    expect(events).toEqual([
      `info ${PREFIX} request built, 1 photo(s) in 0 ms`,
      `info ${PREFIX} job ${JOB} started`,
      `onJobStarted ${JOB}`,
      `info ${PREFIX} job ${JOB} ready`,
      "applyReady ready",
    ]);
    expect(deps.applyReady).toHaveBeenCalledTimes(1);
    expect(deps.applyReady).toHaveBeenCalledWith(ready);
    expect(deps.settleIdle).not.toHaveBeenCalled();
  });

  it("names the build stage and the code before settling idle when the photos are empty", async () => {
    const { deps, events } = harness({
      buildRequest: vi.fn(async () => {
        throw new Error(IDENTITY_PHOTOS_EMPTY);
      }),
    });
    await run(deps);

    expect(errorLines(events)).toEqual([
      `error ${PREFIX} lost at build after 0 ms: ${IDENTITY_PHOTOS_EMPTY}`,
    ]);
    expect(events.indexOf(errorLines(events)[0] ?? "")).toBeLessThan(events.indexOf("settleIdle"));
    expect(deps.settleIdle).toHaveBeenCalledTimes(1);
    expect(deps.startJob).not.toHaveBeenCalled();
  });

  it("names the start stage and the HTTP status before settling idle when the POST fails", async () => {
    const { deps, events } = harness({
      startJob: vi.fn(async () => {
        throw new VisionRequestError("Kunne ikke starte Vision", 500);
      }),
    });
    await run(deps);

    expect(errorLines(events)).toEqual([`error ${PREFIX} lost at start after 0 ms: HTTP 500`]);
    expect(events.indexOf(errorLines(events)[0] ?? "")).toBeLessThan(events.indexOf("settleIdle"));
    expect(deps.settleIdle).toHaveBeenCalledTimes(1);
    expect(deps.fetchJob).not.toHaveBeenCalled();
  });

  it("still lands a read whose photo prepare took 44 s", async () => {
    let polls = 0;
    const { deps } = harness({
      buildRequest: vi.fn(
        () =>
          new Promise<VisionSuggestRequest>((resolve) => {
            setTimeout(() => resolve(request), 44_000);
          }),
      ),
      fetchJob: vi.fn(async () => {
        polls += 1;
        return polls === 1 ? pending : ready;
      }),
    });
    await run(deps, 50_000);

    expect(deps.fetchJob).toHaveBeenCalledTimes(2);
    expect(deps.applyReady).toHaveBeenCalledTimes(1);
    expect(deps.applyReady).toHaveBeenCalledWith(ready);
    expect(deps.settleIdle).not.toHaveBeenCalled();
    expect(deps.log.info).toHaveBeenCalledWith(`${PREFIX} request built, 1 photo(s) in 44000 ms`);
  });

  it("frees the queue after the build budget when photo prepare hangs", async () => {
    const { deps, events } = harness({
      buildRequest: vi.fn(() => new Promise<VisionSuggestRequest>(() => {})),
    });
    await run(deps, 45_000);

    expect(errorLines(events)).toEqual([
      `error ${PREFIX} lost at build after 45000 ms: ${IDENTITY_TIMEOUT_ERROR}`,
    ]);
    expect(events.at(-1)).toBe("settleIdle");
    expect(deps.startJob).not.toHaveBeenCalled();
  });

  it("names the job still pending when the job budget runs out", async () => {
    const { deps, events } = harness({ fetchJob: vi.fn(async () => pending) });
    await run(deps, 46_000);

    expect(errorLines(events)).toEqual([
      `error ${PREFIX} lost at poll after 45000 ms: ${IDENTITY_TIMEOUT_ERROR} (job ${JOB} still pending)`,
    ]);
    expect(events.at(-1)).toBe("settleIdle");
    expect(deps.applyReady).not.toHaveBeenCalled();
  });

  it("logs a failed job as an error and settles idle", async () => {
    const { deps, events } = harness({
      fetchJob: vi.fn(async () => ({ jobId: JOB, status: "failed" as const })),
    });
    await run(deps);

    expect(errorLines(events)).toEqual([`error ${PREFIX} job ${JOB} failed`]);
    expect(events.at(-1)).toBe("settleIdle");
    expect(deps.applyReady).not.toHaveBeenCalled();
  });

  it("names the apply stage when landing the ready job throws", async () => {
    const { deps, events } = harness({
      applyReady: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    await run(deps);

    expect(errorLines(events)).toEqual([`error ${PREFIX} lost at apply after 0 ms: boom`]);
    expect(events.at(-1)).toBe("settleIdle");
  });

  it("settles idle without an error line when Premium is declined", async () => {
    const { deps, events } = harness({ startJob: vi.fn(async () => null) });
    await run(deps);

    expect(events).toEqual([
      `info ${PREFIX} request built, 1 photo(s) in 0 ms`,
      `info ${PREFIX} Premium declined, no job`,
      "settleIdle",
    ]);
    expect(deps.fetchJob).not.toHaveBeenCalled();
    expect(deps.onJobStarted).not.toHaveBeenCalled();
  });
});
