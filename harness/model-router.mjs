/**
 * Cheapest-capable model routing for implement gates.
 * Rule-based complexity → gate → free rotation → paid fallback.
 * Profile (`HARNESS_MODEL_PROFILE`) shifts how aggressive free/cheap OpenRouter is.
 * Pi agent frontmatter still pins defaults; this module drives prompts + metrics.
 */

/** @typedef {"plan" | "scaffold" | "implement" | "verify"} ModelGate */
/** @typedef {"simple" | "standard" | "critical"} ComplexityTier */
/** @typedef {"economy" | "balanced" | "premium"} ModelProfile */

export const FREE_MODEL_ROTATION = Object.freeze([
  "openrouter/minimax/minimax-m3:free",
  "openrouter/z-ai/glm-5.2:free",
  "openrouter/poolside/laguna-s-2.1",
]);

export const PAID_FALLBACK_CHAIN = Object.freeze(["openrouter/tencent/hy3", "cursor/composer-2.5"]);

/** OpenRouter-only fallback after free rotation — no Cursor Composer. */
export const ECONOMY_PAID_FALLBACK_CHAIN = Object.freeze([
  "openrouter/tencent/hy3",
  "openrouter/xiaomi/mimo-v2.5-pro",
]);

export const COMPOSER_MODEL = "cursor/composer-2.5";
export const SCOUT_MODEL = "openrouter/tencent/hy3";
export const VERIFY_PRIMARY = "openrouter/tencent/hy3";
/** Cheap OpenRouter for factory-checker / land when profile is economy (not Grok). */
export const ECONOMY_FAST_MODEL = SCOUT_MODEL;

/** Agent files whose frontmatter `model:` is rewritten for an economy stay. */
export const ECONOMY_PINNED_AGENTS = Object.freeze([
  "draft.md",
  "scout.md",
  "gate.md",
  "nest.md",
  "expo.md",
  "drizzle.md",
  "ui-ux.md",
  "devops.md",
  "slop.md",
]);

export const MODEL_PROFILES = Object.freeze(["economy", "balanced", "premium"]);
export const DEFAULT_MODEL_PROFILE = "balanced";

/**
 * @param {unknown} value
 * @returns {ModelProfile}
 */
export function parseModelProfile(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "economy" || raw === "balanced" || raw === "premium") {
    return raw;
  }
  return DEFAULT_MODEL_PROFILE;
}

/**
 * @param {string[]} chain
 * @returns {string[]}
 */
