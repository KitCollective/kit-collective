import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createWaybackFkListingKitSource } from "../src/listing-kit-source.js";

const homeHtml = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../fixtures/fka-fc-copenhagen-2010-11-home-kit.html",
  ),
  "utf8",
);

describe("Wayback FK listing kit source", () => {
  it("loads FCK 2010/11 home kit from CDX + HTML without touching footballkitarchive.com", async () => {
    const fetched: string[] = [];
    const loadKits = createWaybackFkListingKitSource({
      fetchImpl: async (input) => {
        const url = String(input);
        fetched.push(url);
        if (url.includes("/cdx/search/cdx")) {
          return new Response(
            JSON.stringify([
              ["urlkey", "timestamp", "original", "mimetype", "statuscode"],
              [
                "com,footballkitarchive)/fc-copenhagen-2010-11-home-kit",
                "20230813082833",
                "https://www.footballkitarchive.com/fc-copenhagen-2010-11-home-kit/",
                "text/html",
                "200",
              ],
              [
                "com,footballkitarchive)/fc-copenhagen-2010-11-european-home-kit",
                "20230813082833",
                "https://www.footballkitarchive.com/fc-copenhagen-2010-11-european-home-kit/",
                "text/html",
                "200",
              ],
            ]),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (
          url.includes("id_/https://www.footballkitarchive.com/fc-copenhagen-2010-11-home-kit/")
        ) {
          return new Response(homeHtml, { status: 200, headers: { "content-type": "text/html" } });
        }
        return new Response("missing", { status: 404 });
      },
    });

    const result = await loadKits({
      kind: "club",
      competition: "superligaen",
      clubExternalId: "190",
      season: "2010/11",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.kits).toEqual([
      {
        id: "fc-copenhagen-2010-11-home-kit",
        clubTransfermarktId: "190",
        seasonTransfermarktId: "2010/11",
        seasonLabel: "2010/11",
        type: "home",
        manufacturerName: "Kappa",
        sponsorName: "Carlsberg",
        imageUrl:
          "https://web.archive.org/web/20230813082833id_/https://cdn.footballkitarchive.com/2021/07/04/6BRVH8Hy1F8md50.jpg",
      },
    ]);
    expect(fetched.some((url) => url.startsWith("https://www.footballkitarchive.com"))).toBe(false);
    expect(fetched.some((url) => url.includes("european-home-kit"))).toBe(false);
  });

  it("fails closed when the club has no FKA slug", async () => {
    const loadKits = createWaybackFkListingKitSource({
      fetchImpl: async () => {
        throw new Error("must not fetch");
      },
    });
    const result = await loadKits({
      kind: "club",
      competition: "superligaen",
      clubExternalId: "99999",
      season: "2010/11",
    });
    expect(result).toEqual({
      ok: false,
      error: "no Football Kit Archive slug for clubTransfermarktId=99999",
    });
  });
});
