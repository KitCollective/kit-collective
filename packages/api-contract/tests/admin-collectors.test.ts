import { describe, expect, it } from "vitest";
import {
  adminCollectorJerseyDrillSchema,
  adminCollectorListSchema,
  adminCollectorUserSchema,
  adminRoleUpdateRequestSchema,
  identityRoleErrorSchema,
} from "../src/index.js";

describe("adminCollectorListSchema", () => {
  it("accepts collector rows without passwordHash", () => {
    const list = {
      total: 1,
      rows: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          email: "collector@example.com",
          role: "user" as const,
          jerseyCount: 2,
          createdAt: "2026-08-23T00:00:00.000Z",
          monogram: "CO",
        },
      ],
    };
    expect(adminCollectorListSchema.parse(list)).toEqual(list);
  });

  it("rejects passwordHash on collector rows", () => {
    expect(() =>
      adminCollectorListSchema.parse({
        total: 1,
        rows: [
          {
            id: "550e8400-e29b-41d4-a716-446655440000",
            email: "collector@example.com",
            role: "user",
            jerseyCount: 0,
            createdAt: "2026-08-23T00:00:00.000Z",
            monogram: "CO",
            passwordHash: "secret",
          },
        ],
      }),
    ).toThrow();
  });
});

describe("adminCollectorJerseyDrillSchema", () => {
  it("accepts admin photo paths", () => {
    const drill = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      clubLabel: "FC Copenhagen",
      seasonLabel: "2024/25",
      type: "home" as const,
      size: "m" as const,
      condition: "used" as const,
      photos: [
        {
          id: "550e8400-e29b-41d4-a716-446655440002",
          role: "front" as const,
          photoPath:
            "/admin/collectors/550e8400-e29b-41d4-a716-446655440000/jerseys/550e8400-e29b-41d4-a716-446655440001/photos/550e8400-e29b-41d4-a716-446655440002",
        },
      ],
    };
    expect(adminCollectorJerseyDrillSchema.parse(drill)).toEqual(drill);
  });
});

describe("adminRoleUpdateRequestSchema", () => {
  it("accepts role updates", () => {
    expect(adminRoleUpdateRequestSchema.parse({ role: "admin" })).toEqual({ role: "admin" });
  });
});

describe("identityRoleErrorSchema", () => {
  it("accepts stable role guard errors", () => {
    const error = {
      code: "SELF_DEMOTE" as const,
      message: "You cannot demote your own Staff access.",
    };
    expect(identityRoleErrorSchema.parse(error)).toEqual(error);
  });
});

describe("adminCollectorUserSchema", () => {
  it("accepts a collector user drill", () => {
    const user = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      email: "collector@example.com",
      role: "user" as const,
      jerseyCount: 0,
      adminCount: 1,
      createdAt: "2026-08-23T00:00:00.000Z",
      monogram: "CO",
    };
    expect(adminCollectorUserSchema.parse(user)).toEqual(user);
  });
});
