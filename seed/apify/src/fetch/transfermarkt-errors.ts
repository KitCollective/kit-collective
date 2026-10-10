export class TransfermarktHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`Transfermarkt HTTP ${status} for ${url}`);
    this.name = "TransfermarktHttpError";
  }
}

/**
 * Transfermarkt fronts an AWS WAF challenge. The challenge is served with HTTP 202
 * (or 200 on a challenge body), so `response.ok` alone would hand the challenge page
 * to the Cheerio parser and report an empty squad instead of a blocked fetch.
 */
export class TransfermarktWafChallengeError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`Transfermarkt served an AWS WAF challenge (HTTP ${status}) for ${url}`);
    this.name = "TransfermarktWafChallengeError";
  }
}

/**
 * Measured through Decodo Site Unblocker: a competition season page answered HTTP 200 with
 * 251 bytes, then 166 KB on the next attempt. The WAF interstitial the Unblocker relays
 * instead of the page is 2.1-2.4 KB. Every real Transfermarkt page measured is above 100 KB,
 * so anything under this is a relay artefact, not content.
 */
export const TRANSFERMARKT_MIN_HTML_BYTES = 5_000;

export class TransfermarktThinResponseError extends Error {
  constructor(
    readonly bytes: number,
    readonly url: string,
  ) {
    super(`Transfermarkt answered ${bytes} bytes for ${url}, too small to be a page`);
    this.name = "TransfermarktThinResponseError";
  }
}

export function isTransfermarktThinHtml(html: string): boolean {
  return html.length < TRANSFERMARKT_MIN_HTML_BYTES;
}

const WAF_CHALLENGE_MARKERS = [
  "awsWafCookieDomainList",
  "gokuProps",
  "awswaf.com/challenge",
  "challenge.compact.js",
];

export function isTransfermarktWafChallengeHtml(html: string): boolean {
  const head = html.slice(0, 4_000);
  return WAF_CHALLENGE_MARKERS.some((marker) => head.includes(marker));
}

/** HTTP 202 with a body Transfermarkt never serves for a real page is the WAF gate. */
export function isTransfermarktWafChallengeResponse(status: number, html: string): boolean {
  if (isTransfermarktWafChallengeHtml(html)) {
    return true;
  }
  return status === 202;
}

/**
 * The Site Unblocker refusing to carry traffic at all: metered plan spent, balance empty,
 * or proxy credentials rejected. Every further attempt on that plan answers the same way,
 * so this is fatal on the spot — it must never be retried and never re-routed to a direct
 * GET from our own IP.
 */
export class TransfermarktProxyQuotaError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly reason: string,
  ) {
    super(`Site Unblocker refused the request (HTTP ${status}, ${reason}) for ${url}`);
    this.name = "TransfermarktProxyQuotaError";
  }
}

/** Statuses only a proxy answers. Transfermarkt itself serves none of them. */
const PROXY_HARD_FAILURE_STATUSES = new Map<number, string>([
  [402, "payment required"],
  [407, "proxy authentication required"],
]);

const QUOTA_BODY_MARKERS = [
  "quota exceeded",
  "quota_exceeded",
  "quota has been",
  "traffic limit",
  "traffic_limit",
  "out of traffic",
  "no traffic left",
  "not enough traffic",
  "limit reached",
  "insufficient funds",
  "insufficient balance",
  "subscription expired",
  "subscription has expired",
  "payment required",
  "request limit",
  "balance is too low",
];

/**
 * Only consulted for responses that already failed, so a real 200 page is never scanned
 * for these words.
 */
export function transfermarktProxyQuotaReason(status: number, body: string): string | undefined {
  const hardFailure = PROXY_HARD_FAILURE_STATUSES.get(status);
  if (hardFailure) {
    return hardFailure;
  }

  const head = body.slice(0, 2_000).toLowerCase();
  return QUOTA_BODY_MARKERS.find((marker) => head.includes(marker));
}

export function isTransfermarktProxyQuotaError(error: unknown): boolean {
  return error instanceof TransfermarktProxyQuotaError;
}
