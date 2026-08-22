import type { Db } from "@kit/db";
import { catalogLabel, club, kit, season, teamSeason } from "@kit/db";
import type { KitType } from "@kit/domain";
import { and, eq, ilike, or } from "drizzle-orm";
import { NoopVisionAdapter } from "./noop-vision.adapter.js";
import type { VisionAdapter, VisionInferenceResult } from "./vision.adapter.js";

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_TIMEOUT_MS = 10_000;

type GeminiStructured = {
  clubHint?: string;
  seasonHint?: string;
  kitType?: KitType;
};

function hasGeminiConfig(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function decodeGeminiResponse(body: unknown): GeminiStructured | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const candidates = (body as { candidates?: unknown[] }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const parts = (candidates[0] as { content?: { parts?: unknown[] } }).content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    return null;
  }

  const text = (parts[0] as { text?: string }).text;
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as GeminiStructured;
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
                    text: 'Identify the football club, season, and kit type (home|away|third|gk|special) from this jersey photo. Reply JSON only: {"clubHint":"...","seasonHint":"...","kitType":"home"}. Use English club names. Omit fields you cannot infer.',
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

  private async mapToCatalog(structured: GeminiStructured): Promise<VisionInferenceResult | null> {
    let clubId: string | undefined;
    let seasonId: string | undefined;
    let catalogKitId: string | undefined;

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
      }
    }

    if (clubId && structured.seasonHint?.trim()) {
      const hint = structured.seasonHint.trim();
      const seasonRows = await this.db
        .select({ seasonId: season.id })
        .from(teamSeason)
        .innerJoin(season, eq(teamSeason.seasonId, season.id))
        .where(and(eq(teamSeason.clubId, clubId), ilike(season.label, `%${hint}%`)))
        .limit(1);

      if (seasonRows.length > 0 && seasonRows[0]?.seasonId) {
        seasonId = seasonRows[0].seasonId;
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

    return {
      clubId,
      seasonId,
      catalogKitId,
      type: structured.kitType,
    };
  }
}

export function createGeminiVisionAdapter(db: Db): VisionAdapter {
  if (!hasGeminiConfig()) {
    return new NoopVisionAdapter();
  }
  return new GeminiVisionAdapter(db);
}
