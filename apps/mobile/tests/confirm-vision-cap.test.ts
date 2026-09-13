import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const visionApiPath = join(__dirname, "../src/api/vision.ts");
const confirmVisionPath = join(__dirname, "../src/capture/use-confirm-vision.ts");
const confirmScreenPath = join(__dirname, "../app/(capture)/confirm.tsx");
const authPath = join(__dirname, "../src/auth/AuthProvider.tsx");

describe("Confirm identity 402 maps to startTrial-or-paywall", () => {
  const visionApi = readFileSync(visionApiPath, "utf8");
  const confirmVision = readFileSync(confirmVisionPath, "utf8");
  const confirmScreen = readFileSync(confirmScreenPath, "utf8");
  const auth = readFileSync(authPath, "utf8");

  it("parses identity suggest PREMIUM_REQUIRED as VisionPremiumRequiredError", () => {
    expect(visionApi).toContain("export class VisionPremiumRequiredError");
    expect(visionApi).toContain("PREMIUM_REQUIRED");
    expect(visionApi).toContain("response.status !== 402");
    expect(visionApi).not.toContain('from "apps/api"');
    expect(visionApi).not.toContain('from "@kit/db"');
  });

  it("retries identity suggest after the existing startTrial-or-paywall path", () => {
    expect(confirmVision).toContain("VisionPremiumRequiredError");
    expect(confirmVision).toContain("onPremiumRequired");
    expect(confirmVision).toContain("startVisionSuggest");
    expect(confirmScreen).toContain("requestPremiumAccess");
    expect(confirmScreen).toContain("onPremiumRequired: requestPremiumAccess");
    expect(auth).toContain("resolvePremiumAccessIntent");
    expect(auth).toContain("startNestTrial");
  });

  it("keeps collector-facing Vision errors in Danish", () => {
    expect(visionApi).toContain("Kunne ikke starte Vision");
    expect(visionApi).toContain("Kunne ikke hente Vision-forslag");
  });
});
