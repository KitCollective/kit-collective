import { describe, expect, it } from "vitest";
import { identityPhotosFromSuggestRequest } from "./identity-photos-from-suggest.js";
import {
  decodeIdentityVisionHints,
  IDENTITY_VISION_SYSTEM_PROMPT,
  identityVisionUserPrompt,
} from "./identity-vision-prompt.js";
import { buildOpenRouterIdentityBody } from "./openrouter-vision.js";
import { resolveIdentityJob } from "./vision-confidence.js";

/** QA fixture literals from `.scratch/vision-qa/eval-toulouse-nicolaisen-2026-09-21.md`. */
const TOULOUSE_CLUB = "Toulouse FC";
const TOULOUSE_SEASON = "2024/25";
const TOULOUSE_TYPE = "home";
const NICOLAISEN = "Nicolaisen";
const NICOLAISEN_NUMBER = "2";
const LP_PROMOTION = "LP Promotion";
const ANDERLECHT = "Anderlecht";

const TOULOUSE_CLUB_ID = "11111111-1111-4111-8111-111111111111";
const TOULOUSE_SEASON_ID = "22222222-2222-4222-8222-222222222222";
const NICOLAISEN_PLAYER_ID = "33333333-3333-4333-8333-333333333333";
const ANDERLECHT_CLUB_ID = "99999999-9999-4999-8999-999999999999";

function jpegBytes(marker: number): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, marker]);
}

