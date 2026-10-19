/**
 * Which model the AFK developer Reviewer runs on (ADR-0067, consequence of 2026-10-19): GLM 5.3
 * through Optio's proxy while OpenRouter can pay for it, else Claude. `scripts/reviewer-route.mjs`
 * gathers the inputs; this decides. The answer is one line, `REVIEWER glm` or
 * `REVIEWER claude <reason>`, and nothing here ever puts a key into it.
 */

/** The kill-switch file that forces the Claude Reviewer, relative to the main checkout (like auto-land.off). */
export const OVERRIDE_FILE = ".factory/auto-reviewer.claude";
/** Below this many USD left on the OpenRouter account the Reviewer runs on Claude. */
export const DEFAULT_MIN_CREDIT_USD = 1;
export const CREDITS_URL = "https://openrouter.ai/api/v1/credits";
/** How long the credits request may take before it counts as failed. */
export const CREDITS_TIMEOUT_MS = 10_000;

/**
 * The minimum credit from `REVIEWER_MIN_CREDIT_USD`, or the default when it is unset or not a
 * non-negative number.
 * @param {string | undefined} raw
 */
export function minCredit(raw) {
  const value = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_MIN_CREDIT_USD;
}

/**
 * @param {{
 *   key: string | null,
 *   override: boolean,
 *   min: number,
 *   fetch: (url: string, init: { headers: Record<string, string>, signal?: AbortSignal }) => Promise<{ ok: boolean, status: number, json: () => Promise<unknown> }>,
 *   timeoutMs?: number,
 * }} input `key` is the OpenRouter key (a management key reads the credits endpoint)
 * @returns {Promise<string>} the one answer line
 */
export async function reviewerRoute({ key, override, min, fetch, timeoutMs = CREDITS_TIMEOUT_MS }) {
  if (override) {
    return `REVIEWER claude override: ${OVERRIDE_FILE} exists in the main checkout`;
  }
  if (!key) {
    return "REVIEWER claude no-key: OPENROUTER_API_KEY is not set and not in the main checkout's .env";
  }
  let response;
  try {
    response = await fetch(CREDITS_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "error";
    return `REVIEWER claude credits-unreachable: the credits request failed (${name})`;
  }
  if (response.status === 401 || response.status === 403) {
    return `REVIEWER claude credits-key-refused: OpenRouter answered ${response.status} on the credits endpoint, which needs a management key (OPENROUTER_MANAGEMENT_KEY)`;
  }
  if (!response.ok) {
    return `REVIEWER claude credits-unreachable: OpenRouter answered ${response.status}`;
  }
  let body;
  try {
    body = await response.json();
  } catch {
    return "REVIEWER claude credits-unreadable: the credits answer is not JSON";
  }
  const data = body && typeof body === "object" && "data" in body ? body.data : null;
  const total =
    data && typeof data === "object" && "total_credits" in data ? data.total_credits : null;
  const used = data && typeof data === "object" && "total_usage" in data ? data.total_usage : null;
  if (typeof total !== "number" || typeof used !== "number") {
    return "REVIEWER claude credits-unreadable: no numeric total_credits and total_usage";
  }
  const left = total - used;
  if (left < min) {
    return `REVIEWER claude low-credit: ${left.toFixed(2)} USD left, below ${min} USD`;
  }
  return "REVIEWER glm";
}

/**
 * Reads one key from the process env or a .env text, as scripts/linear.mjs does.
 * @param {string} name
 * @param {Record<string, string | undefined>} env
 * @param {string | null} dotenv the main checkout's .env text, or null when there is none
 */
export function envValue(name, env, dotenv) {
  if (env[name]) return env[name];
  if (!dotenv) return null;
  for (const line of dotenv.split("\n")) {
    const match = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*?)\\s*$`).exec(line);
    if (match?.[1]) return match[1].replace(/^(['"])(.*)\1$/, "$2");
  }
  return null;
}
