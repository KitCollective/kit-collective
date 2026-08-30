/**
 * Cheapest-capable model routing for implement gates.
 * Rule-based complexity → gate → free rotation → paid fallback.
 * Pi agent frontmatter still pins defaults; this module drives prompts + metrics.
 */

/** @typedef {"plan" | "scaffold" | "implement" | "verify"} ModelGate */
/** @typedef {"simple" | "standard" | "critical"} ComplexityTier */

export const FREE_MODEL_ROTATION = Object.freeze([
  "openrouter/minimax/minimax-m3:free",
  "openrouter/z-ai/glm-5.2:free",
  "openrouter/poolside/laguna-s-2.1:free",
]);

export const PAID_FALLBACK_CHAIN = Object.freeze(["openrouter/tencent/hy3", "cursor/composer-2.5"]);

export const COMPOSER_MODEL = "cursor/composer-2.5";
export const SCOUT_MODEL = "openrouter/tencent/hy3";
export const VERIFY_PRIMARY = "openrouter/tencent/hy3";

/** Paths / keywords that force critical (Composer) ownership. */
export const CRITICAL_PATH_MARKERS = Object.freeze([
  "auth",
  "session",
  "jwt",
  "passport",
  "iap",
  "storekit",
  "billing",
  "entitlement",
  "payment",
  "vision",
  "secret",
  "webhook",
]);

export const CRITICAL_HELPERS = Object.freeze(["nest"]);

/**
 * @param {string} text
 * @returns {boolean}
 */
