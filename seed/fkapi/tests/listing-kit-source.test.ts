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
          url.includes("id_/https://www.footballkitarchive.com/fc-copenhagen-2010-11-home-kit/") ||
          url.includes(
            "id_/https://www.footballkitarchive.com/fc-copenhagen-2010-11-european-home-kit/",
          )
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
        design: "Plain",
        colorNames: "White / Black / Blue",
        primaryColorHex: "FFFFFF",
        secondaryColorHex: "000000",
        competition: "Superliga",
        releasedOn: "2010-07-01",
        description:
          "The Kappa FC Copenhagen 2010-11 home shirt was worn with Carlsberg on the chest. The club played Superliga in white, black and blue.",
        imageUrl:
          "https://web.archive.org/web/20230813082833id_/https://cdn.footballkitarchive.com/2021/07/04/6BRVH8Hy1F8md50.jpg",
        extraImageUrls: [
          "https://web.archive.org/web/20230813082833id_/https://cdn.footballkitarchive.com/2021/07/04/extraFront.jpg",
          "https://web.archive.org/web/20230813082833id_/https://cdn.footballkitarchive.com/2021/07/04/extraBack.jpg",
          "https://web.archive.org/web/20230813082833id_/https://cdn.footballkitarchive.com/2021/07/04/extraDetail.jpg",
        ],
      },
      {
        id: "fc-copenhagen-2010-11-european-home-kit",
        clubTransfermarktId: "190",
        seasonTransfermarktId: "2010/11",
        seasonLabel: "2010/11",
        type: "home",
        variant: "european",
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
        imageUrl:
          "https://web.archive.org/web/20230813082833id_/https://cdn.footballkitarchive.com/2021/07/04/6BRVH8Hy1F8md50.jpg",
        extraImageUrls: [
          "https://web.archive.org/web/20230813082833id_/https://cdn.footballkitarchive.com/2021/07/04/extraFront.jpg",
          "https://web.archive.org/web/20230813082833id_/https://cdn.footballkitarchive.com/2021/07/04/extraBack.jpg",
          "https://web.archive.org/web/20230813082833id_/https://cdn.footballkitarchive.com/2021/07/04/extraDetail.jpg",
        ],
      },
    ]);
    expect(fetched.some((url) => url.startsWith("https://www.footballkitarchive.com"))).toBe(false);
    expect(fetched.some((url) => url.includes("european-home-kit"))).toBe(true);
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

  it("retries a transient Wayback CDX 503 before refusing", async () => {
    let cdxCalls = 0;
    const loadKits = createWaybackFkListingKitSource({
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/cdx/search/cdx")) {
          cdxCalls += 1;
          if (cdxCalls < 2) {
            return new Response("unavailable", { status: 503 });
          }
          return new Response(
            JSON.stringify([
              ["urlkey", "timestamp", "original"],
              [
                "com,footballkitarchive)/fc-copenhagen-2010-11-home-kit",
                "20230813082833",
                "https://www.footballkitarchive.com/fc-copenhagen-2010-11-home-kit/",
              ],
            ]),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("fc-copenhagen-2010-11-home-kit")) {
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

    expect(cdxCalls).toBe(3);
    expect(result.ok).toBe(true);
  });

  it("collapses slug and numbered CDX snapshots onto one kit with the numeric id", async () => {
    const fetched: string[] = [];
    const loadKits = createWaybackFkListingKitSource({
      fetchImpl: async (input) => {
        const url = String(input);
        fetched.push(url);
        if (url.includes("/cdx/search/cdx")) {
          return new Response(
            JSON.stringify([
              ["urlkey", "timestamp", "original"],
              [
                "com,footballkitarchive)/fc-copenhagen-2010-11-home-kit",
                "20230813082833",
                "https://www.footballkitarchive.com/fc-copenhagen-2010-11-home-kit/",
              ],
              [
                "com,footballkitarchive)/fc-copenhagen-2010-11-home-kit/354421",
                "20230701000000",
                "https://www.footballkitarchive.com/fc-copenhagen-2010-11-home-kit/354421/",
              ],
            ]),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("fc-copenhagen-2010-11-home-kit/354421")) {
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
    expect(result.kits).toHaveLength(1);
    expect(result.kits[0]?.id).toBe("354421");
    expect(fetched.some((url) => url.endsWith("/fc-copenhagen-2010-11-home-kit/"))).toBe(false);
  });

  it("uses a slugified club label when the Transfermarkt map misses", async () => {
    const fetched: string[] = [];
    const loadKits = createWaybackFkListingKitSource({
      fetchImpl: async (input) => {
        fetched.push(String(input));
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    const result = await loadKits(
      {
        kind: "club",
        competition: "superligaen",
        clubExternalId: "99999",
        season: "2010/11",
      },
      { clubLabel: "FC Copenhagen" },
    );

    expect(result.ok).toBe(false);
    expect(fetched.some((url) => url.includes("fc-copenhagen-2010-11"))).toBe(true);
  });

  it("merges kit detail URLs from the archived season index when prefix CDX missed them", async () => {
    const loadKits = createWaybackFkListingKitSource({
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/cdx/search/cdx")) {
          if (url.includes("-kits")) {
            return new Response(
              JSON.stringify([
                ["urlkey", "timestamp", "original"],
                [
                  "com,footballkitarchive)/fc-copenhagen-2010-11-kits",
                  "20230813082833",
                  "https://www.footballkitarchive.com/fc-copenhagen-2010-11-kits/",
                ],
              ]),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
          if (url.includes("european-home-kit")) {
            return new Response(
              JSON.stringify([
                ["urlkey", "timestamp", "original"],
                [
                  "com,footballkitarchive)/fc-copenhagen-2010-11-european-home-kit",
                  "20230813082833",
                  "https://www.footballkitarchive.com/fc-copenhagen-2010-11-european-home-kit/",
                ],
              ]),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
          return new Response(
            JSON.stringify([
              ["urlkey", "timestamp", "original"],
              [
                "com,footballkitarchive)/fc-copenhagen-2010-11-home-kit",
                "20230813082833",
                "https://www.footballkitarchive.com/fc-copenhagen-2010-11-home-kit/",
              ],
            ]),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("fc-copenhagen-2010-11-kits")) {
          return new Response(
            `<a href="/fc-copenhagen-2010-11-home-kit/">Home</a>
             <a href="/fc-copenhagen-2010-11-european-home-kit/">European</a>
             <a href="/fc-copenhagen-2010-11-training-kit/">Training</a>`,
            { status: 200, headers: { "content-type": "text/html" } },
          );
        }
        if (
          url.includes("fc-copenhagen-2010-11-home-kit") ||
          url.includes("fc-copenhagen-2010-11-european-home-kit")
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
    expect(result.kits.map((kit) => kit.id).sort()).toEqual([
      "fc-copenhagen-2010-11-european-home-kit",
      "fc-copenhagen-2010-11-home-kit",
    ]);
    expect(result.kits.find((kit) => kit.id.includes("european"))?.variant).toBe("european");
  });
});
