import { describe, expect, it } from "vitest";
import { authSecurityDetectionsSchema } from "../src/index.js";

describe("authSecurityDetectionsSchema", () => {
  it("accepts Auth security detections for Auth ops", () => {
    expect(
      authSecurityDetectionsSchema.parse({
        detections: [
          {
            id: "550e8400-e29b-41d4-a716-446655440010",
            kind: "credential_stuffing",
            userId: null,
            summary: "Credential stuffing",
            detectedAt: "2026-09-01T12:00:00.000Z",
          },
        ],
      }),
    ).toEqual({
      detections: [
        {
          id: "550e8400-e29b-41d4-a716-446655440010",
          kind: "credential_stuffing",
          userId: null,
          summary: "Credential stuffing",
          detectedAt: "2026-09-01T12:00:00.000Z",
        },
      ],
    });
  });
});
