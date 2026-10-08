import type { SentinelAdapter, SentinelDetection } from "./sentinel.adapter.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseDetection(value: unknown): SentinelDetection | null {
  if (!isRecord(value)) {
    return null;
  }
  const sentinelId = readString(value.sentinelId) ?? readString(value.id);
  const kind = readString(value.kind) ?? readString(value.type);
  const summary = readString(value.summary) ?? readString(value.message) ?? kind;
  const detectedAtRaw = readString(value.detectedAt) ?? readString(value.createdAt);
  if (!sentinelId || !kind || !summary || !detectedAtRaw) {
    return null;
  }
  const detectedAt = new Date(detectedAtRaw);
  if (Number.isNaN(detectedAt.getTime())) {
    return null;
  }
  const userId = readString(value.userId);
  return {
    sentinelId,
    kind,
    userId,
    summary,
    detectedAt,
  };
}

/**
 * Pulls Sentinel detections when `BETTER_AUTH_API_KEY` is set.
 * Missing key or a failed fetch returns an empty list — Auth ops still renders.
 */
export class LiveSentinelAdapter implements SentinelAdapter {
  async listDetections(): Promise<SentinelDetection[]> {
    const apiKey = process.env.BETTER_AUTH_API_KEY?.trim();
    if (!apiKey) {
      return [];
    }

    const origin = (
      process.env.BETTER_AUTH_SENTINEL_URL?.trim() || "https://api.better-auth.com"
    ).replace(/\/$/, "");

    try {
      const response = await fetch(`${origin}/sentinel/detections`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) {
        return [];
      }
      const body: unknown = await response.json();
      const rows = Array.isArray(body)
        ? body
        : isRecord(body) && Array.isArray(body.detections)
          ? body.detections
          : [];
      return rows
        .map((row) => parseDetection(row))
        .filter((row): row is SentinelDetection => row !== null);
    } catch {
      return [];
    }
  }
}
