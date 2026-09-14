import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONFIRM_VISION_BANNER_COPY,
  type ConfirmVisionBannerInput,
  resolveConfirmVisionBannerState,
  visionMatcherRemainingToOutOfQuota,
} from "../src/capture/confirmVisionBanner";

const bannerModulePath = join(__dirname, "../src/capture/confirmVisionBanner.ts");
const componentPath = join(__dirname, "../src/components/confirm-vision-banner.tsx");
const slotPath = join(__dirname, "../src/components/confirm-vision-slot.tsx");
const confirmScreenPath = join(__dirname, "../app/(capture)/confirm.tsx");

const baseInput: ConfirmVisionBannerInput = {
  activated: true,
  outOfQuota: false,
  analyzing: false,
  succeeded: false,
};

describe("resolveConfirmVisionBannerState", () => {
  it("shows analyzing while a Vision job is in flight (highest priority)", () => {
    expect(
      resolveConfirmVisionBannerState({ ...baseInput, analyzing: true, succeeded: true }),
    ).toBe("analyzing");
  });

  it("shows success once Vision filled the data", () => {
    expect(resolveConfirmVisionBannerState({ ...baseInput, succeeded: true })).toBe("success");
  });

  it("shows inactive when the analyzer is not activated", () => {
    expect(resolveConfirmVisionBannerState({ ...baseInput, activated: false })).toBe("inactive");
  });

  it("shows out-of-quota when activated but the freemium quota is spent", () => {
    expect(resolveConfirmVisionBannerState({ ...baseInput, outOfQuota: true })).toBe(
      "out-of-quota",
    );
  });

  it("defaults to inactive when activated, in quota, and idle", () => {
    expect(resolveConfirmVisionBannerState(baseInput)).toBe("inactive");
  });
});

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
    const moduleSource = readFileSync(bannerModulePath, "utf8");
    expect(moduleSource).toContain("VISION_MATCHER_JERSEY_CAP");
    expect(moduleSource).not.toContain(">5 uploads");
  });
});

describe("CONFIRM_VISION_BANNER_COPY", () => {
  it("uses the collector-facing Danish-first strings for each state", () => {
    expect(CONFIRM_VISION_BANNER_COPY.inactive).toBe("AI Analyzer er ikke aktiveret");
    expect(CONFIRM_VISION_BANNER_COPY["out-of-quota"]).toBe("Vision Matcher er ude af forbrug");
    expect(CONFIRM_VISION_BANNER_COPY.analyzing).toBe("AI Vision analyserer …");
    expect(CONFIRM_VISION_BANNER_COPY.success).toBe("AI Vision udfyldte trøjens data");
  });

  it("names Vision Matcher in the quota sentence and does not invent n/10 remaining copy", () => {
    expect(CONFIRM_VISION_BANNER_COPY["out-of-quota"]).toContain("Vision Matcher");
    expect(CONFIRM_VISION_BANNER_COPY["out-of-quota"]).not.toMatch(/\d+\s*\/\s*10/);
  });
});

describe("ConfirmVisionBanner chrome", () => {
  const source = readFileSync(componentPath, "utf8");

  it("renders a static AI icon on the left and a spinner on the right for analyzing", () => {
    // Static AI icon (Ionicons sparkles) leads the text; it is not interactive.
    expect(source).toContain('name="sparkles"');
    const iconIdx = source.indexOf('name="sparkles"');
    const textIdx = source.indexOf("{message}</Text>");
    const spinnerIdx = source.indexOf("<ActivityIndicator");
    expect(iconIdx).toBeGreaterThan(-1);
    expect(iconIdx).toBeLessThan(textIdx);
    // Spinner is trailing (after the text/body) and only while analyzing.
    expect(spinnerIdx).toBeGreaterThan(textIdx);
    expect(source).toContain('size="small"');
  });

  it("tints the analyzing state light blue from the info token, not an invented hex", () => {
    expect(source).toContain("withAlpha(theme.info, 0.08)");
    expect(source).toContain("theme.info");
    // No raw hex/rgba literals — the design-token ratchet forbids them.
    expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(source).not.toMatch(/rgba?\(/);
  });

  it("uses the sanctioned Banner tones per state", () => {
    expect(source).toContain("theme.success");
    expect(source).toContain("theme.warning");
    expect(source).toContain("theme.borderSubtle");
  });

  it("composes the Banner chrome tokens (border, radius.md, reduced inset.sm)", () => {
    expect(source).toContain("borderWidth: 1");
    expect(source).toContain("borderRadius: radius.md");
    // Height stepped down one space token (inset.md → inset.sm) to sit lighter.
    expect(source).toContain("padding: space.insetSm");
  });

  it("never gates Save — it only reads a state prop", () => {
    expect(source).toContain("state: ConfirmVisionBannerState");
    expect(source).not.toContain("saveEnabled");
    expect(source).not.toContain("handleSave");
  });

  it("makes the out-of-quota Banner a quota button when onQuotaPress is provided", () => {
    expect(source).toContain("Pressable");
    expect(source).toContain("onQuotaPress");
    expect(source).toContain('state === "out-of-quota"');
    expect(source).toContain('"button"');
    expect(source).toContain("minHeight: 44");
    expect(source).not.toContain("PaywallCard");
    expect(source).not.toContain("PaywallSheet");
  });
});

describe("ConfirmVisionSlot", () => {
  const slotSource = readFileSync(slotPath, "utf8");

  it("forwards onQuotaPress to ConfirmVisionBanner", () => {
    expect(slotSource).toContain("onQuotaPress");
    expect(slotSource).toContain("<ConfirmVisionBanner");
    expect(slotSource).toContain("onQuotaPress={onQuotaPress}");
    expect(slotSource).not.toContain("PaywallCard");
  });
});

describe("Confirm screen Vision Matcher quota wiring", () => {
  const confirmScreen = readFileSync(confirmScreenPath, "utf8");

  it("maps session visionMatcher remaining onto the existing out-of-quota Banner", () => {
    expect(confirmScreen).toContain("entitlement");
    expect(confirmScreen).toContain("visionMatcherRemainingToOutOfQuota");
    expect(confirmScreen).toContain("entitlement?.visionMatcher");
    expect(confirmScreen).toContain("resolveConfirmVisionBannerState");
    expect(confirmScreen).toContain("onQuotaPress");
    expect(confirmScreen).toContain("requestPremiumAccess");
  });

  it("does not disable Gem from Vision Matcher remaining", () => {
    expect(confirmScreen).toContain("disabled={!saveEnabled}");
    expect(confirmScreen).not.toMatch(/remaining\s*===\s*0/);
    expect(confirmScreen).not.toContain("PaywallCard");
    expect(confirmScreen).toContain("from \"@/auth/AuthProvider\"");
    expect(confirmScreen).toContain("from \"@/capture/confirmVisionBanner\"");
  });
});
