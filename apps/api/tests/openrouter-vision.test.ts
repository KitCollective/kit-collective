import { afterEach, describe, expect, it } from "vitest";
import {
  buildOpenRouterGroupingBody,
  buildOpenRouterIdentityBody,
  buildOpenRouterIdentityRefinementBody,
  extractOpenRouterMessageText,
  OPENROUTER_VISION_MODEL,
  OPENROUTER_VISION_PROVIDERS,
  openRouterVisionHeaders,
  resolveVisionTransport,
} from "../src/vision/openrouter-vision.js";

describe("openrouter vision transport", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("prefers OpenRouter Vision over direct Gemini", () => {
    process.env.OPENROUTER_VISION_API_KEY = "sk-or-vision-test";
    process.env.OPENROUTER_API_KEY = "sk-or-factory-test";
    process.env.GEMINI_API_KEY = "gemini-test";
    expect(resolveVisionTransport()).toBe("openrouter");
  });

  it("does not use the factory OpenRouter key for Vision", () => {
    delete process.env.OPENROUTER_VISION_API_KEY;
    process.env.OPENROUTER_API_KEY = "sk-or-factory-test";
    delete process.env.GEMINI_API_KEY;
    expect(resolveVisionTransport()).toBe("noop");
  });

  it("falls back to direct Gemini when the Vision key is unset", () => {
    delete process.env.OPENROUTER_VISION_API_KEY;
    process.env.GEMINI_API_KEY = "gemini-test";
    expect(resolveVisionTransport()).toBe("gemini");
  });

  it("no-ops when both Vision keys are unset", () => {
    delete process.env.OPENROUTER_VISION_API_KEY;
    delete process.env.GEMINI_API_KEY;
    expect(resolveVisionTransport()).toBe("noop");
  });

  it("pins Google providers, denies data collection, and keeps thinking off", () => {
    const body = buildOpenRouterIdentityBody([
      { role: "front", bytes: Uint8Array.from([0xff, 0xd8, 0xff]) },
    ]);

    expect(body.model).toBe(OPENROUTER_VISION_MODEL);
    expect(body.provider.only).toEqual([...OPENROUTER_VISION_PROVIDERS]);
    expect(body.provider.allow_fallbacks).toBe(false);
    expect(body.provider.data_collection).toBe("deny");
    expect(body.provider.sort).toBe("latency");
    expect(body.reasoning.enabled).toBe(false);
    expect(body.response_format).toEqual({ type: "json_object" });
    const userMessage = body.messages.find((message) => message.role === "user");
    expect(userMessage?.role).toBe("user");
    if (userMessage?.role !== "user") {
      throw new Error("expected user message");
    }
    expect(userMessage.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text" }),
        {
          type: "image_url",
          image_url: { url: expect.stringMatching(/^data:image\/jpeg;base64,/) },
        },
      ]),
    );
  });

  it("sends grouping photoIds as text before each image", () => {
    const photoId = "11111111-1111-4111-8111-111111111111";
    const body = buildOpenRouterGroupingBody([
      { photoId, bytes: Uint8Array.from([0xff, 0xd8, 0xff]) },
      {
        photoId: "22222222-2222-4222-8222-222222222222",
        bytes: Uint8Array.from([0xff, 0xd8, 0xff]),
      },
    ]);

    expect(body.messages[0]?.role).toBe("system");
    const userMessage = body.messages.find((message) => message.role === "user");
    expect(userMessage?.role).toBe("user");
    if (userMessage?.role !== "user") {
      throw new Error("expected user message");
    }
    expect(userMessage.content).toEqual(
      expect.arrayContaining([{ type: "text", text: `photoId: ${photoId}` }]),
    );
  });

  it("extracts OpenAI-shaped chat text", () => {
    expect(
      extractOpenRouterMessageText({
        choices: [{ message: { content: '{"clubHint":"Brøndby"}' } }],
      }),
    ).toBe('{"clubHint":"Brøndby"}');
  });

  it("does not put the key in a query string", () => {
    const headers = openRouterVisionHeaders("sk-or-secret");
    expect(headers.Authorization).toBe("Bearer sk-or-secret");
    expect(JSON.stringify(headers)).not.toContain("?key=");
  });

  it("lists catalog candidate seasons on the second look without telling the model it was wrong", () => {
    const body = buildOpenRouterIdentityRefinementBody(
      [{ role: "front", bytes: Uint8Array.from([0xff, 0xd8, 0xff]) }],
      [
        {
          seasonLabel: "2019/20",
          type: "home",
          manufacturer: "Nike",
          sponsor: "Red Bull",
          colorNames: "white with red trim",
        },
        {
          seasonLabel: "2020/21",
          type: "away",
          manufacturer: "Nike",
          sponsor: "Red Bull",
          colorNames: "navy",
        },
      ],
    );

    const userMessage = body.messages.find((message) => message.role === "user");
    expect(userMessage?.role).toBe("user");
    if (userMessage?.role !== "user") {
      throw new Error("expected user message");
    }
    const textPart = userMessage.content.find((part) => part.type === "text");
    expect(textPart?.type).toBe("text");
    if (textPart?.type !== "text") {
      throw new Error("expected text part");
    }
    expect(textPart.text).toContain("2019/20");
    expect(textPart.text).toContain("2020/21");
    expect(textPart.text).toMatch(/home/);
    expect(textPart.text).toMatch(/away/);
    expect(textPart.text.toLowerCase()).not.toMatch(/wrong/);
    expect(textPart.text.toLowerCase()).not.toMatch(/incorrect/);
    expect(body.provider.only).toEqual([...OPENROUTER_VISION_PROVIDERS]);
    expect(body.provider.allow_fallbacks).toBe(false);
  });
});
