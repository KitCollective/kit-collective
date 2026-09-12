import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import {
  type AdminClubSeasonKitsFetch,
  adminClubSeasonKitsFetchSchema,
} from "@kit/api-contract";
import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from "@nestjs/common";

export const FK_LISTING_INGEST = Symbol("FK_LISTING_INGEST");

/** Wayback CDX + kit pages + archive bytes can exceed Node’s 5-minute default. */
export const FK_LISTING_INGEST_TIMEOUT_MS = 15 * 60 * 1000;

export type FkListingIngestRequest = {
  clubTransfermarktId: string;
  seasonLabel: string;
  clubLabel?: string;
};

export type FkListingIngestClient = {
  ingestClubSeason(input: FkListingIngestRequest): Promise<AdminClubSeasonKitsFetch>;
};

export type HttpFkListingIngestClientOptions = {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
};

function listingErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object" || !("error" in body)) {
    return fallback;
  }
  const error = body.error;
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return fallback;
}

function isListingTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return true;
  }
  const cause = "cause" in error ? error.cause : undefined;
  if (!cause || typeof cause !== "object" || !("code" in cause)) {
    return false;
  }
  return cause.code === "UND_ERR_HEADERS_TIMEOUT" || cause.code === "UND_ERR_BODY_TIMEOUT";
}

function postListingIngest(url: URL, token: string): Promise<Response> {
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = send(
      url,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        timeout: FK_LISTING_INGEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 500,
              headers: { "content-type": res.headers["content-type"] ?? "application/json" },
            }),
          );
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      const error = new TypeError("fetch failed");
      error.cause = { code: "UND_ERR_HEADERS_TIMEOUT" };
      reject(error);
    });
    req.on("error", reject);
    req.end();
  });
}

export function createHttpFkListingIngestClient(
  options: HttpFkListingIngestClientOptions = {},
): FkListingIngestClient {
  const fetchImpl = options.fetchImpl;
  const env = options.env ?? process.env;

  return {
    async ingestClubSeason(input) {
      const baseUrl = env.FKAPI_BASE_URL?.trim();
      const token = env.FK_LISTING_INGEST_TOKEN?.trim();
      if (!baseUrl || !token) {
        throw new ServiceUnavailableException("FK listing ingest is not configured");
      }

      const url = new URL("ingest", `${baseUrl.replace(/\/$/, "")}/`);
      url.searchParams.set("clubTransfermarktId", input.clubTransfermarktId);
      url.searchParams.set("season", input.seasonLabel);
      if (input.clubLabel) {
        url.searchParams.set("clubLabel", input.clubLabel);
      }

      let response: Response;
      try {
        response = fetchImpl
          ? await fetchImpl(url, {
              method: "POST",
              headers: { authorization: `Bearer ${token}` },
            })
          : await postListingIngest(url, token);
      } catch (error) {
        if (isListingTimeout(error)) {
          throw new GatewayTimeoutException(
            "Football Kit Archive ingest timed out. Try Fetch kits again.",
          );
        }
        throw new BadGatewayException("FK listing ingest failed");
      }
      const body: unknown = await response.json().catch(() => undefined);

      if (response.status === 401 || response.status === 503) {
        throw new ServiceUnavailableException(
          listingErrorMessage(body, "FK listing ingest is not configured"),
        );
      }
      if (response.status === 400) {
        throw new BadRequestException(listingErrorMessage(body, "Invalid FK listing ingest query"));
      }
      if (response.status === 502) {
        throw new BadGatewayException(
          listingErrorMessage(body, "Football Kit Archive listing failed"),
        );
      }
      if (!response.ok) {
        throw new BadGatewayException(
          listingErrorMessage(body, `FK listing ingest failed (${response.status})`),
        );
      }

      return adminClubSeasonKitsFetchSchema.parse(body);
    },
  };
}
