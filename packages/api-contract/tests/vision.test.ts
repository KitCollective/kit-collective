import {
  type VisionJobResponse,
  type VisionLogRequest,
  type VisionSuggestRequest,
  visionJobResponseSchema,
  visionLogRequestSchema,
  visionSuggestRequestSchema,
  visionSuggestResponseSchema,
} from "@kit/api-contract";
import { describe, expect, it } from "vitest";

describe("vision contract", () => {
  it("parses suggest request and response", () => {
    const request: VisionSuggestRequest = {
      draftId: "11111111-1111-1111-1111-111111111111",
      photo: { role: "front", contentBase64: "abc123" },
    };
    expect(visionSuggestRequestSchema.parse(request)).toEqual(request);

    const response = visionSuggestResponseSchema.parse({
      jobId: "22222222-2222-2222-2222-222222222222",
    });
    expect(response.jobId).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("parses job response with catalog UUID suggestions only", () => {
    const job: VisionJobResponse = {
      jobId: "22222222-2222-2222-2222-222222222222",
      status: "ready",
      suggestions: {
        clubId: "33333333-3333-3333-3333-333333333333",
        seasonId: "44444444-4444-4444-4444-444444444444",
        type: "home",
        clubLabel: "F.C. København",
        seasonLabel: "2023/24",
      },
    };
    const parsed = visionJobResponseSchema.parse(job);
    expect(parsed.suggestions?.clubId).toBe(job.suggestions?.clubId);
    expect(parsed.suggestions?.clubLabel).toBe("F.C. København");
  });

  it("parses job response with preselect flag", () => {
    const job: VisionJobResponse = {
      jobId: "22222222-2222-2222-2222-222222222222",
      status: "ready",
      preselect: false,
      suggestions: {
        clubId: "33333333-3333-3333-3333-333333333333",
        clubLabel: "F.C. København",
      },
    };
    expect(visionJobResponseSchema.parse(job).preselect).toBe(false);
  });

  it("parses vision log request", () => {
    const body: VisionLogRequest = {
      jobId: "22222222-2222-2222-2222-222222222222",
      action: "accepted",
      userJerseyId: "55555555-5555-5555-5555-555555555555",
    };
    expect(visionLogRequestSchema.parse(body)).toEqual(body);
  });
});
