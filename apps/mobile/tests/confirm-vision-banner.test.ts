import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { visionMatcherRemainingToOutOfQuota } from "../src/capture/confirmVisionQuota";

// The green banner and its four states are gone (design lock: Confirm and Save, Revision
// 2026-10-09). This file keeps the quota helper and pins that the banner stays removed.
const quotaModulePath = join(__dirname, "../src/capture/confirmVisionQuota.ts");
const identityBlockPath = join(__dirname, "../src/components/confirm-identity-block.tsx");
const slotPath = join(__dirname, "../src/components/confirm-vision-slot.tsx");
const confirmScreenPath = join(__dirname, "../app/(capture)/confirm.tsx");

describe("visionMatcherRemainingToOutOfQuota", () => {
  it("is out of quota only when remaining is 0 and usage is not unlimited", () => {
    expect(
      visionMatcherRemainingToOutOfQuota({
        used: 10,
        cap: 10,
        remaining: 0,
        unlimited: false,
      }),
    ).toBe(true);
    expect(
      visionMatcherRemainingToOutOfQuota({
        used: 10,
        cap: 10,
        remaining: 0,
        unlimited: true,
      }),
    ).toBe(false);
  });

  it("is in quota when remaining is above 0", () => {
    expect(
      visionMatcherRemainingToOutOfQuota({
        used: 3,
        cap: 10,
        remaining: 7,
        unlimited: false,
      }),
    ).toBe(false);
  });

  it("is in quota when session usage is missing", () => {
    expect(visionMatcherRemainingToOutOfQuota(undefined)).toBe(false);
    expect(visionMatcherRemainingToOutOfQuota(null)).toBe(false);
  });

  it("uses the Vision Matcher jersey cap of 10, not a leftover 5", () => {
    const moduleSource = readFileSync(quotaModulePath, "utf8");
    expect(moduleSource).toContain("VISION_MATCHER_JERSEY_CAP");
    expect(moduleSource).not.toContain(">5 uploads");
  });
});

describe("Identity block chrome", () => {
  const source = readFileSync(identityBlockPath, "utf8");

  it("composes type roles and fill tokens only, with no raw colour", () => {
    expect(source).toContain("typography.display");
    expect(source).toContain("typography.mono");
    expect(source).toContain("typography.captionSm");
    expect(source).toContain("theme.fillPrimary");
    expect(source).toContain("theme.fillSecondary");
    expect(source).toContain("theme.success");
    expect(source).toContain("radius.pill");
    expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(source).not.toMatch(/rgba?\(/);
    expect(source).not.toContain("fontSize");
  });

  it("opens the unchanged Data drill from the whole block and keeps 44pt hit targets", () => {
    expect(source).toContain("onOpenData");
    expect(source).toContain('accessibilityRole="button"');
    expect(source).toContain("minHeight: 44");
  });

  it("never gates Save", () => {
    expect(source).not.toContain("saveEnabled");
    expect(source).not.toContain("handleSave");
  });
});

describe("ConfirmVisionSlot", () => {
  const slotSource = readFileSync(slotPath, "utf8");

  it("is no longer a status banner: only the catalog-miss note, no grouping strip", () => {
    expect(slotSource).not.toContain("ConfirmVisionBanner");
    expect(slotSource).not.toContain("onQuotaPress");
    expect(slotSource).not.toContain("bannerState");
    expect(slotSource).not.toContain("groupingMessage");
    expect(slotSource).toContain("catalogMiss");
  });
});

describe("Confirm screen Vision availability wiring", () => {
  const confirmScreen = readFileSync(confirmScreenPath, "utf8");

  it("reads session visionMatcher remaining to decide whether Vision is on", () => {
    expect(confirmScreen).toContain("entitlement");
    expect(confirmScreen).toContain("visionMatcherRemainingToOutOfQuota");
    expect(confirmScreen).toContain("entitlement?.visionMatcher");
    expect(confirmScreen).toContain('from "@/capture/confirmVisionQuota"');
    expect(confirmScreen).toContain("resolveIdentityBlock");
  });

  it("does not disable Gem from Vision Matcher remaining", () => {
    expect(confirmScreen).toContain("disabled={!saveEnabled}");
    expect(confirmScreen).not.toMatch(/remaining\s*===\s*0/);
    expect(confirmScreen).not.toContain("PaywallCard");
    expect(confirmScreen).toContain('from "@/auth/AuthProvider"');
  });
});
