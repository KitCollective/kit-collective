import { describe, expect, it } from "vitest";
import {
  catalogMarkObjectKeyFromCdnUrl,
  clubCrestCdnUrl,
  clubCrestObjectKey,
  leagueBadgeCdnUrl,
  leagueBadgeObjectKey,
} from "../src/catalog-mark-cdn.js";

describe("catalog mark CDN keys", () => {
  it("builds club crest and league badge URLs from Transfermarkt ids", () => {
    expect(clubCrestCdnUrl("190")).toBe(
      "https://img.a.transfermarkt.technology/wappen/head/190.png",
    );
    expect(leagueBadgeCdnUrl("DK1")).toBe(
      "https://img.a.transfermarkt.technology/logo/header/dk1.png",
    );
    expect(clubCrestObjectKey("190")).toBe("club/190/crest");
    expect(leagueBadgeObjectKey("DK1")).toBe("league/dk1/badge");
  });

  it("maps honour trophy, competition logo, and crest URLs to object keys", () => {
    expect(
      catalogMarkObjectKeyFromCdnUrl(
        "https://img.a.transfermarkt.technology/erfolge/tiny/6.png?lm=4711",
      ),
    ).toBe("honour/erfolge/6");
    expect(
      catalogMarkObjectKeyFromCdnUrl(
        "https://img.a.transfermarkt.technology/logo/tiny/dk1.png?lm=4711",
      ),
    ).toBe("league/dk1/badge");
    expect(
      catalogMarkObjectKeyFromCdnUrl(
        "https://img.a.transfermarkt.technology/wappen/tiny/190_1765210308.png",
      ),
    ).toBe("club/190/crest");
  });

  it("drops URLs that are not the Transfermarkt image CDN", () => {
    expect(
      catalogMarkObjectKeyFromCdnUrl("https://example.test/erfolge/tiny/6.png"),
    ).toBeUndefined();
  });
});
