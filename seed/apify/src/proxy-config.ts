import { ProxyAgent, fetch as undiciFetch } from "undici";
import {
  isTransfermarktThinHtml,
  isTransfermarktWafChallengeResponse,
  TransfermarktHttpError,
  TransfermarktProxyQuotaError,
  TransfermarktThinResponseError,
  TransfermarktWafChallengeError,
  transfermarktProxyQuotaReason,
} from "./fetch/transfermarkt-errors.js";
import { directTransfermarktRequestHeaders } from "./fetch/transfermarkt-session.js";
import { safeSeedUrl, seedProgress } from "./progress.js";

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

export const DEFAULT_SITE_UNBLOCKER_GEO = "Germany";

/** A rendered Site Unblocker pass was measured at 8-107 s, well past undici's own defaults. */
export const SITE_UNBLOCKER_TIMEOUT_MS = 180_000;

/**
 * `auto` sends the cheap pass first and escalates to a rendered pass only when the WAF
 * answers. Measured over 8 kader URLs: cheap cleared 6 in ~1.5 s each, the WAF took the
 * other 2 (HTTP 405 with a Human Verification body), and the rendered pass cleared both.
 */
export type SiteUnblockerRenderMode = "auto" | "html" | "off";

export interface SiteUnblockerOptions {
  geo: string;
  render: SiteUnblockerRenderMode;
  /** Sticky exit id. Optional: the rendered pass already clears the WAF without one. */
  sessionId?: string;
}

export function resolveSiteUnblockerOptions(
  env: NodeJS.ProcessEnv = process.env,
): SiteUnblockerOptions {
  const render = env.SEED_PROXY_HEADLESS?.trim().toLowerCase();

  return {
    geo: env.SEED_PROXY_GEO?.trim() || DEFAULT_SITE_UNBLOCKER_GEO,
    render: render === "html" || render === "off" ? render : "auto",
    sessionId: env.SEED_PROXY_SESSION_ID?.trim() || undefined,
  };
}

export type SeedProxyAgentOptions =
  | string
  | {
      uri: string;
      requestTls: { rejectUnauthorized: boolean };
      proxyTls: { rejectUnauthorized: boolean };
      headersTimeout: number;
      bodyTimeout: number;
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
    headersTimeout: SITE_UNBLOCKER_TIMEOUT_MS,
    bodyTimeout: SITE_UNBLOCKER_TIMEOUT_MS,
  });
}

function siteUnblockerHeaders(
  options: SiteUnblockerOptions,
  render: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-SU-Geo": options.geo,
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
  };
  if (render) {
    headers["X-SU-Headless"] = "html";
  }
  if (options.sessionId) {
    headers["X-SU-Session-Id"] = options.sessionId;
  }
  return headers;
}

/** Header sets to try for one URL, cheapest first. */
function proxyAttemptHeaders(
  proxyUrl: string,
  options: SiteUnblockerOptions,
): Array<Record<string, string>> {
  if (!isDecodoSiteUnblockerProxy(proxyUrl)) {
    // A named bot UA is 502d by Transfermarkt; residential exits need the browser set too.
    return [directTransfermarktRequestHeaders()];
  }

  if (options.render === "html") {
    return [siteUnblockerHeaders(options, true)];
  }
  if (options.render === "off") {
    return [siteUnblockerHeaders(options, false)];
  }
  return [siteUnblockerHeaders(options, false), siteUnblockerHeaders(options, true)];
}

/** Only the WAF gate and a truncated relay are worth paying for a rendered pass. */
function isWorthRendering(error: unknown): boolean {
  return (
    error instanceof TransfermarktWafChallengeError ||
    error instanceof TransfermarktThinResponseError
  );
}

export function createProxyFetchHtml(
  proxyUrl: string,
  fetchImpl: SeedProxyFetch = defaultSeedProxyFetch,
  createProxyAgent: SeedProxyAgentFactory = createUndiciProxyAgent,
  options: SiteUnblockerOptions = resolveSiteUnblockerOptions(),
): ProxyFetchHtml {
  const agent = createSeedProxyAgent(proxyUrl, createProxyAgent);
  const attempts = proxyAttemptHeaders(proxyUrl, options);

  const requestHtml = async (url: string, headers: Record<string, string>) => {
    const response = await fetchImpl(url, { dispatcher: agent, headers });

    const text = await response.text();
    if (!response.ok) {
      // Checked before the WAF gate: a spent plan is the proxy talking, not Transfermarkt.
      const quotaReason = transfermarktProxyQuotaReason(response.status, text);
      if (quotaReason) {
        throw new TransfermarktProxyQuotaError(response.status, url, quotaReason);
      }
    }
    if (isTransfermarktWafChallengeResponse(response.status, text)) {
      throw new TransfermarktWafChallengeError(response.status, url);
    }
    if (!response.ok) {
      throw new TransfermarktHttpError(response.status, url);
    }
    if (isTransfermarktThinHtml(text)) {
      throw new TransfermarktThinResponseError(text.length, url);
    }

    return text;
  };

  const fetchHtml = async (url: string) => {
    let lastError: unknown;

    for (const [index, headers] of attempts.entries()) {
      try {
        return await requestHtml(url, headers);
      } catch (error: unknown) {
        lastError = error;
        if (index === attempts.length - 1 || !isWorthRendering(error)) {
          throw error;
        }
        seedProgress(`unblocker render ${safeSeedUrl(url)}`);
      }
    }

    throw lastError;
  };

  return {
    fetchHtml,
    close: async () => {
      await agent.close();
    },
  };
}
