import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GatewayTimeoutException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { createHttpFkListingIngestClient } from "../dist/admin/fk-listing-ingest.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("HTTP FK listing ingest client", () => {
  it("refuses when listing origin or ingest token is missing", async () => {
    const client = createHttpFkListingIngestClient({
      env: {},
      fetchImpl: async () => {
        throw new Error("must not fetch");
      },
    });

    await expect(
      client.ingestClubSeason({
        clubTransfermarktId: "190",
        seasonLabel: "2010/11",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("posts club season identity to listing ingest", async () => {
    const requested: string[] = [];
    const client = createHttpFkListingIngestClient({
      env: {
        FKAPI_BASE_URL: "http://listing.test",
        FK_LISTING_INGEST_TOKEN: "ingest-secret",
      },
      fetchImpl: async (input, init) => {
        requested.push(String(input));
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual({ authorization: "Bearer ingest-secret" });
        return new Response(JSON.stringify({ kitsUpserted: 1, photosWritten: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    await expect(
      client.ingestClubSeason({
        clubTransfermarktId: "190",
        seasonLabel: "2010/11",
        clubLabel: "FC Copenhagen",
      }),
    ).resolves.toEqual({ kitsUpserted: 1, photosWritten: 0 });

    expect(requested).toEqual([
      "http://listing.test/ingest?clubTransfermarktId=190&season=2010%2F11&clubLabel=FC+Copenhagen",
    ]);
  });

  it("does not import seed packages from Nest admin ingest", () => {
    const ingest = readFileSync(join(here, "../src/admin/fk-listing-ingest.ts"), "utf8");
    const catalog = readFileSync(join(here, "../src/admin/admin-catalog.service.ts"), "utf8");
    expect(ingest).not.toMatch(/@kit\/seed-/);
    expect(catalog).not.toMatch(/@kit\/seed-/);
  });

  it("maps listing header timeout to 504 instead of a raw 500", async () => {
    const timeout = new TypeError("fetch failed");
    timeout.cause = { code: "UND_ERR_HEADERS_TIMEOUT" };
    const client = createHttpFkListingIngestClient({
      env: {
        FKAPI_BASE_URL: "http://listing.test",
        FK_LISTING_INGEST_TOKEN: "ingest-secret",
      },
      fetchImpl: async () => {
        throw timeout;
      },
    });

    const error = await client
      .ingestClubSeason({
        clubTransfermarktId: "5",
        seasonLabel: "2025/26",
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GatewayTimeoutException);
    expect(error).toMatchObject({ message: expect.stringContaining("timed out") });
    if (error instanceof GatewayTimeoutException) {
      expect(error.getStatus()).toBe(504);
    }
  });
});
