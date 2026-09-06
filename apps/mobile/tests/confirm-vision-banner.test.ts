import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONFIRM_VISION_BANNER_COPY,
  type ConfirmVisionBannerInput,
  resolveConfirmVisionBannerState,
} from "../src/capture/confirmVisionBanner";

const componentPath = join(__dirname, "../src/components/confirm-vision-banner.tsx");

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

describe("CONFIRM_VISION_BANNER_COPY", () => {
  it("uses the collector-facing Danish-first strings for each state", () => {
    expect(CONFIRM_VISION_BANNER_COPY.inactive).toBe("AI Analyzer er ikke aktiveret");
    expect(CONFIRM_VISION_BANNER_COPY["out-of-quota"]).toBe("AI Analyzer er ude af forbrug");
    expect(CONFIRM_VISION_BANNER_COPY.analyzing).toBe("AI Vision analyserer …");
    expect(CONFIRM_VISION_BANNER_COPY.success).toBe("AI Vision udfyldte trøjens data");
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
});
