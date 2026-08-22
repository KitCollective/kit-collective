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
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (typeof record.overall !== "number") {
      return null;
    }

    return {
      overall: record.overall,
      club: typeof record.club === "number" ? record.club : undefined,
      season: typeof record.season === "number" ? record.season : undefined,
      kitType: typeof record.kitType === "number" ? record.kitType : undefined,
    };
  } catch {
    return null;
  }
}

export function shouldPreselect(confidences: VisionFieldConfidences | null): boolean {
  if (!confidences) {
    return false;
  }

  return confidences.overall >= VISION_CONFIDENCE_PRESELECT;
}

export function resolveVisionStatus(
  result: VisionInferenceResult | null,
): { status: VisionJobStatus; result: VisionInferenceResult | null } {
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