describe("identity multi-photo job", () => {
  it("maps ≥2 suggest photos with front+back roles and does not truncate to the first", () => {
    const frontBase64 = Buffer.from("FRONT-CREST").toString("base64");
    const backBase64 = Buffer.from("BACK-PRINT").toString("base64");
    const photos = identityPhotosFromSuggestRequest([
      { role: "back", contentBase64: backBase64 },
      { role: "front", contentBase64: `data:image/jpeg;base64,${frontBase64}` },
    ]);

    expect(photos).toHaveLength(2);
    const front = photos[0];
    const back = photos[1];
    expect(front?.role).toBe("front");
    expect(back?.role).toBe("back");
    if (!front || !back) {
      throw new Error("expected front and back identity photos");
    }
    expect(Buffer.from(front.bytes).toString()).toBe("FRONT-CREST");
    expect(Buffer.from(back.bytes).toString()).toBe("BACK-PRINT");
  });

  it("teaches joint infer: front-heavy club/season/type, back print for player, one JSON", () => {
    const system = IDENTITY_VISION_SYSTEM_PROMPT;
    expect(system).toMatch(/crest/i);
    expect(system).toMatch(/sponsor/i);
    expect(system).toMatch(/league patch/i);
    expect(system).toMatch(/motto/i);
    expect(system).toMatch(/front/i);
    expect(system).toMatch(/name and number|back print/i);
    expect(system).toMatch(/do not identify the club from the back alone/i);
    expect(system).toMatch(/crest-less/i);
    expect(system).toMatch(/one JSON/i);
    expect(system).not.toContain(TOULOUSE_CLUB);
    expect(system).not.toContain(ANDERLECHT);
    expect(system).not.toContain(NICOLAISEN);

    const user = identityVisionUserPrompt(2, "12:ffd8ffe0", ["front", "back"]);
    expect(user).toMatch(/PHOTO ROLES/i);
    expect(user).toMatch(/crest/i);
    expect(user).toMatch(/sponsor/i);
    expect(user).toMatch(/league patch/i);
    expect(user).toMatch(/motto/i);
    expect(user).toMatch(/player/i);
    expect(user).toMatch(/one JSON/i);
    expect(user).toMatch(/do not identify the club from the back alone/i);
    expect(user.indexOf("front")).toBeLessThan(user.indexOf("back"));
    expect(user).toContain("Photo fingerprint: 12:ffd8ffe0");
  });

  it("sends two OpenRouter images with role: front and role: back text parts", () => {
    const body = buildOpenRouterIdentityBody([
      { role: "front", bytes: jpegBytes(0xe0) },
      { role: "back", bytes: jpegBytes(0xe1) },
    ]);
    const userMessage = body.messages.find((message) => message.role === "user");
    expect(userMessage?.role).toBe("user");
    if (userMessage?.role !== "user") {
      throw new Error("expected user message");
    }

    const textParts = userMessage.content.filter((part) => part.type === "text");
    const imageParts = userMessage.content.filter((part) => part.type === "image_url");
    expect(imageParts).toHaveLength(2);
    expect(textParts.map((part) => part.text)).toEqual(
      expect.arrayContaining(["role: front", "role: back"]),
    );

    const promptText = textParts[0]?.text ?? "";
    expect(promptText).toMatch(/front/i);
    expect(promptText).toMatch(/back/i);
    expect(promptText).toMatch(/PHOTO ROLES/i);
  });

  it("keeps joint Toulouse VLM hints (club, season, type, player) without Anderlecht", () => {
    const decoded = decodeIdentityVisionHints(
      JSON.stringify({
        clubHint: TOULOUSE_CLUB,
        seasonHint: TOULOUSE_SEASON,
        kitType: TOULOUSE_TYPE,
        playerHint: NICOLAISEN,
        playerNumberHint: NICOLAISEN_NUMBER,
        sponsorHint: LP_PROMOTION,
        manufacturerHint: "Nike",
        colorHint: "purple with white sash",
        badges: [{ nameText: "Ligue 1" }],
        confidence: {
          club: 0.92,
          season: 0.88,
          kitType: 0.9,
          player: 0.95,
          badge: 0.7,
          overall: 0.9,
        },
      }),
    );

    expect(decoded?.clubHint).toBe(TOULOUSE_CLUB);
    expect(decoded?.seasonHint).toBe(TOULOUSE_SEASON);
    expect(decoded?.kitType).toBe(TOULOUSE_TYPE);
    expect(decoded?.playerHint).toBe(NICOLAISEN);
    expect(decoded?.playerNumberHint).toBe(NICOLAISEN_NUMBER);
    expect(decoded?.sponsorHint).toBe(LP_PROMOTION);
    expect(decoded?.clubHint).not.toMatch(new RegExp(ANDERLECHT, "i"));
    expect(JSON.stringify(decoded)).not.toMatch(new RegExp(ANDERLECHT, "i"));
  });

  it("resolves one ready job combining Toulouse club/season/type with Nicolaisen", () => {
    const resolved = resolveIdentityJob({
      clubId: TOULOUSE_CLUB_ID,
      seasonId: TOULOUSE_SEASON_ID,
      type: TOULOUSE_TYPE,
      playerId: NICOLAISEN_PLAYER_ID,
      playerNumber: NICOLAISEN_NUMBER,
      confidences: {
        overall: 90,
        club: 92,
        season: 88,
        kitType: 90,
        player: 95,
      },
    });

    expect(resolved.status).toBe("ready");
    expect(resolved.suggestions?.clubId).toBe(TOULOUSE_CLUB_ID);
    expect(resolved.suggestions?.seasonId).toBe(TOULOUSE_SEASON_ID);
    expect(resolved.suggestions?.type).toBe(TOULOUSE_TYPE);
    expect(resolved.suggestions?.playerId).toBe(NICOLAISEN_PLAYER_ID);
    expect(resolved.suggestions?.playerNumber).toBe(NICOLAISEN_NUMBER);
    expect(resolved.suggestions?.clubId).not.toBe(ANDERLECHT_CLUB_ID);
    expect(JSON.stringify(resolved.suggestions)).not.toMatch(new RegExp(ANDERLECHT, "i"));
    expect(resolved.suggestions?.clubId).toBeDefined();
    expect(resolved.suggestions?.playerId).toBeDefined();
  });
});
