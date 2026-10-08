import {
  VISION_CONFIDENCE_PRESELECT,
  VISION_CONFIDENCE_SUGGEST,
  type VisionGroupingSuggestRequest,
  type VisionJobResponse,
  visionGroupingSuggestionsSchema,
  visionGroupingSuggestRequestSchema,
  visionJobResponseSchema,
  visionSuggestResponseSchema,
} from "@kit/api-contract";
import { describe, expect, it } from "vitest";

const PHOTO_A = "11111111-1111-1111-1111-111111111111";
const PHOTO_B = "22222222-2222-2222-2222-222222222222";
const PHOTO_C = "33333333-3333-3333-3333-333333333333";
const JOB_ID = "44444444-4444-4444-4444-444444444444";

describe("vision grouping contract", () => {
  it("parses grouping suggest request with stable photoIds", () => {
    const request: VisionGroupingSuggestRequest = {
      sessionId: "55555555-5555-5555-5555-555555555555",
      photos: [
        { photoId: PHOTO_A, contentBase64: "abc123" },
        { photoId: PHOTO_B, contentBase64: "def456" },
      ],
    };
    expect(visionGroupingSuggestRequestSchema.parse(request)).toEqual(request);
  });

  it("parses grouping suggest request with priorGroups for an incremental pass", () => {
    const request: VisionGroupingSuggestRequest = {
      sessionId: "55555555-5555-5555-5555-555555555555",
      photos: [{ photoId: PHOTO_C, contentBase64: "ghi789" }],
      priorGroups: [{ photoIds: [PHOTO_A, PHOTO_B] }],
    };
    expect(visionGroupingSuggestRequestSchema.parse(request)).toEqual(request);
  });

  it("parses grouping job response with photoId groups", () => {
    const job: VisionJobResponse = {
      jobId: JOB_ID,
      status: "ready",
      kind: "grouping",
      preselect: true,
      grouping: {
        groups: [
          { photoIds: [PHOTO_A, PHOTO_B], confidence: 85 },
          { photoIds: [PHOTO_C], confidence: 80 },
        ],
      },
    };
    const parsed = visionJobResponseSchema.parse(job);
    expect(parsed.kind).toBe("grouping");
    expect(parsed.grouping?.groups).toHaveLength(2);
    expect(parsed.grouping?.groups[0]?.photoIds).toEqual([PHOTO_A, PHOTO_B]);
  });

  it("parses suggest-only grouping at 50–69% confidence", () => {
    const job: VisionJobResponse = {
      jobId: JOB_ID,
      status: "ready",
      kind: "grouping",
      preselect: false,
      grouping: {
        groups: [{ photoIds: [PHOTO_A, PHOTO_B], confidence: 55 }],
      },
    };
    const parsed = visionJobResponseSchema.parse(job);
    expect(parsed.preselect).toBe(false);
    expect(parsed.grouping?.groups[0]?.confidence).toBe(55);
  });

  it("exports confidence thresholds for grouping", () => {
    expect(VISION_CONFIDENCE_PRESELECT).toBe(70);
    expect(VISION_CONFIDENCE_SUGGEST).toBe(50);
  });

  it("parses grouping suggestions schema", () => {
    const grouping = visionGroupingSuggestionsSchema.parse({
      groups: [{ photoIds: [PHOTO_A] }],
    });
    expect(grouping.groups).toHaveLength(1);
  });

  it("parses suggest response unchanged for grouping jobs", () => {
    const response = visionSuggestResponseSchema.parse({ jobId: JOB_ID });
    expect(response.jobId).toBe(JOB_ID);
  });
});
