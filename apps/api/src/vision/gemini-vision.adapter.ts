import type { Db } from "@kit/db";
import { catalogLabel, club, kit, season, teamSeason } from "@kit/db";
import type { KitType } from "@kit/domain";
import { KIT_TYPES } from "@kit/domain";
import { and, eq, ilike, or } from "drizzle-orm";
import { NoopVisionAdapter } from "./noop-vision.adapter.js";
import type { VisionAdapter, VisionInferenceResult } from "./vision.adapter.js";

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

function decodeGeminiResponse(body: unknown): GeminiStructured | null {
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

  try {
    const parsed: unknown = JSON.parse(firstPart.text);
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
  constructor(private readonly db: Db) {}

  async infer(photoBytes: Uint8Array): Promise<VisionInferenceResult | null> {
    if (!hasGeminiConfig()) {
      return null;
    }

    const started = Date.now();
    const base64 = Buffer.from(photoBytes).toString("base64");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: 'Identify the football club, season, and kit type (home|away|third|gk|special) from this jersey photo. Reply JSON only: {"clubHint":"...","seasonHint":"...","kitType":"home","confidence":0.85}. confidence is 0-1 for how sure you are overall. Use English club names. Omit fields you cannot infer.',
                  },
                  {
                    inline_data: {
                      mime_type: "image/jpeg",
                      data: base64,
                    },
                  },
                ],
              },
            ],
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

      const mapped = await this.mapToCatalog(structured);
      if (!mapped) {
        return {
          visionRaw: JSON.stringify(structured),
          confidences: this.buildConfidences(structured.confidence, {}),
          latencyMs: Date.now() - started,
          model: GEMINI_MODEL,
        };
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

  private buildConfidences(
    modelConfidence: number | undefined,
    fields: { club?: number; season?: number; kitType?: number },
  ): VisionInferenceResult["confidences"] {
    const fieldValues = [fields.club, fields.season, fields.kitType].filter(
      (value): value is number => value !== undefined,
    );
    const matchAverage =
      fieldValues.length > 0
        ? fieldValues.reduce((sum, value) => sum + value, 0) / fieldValues.length
        : 0;
    const modelScore = modelConfidence !== undefined ? modelConfidence * 100 : matchAverage;
    const overall = Math.round(Math.max(modelScore, matchAverage));

    return {
      overall,
      club: fields.club,
      season: fields.season,
      kitType: fields.kitType,
    };
  }

  private async mapToCatalog(structured: GeminiStructured): Promise<VisionInferenceResult | null> {
    let clubId: string | undefined;
    let seasonId: string | undefined;
    let catalogKitId: string | undefined;
    let clubMatchScore: number | undefined;
    let seasonMatchScore: number | undefined;

    if (structured.clubHint?.trim()) {
      const hint = structured.clubHint.trim();
      const rows = await this.db
        .select({ clubId: club.id, label: catalogLabel.text })
        .from(club)
        .innerJoin(
          catalogLabel,
          and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
        )
        .where(or(ilike(catalogLabel.text, hint), ilike(catalogLabel.text, `%${hint}%`)))
        .limit(5);

      if (rows.length > 0 && rows[0]?.clubId) {
        clubId = rows[0].clubId;
        const label = rows[0].label?.toLowerCase() ?? "";
        clubMatchScore = label === hint.toLowerCase() ? 90 : 65;
      }
    }

    if (clubId && structured.seasonHint?.trim()) {
      const hint = structured.seasonHint.trim();
      const seasonRows = await this.db
        .select({ seasonId: season.id, label: season.label })
        .from(teamSeason)
        .innerJoin(season, eq(teamSeason.seasonId, season.id))
        .where(and(eq(teamSeason.clubId, clubId), ilike(season.label, `%${hint}%`)))
        .limit(1);

      if (seasonRows.length > 0 && seasonRows[0]?.seasonId) {
        seasonId = seasonRows[0].seasonId;
        const label = seasonRows[0].label?.toLowerCase() ?? "";
        seasonMatchScore = label.includes(hint.toLowerCase()) ? 85 : 60;
      }
    }

    if (clubId && seasonId && structured.kitType) {
      const kitRows = await this.db
        .select({ id: kit.id })
        .from(kit)
        .where(
          and(eq(kit.clubId, clubId), eq(kit.seasonId, seasonId), eq(kit.type, structured.kitType)),
        )
        .limit(1);

      if (kitRows.length > 0 && kitRows[0]?.id) {
        catalogKitId = kitRows[0].id;
      }
    }

    if (!clubId && !seasonId && !structured.kitType) {
      return null;
    }

    const kitTypeScore = structured.kitType ? 70 : undefined;

    return {
      clubId,
      seasonId,
      catalogKitId,
      type: structured.kitType,
      confidences: this.buildConfidences(structured.confidence, {
        club: clubMatchScore,
        season: seasonMatchScore,
        kitType: kitTypeScore,
      }),
    };
  }
}

export function createGeminiVisionAdapter(db: Db): VisionAdapter {
  if (!hasGeminiConfig()) {
    return new NoopVisionAdapter();
  }
  return new GeminiVisionAdapter(db);
}
