import { describe, expect, it } from "vitest";
import { hydrateListingKitBytes } from "../src/listing-ingest.js";
import type { FkListingKitJson } from "../src/listing-kit-source.js";

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
const html404 = "<!DOCTYPE html>not a kit";

const homeKit: FkListingKitJson = {
  id: "ac-milan-2025-26-home-kit",
  clubTransfermarktId: "5",
  seasonTransfermarktId: "2025/26",
  seasonLabel: "2025/26",
  type: "home",
  imageUrl:
    "https://web.archive.org/web/20250418220627id_/https://cdn.footballkitarchive.com/2025/03/17/4fhK6PR760awG38.jpg",
};

describe("hydrateListingKitBytes", () => {
  it("omits a kit when Wayback returns HTML instead of archive JPEG bytes", async () => {
    const fetched: string[] = [];
    const hydrated = await hydrateListingKitBytes([homeKit], async (input) => {
      fetched.push(String(input));
      return new Response(html404, { status: 404, headers: { "content-type": "text/html" } });
    });

    expect(hydrated).toEqual([]);
    expect(fetched[0]).toBe(homeKit.imageUrl);
  });

  it("keeps a kit when Wayback returns JPEG bytes", async () => {
    const hydrated = await hydrateListingKitBytes([homeKit], async () => {
      return new Response(jpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
    });

    expect(hydrated).toHaveLength(1);
    expect(hydrated[0]?.id).toBe("ac-milan-2025-26-home-kit");
    expect(hydrated[0]?.imageBytes).toEqual(jpeg);
  });

  it("falls back to a later CDX snapshot when the page timestamp has no JPEG", async () => {
    const later =
      "https://web.archive.org/web/20250801000000id_/https://cdn.footballkitarchive.com/2025/03/17/4fhK6PR760awG38.jpg";
    const fetched: string[] = [];
    const hydrated = await hydrateListingKitBytes([homeKit], async (input) => {
      const url = String(input);
      fetched.push(url);
      if (url.includes("/cdx/search/cdx")) {
        return new Response(
          JSON.stringify([
            ["urlkey", "timestamp", "original"],
            [
              "com,footballkitarchive)/2025/03/17/4fhk6pr760awg38.jpg",
              "20250801000000",
              "https://cdn.footballkitarchive.com/2025/03/17/4fhK6PR760awG38.jpg",
            ],
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url === later) {
        return new Response(jpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
      }
      return new Response(html404, { status: 404, headers: { "content-type": "text/html" } });
    });

    expect(hydrated).toHaveLength(1);
    expect(hydrated[0]?.imageBytes).toEqual(jpeg);
    expect(fetched.some((url) => url.includes("/cdx/search/cdx"))).toBe(true);
    expect(fetched).toContain(later);
  });

  it("downloads extra flat images after the primary JPEG", async () => {
    const extra =
      "https://web.archive.org/web/20250418220627id_/https://cdn.footballkitarchive.com/2025/05/22/extra.jpg";
    const extraJpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb]);
    const hydrated = await hydrateListingKitBytes(
      [{ ...homeKit, extraImageUrls: [extra] }],
      async (input) => {
        const url = String(input);
        if (url === extra) {
          return new Response(extraJpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
        }
        return new Response(jpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
      },
    );

    expect(hydrated[0]?.imageBytes).toEqual(jpeg);
    expect(hydrated[0]?.additionalImageBytes).toEqual([extraJpeg]);
  });
});