function mentionsCritical(text) {
  const lower = String(text ?? "").toLowerCase();
  return CRITICAL_PATH_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Score slice complexity from ticket + write-scope + helpers (no model call).
 *
 * @param {{
 *   title?: string,
 *   body?: string,
 *   writeScope?: string,
 *   requiredHelpers?: string[],
 *   paths?: string[],
 * }} input
 * @returns {{
 *   tier: ComplexityTier,
 *   score: number,
 *   reasons: string[],
 *   skipDraft: boolean,
 * }}
 */
export function classifySliceComplexity(input = {}) {
  const title = typeof input.title === "string" ? input.title : "";
  const body = typeof input.body === "string" ? input.body : "";
  const writeScope = typeof input.writeScope === "string" ? input.writeScope : "";
  const helpers = Array.isArray(input.requiredHelpers) ? input.requiredHelpers : [];
  const paths = Array.isArray(input.paths) ? input.paths : [];
  const blob = `${title}\n${body}\n${writeScope}\n${paths.join("\n")}\n${helpers.join(",")}`;

  /** @type {string[]} */
  const reasons = [];
  let score = 0;

  const pathCount = paths.length > 0 ? paths.length : writeScope.split(",").filter(Boolean).length;
  if (pathCount >= 8) {
    score += 2;
    reasons.push(`many paths (${pathCount})`);
  } else if (pathCount >= 4) {
    score += 1;
    reasons.push(`several paths (${pathCount})`);
  }

  if (helpers.some((helper) => CRITICAL_HELPERS.includes(helper))) {
    score += 3;
    reasons.push("nest helper (API/auth surface)");
  }
  if (helpers.includes("drizzle")) {
    score += 1;
    reasons.push("drizzle helper");
  }
  if (helpers.includes("expo") || helpers.includes("ui-ux")) {
    score += 1;
    reasons.push("UI helper");
  }

  const criticalHit = mentionsCritical(blob);
  if (criticalHit) {
    score += 4;
    reasons.push("critical keyword (auth/IAP/Vision/secrets/billing)");
  }

  if (/\brace\b|concurren|deadlock|idempoten|migrat/i.test(blob)) {
    score += 2;
    reasons.push("concurrency or migration signal");
  }

  if (
    /\b(crud|boilerplate|scaffold|rename|copy|typo|css|padding|margin)\b/i.test(blob) &&
    !criticalHit
  ) {
    score -= 1;
    reasons.push("simple CRUD/scaffold wording");
  }

  /** @type {ComplexityTier} */
  let tier = "standard";
  if (score >= 4 || criticalHit) {
    tier = "critical";
  } else if (score <= 1) {
    tier = "simple";
  }

  const skipDraft = tier === "critical" && criticalHit;
  if (skipDraft) {
    reasons.push("Skip Draft — critical seam");
  }

  return { tier, score, reasons, skipDraft };
}

/**
 * Full free→paid chain for rate-limit rotation.
 * @returns {string[]}
 */
export function freeThenPaidChain() {
  return [...FREE_MODEL_ROTATION, ...PAID_FALLBACK_CHAIN];
}

/**
 * Rotate free models starting at `startIndex` (round-robin across jobs).
 *
 * @param {number} [startIndex]
 * @returns {string[]}
 */
export function rotateFreeChain(startIndex = 0) {
  const n = FREE_MODEL_ROTATION.length;
  const start = ((Number(startIndex) % n) + n) % n;
  /** @type {string[]} */
  const rotated = [];
  for (let i = 0; i < n; i += 1) {
    rotated.push(FREE_MODEL_ROTATION[(start + i) % n]);
  }
  return [...rotated, ...PAID_FALLBACK_CHAIN];
}

/**
 * @param {ModelGate} gate
 * @param {ComplexityTier} tier
 * @param {{ rotationIndex?: number }} [options]
 * @returns {{
 *   gate: ModelGate,
 *   tier: ComplexityTier,
 *   primary: string,
 *   fallbacks: string[],
 *   chain: string[],
 *   useFree: boolean,
 * }}
 */
export function routeForGate(gate, tier, options = {}) {
  const rotationIndex =
    typeof options.rotationIndex === "number" && Number.isFinite(options.rotationIndex)
      ? options.rotationIndex
      : 0;
  const freeChain = rotateFreeChain(rotationIndex);

  if (gate === "plan") {
    return {
      gate,
      tier,
      primary: SCOUT_MODEL,
      fallbacks: ["openrouter/xiaomi/mimo-v2.5-pro", COMPOSER_MODEL],
      chain: [SCOUT_MODEL, "openrouter/xiaomi/mimo-v2.5-pro", COMPOSER_MODEL],
      useFree: false,
    };
  }

  if (gate === "scaffold") {
    if (tier === "critical") {
      return {
        gate,
        tier,
        primary: COMPOSER_MODEL,
        fallbacks: [],
        chain: [COMPOSER_MODEL],
        useFree: false,
      };
    }
    return {
      gate,
      tier,
      primary: freeChain[0],
      fallbacks: freeChain.slice(1),
      chain: freeChain,
      useFree: true,
    };
  }

  if (gate === "verify") {
    // Criteria-only: cheap OpenRouter first; Composer last.
    return {
      gate,
      tier,
      primary: VERIFY_PRIMARY,
      fallbacks: [...FREE_MODEL_ROTATION, COMPOSER_MODEL],
      chain: [VERIFY_PRIMARY, ...FREE_MODEL_ROTATION, COMPOSER_MODEL],
      useFree: true,
    };
  }

  // implement gate
  if (tier === "simple") {
    return {
      gate,
      tier,
      primary: freeChain[0],
      fallbacks: freeChain.slice(1),
      chain: freeChain,
      useFree: true,
    };
  }
  if (tier === "critical") {
    return {
      gate,
      tier,
      primary: COMPOSER_MODEL,
      fallbacks: [],
      chain: [COMPOSER_MODEL],
      useFree: false,
    };
  }
  return {
    gate,
    tier,
    primary: COMPOSER_MODEL,
    fallbacks: freeChain,
    chain: [COMPOSER_MODEL, ...freeChain],
    useFree: false,
  };
}

/**
 * Build the full route card for an implement stay (injected into prompt / append).
 *
 * @param {{
 *   title?: string,
 *   body?: string,
 *   writeScope?: string,
 *   requiredHelpers?: string[],
 *   paths?: string[],
 *   rotationIndex?: number,
 * }} input
 */
export function buildModelRoute(input = {}) {
  const complexity = classifySliceComplexity(input);
  const rotationIndex = input.rotationIndex ?? Date.now();
  const plan = routeForGate("plan", complexity.tier, { rotationIndex });
  const scaffold = routeForGate("scaffold", complexity.tier, { rotationIndex });
  const implement = routeForGate("implement", complexity.tier, { rotationIndex });
  const verify = routeForGate("verify", complexity.tier, { rotationIndex });

  return {
    complexity,
    skipDraft: complexity.skipDraft,
    gates: { plan, scaffold, implement, verify },
    freeRotation: rotateFreeChain(rotationIndex).filter((id) => id.includes(":free")),
  };
}

/**
 * Markdown block for implement prompt / append overlay.
 *
 * @param {ReturnType<typeof buildModelRoute>} route
 * @returns {string}
 */
export function formatModelRouteBrief(route) {
  const { complexity, gates, skipDraft, freeRotation } = route;
  const lines = [
    "### Model route (cheapest capable)",
    "",
    `- Complexity: **${complexity.tier}** (score ${complexity.score})`,
    `- Reasons: ${complexity.reasons.length > 0 ? complexity.reasons.join("; ") : "(none)"}`,
    `- Free rotation: ${freeRotation.join(" → ")}`,
    `- Plan (Scout): \`${gates.plan.primary}\``,
    `- Scaffold (Draft): ${skipDraft ? "**Skip Draft** (critical seam)" : `\`${gates.scaffold.primary}\` → ${gates.scaffold.fallbacks.slice(0, 3).join(" → ")}`}`,
    `- Implement (parent/helpers): \`${gates.implement.primary}\`${gates.implement.useFree ? " (free-capable simple slice — still harden with Composer helpers when listed)" : " (Composer owns complex/critical logic)"}`,
    `- Verify (criteria-only): \`${gates.verify.primary}\` then free rotation; Mechanical close stays harness-owned (no Pi Gate)`,
    "",
    "Override: if a free model 429s, continue the fallback chain — do not stall the stay.",
  ];
  return `${lines.join("\n")}\n`;
}
