import { ProxyAgent, fetch as undiciFetch } from "undici";
import { TransfermarktHttpError } from "./fetch/kader-fetch-adapter.js";

export interface SeedProxyConfig {
  /** HTTP(S) proxy URL when configured. */
  proxyUrl?: string;
  /** When true, live Transfermarkt fetch refuses to run without a proxy URL. */
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
      "SEED_REQUIRE_PROXY is set but SEED_PROXY_URL is missing. Refusing live Transfermarkt fetch without a proxy.",
    );
  }
}

export interface ProxyFetchHtml {
  fetchHtml: (url: string) => Promise<string>;
  close: () => Promise<void>;
}

export function createProxyFetchHtml(proxyUrl: string): ProxyFetchHtml {
  const agent = new ProxyAgent(proxyUrl);

  const fetchHtml = async (url: string) => {
    const response = await undiciFetch(url, {
      dispatcher: agent,
      headers: {
        "User-Agent": "KitCollective-Seed/1.0 (+https://github.com/KitCollective/kit-collective)",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const text = await response.text();
    if (!response.ok) {
      throw new TransfermarktHttpError(response.status, url);
    }

    return text;
  };

  return {
    fetchHtml,
    close: () => agent.close(),
  };
}
