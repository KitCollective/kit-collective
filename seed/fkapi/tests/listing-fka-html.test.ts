import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapFkaTypeLabel, parseFkaKitPageHtml } from "../src/listing-fka-html.js";

const fixtureHtml = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../fixtures/fka-fc-copenhagen-2010-11-home-kit.html",
  ),
  "utf8",
);

describe("FKA kit page HTML", () => {
  it("parses Home type, Kappa, Carlsberg, and archive JPEG URL", () => {
    const parsed = parseFkaKitPageHtml(fixtureHtml);
    expect(parsed).toEqual({
      type: "home",
      manufacturerName: "Kappa",
      sponsorName: "Carlsberg",
      imageUrl: "https://cdn.footballkitarchive.com/2021/07/04/6BRVH8Hy1F8md50.jpg",
      canonicalUrl: "https://www.footballkitarchive.com/fc-copenhagen-2010-11-home-kit/",
    });
  });

  it("drops training kits", () => {
    expect(mapFkaTypeLabel("Training")).toBeUndefined();
    expect(mapFkaTypeLabel("Champions League Home")).toBeUndefined();
  });
});
