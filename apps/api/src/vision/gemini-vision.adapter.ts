import type { Db } from "@kit/db";
import { decodeGroupingVisionGroups, groupingVisionPrompt } from "./grouping-vision-prompt.js";
import {
  decodeIdentityVisionHints,
  type IdentityRefinementCandidate,
  identityVisionPrompt,
  identityVisionRefinementUserPrompt,
} from "./identity-vision-prompt.js";
import { NoopVisionAdapter } from "./noop-vision.adapter.js";
import {
  buildOpenRouterGroupingBody,
  buildOpenRouterIdentityBody,
  buildOpenRouterIdentityRefinementBody,
  extractOpenRouterMessageText,
  OPENROUTER_CHAT_URL,
  OPENROUTER_VISION_MODEL,
  openRouterVisionApiKey,
  openRouterVisionHeaders,
  resolveVisionTransport,
} from "./openrouter-vision.js";
import type {
  VisionAdapter,
  VisionGroupingInferenceResult,
  VisionGroupingOptions,
  VisionGroupingPhotoInput,
  VisionIdentityPhotoInput,
  VisionInferenceResult,
} from "./vision.adapter.js";
import { VisionCatalogMapper } from "./vision-catalog-mapper.js";

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_TIMEOUT_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
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

export class GeminiVisionAdapter implements VisionAdapter {
  private readonly mapper: VisionCatalogMapper;

  constructor(db: Db) {
    this.mapper = new VisionCatalogMapper(db);
  }

  async infer(photos: VisionIdentityPhotoInput[]): Promise<VisionInferenceResult | null> {
    const transport = resolveVisionTransport();
    if (transport === "noop" || photos.length === 0) {
      return null;
    }

    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
      const text =
        transport === "openrouter"
          ? await this.completeOpenRouter(buildOpenRouterIdentityBody(photos), controller.signal)
          : await this.completeGeminiDirect(photos, controller.signal);

      const structured = decodeIdentityVisionHints(text);
      if (!structured) {
        return null;
      }

      let mapped = await this.mapper.mapHints(structured);
      if (!mapped?.catalogKitId) {
        const candidates = await this.mapper.listObservableKitHits(structured);
        if (candidates.length > 1) {
          const refineText =
            transport === "openrouter"
              ? await this.completeOpenRouter(
                  buildOpenRouterIdentityRefinementBody(photos, candidates),
                  controller.signal,
                )
              : await this.completeGeminiRefinement(photos, candidates, controller.signal);
          const refined = decodeIdentityVisionHints(refineText);
          if (refined) {
            const second = await this.mapper.mapHints(
              {
                ...structured,
                seasonHint: refined.seasonHint ?? structured.seasonHint,
                kitType: refined.kitType ?? structured.kitType,
              },
              { amongKitIds: candidates.map((candidate) => candidate.kitId) },
            );
            if (second) {
              mapped = second;
            }
          }
        }
      }

      if (!mapped) {
        return null;
      }

      return {
        ...mapped,
        visionRaw: JSON.stringify(structured),
        latencyMs: Date.now() - started,
        model: transport === "openrouter" ? OPENROUTER_VISION_MODEL : GEMINI_MODEL,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async inferGrouping(
    photos: VisionGroupingPhotoInput[],
    options: VisionGroupingOptions = {},
  ): Promise<VisionGroupingInferenceResult | null> {
    const transport = resolveVisionTransport();
    const priorGroups = options.priorGroups ?? [];
    if (transport === "noop" || photos.length === 0) {
      return null;
    }
    if (photos.length < 2 && priorGroups.length === 0) {
      return null;
    }

    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
      const text =
        transport === "openrouter"
          ? await this.completeOpenRouter(
              buildOpenRouterGroupingBody(photos, priorGroups),
              controller.signal,
            )
          : await this.completeGeminiGrouping(photos, priorGroups, controller.signal);
      if (!text) {
        return null;
      }

      const allowedPhotoIds = [
        ...photos.map((photo) => photo.photoId),
        ...priorGroups.flatMap((group) => group.photoIds),
      ];
      const groups = decodeGroupingVisionGroups(text, allowedPhotoIds);
      if (!groups) {
        return null;
      }

      return {
        groups,
        latencyMs: Date.now() - started,
        model: transport === "openrouter" ? OPENROUTER_VISION_MODEL : GEMINI_MODEL,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async completeOpenRouter(
    body: ReturnType<
      | typeof buildOpenRouterIdentityBody
      | typeof buildOpenRouterIdentityRefinementBody
      | typeof buildOpenRouterGroupingBody
    >,
    signal: AbortSignal,
  ): Promise<string | null> {
    const apiKey = openRouterVisionApiKey();
    if (!apiKey) {
      return null;
    }

    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: openRouterVisionHeaders(apiKey),
      signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return null;
    }

    return extractOpenRouterMessageText(await response.json());
  }

  private async completeGeminiDirect(
    photos: VisionIdentityPhotoInput[],
    signal: AbortSignal,
  ): Promise<string | null> {
    const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
      { text: identityVisionPrompt(photos.length) },
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

    return this.fetchGeminiGenerateContent(parts, signal);
  }

  private async completeGeminiRefinement(
    photos: VisionIdentityPhotoInput[],
    candidates: IdentityRefinementCandidate[],
    signal: AbortSignal,
  ): Promise<string | null> {
    const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
      {
        text: `${identityVisionPrompt(photos.length)}\n\n${identityVisionRefinementUserPrompt(candidates)}`,
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

    return this.fetchGeminiGenerateContent(parts, signal);
  }

  private async completeGeminiGrouping(
    photos: VisionGroupingPhotoInput[],
    priorGroups: Array<{ photoIds: string[] }>,
    signal: AbortSignal,
  ): Promise<string | null> {
    const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
      { text: groupingVisionPrompt(photos.length, priorGroups) },
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

    return this.fetchGeminiGenerateContent(parts, signal);
  }

  private async fetchGeminiGenerateContent(
    parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }>,
    signal: AbortSignal,
  ): Promise<string | null> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
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

    return extractGeminiText(await response.json());
  }
}

export function createGeminiVisionAdapter(db: Db): VisionAdapter {
  if (resolveVisionTransport() === "noop") {
    return new NoopVisionAdapter();
  }
  return new GeminiVisionAdapter(db);
}
