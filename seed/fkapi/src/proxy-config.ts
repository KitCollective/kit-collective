import { ProxyAgent, fetch as undiciFetch } from "undici";

export interface SeedProxyConfig {
  /** HTTP(S) proxy URL when configured. */
  proxyUrl?: string;
  /** When true, live FK fetch refuses to run without a proxy URL. */
  requireProxy: boolean;
}

const TRUTHY = new Set(["1", "true", "yes", "on"]);

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return TRUTHY.has(value.trim().toLowerCase());
}

export function resolveSeedProxyConfig(env: NodeJS.ProcessEnv = process.env): SeedProxyConfig {
  const proxyUrl = env.SEED_PROXY_URL?.trim() || undefined;
  const requireProxy = isTruthy(env.SEED_REQUIRE_PROXY);

  return { proxyUrl, requireProxy };
}

export function assertSeedProxyAvailable(config: SeedProxyConfig): void {
  if (config.requireProxy && !config.proxyUrl) {
    throw new Error(
      "SEED_REQUIRE_PROXY is set but SEED_PROXY_URL is missing. Refusing live Football Kit Archive fetch without a proxy.",
    );
  }
}

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

export function createSeedHttpFetch(proxyConfig: SeedProxyConfig): SeedHttpFetch {
  const dispatcher = proxyConfig.proxyUrl ? new ProxyAgent(proxyConfig.proxyUrl) : undefined;

  return async (url: string, init?: SeedHttpFetchOptions) => {
    const headers: Record<string, string> = {
      "User-Agent": "KitCollective-Seed/1.0 (+https://github.com/KitCollective/kit-collective)",
      "Accept-Language": "en-US,en;q=0.9",
      ...init?.headers,
    };

    const response = await undiciFetch(url, {
      dispatcher,
      headers,
    });

    if (!response.ok) {
      throw new FkFetchHttpError(response.status, url);
    }

    return response;
  };
}
