/**
 * Approximate on-demand USD cost from token counts (Cursor / OpenRouter list rates).
 * Estimates only — plan included pools and Fast variants are not billed here.
 * When Pi/Cursor usage reports an explicit cost field, prefer that over the table.
 * Override via env `KIT_TOKEN_PRICE_<MODEL_KEY>_IN` / `_OUT` (USD per 1M tokens).
 */
export const UNKNOWN_TOKEN_COUNT = "unknown";

/** @typedef {{ input: number, output: number, label: string }} ModelPrice */

/**
 * USD per 1M tokens. Cursor Models pool list rates (standard, not Fast).
 * OpenRouter Scout/Gate rows are best-effort estimates — log as estimate.
 *
 * @type {Record<string, ModelPrice>}
 */
export const MODEL_PRICING_USD_PER_MTOK = Object.freeze({
  // Cursor-routed Composer (implement parent + helpers + Slop)
  "cursor/composer-2.5": { input: 0.5, output: 2.5, label: "Composer" },
  "composer-2.5": { input: 0.5, output: 2.5, label: "Composer" },
  "cursor/composer-2": { input: 0.5, output: 2.5, label: "Composer" },
  "composer-2": { input: 0.5, output: 2.5, label: "Composer" },
  composer: { input: 0.5, output: 2.5, label: "Composer" },
  Composer: { input: 0.5, output: 2.5, label: "Composer" },
  // Cursor-routed Grok (factory-checker / land)
  "cursor/grok-4.6": { input: 2, output: 6, label: "Grok" },
  "grok-4.6": { input: 2, output: 6, label: "Grok" },
  "cursor/grok": { input: 2, output: 6, label: "Grok" },
  grok: { input: 2, output: 6, label: "Grok" },
  Grok: { input: 2, output: 6, label: "Grok" },
  // OpenRouter Scout / Gate
  "openrouter/tencent/hy3": { input: 0.35, output: 1.4, label: "Hy3" },
  "tencent/hy3": { input: 0.35, output: 1.4, label: "Hy3" },
  hy3: { input: 0.35, output: 1.4, label: "Hy3" },
  Hy3: { input: 0.35, output: 1.4, label: "Hy3" },
  "openrouter/xiaomi/mimo-v2.5-pro": { input: 0.4, output: 1.6, label: "MiMo" },
  "xiaomi/mimo-v2.5-pro": { input: 0.4, output: 1.6, label: "MiMo" },
  "mimo-v2.5-pro": { input: 0.4, output: 1.6, label: "MiMo" },
  mimo: { input: 0.4, output: 1.6, label: "MiMo" },
  MiMo: { input: 0.4, output: 1.6, label: "MiMo" },
});

/**
 * Normalize model ids so Cursor slug variants hit the same price row.
 *
 * @param {string | undefined} model
 * @returns {string[]}
 */
export function modelPriceLookupKeys(model) {
  if (typeof model !== "string" || model.trim().length === 0) {
    return [];
  }
  const raw = model.trim();
  const lower = raw.toLowerCase();
  const noVendor = lower.replace(/^(cursor|openrouter)\//, "");
  const compact = lower.replace(/[\s_]+/g, "-");
  const keys = [raw, lower, compact, noVendor, noVendor.replace(/[\s_]+/g, "-")];
  if (lower.includes("composer")) {
    keys.push("cursor/composer-2.5", "Composer", "composer");
  }
  if (lower.includes("grok")) {
    keys.push("cursor/grok-4.6", "Grok", "grok");
  }
  if (lower.includes("hy3") || lower.includes("hy-3")) {
    keys.push("openrouter/tencent/hy3", "Hy3");
  }
  if (lower.includes("mimo")) {
    keys.push("openrouter/xiaomi/mimo-v2.5-pro", "MiMo");
  }
  return [...new Set(keys.filter((key) => key.length > 0))];
}

/**
 * @param {string | undefined} model
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {ModelPrice | null}
 */
export function resolveModelPrice(model, env = process.env) {
  if (typeof model !== "string" || model.length === 0) {
    return null;
  }
  for (const key of modelPriceLookupKeys(model)) {
    const fromTable = MODEL_PRICING_USD_PER_MTOK[key];
    const slug = key
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const envIn = env[`KIT_TOKEN_PRICE_${slug}_IN`];
    const envOut = env[`KIT_TOKEN_PRICE_${slug}_OUT`];
    const input =
      typeof envIn === "string" && Number.isFinite(Number(envIn))
        ? Number(envIn)
        : fromTable?.input;
    const output =
      typeof envOut === "string" && Number.isFinite(Number(envOut))
        ? Number(envOut)
        : fromTable?.output;
    if (typeof input === "number" && typeof output === "number") {
      return { input, output, label: fromTable?.label ?? key };
    }
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
export function isFiniteTokenCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Prefer an explicit cost field from Cursor/Pi usage when present.
 *
 * @param {unknown} usage
 * @returns {number | null}
 */
export function readReportedCostUsd(usage) {
  if (usage === null || typeof usage !== "object") {
    return null;
  }
  const record = /** @type {Record<string, unknown>} */ (usage);
  for (const key of ["costUsd", "cost_usd", "total_cost", "totalCost", "cost"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Number(value.toFixed(6));
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Number(parsed.toFixed(6));
      }
    }
  }
  return null;
}

/**
 * @param {{
 *   model?: string,
 *   input?: number | "unknown",
 *   output?: number | "unknown",
 *   reportedCostUsd?: number | null,
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 * }} input
 * @returns {{ costUsd: number | null, estimate: boolean }}
 */
export function estimateLineCostUsd({
  model,
  input,
  output,
  reportedCostUsd = null,
  env = process.env,
}) {
  if (typeof reportedCostUsd === "number" && Number.isFinite(reportedCostUsd)) {
    return { costUsd: Number(reportedCostUsd.toFixed(6)), estimate: false };
  }
  const price = resolveModelPrice(model, env);
  if (!price || !isFiniteTokenCount(input) || !isFiniteTokenCount(output)) {
    return { costUsd: null, estimate: true };
  }
  const costUsd = (input / 1_000_000) * price.input + (output / 1_000_000) * price.output;
  return { costUsd: Number(costUsd.toFixed(6)), estimate: true };
}

/**
 * @param {Array<{ costUsd?: number | null }>} lines
 * @returns {number | null}
 */
export function sumCostUsd(lines = []) {
  let total = 0;
  let any = false;
  for (const line of lines) {
    if (typeof line?.costUsd === "number" && Number.isFinite(line.costUsd)) {
      total += line.costUsd;
      any = true;
    }
  }
  return any ? Number(total.toFixed(6)) : null;
}

/**
 * @param {number | null | undefined} costUsd
 */
export function formatCostUsd(costUsd) {
  if (typeof costUsd !== "number" || !Number.isFinite(costUsd)) {
    return "unknown";
  }
  if (costUsd < 0.01) {
    return `~$${costUsd.toFixed(4)}`;
  }
  return `~$${costUsd.toFixed(3)}`;
}
