import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Agent, type Dispatcher, fetch as undiciFetch } from "undici";
import { seedProgress } from "../progress.js";
import {
  isTransfermarktWafChallengeResponse,
  TransfermarktHttpError,
  TransfermarktWafChallengeError,
} from "./transfermarkt-errors.js";

/**
 * Transfermarkt's AWS WAF hands out an `aws-waf-token` cookie. Node's global fetch keeps
 * no jar, so every GET re-entered the challenge. One session per run holds the cookies and
 * a keep-alive connection.
 */
export interface TransfermarktSession {
  fetchHtml: (url: string) => Promise<string>;
  fetchBytes: (url: string) => Promise<Uint8Array>;
  close: () => Promise<void>;
}

export interface TransfermarktSessionResponse {
  status: number;
  ok: boolean;
  headers: { getSetCookie?: () => string[] };
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export type TransfermarktSessionFetch = (
  url: string,
  init: { headers: Record<string, string>; dispatcher?: unknown },
) => Promise<TransfermarktSessionResponse>;

export interface TransfermarktSessionOptions {
  /** JSON file the cookie jar survives in between runs. */
  cookieFile?: string;
  fetchImpl?: TransfermarktSessionFetch;
  dispatcher?: unknown;
}

/** Desktop direct GETs. Transfermarkt 502s the identified `KitCollective-Seed` UA. */
export function directTransfermarktRequestHeaders(): Record<string, string> {
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    Referer: "https://www.transfermarkt.com/",
  };
}

function assetRequestHeaders(): Record<string, string> {
  const headers = directTransfermarktRequestHeaders();
  headers.Accept = "image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5";
  headers["Sec-Fetch-Dest"] = "image";
  headers["Sec-Fetch-Mode"] = "no-cors";
  headers["Sec-Fetch-Site"] = "cross-site";
  delete headers["Sec-Fetch-User"];
  delete headers["Upgrade-Insecure-Requests"];
  return headers;
}

export interface CookieJar {
  header(): string | undefined;
  accept(setCookies: string[]): boolean;
  entries(): Record<string, string>;
}

export function createCookieJar(initial: Record<string, string> = {}): CookieJar {
  const cookies = new Map(Object.entries(initial));

  return {
    header() {
      if (cookies.size === 0) {
        return undefined;
      }
      return Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; ");
    },

    accept(setCookies: string[]): boolean {
      let changed = false;
      for (const raw of setCookies) {
        const [pair, ...attributes] = raw.split(";");
        const separator = pair?.indexOf("=") ?? -1;
        if (!pair || separator <= 0) {
          continue;
        }
        const name = pair.slice(0, separator).trim();
        const value = pair.slice(separator + 1).trim();
        const expired = attributes.some((attribute) => {
          const [key, attributeValue] = attribute.split("=");
          const folded = key?.trim().toLowerCase();
          if (folded === "max-age") {
            return Number.parseInt(attributeValue?.trim() ?? "", 10) <= 0;
          }
          if (folded === "expires" && attributeValue) {
            const at = Date.parse(attributeValue.trim());
            return Number.isFinite(at) && at <= Date.now();
          }
          return false;
        });

        if (expired) {
          changed = cookies.delete(name) || changed;
          continue;
        }
        if (cookies.get(name) !== value) {
          cookies.set(name, value);
          changed = true;
        }
      }
      return changed;
    },

    entries() {
      return Object.fromEntries(cookies);
    },
  };
}

function cookieRecordFromUnknown(parsed: unknown): Record<string, string> {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") {
      record[key] = value;
    }
  }
  return record;
}

function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function defaultSessionFetch(
  url: string,
  init: { headers: Record<string, string>; dispatcher?: unknown },
): Promise<TransfermarktSessionResponse> {
  const response = await undiciFetch(url, {
    headers: init.headers,
    // SAFETY: this default fetch only runs with an undici Agent or ProxyAgent from this
    // package; tests inject fetchImpl and never pass a fake dispatcher through here.
    dispatcher: init.dispatcher as Dispatcher | undefined,
  });
  return {
    status: response.status,
    ok: response.ok,
    headers: { getSetCookie: () => response.headers.getSetCookie() },
    text: () => response.text(),
    arrayBuffer: () => response.arrayBuffer(),
  };
}

function createKeepAliveAgent(): Agent {
  return new Agent({
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 120_000,
    connections: 4,
    headersTimeout: 45_000,
    bodyTimeout: 60_000,
  });
}

export function createTransfermarktSession(
  options: TransfermarktSessionOptions = {},
): TransfermarktSession {
  const fetchImpl = options.fetchImpl ?? defaultSessionFetch;
  const ownedAgent =
    options.fetchImpl || options.dispatcher !== undefined ? undefined : createKeepAliveAgent();
  const dispatcher = options.dispatcher ?? ownedAgent;
  const cookieFile = options.cookieFile;

  let jar: CookieJar | undefined;
  let loading: Promise<CookieJar> | undefined;

  async function loadJar(): Promise<CookieJar> {
    if (jar) {
      return jar;
    }
    loading ??= (async () => {
      let initial: Record<string, string> = {};
      if (cookieFile) {
        try {
          initial = cookieRecordFromUnknown(JSON.parse(await readFile(cookieFile, "utf8")));
        } catch {
          initial = {};
        }
      }
      jar = createCookieJar(initial);
      return jar;
    })();
    return loading;
  }

  async function persistJar(current: CookieJar): Promise<void> {
    if (!cookieFile) {
      return;
    }
    try {
      await mkdir(path.dirname(cookieFile), { recursive: true });
      await writeFile(cookieFile, `${JSON.stringify(current.entries(), null, 2)}\n`, "utf8");
    } catch (error: unknown) {
      seedProgress(`cookie jar not persisted: ${unknownErrorMessage(error)}`);
    }
  }

  async function request(
    url: string,
    headers: Record<string, string>,
  ): Promise<TransfermarktSessionResponse> {
    const current = await loadJar();
    const cookieHeader = current.header();
    const response = await fetchImpl(url, {
      headers: cookieHeader ? { ...headers, Cookie: cookieHeader } : headers,
      dispatcher,
    });

    const setCookies = response.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0 && current.accept(setCookies)) {
      await persistJar(current);
    }

    return response;
  }

  return {
    async fetchHtml(url: string): Promise<string> {
      const response = await request(url, directTransfermarktRequestHeaders());
      const html = await response.text();

      if (isTransfermarktWafChallengeResponse(response.status, html)) {
        throw new TransfermarktWafChallengeError(response.status, url);
      }
      if (!response.ok) {
        throw new TransfermarktHttpError(response.status, url);
      }

      return html;
    },

    async fetchBytes(url: string): Promise<Uint8Array> {
      const response = await request(url, assetRequestHeaders());
      if (response.status === 202) {
        throw new TransfermarktWafChallengeError(response.status, url);
      }
      if (!response.ok) {
        throw new TransfermarktHttpError(response.status, url);
      }
      return new Uint8Array(await response.arrayBuffer());
    },

    async close(): Promise<void> {
      await ownedAgent?.close();
    },
  };
}
