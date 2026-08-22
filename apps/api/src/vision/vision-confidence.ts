import {
  VISION_CONFIDENCE_PRESELECT,
  VISION_CONFIDENCE_SUGGEST,
  type VisionJobStatus,
} from "@kit/api-contract";
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
      season: typeof parsed.season === "number" ? parsed.season : undefined,
      kitType: typeof parsed.kitType === "number" ? parsed.kitType : undefined,
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

export function shouldPreselect(confidences: VisionFieldConfidences | null): boolean {
  if (!confidences) {
    return false;
  }

  return confidences.overall >= VISION_CONFIDENCE_PRESELECT;
}

export function resolveVisionStatus(result: VisionInferenceResult | null): {
  status: VisionJobStatus;
  result: VisionInferenceResult | null;
} {
  if (!result) {
    return { status: "noop", result: null };
  }

  const hasCatalogHit = Boolean(
    result.clubId || result.seasonId || result.catalogKitId || result.type,
  );

  if (!hasCatalogHit) {
    return { status: "noop", result };
  }

  const overall = result.confidences?.overall ?? 0;
  if (overall >= VISION_CONFIDENCE_SUGGEST) {
    return { status: "ready", result };
  }

  return {
    status: "noop",
    result: {
      visionRaw: result.visionRaw,
      confidences: result.confidences,
      latencyMs: result.latencyMs,
      model: result.model,
    },
  };
}
