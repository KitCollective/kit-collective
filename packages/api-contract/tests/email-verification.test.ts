import { describe, expect, it } from "vitest";
import {
  identityPasswordResetAcceptedSchema,
  identityPasswordResetCompleteSchema,
  identityPasswordResetRequestSchema,
  identityVerifyRequestSchema,
  identityVerifyResponseSchema,
} from "../src/index.js";

describe("email verification and password reset contract", () => {
  it("accepts a verify token and a verified response", () => {
    expect(identityVerifyRequestSchema.parse({ token: "abc" })).toEqual({ token: "abc" });
    expect(identityVerifyResponseSchema.parse({ emailVerified: true })).toEqual({
      emailVerified: true,
    });
  });

  it("accepts the same password-reset request shape for any email", () => {
    expect(identityPasswordResetRequestSchema.parse({ email: "a@example.com" })).toEqual({
      email: "a@example.com",
    });
    expect(identityPasswordResetAcceptedSchema.parse({ accepted: true })).toEqual({
      accepted: true,
    });
  });

  it("accepts reset complete with a new password", () => {
    expect(
      identityPasswordResetCompleteSchema.parse({
        token: "reset-token",
        password: "password123",
      }),
    ).toEqual({
      token: "reset-token",
      password: "password123",
    });
  });
});
