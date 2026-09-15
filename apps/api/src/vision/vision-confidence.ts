import {
  VISION_CONFIDENCE_PRESELECT,
  VISION_CONFIDENCE_SUGGEST,
  type VisionEvalEntityHints,
  type VisionFieldPreselect,
  type VisionJobStatus,
  type VisionSuggestions,
} from "@kit/api-contract";
import type { IdentityVisionHints } from "./identity-vision-prompt.js";
import type { VisionFieldConfidences, VisionInferenceResult } from "./vision.adapter.js";

export function serializeConfidences(confidences: VisionFieldConfidences): string {
  return JSON.stringify(confidences);
}

export function parseConfidences(raw: string | null | undefined): VisionFieldConfidences | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }

    if (typeof parsed.overall !== "number") {
      return null;
    }

    return {
      overall: parsed.overall,
      club: typeof parsed.club === "number" ? parsed.club : undefined,
      nationalTeam: typeof parsed.nationalTeam === "number" ? parsed.nationalTeam : undefined,
      season: typeof parsed.season === "number" ? parsed.season : undefined,
      kitType: typeof parsed.kitType === "number" ? parsed.kitType : undefined,
      player: typeof parsed.player === "number" ? parsed.player : undefined,
      badge: typeof parsed.badge === "number" ? parsed.badge : undefined,
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Model self-reported confidence (0–1) scaled to 0–100 for gate decisions. */
export function computeOverallConfidence(modelConfidence: number | undefined): number {
  if (modelConfidence === undefined) {
    return 0;
  }

  return Math.round(modelConfidence * 100);
}

/**
 * Catalog ILIKE scores must not inflate a weak model guess into a preselect.
 * Missing model score keeps the match score (legacy overall-only payloads).
 */
export function combineModelAndMatchConfidence(
  model01: number | undefined,
  matchScore: number | undefined,
): number | undefined {
  if (model01 === undefined) {
    return matchScore;
  }

  const modelPct = computeOverallConfidence(model01);
  if (matchScore === undefined) {
    return modelPct;
  }

  return Math.min(modelPct, matchScore);
}

export function shouldPreselect(confidences: VisionFieldConfidences | null): boolean {
  if (!confidences) {
    return false;
  }

  return confidences.overall >= VISION_CONFIDENCE_PRESELECT;
}

export type VisionFieldGate = "preselect" | "suggest" | "omit";

export function resolveFieldGate(
  confidence: number | undefined,
  hasCatalogHit: boolean,
): VisionFieldGate {
  if (!hasCatalogHit) {
    return "omit";
  }

  const score = confidence ?? 0;
  if (score >= VISION_CONFIDENCE_PRESELECT) {
    return "preselect";
  }
  if (score >= VISION_CONFIDENCE_SUGGEST) {
    return "suggest";
  }

  return "omit";
}

export type ResolvedIdentityJob = {
  status: VisionJobStatus;
  suggestions?: VisionSuggestions;
  fieldPreselect?: VisionFieldPreselect;
  catalogMiss: boolean;
  /** Overall preselect for legacy clients — true when any field preselects. */
  preselect: boolean;
  storedResult: VisionInferenceResult | null;
};

export function parseClubHintFromVisionRaw(raw: string | null | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return undefined;
    }
    const clubHint = nonemptyString(parsed.clubHint);
    if (clubHint) {
      return clubHint;
    }
    if (Array.isArray(parsed.clubHintAlts)) {
      for (const alt of parsed.clubHintAlts) {
        const hint = nonemptyString(alt);
        if (hint) {
          return hint;
        }
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function parseVisionEvalHints(raw: string | null | undefined): VisionEvalEntityHints {
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return {};
    }

    const side: string[] = [];
    const clubHint = nonemptyString(parsed.clubHint);
    if (clubHint) {
      side.push(clubHint);
    }
    if (Array.isArray(parsed.clubHintAlts)) {
      for (const alt of parsed.clubHintAlts) {
        const hint = nonemptyString(alt);
        if (hint) {
          side.push(hint);
        }
      }
    }

    const hints: VisionEvalEntityHints = {};
    if (side.length > 0) {
      hints.side = side;
    }
    const playerHint = nonemptyString(parsed.playerHint);
    if (playerHint) {
      hints.player = [playerHint];
    }
    const patchHint = nonemptyString(parsed.patchHint);
    if (patchHint) {
      hints.patch = [patchHint];
    }
    return hints;
  } catch {
    return {};
  }
}

export function encodeVisionEvalRaw(hints: IdentityVisionHints, kitHitCount?: number): string {
  return JSON.stringify(kitHitCount === undefined ? hints : { ...hints, kitHitCount });
}

export function parseZeroKitHits(raw: string | null | undefined): boolean {
  if (!raw) {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return false;
    }
    if (typeof parsed.kitHitCount === "number") {
      return parsed.kitHitCount === 0;
    }
    if (Array.isArray(parsed.kitHits)) {
      return parsed.kitHits.length === 0;
    }
  } catch {
    return false;
  }

  return false;
}

function nonemptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hadClubCatalogHint(result: VisionInferenceResult): boolean {
  return Boolean(result.clubHint?.trim() || parseClubHintFromVisionRaw(result.visionRaw));
}

export function resolveIdentityJob(result: VisionInferenceResult | null): ResolvedIdentityJob {
  if (!result) {
    return {
      status: "noop",
      catalogMiss: false,
      preselect: false,
      storedResult: null,
    };
  }

  const confidences = result.confidences;
  const clubGate = resolveFieldGate(
    confidences?.club ?? confidences?.overall,
    Boolean(result.clubId),
  );
  const nationalTeamGate = resolveFieldGate(
    confidences?.nationalTeam ?? confidences?.overall,
    Boolean(result.nationalTeamId),
  );
  const seasonGate = resolveFieldGate(
    confidences?.season ?? confidences?.overall,
    Boolean(result.seasonId),
  );
  const typeGate = resolveFieldGate(
    confidences?.kitType ?? confidences?.overall,
    Boolean(result.catalogKitId),
  );
  const playerGate = resolveFieldGate(
    confidences?.player ?? confidences?.overall,
    Boolean(result.playerId),
  );
  const badgeGate = resolveFieldGate(
    confidences?.badge ?? confidences?.overall,
    Boolean(result.patchId),
  );

  const catalogMiss = Boolean(hadClubCatalogHint(result) && !result.clubId && !result.catalogKitId);

  const suggestions: VisionSuggestions = {};
  const fieldPreselect: VisionFieldPreselect = {};

  if (clubGate !== "omit" && result.clubId) {
    suggestions.clubId = result.clubId;
    if (clubGate === "preselect") {
      fieldPreselect.club = true;
    }
  }

  if (nationalTeamGate !== "omit" && result.nationalTeamId) {
    suggestions.nationalTeamId = result.nationalTeamId;
    if (nationalTeamGate === "preselect") {
      fieldPreselect.nationalTeam = true;
    }
  }

  if (seasonGate !== "omit" && result.seasonId) {
    suggestions.seasonId = result.seasonId;
    if (seasonGate === "preselect") {
      fieldPreselect.season = true;
    }
  }

  if (typeGate !== "omit" && result.type && result.catalogKitId) {
    suggestions.type = result.type;
    if (typeGate === "preselect") {
      fieldPreselect.type = true;
    }
  }

  if (playerGate !== "omit" && result.playerId) {
    suggestions.playerId = result.playerId;
    if (result.playerNumber) {
      suggestions.playerNumber = result.playerNumber;
    }
    if (playerGate === "preselect") {
      fieldPreselect.player = true;
    }
  }

  if (badgeGate !== "omit" && result.patchId) {
    suggestions.patchId = result.patchId;
    if (badgeGate === "preselect") {
      fieldPreselect.badge = true;
    }
  }

  if (result.catalogKitId && seasonGate !== "omit") {
    suggestions.catalogKitId = result.catalogKitId;
  }

  const hasSuggestion = Boolean(
    suggestions.clubId ||
      suggestions.nationalTeamId ||
      suggestions.seasonId ||
      suggestions.type ||
      suggestions.catalogKitId ||
      suggestions.playerId ||
      suggestions.patchId,
  );

  if (!hasSuggestion && !catalogMiss) {
    return {
      status: "noop",
      catalogMiss,
      preselect: false,
      storedResult: {
        visionRaw: result.visionRaw,
        confidences: result.confidences,
        latencyMs: result.latencyMs,
        model: result.model,
        clubHint: result.clubHint,
      },
    };
  }

  const preselect = Boolean(
    fieldPreselect.club ||
      fieldPreselect.nationalTeam ||
      fieldPreselect.season ||
      fieldPreselect.type ||
      fieldPreselect.player ||
      fieldPreselect.badge,
  );

  return {
    status: hasSuggestion || catalogMiss ? "ready" : "noop",
    suggestions: hasSuggestion ? suggestions : undefined,
    fieldPreselect: hasSuggestion ? fieldPreselect : undefined,
    catalogMiss,
    preselect,
    storedResult: result,
  };
}

/** @deprecated Use resolveIdentityJob for per-field gates. */
export function resolveVisionStatus(result: VisionInferenceResult | null): {
  status: VisionJobStatus;
  result: VisionInferenceResult | null;
} {
  const resolved = resolveIdentityJob(result);
  return { status: resolved.status, result: resolved.storedResult };
}
