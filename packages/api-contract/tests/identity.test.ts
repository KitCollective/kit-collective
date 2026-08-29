import { describe, expect, it } from "vitest";
import {
  collectionJerseysSchema,
  identityCredentialsSchema,
  identitySessionSchema,
} from "../src/index.js";

describe("identityCredentialsSchema", () => {
  it("accepts email and password", () => {
    expect(
      identityCredentialsSchema.parse({
        email: "collector@example.com",
        password: "password123",
      }),
    ).toEqual({
      email: "collector@example.com",
      password: "password123",
    });
  });

  it("rejects short passwords", () => {
    expect(() =>
      identityCredentialsSchema.parse({
        email: "collector@example.com",
        password: "short",
      }),
    ).toThrow();
  });
});

describe("identitySessionSchema", () => {
  it("accepts access token and user", () => {
    const session = {
      accessToken: "jwt-token",
      user: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "collector@example.com",
        role: "user" as const,
        handle: "collector",
        aboutMe: null,
        avatarUrl: null,
      },
    };
    expect(identitySessionSchema.parse(session)).toEqual(session);
  });
});

describe("collectionJerseysSchema", () => {
  it("accepts an empty jersey list", () => {
    expect(collectionJerseysSchema.parse({ jerseys: [] })).toEqual({ jerseys: [] });
  });
});
