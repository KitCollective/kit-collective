/**
 * Structured harness logs for Loki/Promtail (one JSON object per line on stderr).
 * Fields: source, ts, role, identifier, event, gate (green|yellow|red), loopRisk (1-10), error (redacted).
 */

/** @typedef {"start" | "fail" | "exit" | "retry" | "wait" | "phase" | "tool" | "tokens"} HarnessLogEvent */
/** @typedef {"green" | "yellow" | "red"} HarnessGate */

export const IMPLEMENTING = "Implementing";
export const IN_REVIEW = "In Review";

const SECRET_PATTERNS = [
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\b(lin_api|lin_oauth)_[A-Za-z0-9]{20,}\b/g,
  /\b(sk-[A-Za-z0-9-]{20,})\b/g,
  /\b(CURSOR_API_KEY|LINEAR_CLI_API_KEY|GH_TOKEN|OPENROUTER_API_KEY|LINEAR_WEBHOOK_SECRET)\s*[:=]\s*\S+/gi,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
];

/**
 * @param {unknown} error
 * @returns {string | undefined}
 */
export function redactHarnessError(error) {
  if (error === undefined || error === null) {
    return undefined;
  }
  let text =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[redacted]");
  }
  if (text.length > 500) {
    return `${text.slice(0, 497)}…`;
  }
  return text;
}

/**
 * Retry attempt → loop risk (1–10). Cap-aligned with implement in-slot retries.
 *
 * @param {number} attempt
 * @param {number} [cap]
 * @returns {number}
 */
export function loopRiskForRetry(attempt, cap = 5) {
  const safe = Number.isFinite(attempt) && attempt > 0 ? attempt : 1;
  const limit = Number.isFinite(cap) && cap > 0 ? cap : 5;
  return Math.min(10, Math.max(2, Math.round((safe / limit) * 7 + 2)));
}

/**
 * Exit gate from job result — factory green/yellow/red semantics.
 *
 * @param {unknown} result
 * @param {{ role?: string }} [job]
 * @returns {HarnessGate}
 */
export function resolveExitGate(result, job = {}) {
  if (!result || typeof result !== "object") {
    return "green";
  }
  const row = /** @type {Record<string, unknown>} */ (result);
  if (row.passed === false && row.skipped !== true) {
    return "red";
  }
  if (row.passed === true || row.status === IN_REVIEW) {
    return "green";
  }
  if (row.ciRetry === true || row.writeScopeRetry === true || row.formatRetry === true) {
    return "yellow";
  }
  if (row.status === IMPLEMENTING && job.role === "implement") {
    return "yellow";
  }
  return "green";
}

/**
 * @param {HarnessGate} gate
 * @returns {number}
 */
export function loopRiskForGate(gate) {
  if (gate === "red") {
    return 10;
  }
  if (gate === "yellow") {
    return 5;
  }
  return 1;
}

/**
 * @param {{
 *   role: string,
 *   identifier?: string,
 *   event: HarnessLogEvent,
 *   gate: HarnessGate,
 *   error?: unknown,
 *   reason?: string,
 *   attempt?: number,
 *   loopRisk?: number,
 *   phase?: string,
 *   stopPoint?: number,
 *   tool?: string,
 *   detail?: string,
 *   tokensIn?: number,
 *   tokensOut?: number,
 * }} input
 */
export function harnessLog(input) {
  const identifier =
    typeof input.identifier === "string" && input.identifier.length > 0
      ? input.identifier
      : undefined;
  const loopRisk =
    typeof input.loopRisk === "number" && Number.isFinite(input.loopRisk)
      ? Math.min(10, Math.max(1, Math.round(input.loopRisk)))
      : loopRiskForGate(input.gate);
  /** @type {Record<string, unknown>} */
  const payload = {
    source: "harness",
    ts: new Date().toISOString(),
    role: input.role,
    event: input.event,
    gate: input.gate,
    loopRisk,
  };
  if (identifier) {
    payload.identifier = identifier;
  }
  const error = redactHarnessError(input.error);
  if (error) {
    payload.error = error;
  }
  if (typeof input.reason === "string" && input.reason.length > 0) {
    payload.reason = input.reason;
  }
  if (typeof input.attempt === "number" && Number.isFinite(input.attempt)) {
    payload.attempt = input.attempt;
  }
  if (typeof input.phase === "string" && input.phase.length > 0) {
    payload.phase = input.phase;
  }
  if (typeof input.stopPoint === "number" && Number.isFinite(input.stopPoint)) {
    payload.stopPoint = Math.min(10, Math.max(1, Math.round(input.stopPoint)));
  }
  if (typeof input.tool === "string" && input.tool.length > 0) {
    payload.tool = input.tool;
  }
  if (typeof input.detail === "string" && input.detail.length > 0) {
    payload.detail = redactHarnessError(input.detail);
  }
  if (typeof input.tokensIn === "number" && Number.isFinite(input.tokensIn)) {
    payload.tokensIn = input.tokensIn;
  }
  if (typeof input.tokensOut === "number" && Number.isFinite(input.tokensOut)) {
    payload.tokensOut = input.tokensOut;
  }
  console.error(JSON.stringify(payload));
}
