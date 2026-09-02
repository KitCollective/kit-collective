import { describe, expect, it } from "vitest";
import { identitySocialLoginSchema } from "../src/index.js";

describe("identitySocialLoginSchema", () => {
  it("accepts google and facebook id tokens", () => {
    expect(
      identitySocialLoginSchema.parse({
        provider: "google",
        idToken: "test:google:verified:collector@example.com:gid-1",
      }),
    ).toEqual({
      provider: "google",
      idToken: "test:google:verified:collector@example.com:gid-1",
    });

    expect(
      identitySocialLoginSchema.parse({
        provider: "facebook",
        idToken: "test:facebook:unverified:collector@example.com:fid-1:Display Name",
      }),
    ).toEqual({
      provider: "facebook",
      idToken: "test:facebook:unverified:collector@example.com:fid-1:Display Name",
    });
  });

  it("rejects unknown providers and empty tokens", () => {
    expect(() =>
      identitySocialLoginSchema.parse({
        provider: "apple",
        idToken: "token",
      }),
    ).toThrow();

    expect(() =>
      identitySocialLoginSchema.parse({
        provider: "google",
        idToken: "",
      }),
    ).toThrow();
  });
});
