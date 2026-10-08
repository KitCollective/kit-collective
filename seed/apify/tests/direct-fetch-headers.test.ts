import { describe, expect, it } from "vitest";
import { directTransfermarktRequestHeaders } from "../src/fetch/kader-fetch-adapter.js";

describe("direct Transfermarkt request headers", () => {
  it("uses a browser User-Agent so Desktop GETs are not 502d as a named bot", () => {
    const headers = directTransfermarktRequestHeaders();
    expect(headers["User-Agent"]).toMatch(/^Mozilla\/5\.0 /);
    expect(headers["User-Agent"]).not.toMatch(/KitCollective-Seed/);
  });
});
