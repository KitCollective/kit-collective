import type { VisionJobResponse } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import {
  capFirstSessionPhotos,
  classifyVisionJob,
  visionResolvedRows,
  visionReveal,
} from "../src/first-session/vision-result";

const JOB_ID = "6f0c1e1c-6f0c-4f0c-8f0c-6f0c1e1c6f0c";

function job(partial: Partial<VisionJobResponse>): VisionJobResponse {
  return { jobId: JOB_ID, status: "ready", ...partial };
}

describe("own-photo Vision outcome", () => {
  it("a pending job keeps waiting", () => {
    expect(classifyVisionJob(job({ status: "pending" }))).toEqual({ kind: "pending" });
  });

  it("a ready job shows club, season and type rows in Danish", () => {
    const outcome = classifyVisionJob(
      job({ suggestions: { clubLabel: "FC København", seasonLabel: "2023/24", type: "away" } }),
    );

    expect(outcome.kind).toBe("ready");
    if (outcome.kind === "ready") {
      expect(outcome.rows.club).toBe("FC København");
      expect(outcome.rows.season).toBe("2023/24");
      expect(outcome.rows.type).toMatch(/\S/);
    }
  });

  it("a national team fills the club row", () => {
    const outcome = classifyVisionJob(
      job({ suggestions: { nationalTeamLabel: "Danmark", type: "home" } }),
    );

    expect(outcome.kind).toBe("ready");
    if (outcome.kind === "ready") {
      expect(outcome.rows.club).toBe("Danmark");
      expect(outcome.rows.season).toBeUndefined();
    }
  });

  it("failed, noop, missing and empty suggestions all mean Vision could not recognise it", () => {
    expect(classifyVisionJob(job({ status: "failed" }))).toEqual({ kind: "failed" });
    expect(classifyVisionJob(job({ status: "noop" }))).toEqual({ kind: "failed" });
    expect(classifyVisionJob(job({ status: "ready" }))).toEqual({ kind: "failed" });
    expect(classifyVisionJob(job({ status: "ready", suggestions: {} }))).toEqual({
      kind: "failed",
    });
  });

  it("found rows resolve one at a time in demo order and leave out rows Vision did not find", () => {
    const reveal = visionReveal({ club: "A", type: "Hjemme" });

    expect(reveal.rowAtMs.club).toBe(0);
    expect(reveal.rowAtMs.season).toBeUndefined();
    expect(reveal.rowAtMs.type).toBeGreaterThan(0);
    expect(visionResolvedRows(reveal, 0)).toEqual(["club"]);
    expect(visionResolvedRows(reveal, reveal.doneAtMs)).toEqual(["club", "type"]);
    expect(reveal.doneAtMs).toBeGreaterThan(reveal.rowAtMs.type ?? 0);
  });

  it("the own-photo road keeps at most three photos", () => {
    expect(capFirstSessionPhotos(["a", "b", "c", "d", "e"])).toEqual(["a", "b", "c"]);
    expect(capFirstSessionPhotos(["a"])).toEqual(["a"]);
  });
});
