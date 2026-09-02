import { describe, expect, it } from "vitest";
import { authEventsSchema } from "../src/index.js";

describe("authEventsSchema", () => {
  it("accepts own Auth events", () => {
    expect(
      authEventsSchema.parse({
        events: [
          {
            id: "550e8400-e29b-41d4-a716-446655440000",
            kind: "login",
            userId: "550e8400-e29b-41d4-a716-446655440001",
            provider: null,
            createdAt: "2026-09-01T20:00:00.000Z",
          },
        ],
      }),
    ).toEqual({
      events: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          kind: "login",
          userId: "550e8400-e29b-41d4-a716-446655440001",
          provider: null,
          createdAt: "2026-09-01T20:00:00.000Z",
        },
      ],
    });
  });
});
