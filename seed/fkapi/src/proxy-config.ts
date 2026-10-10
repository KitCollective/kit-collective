import { fetch as undiciFetch } from "undici";

export class FkFetchHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`FK fetch failed: ${status} ${url}`);
    this.name = "FkFetchHttpError";
  }
}

export type SeedHttpFetchOptions = {
  headers?: Record<string, string>;
};

export type SeedHttpFetch = (
  url: string,
  init?: SeedHttpFetchOptions,
) => Promise<Awaited<ReturnType<typeof undiciFetch>>>;

export type SeedHttpFetcher = (
  url: string,
  init: {
    dispatcher?: unknown;
    headers: Record<string, string>;
  },
) => Promise<Awaited<ReturnType<typeof undiciFetch>>>;

async function defaultSeedHttpFetcher(
  url: string,
  init: {
    dispatcher?: unknown;
    headers: Record<string, string>;
  },
): Promise<Awaited<ReturnType<typeof undiciFetch>>> {
  return undiciFetch(url, {
    headers: init.headers,
  });
}

/** Direct FK HTTP — never Seed proxy / Decodo. */
export function createSeedHttpFetch(
  fetchImpl: SeedHttpFetcher = defaultSeedHttpFetcher,
): SeedHttpFetch {
  return async (url: string, init?: SeedHttpFetchOptions) => {
    const headers: Record<string, string> = {
      "User-Agent": "KitCollective-Seed/1.0 (+https://github.com/KitCollective/kit-collective)",
      "Accept-Language": "en-US,en;q=0.9",
      ...init?.headers,
    };

    const response = await fetchImpl(url, {
      dispatcher: undefined,
      headers,
    });

    if (!response.ok) {
      throw new FkFetchHttpError(response.status, url);
    }

    return response;
  };
}
