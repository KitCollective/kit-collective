import { describe, expect, it } from "vitest";
import {
  decodeIdentityVisionHints,
  IDENTITY_VISION_SYSTEM_PROMPT,
  identityVisionRefinementUserPrompt,
  identityVisionUserPrompt,
} from "../src/vision/identity-vision-prompt.js";
import { buildOpenRouterIdentityBody } from "../src/vision/openrouter-vision.js";

describe("identity vision prompt (Huddle-strength)", () => {
  it("teaches home-from-club-colors, empty badges, and no invented pads", () => {
    const system = IDENTITY_VISION_SYSTEM_PROMPT;
    expect(system).toMatch(/traditional primary colou?rs/i);
    expect(system).toMatch(/white/i);
    expect(system).toMatch(/not automatically away/i);
    expect(system).toMatch(/usual home/i);
    expect(system).toMatch(/patterned or tonal-print white/i);
    expect(system).toMatch(/adjacent/i);
    expect(system).toMatch(/sponsor/i);
    expect(system).toMatch(/not a sleeve patch/i);
    expect(system).toMatch(/empty/i);
    expect(system).toMatch(/do not invent/i);
    expect(system).toMatch(/commemorative/i);
    expect(system).toMatch(/manufacturer/i);
    expect(system).toMatch(/null/i);
  });

  it("asks for per-field confidence and omit-empty patchHint", () => {
    const user = identityVisionUserPrompt(4);
    expect(user).toContain('"kitType": "home"|"away"|"third"|"fourth"|"gk"|"special"|null');
    expect(user).toContain('"club"');
    expect(user).toContain('"season"');
    expect(user).toContain('"badge"');
    expect(user).toMatch(/omit patchHint/i);
    expect(user).toMatch(/same shirt/i);
  });

  it("sends the system prompt as an OpenRouter system message", () => {
    const body = buildOpenRouterIdentityBody([
      { role: "front", bytes: Uint8Array.from([0xff, 0xd8, 0xff]) },
    ]);
    expect(body.messages[0]).toEqual({
      role: "system",
      content: IDENTITY_VISION_SYSTEM_PROMPT,
    });
    expect(body.messages[1]?.role).toBe("user");
  });

  it("omits patchHint when badges are empty or the model invented none", () => {
    const decoded = decodeIdentityVisionHints(
      JSON.stringify({
        clubHint: "RB Leipzig",
        seasonHint: "2019/20",
        kitType: "home",
        manufacturerHint: "Nike",
        sponsorHint: "Red Bull",
        badges: [],
        patchHint: "Bundesliga",
        confidence: {
          club: 0.95,
          season: 0.45,
          kitType: 0.8,
          player: 0,
          badge: 0,
          overall: 0.7,
        },
      }),
    );

    expect(decoded?.clubHint).toBe("RB Leipzig");
    expect(decoded?.seasonHint).toBe("2019/20");
    expect(decoded?.kitType).toBe("home");
    expect(decoded?.patchHint).toBeUndefined();
    expect(decoded?.confidence).toBe(0.7);
    expect(decoded?.fieldConfidence).toEqual({
      club: 0.95,
      season: 0.45,
      kitType: 0.8,
      player: 0,
      badge: 0,
    });
  });

  it("takes the first visible badge as patchHint and accepts 0–100 scores", () => {
    const decoded = decodeIdentityVisionHints(
      JSON.stringify({
        clubHint: "Liverpool FC",
        kitType: "Home",
        badges: [
          {
            position: "right_sleeve",
            category: "competition",
            nameText: "UEFA Champions League",
          },
        ],
        confidence: {
          club: 95,
          season: 40,
          kitType: 80,
          player: 0,
          badge: 90,
          overall: 80,
        },
      }),
    );

    expect(decoded?.kitType).toBe("home");
    expect(decoded?.patchHint).toBe("UEFA Champions League");
    expect(decoded?.confidence).toBe(0.8);
    expect(decoded?.fieldConfidence?.badge).toBe(0.9);
    expect(decoded?.fieldConfidence?.season).toBe(0.4);
  });

  it("caps away confidence when the shirt body is white", () => {
    const decoded = decodeIdentityVisionHints(
      JSON.stringify({
        clubHint: "RB Leipzig",
        kitType: "away",
        colorHint: "white with red trim and grey pattern",
        confidence: { club: 0.9, season: 0.7, kitType: 0.9, player: 0, badge: 0, overall: 0.8 },
      }),
    );
    expect(decoded?.kitType).toBe("away");
    expect(decoded?.fieldConfidence?.kitType).toBe(0.45);
  });

  it("omits unreadable fields instead of keeping empty strings", () => {
    expect(
      decodeIdentityVisionHints(
        JSON.stringify({
          clubHint: "",
          seasonHint: null,
          kitType: "unknown",
          patchHint: "none",
          confidence: 0.2,
        }),
      ),
    ).toEqual({
      confidence: 0.2,
    });
  });

  it("gives catalog facts on a second look instead of telling the model it guessed the wrong year", () => {
    const prompt = identityVisionRefinementUserPrompt([
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
      },
    ]);

    expect(prompt).toContain("2019/20");
    expect(prompt).toContain("2020/21");
    expect(prompt).toContain("Nike");
    expect(prompt).toContain("Red Bull");
    expect(prompt).toMatch(/white with red trim/);
    expect(prompt.toLowerCase()).not.toMatch(/wrong year/);
    expect(prompt.toLowerCase()).not.toMatch(/you guessed/);
  });
});
