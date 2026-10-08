import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  mapFkaTypeLabel,
  parseFkaKitPageHtml,
  parseFkaSeasonIndexKitUrls,
} from "../src/listing-fka-html.js";

const fixtureHtml = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../fixtures/fka-fc-copenhagen-2010-11-home-kit.html",
  ),
  "utf8",
);

describe("FKA kit page HTML", () => {
  it("parses facts, extra flat images, and the long description", () => {
    const parsed = parseFkaKitPageHtml(fixtureHtml);
    expect(parsed).toEqual({
      type: "home",
      manufacturerName: "Kappa",
      sponsorName: "Carlsberg",
      design: "Plain",
      colorNames: "White / Black / Blue",
      primaryColorHex: "FFFFFF",
      secondaryColorHex: "000000",
      competition: "Superliga",
      releasedOn: "2010-07-01",
      description:
        "The Kappa FC Copenhagen 2010-11 home shirt was worn with Carlsberg on the chest. The club played Superliga in white, black and blue.",
      imageUrl: "https://cdn.footballkitarchive.com/2021/07/04/6BRVH8Hy1F8md50.jpg",
      extraImageUrls: [
        "https://cdn.footballkitarchive.com/2021/07/04/extraFront.jpg",
        "https://cdn.footballkitarchive.com/2021/07/04/extraBack.jpg",
        "https://cdn.footballkitarchive.com/2021/07/04/extraDetail.jpg",
      ],
      canonicalUrl: "https://www.footballkitarchive.com/fc-copenhagen-2010-11-home-kit/",
    });
  });

  it("maps Fourth, cup homes, and CL remainder, and still drops training", () => {
    expect(mapFkaTypeLabel("Fourth")).toBe("fourth");
    expect(mapFkaTypeLabel("GK Fourth")).toBe("gk");
    expect(mapFkaTypeLabel("Supercoppa Italiana")).toBe("special");
    expect(mapFkaTypeLabel("Supercoppa Italiana Home")).toBe("home");
    expect(mapFkaTypeLabel("Champions League Home")).toBe("home");
    expect(mapFkaTypeLabel("Training")).toBeUndefined();
    expect(mapFkaTypeLabel("Pre-season")).toBeUndefined();
    expect(mapFkaTypeLabel("Pre-match")).toBeUndefined();
  });

  it("reads match-kit hrefs from a season index and skips training", () => {
    const html = `
      <a href="/fc-copenhagen-2010-11-home-kit/">Home</a>
      <a href="https://www.footballkitarchive.com/fc-copenhagen-2010-11-european-home-kit/31573/">European</a>
      <a href="/fc-copenhagen-2010-11-training-kit/">Training</a>
      <a href="/fc-copenhagen-2010-11-kits/">Index</a>
    `;
    expect(parseFkaSeasonIndexKitUrls(html, "fc-copenhagen", "2010-11")).toEqual([
      "https://www.footballkitarchive.com/fc-copenhagen-2010-11-home-kit/",
      "https://www.footballkitarchive.com/fc-copenhagen-2010-11-european-home-kit/31573/",
    ]);
  });
});
