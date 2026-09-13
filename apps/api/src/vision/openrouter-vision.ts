import {
  GROUPING_VISION_SYSTEM_PROMPT,
  type GroupingPriorGroup,
  groupingVisionUserPrompt,
} from "./grouping-vision-prompt.js";
import {
  IDENTITY_VISION_SYSTEM_PROMPT,
  type IdentityRefinementCandidate,
  identityVisionRefinementUserPrompt,
  identityVisionUserPrompt,
} from "./identity-vision-prompt.js";
import type { VisionGroupingPhotoInput, VisionIdentityPhotoInput } from "./vision.adapter.js";

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_VISION_MODEL = "google/gemini-2.5-flash-lite";
export const OPENROUTER_VISION_PROVIDERS = ["google-ai-studio", "google-vertex"] as const;

export type VisionTransport = "openrouter" | "gemini" | "noop";

export type OpenRouterChatContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OpenRouterChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: OpenRouterChatContent[] };

export type OpenRouterChatBody = {
  model: string;
  messages: OpenRouterChatMessage[];
  temperature: number;
  response_format: { type: "json_object" };
  reasoning: { enabled: false };
  provider: {
    only: string[];
    allow_fallbacks: false;
    data_collection: "deny";
    sort: "latency";
  };
};

/** Nest Vision key — not the factory Scout `OPENROUTER_API_KEY`. */
export function openRouterVisionApiKey(): string | null {
  const key = process.env.OPENROUTER_VISION_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

function hasOpenRouterConfig(): boolean {
  return openRouterVisionApiKey() !== null;
}

function hasGeminiConfig(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/** OpenRouter first (Google-pinned). Direct Gemini is fallback. Unset → noop. */
export function resolveVisionTransport(): VisionTransport {
  if (hasOpenRouterConfig()) {
    return "openrouter";
  }
  if (hasGeminiConfig()) {
    return "gemini";
  }
  return "noop";
}

export { GROUPING_VISION_SYSTEM_PROMPT, groupingVisionPrompt } from "./grouping-vision-prompt.js";
export {
  IDENTITY_VISION_SYSTEM_PROMPT,
  identityVisionPrompt,
  identityVisionUserPrompt,
} from "./identity-vision-prompt.js";

function jpegDataUrl(bytes: Uint8Array): string {
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

function openrouterProvider(): OpenRouterChatBody["provider"] {
  return {
    only: [...OPENROUTER_VISION_PROVIDERS],
    allow_fallbacks: false,
    data_collection: "deny",
    sort: "latency",
  };
}

function chatBody(content: OpenRouterChatContent[], system?: string): OpenRouterChatBody {
  const messages: OpenRouterChatMessage[] = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content });
  return {
    model: OPENROUTER_VISION_MODEL,
    messages,
    temperature: 0.1,
    response_format: { type: "json_object" },
    reasoning: { enabled: false },
    provider: openrouterProvider(),
  };
}

export function buildOpenRouterIdentityBody(
  photos: VisionIdentityPhotoInput[],
): OpenRouterChatBody {
  const content: OpenRouterChatContent[] = [
    { type: "text", text: identityVisionUserPrompt(photos.length) },
  ];
  for (const photo of photos) {
    if (photo.role) {
      content.push({ type: "text", text: `role: ${photo.role}` });
    }
    content.push({ type: "image_url", image_url: { url: jpegDataUrl(photo.bytes) } });
  }
  return chatBody(content, IDENTITY_VISION_SYSTEM_PROMPT);
}

export function buildOpenRouterIdentityRefinementBody(
  photos: VisionIdentityPhotoInput[],
  candidates: IdentityRefinementCandidate[],
): OpenRouterChatBody {
  const content: OpenRouterChatContent[] = [
    { type: "text", text: identityVisionRefinementUserPrompt(candidates) },
  ];
  for (const photo of photos) {
    if (photo.role) {
      content.push({ type: "text", text: `role: ${photo.role}` });
    }
    content.push({ type: "image_url", image_url: { url: jpegDataUrl(photo.bytes) } });
  }
  return chatBody(content, IDENTITY_VISION_SYSTEM_PROMPT);
}

export function buildOpenRouterGroupingBody(
  photos: VisionGroupingPhotoInput[],
  priorGroups: GroupingPriorGroup[] = [],
): OpenRouterChatBody {
  const content: OpenRouterChatContent[] = [
    { type: "text", text: groupingVisionUserPrompt(photos.length, priorGroups) },
  ];
  for (const photo of photos) {
    content.push({ type: "text", text: `photoId: ${photo.photoId}` });
    content.push({ type: "image_url", image_url: { url: jpegDataUrl(photo.bytes) } });
  }
  return chatBody(content, GROUPING_VISION_SYSTEM_PROMPT);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/** OpenAI-shaped chat completion text. Never logs the body. */
export function extractOpenRouterMessageText(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }

  const choices = body.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  const first = choices[0];
  if (!isRecord(first)) {
    return null;
  }

  const message = first.message;
  if (!isRecord(message)) {
    return null;
  }

  const content = message.content;
  if (typeof content === "string" && content.length > 0) {
    return content;
  }

  return null;
}

export function openRouterVisionHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://kitcollective.app",
    "X-OpenRouter-Title": "KitCollective Vision",
  };
}
