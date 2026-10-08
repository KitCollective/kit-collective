import { describe, expect, it } from "vitest";
import { describeSeedError, safeSeedUrl } from "../src/progress.js";

describe("describeSeedError", () => {
  it("explains circuit open", () => {
    const error = Object.assign(new Error("stopped"), { name: "TransfermarktCircuitOpenError" });
    expect(describeSeedError(error)).toContain("circuit open");
    expect(describeSeedError(error)).toContain("direct");
  });

  it("explains HTTP 403 without leaking userinfo", () => {
    const error = Object.assign(new Error("Transfermarkt HTTP 403"), {
      name: "TransfermarktHttpError",
      status: 403,
      url: "https://user:secret@www.transfermarkt.com/kader/verein/11",
    });
    const text = describeSeedError(error);
    expect(text).toContain("HTTP 403");
    expect(text).toContain("www.transfermarkt.com/kader/verein/11");
    expect(text).not.toContain("secret");
  });

  it("passes through other Error messages", () => {
    expect(describeSeedError(new Error("FKApi fetch requires FKAPI_BASE_URL"))).toBe(
      "FKApi fetch requires FKAPI_BASE_URL",
    );
  });
});

describe("safeSeedUrl", () => {
  it("keeps host and path only", () => {
    expect(safeSeedUrl("https://www.transfermarkt.com/foo/bar?x=1")).toBe(
      "www.transfermarkt.com/foo/bar",
    );
  });
});