export function withoutComposer(chain) {
  return chain.filter((id) => !String(id).toLowerCase().includes("composer"));
}

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

  const hasSignal =
    title.trim().length > 0 ||
    body.trim().length > 0 ||
    writeScope.trim().length > 0 ||
    helpers.length > 0 ||
    paths.length > 0;

  /** @type {ComplexityTier} */
  let tier = "standard";
  if (!hasSignal) {
    tier = "standard";
    reasons.push("no slice signal — default standard (Composer parent)");
  } else if (score >= 4 || criticalHit) {
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
 * Economy chain: free/Laguna → Hy3 → MiMo. Never Cursor Composer.
 *
 * @param {number} [startIndex]
 * @returns {string[]}
 */
export function rotateEconomyChain(startIndex = 0) {
  const n = FREE_MODEL_ROTATION.length;
  const start = ((Number(startIndex) % n) + n) % n;
  /** @type {string[]} */
  const rotated = [];
  for (let i = 0; i < n; i += 1) {
    rotated.push(FREE_MODEL_ROTATION[(start + i) % n]);
  }
  return withoutComposer([...rotated, ...ECONOMY_PAID_FALLBACK_CHAIN]);
}

/**
 * @param {ModelGate} gate
 * @param {ComplexityTier} tier
 * @param {{ rotationIndex?: number, profile?: ModelProfile | string }} [options]
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
  const profile = parseModelProfile(options.profile);
  const rotationIndex =
    typeof options.rotationIndex === "number" && Number.isFinite(options.rotationIndex)
      ? options.rotationIndex
      : 0;
  const freeChain =
    profile === "economy" ? rotateEconomyChain(rotationIndex) : rotateFreeChain(rotationIndex);

  if (gate === "plan") {
    if (profile === "economy") {
      return {
        gate,
        tier,
        primary: SCOUT_MODEL,
        fallbacks: withoutComposer([
          "openrouter/xiaomi/mimo-v2.5-pro",
          ...FREE_MODEL_ROTATION,
        ]),
        chain: withoutComposer([
          SCOUT_MODEL,
          "openrouter/xiaomi/mimo-v2.5-pro",
          ...FREE_MODEL_ROTATION,
        ]),
        useFree: false,
      };
    }
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
    if (tier === "critical" && profile !== "economy") {
      return {
        gate,
        tier,
        primary: COMPOSER_MODEL,
        fallbacks: [],
        chain: [COMPOSER_MODEL],
        useFree: false,
      };
    }
    if (profile === "premium") {
      return {
        gate,
        tier,
        primary: COMPOSER_MODEL,
        fallbacks: freeChain,
        chain: [COMPOSER_MODEL, ...freeChain],
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
    if (profile === "economy") {
      return {
        gate,
        tier,
        primary: VERIFY_PRIMARY,
        fallbacks: freeChain,
        chain: [VERIFY_PRIMARY, ...freeChain.filter((id) => id !== VERIFY_PRIMARY)],
        useFree: true,
      };
    }
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
  if (profile === "premium") {
    return {
      gate,
      tier,
      primary: COMPOSER_MODEL,
      fallbacks: freeChain,
      chain: [COMPOSER_MODEL, ...freeChain],
      useFree: false,
    };
  }

  if (profile === "economy") {
    // Allowlisted cheap OpenRouter only. Free MiniMax as parent/helper primary fails
    // closed on KIT-Pi-harness and sends the session into harness meta-debug.
    const mimo = "openrouter/xiaomi/mimo-v2.5-pro";
    const economyPrimary = SCOUT_MODEL;
    const economyFallbacks = withoutComposer([mimo, ...FREE_MODEL_ROTATION]);
    return {
      gate,
      tier,
      primary: economyPrimary,
      fallbacks: economyFallbacks,
      chain: [economyPrimary, ...economyFallbacks],
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

  // balanced standard
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
 *   profile?: ModelProfile | string,
 * }} input
 */
export function buildModelRoute(input = {}) {
  const complexity = classifySliceComplexity(input);
  const profile = parseModelProfile(input.profile);
  const rotationIndex = input.rotationIndex ?? Date.now();
  const gateOpts = { rotationIndex, profile };
  const plan = routeForGate("plan", complexity.tier, gateOpts);
  const scaffold = routeForGate("scaffold", complexity.tier, gateOpts);
  const implement = routeForGate("implement", complexity.tier, gateOpts);
  const verify = routeForGate("verify", complexity.tier, gateOpts);

  return {
    profile,
    complexity,
    skipDraft: complexity.skipDraft,
    gates: { plan, scaffold, implement, verify },
    freeRotation: (profile === "economy" ? rotateEconomyChain(rotationIndex) : rotateFreeChain(rotationIndex)).filter(
      (id) => id.includes(":free") || id.includes("laguna-s-2.1"),
    ),
  };
}

/**
 * Markdown block for implement prompt / append overlay.
 *
 * @param {ReturnType<typeof buildModelRoute>} route
 * @returns {string}
 */
export function formatModelRouteBrief(route) {
  const { complexity, gates, skipDraft, freeRotation, profile } = route;
  const profileLabel = parseModelProfile(profile);
  const economy = profileLabel === "economy";
  const implementNote = gates.implement.useFree
    ? economy
      ? " (harness sets parent `--model` + pins Scout/Draft/helpers/Slop to OpenRouter — no Composer)"
      : " (harness sets parent `--model` to this free/cheap primary — Composer helpers still harden when listed)"
    : " (Composer parent `--model`; owns complex/critical logic)";
  const lines = [
    "### Model route (cheapest capable)",
    "",
    `- Profile: **${profileLabel}** (\`HARNESS_MODEL_PROFILE\`)`,
    `- Complexity: **${complexity.tier}** (score ${complexity.score})`,
    `- Reasons: ${complexity.reasons.length > 0 ? complexity.reasons.join("; ") : "(none)"}`,
    `- Cheap rotation: ${freeRotation.join(" → ")}`,
    `- Plan (Scout): \`${gates.plan.primary}\``,
    `- Scaffold (Draft): ${skipDraft ? "**Skip Draft** (critical seam)" : `\`${gates.scaffold.primary}\` → ${gates.scaffold.fallbacks.slice(0, 3).join(" → ")}`}`,
    `- Implement (parent/helpers): \`${gates.implement.primary}\`${implementNote}`,
    `- Verify (criteria-only): \`${gates.verify.primary}\` then free rotation; Mechanical close stays harness-owned (no Pi Gate)`,
    "",
    economy
      ? "Economy: OpenRouter only (Hy3 primary for parent/helpers — free models are fallbacks). Never edit `.pi/agents` or `.cursor/agents`; harness owns those pins. On 429, continue the OpenRouter fallback chain."
      : "Override: if a free model 429s, continue the fallback chain — do not stall the stay.",
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * Parent Pi `--model` for an implement stay.
 * useFree → route primary (free/Laguna chain). Premium never overrides to free.
 * Economy never returns Composer even if `fallbackModel` is Composer.
 *
 * @param {ReturnType<typeof buildModelRoute> | null | undefined} route
 * @param {string} fallbackModel
 * @returns {string}
 */
export function resolveImplementParentModel(route, fallbackModel) {
  const profile = parseModelProfile(route?.profile);
  const gate = route?.gates?.implement;
  if (profile === "premium") {
    return typeof fallbackModel === "string" && fallbackModel.length > 0
      ? fallbackModel
      : COMPOSER_MODEL;
  }
  if (profile === "economy") {
    if (gate && typeof gate.primary === "string" && gate.primary.length > 0) {
      return gate.primary;
    }
    return rotateEconomyChain(0)[0];
  }
  const fallback =
    typeof fallbackModel === "string" && fallbackModel.length > 0 ? fallbackModel : COMPOSER_MODEL;
  if (!gate || typeof gate.primary !== "string" || gate.primary.length === 0) {
    return fallback;
  }
  if (gate.useFree === true) {
    return gate.primary;
  }
  return fallback;
}

/**
 * factory-checker / land `--model`. Economy swaps Grok for cheap OpenRouter Hy3.
 *
 * @param {ModelProfile | string | undefined} profile
 * @param {string} fallbackFastModel
 * @returns {string}
 */
export function resolveFastRoleModel(profile, fallbackFastModel) {
  const fallback =
    typeof fallbackFastModel === "string" && fallbackFastModel.length > 0
      ? fallbackFastModel
      : "cursor/grok-4.6";
  if (parseModelProfile(profile) === "economy") {
    return ECONOMY_FAST_MODEL;
  }
  return fallback;
}

/**
 * Per-agent OpenRouter pins for an economy stay (no Composer in model or fallbacks).
 * Helpers/Slop/Draft use Hy3 (KIT-Pi-harness allowlist) — free MiniMax as helper primary
 * fails closed instantly and sends the parent into harness meta-debug.
 *
 * @param {string} agentFileName e.g. `nest.md`
 * @param {number} [rotationIndex]
 * @returns {{ model: string, fallbackModels: string[] }}
 */
export function economyAgentModelSpec(agentFileName, rotationIndex = 0) {
  const name = String(agentFileName ?? "").replace(/^.*\//, "");
  const mimo = "openrouter/xiaomi/mimo-v2.5-pro";
  const allowlistedFallbacks = withoutComposer([mimo, ...FREE_MODEL_ROTATION]);
  if (name === "scout.md") {
    return {
      model: SCOUT_MODEL,
      fallbackModels: allowlistedFallbacks,
    };
  }
  if (name === "gate.md") {
    return {
      model: mimo,
      fallbackModels: withoutComposer([SCOUT_MODEL, ...FREE_MODEL_ROTATION]),
    };
  }
  // draft, nest, expo, drizzle, ui-ux, devops, slop — Hy3 primary (same allowlist as Scout)
  void rotationIndex;
  return {
    model: SCOUT_MODEL,
    fallbackModels: allowlistedFallbacks,
  };
}

/**
 * Ensure agent markdown starts at YAML frontmatter (`---`). Leading HTML comments
 * on generated helpers break pi-subagents discovery for some model paths.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function stripLeadingNoiseBeforeFrontmatter(markdown) {
  let out = String(markdown ?? "");
  // Drop any preamble before the first frontmatter fence.
  const fence = out.search(/^---\s*$/m);
  if (fence > 0) {
    out = out.slice(fence);
  }
  return out;
}

/**
 * Rewrite YAML frontmatter `model` / `fallbackModels` (keeps body intact).
 *
 * @param {string} markdown
 * @param {{ model: string, fallbackModels: string[] }} pins
 * @returns {string}
 */
export function rewriteAgentModelFrontmatter(markdown, pins) {
  const model = typeof pins.model === "string" ? pins.model : "";
  const fallbacks = Array.isArray(pins.fallbackModels) ? pins.fallbackModels.filter(Boolean) : [];
  const fbLine = fallbacks.join(", ");
  let out = stripLeadingNoiseBeforeFrontmatter(markdown);
  if (/^model:\s*.+$/m.test(out)) {
    out = out.replace(/^model:\s*.+$/m, `model: ${model}`);
  }
  if (/^fallbackModels:\s*.+$/m.test(out)) {
    out = out.replace(/^fallbackModels:\s*.+$/m, `fallbackModels: ${fbLine}`);
  } else if (fbLine.length > 0 && /^model:\s*.+$/m.test(out)) {
    out = out.replace(/^(model:\s*.+)$/m, `$1\nfallbackModels: ${fbLine}`);
  }
  return out;
}

/**
 * Short label for token lines / health.
 *
 * @param {string | undefined} modelId
 * @returns {string}
 */
export function labelForModelId(modelId) {
  const id = String(modelId ?? "").toLowerCase();
  if (id.includes("composer")) return "Composer";
  if (id.includes("grok")) return "Grok";
  if (id.includes("laguna")) return "Laguna";
  if (id.includes("minimax")) return "MiniMax";
  if (id.includes("glm")) return "GLM";
  if (id.includes("hy3") || id.includes("hy-3")) return "Hy3";
  if (id.includes("mimo")) return "MiMo";
  return typeof modelId === "string" && modelId.length > 0 ? modelId : "unknown";
}
