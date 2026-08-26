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

const DECODO_SITE_UNBLOCKER_HOST = "unblock.decodo.com";

export function isDecodoSiteUnblockerProxy(proxyUrl: string): boolean {
  try {
    return new URL(proxyUrl).hostname.toLowerCase() === DECODO_SITE_UNBLOCKER_HOST;
  } catch {
    return false;
  }
}

export type SeedProxyAgentOptions =
  | string
  | {
      uri: string;
      requestTls: { rejectUnauthorized: boolean };
      proxyTls: { rejectUnauthorized: boolean };
    };

export type SeedProxyAgent = {
  close: () => void | Promise<void>;
};

export type SeedProxyAgentFactory = (options: SeedProxyAgentOptions) => SeedProxyAgent;

export type SeedProxyFetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

export type SeedProxyFetch = (
  url: string,
  init: {
    dispatcher: SeedProxyAgent;
    headers: Record<string, string>;
  },
) => Promise<SeedProxyFetchResponse>;

function createUndiciProxyAgent(options: SeedProxyAgentOptions): SeedProxyAgent {
  return new ProxyAgent(options);
}

async function defaultSeedProxyFetch(
  url: string,
  init: { dispatcher: SeedProxyAgent; headers: Record<string, string> },
): Promise<SeedProxyFetchResponse> {
  if (!(init.dispatcher instanceof ProxyAgent)) {
    throw new Error("default Seed proxy fetch requires an undici ProxyAgent dispatcher");
  }
  return undiciFetch(url, {
    dispatcher: init.dispatcher,
    headers: init.headers,
  });
}

function createSeedProxyAgent(
  proxyUrl: string,
  createProxyAgent: SeedProxyAgentFactory,
): SeedProxyAgent {
  if (!isDecodoSiteUnblockerProxy(proxyUrl)) {
    return createProxyAgent(proxyUrl);
  }

  // Site Unblocker MITMs TLS; Decodo's client examples use verify=False / curl -k.
  return createProxyAgent({
    uri: proxyUrl,
    requestTls: { rejectUnauthorized: false },
    proxyTls: { rejectUnauthorized: false },
  });
}

function seedProxyRequestHeaders(proxyUrl: string): Record<string, string> {
  if (isDecodoSiteUnblockerProxy(proxyUrl)) {
    return {
      "X-SU-Geo": "Germany",
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    };
  }

  return {
    "User-Agent": "KitCollective-Seed/1.0 (+https://github.com/KitCollective/kit-collective)",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

export function createProxyFetchHtml(
  proxyUrl: string,
  fetchImpl: SeedProxyFetch = defaultSeedProxyFetch,
  createProxyAgent: SeedProxyAgentFactory = createUndiciProxyAgent,
): ProxyFetchHtml {
  const agent = createSeedProxyAgent(proxyUrl, createProxyAgent);

  const fetchHtml = async (url: string) => {
    const response = await fetchImpl(url, {
      dispatcher: agent,
      headers: seedProxyRequestHeaders(proxyUrl),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new TransfermarktHttpError(response.status, url);
    }

    return text;
  };

  return {
    fetchHtml,
    close: async () => {
      await agent.close();
    },
  };
}
