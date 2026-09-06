import {
  VISION_CONFIDENCE_PRESELECT,
  VISION_CONFIDENCE_SUGGEST,
  type VisionGroupingSuggestions,
  type VisionJobStatus,
} from "@kit/api-contract";
import type { VisionGroupingInferenceResult } from "./vision.adapter.js";

export function serializeGroupingResult(grouping: VisionGroupingSuggestions): string {
  return JSON.stringify(grouping);
}

export function parseGroupingResult(
  raw: string | null | undefined,
): VisionGroupingSuggestions | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.groups)) {
      return null;
    }

    const groups = parsed.groups
      .map((entry) => {
        if (!isRecord(entry) || !Array.isArray(entry.photoIds)) {
          return null;
        }
        const photoIds = entry.photoIds.filter((id): id is string => typeof id === "string");
        if (photoIds.length === 0) {
          return null;
        }
        return {
          photoIds,
          confidence: typeof entry.confidence === "number" ? entry.confidence : undefined,
        };
      })
      .filter((group): group is NonNullable<typeof group> => group !== null);

    if (groups.length === 0) {
      return null;
    }

    return { groups };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function resolveGroupingOverallConfidence(
  result: VisionGroupingInferenceResult | null,
): number {
  if (!result || result.groups.length === 0) {
    return 0;
  }

  const confidences = result.groups.map((group) => group.confidence);
  return Math.min(...confidences);
}

export function shouldPreselectGrouping(confidence: number): boolean {
  return confidence >= VISION_CONFIDENCE_PRESELECT;
}

export function resolveGroupingStatus(result: VisionGroupingInferenceResult | null): {
  status: VisionJobStatus;
  result: VisionGroupingInferenceResult | null;
  overallConfidence: number;
} {
  if (!result || result.groups.length === 0) {
    return { status: "noop", result: null, overallConfidence: 0 };
  }

  const overallConfidence = resolveGroupingOverallConfidence(result);
  if (overallConfidence >= VISION_CONFIDENCE_SUGGEST) {
    return { status: "ready", result, overallConfidence };
  }

  return { status: "noop", result: null, overallConfidence };
}
