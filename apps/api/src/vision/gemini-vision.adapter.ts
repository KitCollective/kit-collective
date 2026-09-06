import type { Db } from "@kit/db";
import type { KitType } from "@kit/domain";
import { KIT_TYPES } from "@kit/domain";
import { NoopVisionAdapter } from "./noop-vision.adapter.js";
import type {
  VisionAdapter,
  VisionGroupingInferenceResult,
  VisionGroupingPhotoInput,
  VisionIdentityPhotoInput,
  VisionInferenceResult,
} from "./vision.adapter.js";
import { VisionCatalogMapper } from "./vision-catalog-mapper.js";

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_TIMEOUT_MS = 10_000;

type GeminiStructured = {
  clubHint?: string;
  seasonHint?: string;
  kitType?: KitType;
  confidence?: number;
};

function hasGeminiConfig(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isKitType(value: unknown): value is KitType {
  if (typeof value !== "string") {
    return false;
  }

  return KIT_TYPES.some((kitType) => kitType === value);
}

function extractGeminiText(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }

  const candidates = body.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const firstCandidate = candidates[0];
  if (!isRecord(firstCandidate)) {
    return null;
  }

  const content = firstCandidate.content;
  if (!isRecord(content)) {
    return null;
  }

  const parts = content.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    return null;
  }

  const firstPart = parts[0];
  if (!isRecord(firstPart) || typeof firstPart.text !== "string") {
    return null;
  }

  return firstPart.text;
}

function decodeGeminiResponse(body: unknown): GeminiStructured | null {
  const text = extractGeminiText(body);
  if (!text) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) {
      return null;
    }

    return {
      clubHint: typeof parsed.clubHint === "string" ? parsed.clubHint : undefined,
      seasonHint: typeof parsed.seasonHint === "string" ? parsed.seasonHint : undefined,
      kitType: isKitType(parsed.kitType) ? parsed.kitType : undefined,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
    };
  } catch {
    return null;
  }
}

export class GeminiVisionAdapter implements VisionAdapter {
  private readonly mapper: VisionCatalogMapper;

  constructor(private readonly db: Db) {
    this.mapper = new VisionCatalogMapper(db);
  }

  async infer(photos: VisionIdentityPhotoInput[]): Promise<VisionInferenceResult | null> {
    if (!hasGeminiConfig() || photos.length === 0) {
      return null;
    }

    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
      const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
        {
          text:
            photos.length === 1
              ? 'Identify the football club, season, and kit type (home|away|third|fourth|gk|special) from this jersey photo. Reply JSON only: {"clubHint":"...","seasonHint":"...","kitType":"home","confidence":0.85}. confidence is 0-1 for how sure you are overall. Use English club names. Omit fields you cannot infer.'
              : 'Identify the football club, season, and kit type (home|away|third|fourth|gk|special) from these jersey photos of the same shirt. Reply JSON only: {"clubHint":"...","seasonHint":"...","kitType":"home","confidence":0.85}. confidence is 0-1 for how sure you are overall. Use English club names. Omit fields you cannot infer.',
        },
      ];

      for (const photo of photos) {
        if (photo.role) {
          parts.push({ text: `role: ${photo.role}` });
        }
        parts.push({
          inline_data: {
            mime_type: "image/jpeg",
            data: Buffer.from(photo.bytes).toString("base64"),
          },
        });
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          }),
        },
      );

      if (!response.ok) {
        return null;
      }

      const body = await response.json();
      const structured = decodeGeminiResponse(body);
      if (!structured) {
        return null;
      }

      const mapped = await this.mapper.mapHints(structured);
      if (!mapped) {
        return null;
      }

      return {
        ...mapped,
        visionRaw: JSON.stringify(structured),
        latencyMs: Date.now() - started,
        model: GEMINI_MODEL,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async inferGrouping(
    photos: VisionGroupingPhotoInput[],
  ): Promise<VisionGroupingInferenceResult | null> {
    if (!hasGeminiConfig() || photos.length < 2) {
      return null;
    }

    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
      const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
        {
          text: 'Group these football jersey photos into separate shirts. Reply JSON only: {"groups":[{"photoIds":["<uuid>",...],"confidence":0.85}]}. Use the exact photoId strings provided before each image. confidence is 0-1 per group.',
        },
      ];

      for (const photo of photos) {
        parts.push({ text: `photoId: ${photo.photoId}` });
        parts.push({
          inline_data: {
            mime_type: "image/jpeg",
            data: Buffer.from(photo.bytes).toString("base64"),
          },
        });
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          }),
        },
      );

      if (!response.ok) {
        return null;
      }

      const body = await response.json();
      const text = extractGeminiText(body);
      if (!text) {
        return null;
      }

      const parsed: unknown = JSON.parse(text);
      if (!isRecord(parsed) || !Array.isArray(parsed.groups)) {
        return null;
      }

      const groups = parsed.groups
        .map((group) => {
          if (!isRecord(group) || !Array.isArray(group.photoIds)) {
            return null;
          }
          const photoIds = group.photoIds.filter((id): id is string => typeof id === "string");
          if (photoIds.length === 0) {
            return null;
          }
          const confidence =
            typeof group.confidence === "number" ? Math.round(group.confidence * 100) : 0;
          return { photoIds, confidence };
        })
        .filter((group): group is { photoIds: string[]; confidence: number } => group !== null);

      if (groups.length === 0) {
        return null;
      }

      return {
        groups,
        latencyMs: Date.now() - started,
        model: GEMINI_MODEL,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createGeminiVisionAdapter(db: Db): VisionAdapter {
  if (!hasGeminiConfig()) {
    return new NoopVisionAdapter();
  }
  return new GeminiVisionAdapter(db);
}
