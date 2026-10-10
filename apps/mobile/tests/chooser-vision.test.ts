import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { VisionMatcherUsage } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import {
  createCaptureSessionFromPhotos,
  groupingJobFingerprint,
} from "../src/capture/captureSession";
import {
  CHOOSER_VISION_COPY,
  formatRenewalDate,
  resolveChooserVision,
  resolveVisionEnabled,
} from "../src/capture/chooserVision";
import { resolveIdentityBlock } from "../src/capture/confirmIdentityBlock";
import { visionRequestToken } from "../src/capture/identitySuggestRequest";

const free = (remaining: number, renewsAt: string | null = null): VisionMatcherUsage => ({
  used: 10 - remaining,
  cap: 10,
  remaining,
  unlimited: false,
  renewsAt,
});

const plus: VisionMatcherUsage = {
  used: 14,
  cap: 10,
  remaining: 10,
  unlimited: true,
  renewsAt: null,
};

describe("Chooser Vision row", () => {
  it("shows the remaining runs to a free collector", () => {
    const row = resolveChooserVision(true, free(7));
    expect(row.quotaLine).toBe("7 af 10 tilbage denne måned");
    expect(row.switchOn).toBe(true);
    expect(row.switchDisabled).toBe(false);
    expect(row.helperIsLink).toBe(false);
    expect(row.quotaTone).toBe("mono");
  });

  it("shows the correct n for every count short of zero", () => {
    for (const remaining of [10, 9, 1]) {
      expect(resolveChooserVision(true, free(remaining)).quotaLine).toBe(
        `${remaining} af 10 tilbage denne måned`,
      );
    }
  });

  it("shows no quota line to a Plus collector", () => {
    const row = resolveChooserVision(true, plus);
    expect(row.quotaLine).toBeNull();
    expect(row.switchOn).toBe(true);
    expect(row.switchDisabled).toBe(false);
  });

  it("shows no quota line while the entitlement is unknown", () => {
    expect(resolveChooserVision(true, null).quotaLine).toBeNull();
    expect(resolveChooserVision(true, undefined).switchDisabled).toBe(false);
  });

  it("at zero turns the switch off and disabled, shows the renewal date and links to the paywall", () => {
    const row = resolveChooserVision(true, free(0, "2026-11-14T09:30:00.000Z"));
    expect(row.switchOn).toBe(false);
    expect(row.switchDisabled).toBe(true);
    expect(row.quotaLine).toBe("Brugt op · fornyes 14. nov");
    expect(row.quotaTone).toBe("danger");
    expect(row.helper).toBe(CHOOSER_VISION_COPY.helperUpgrade);
    expect(row.helperIsLink).toBe(true);
    expect(row.caption).toBe(CHOOSER_VISION_COPY.captionOff);
  });

  it("at zero without a renewal date still says the allowance is spent", () => {
    expect(resolveChooserVision(true, free(0)).quotaLine).toBe("Brugt op denne måned");
  });

  it("reads the caption from the switch", () => {
    expect(resolveChooserVision(true, free(7)).caption).toBe(
      "Én trøje eller en hel bunke. Vision sorterer dem.",
    );
    const off = resolveChooserVision(false, free(7));
    expect(off.caption).toBe("Én trøje eller en hel bunke. Du sorterer selv.");
    expect(off.switchOn).toBe(false);
    expect(off.switchDisabled).toBe(false);
  });

  it("formats an unreadable renewal date as nothing", () => {
    expect(formatRenewalDate("not a date")).toBeNull();
  });
});

describe("Vision off at the request seam", () => {
  const photos = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      uri: `file:///photos/${index}.jpg`,
      role: null,
      source: "gallery" as const,
    }));

  it("hands out no token with the switch off, and with the allowance spent", () => {
    expect(visionRequestToken("token", true)).toBe("token");
    expect(visionRequestToken("token", false)).toBeNull();
    expect(visionRequestToken(null, true)).toBeNull();
    expect(resolveVisionEnabled(false, free(7))).toBe(false);
    expect(resolveVisionEnabled(true, free(0))).toBe(false);
    expect(resolveVisionEnabled(true, free(3))).toBe(true);
    expect(resolveVisionEnabled(true, plus)).toBe(true);
  });

  it("lands three photos on Confirm with the empty identity block", () => {
    const session = createCaptureSessionFromPhotos(photos(3));
    const draft = session.drafts[0];
    if (!draft) {
      throw new Error("expected a draft");
    }
    expect(session.branch).toBe("single");
    const block = resolveIdentityBlock({
      draft,
      visionOn: false,
      inFlight: false,
      filledByVision: false,
      suggestion: null,
    });
    expect(block.kind).toBe("empty");
    expect(block.label).toBe("Vision er slået fra");
  });

  it("keeps four photos in the bulk bind chrome; the grouping hook keys its job on the token", () => {
    const session = createCaptureSessionFromPhotos(photos(4));
    expect(session.branch).toBe("bulk");
    expect(session.unboundUris).toHaveLength(4);
    // A bulk session is due a grouping run; with no token the hook has no job key and sends none.
    expect(groupingJobFingerprint(session)).not.toBeNull();
  });

  it("runs both Vision hooks on the gated token, so a switched-off session sends nothing", () => {
    const confirm = readFileSync(join(__dirname, "../app/(capture)/confirm.tsx"), "utf8");
    const grouping = readFileSync(
      join(__dirname, "../src/capture/use-confirm-grouping.ts"),
      "utf8",
    );
    expect(confirm).toContain("visionRequestToken(sessionToken, visionEnabled)");
    expect(confirm).toContain("resolveVisionEnabled(visionRemembered");
    expect(confirm).toMatch(/useConfirmGrouping\(\{\s*accessToken,/);
    expect(confirm).toMatch(/useConfirmVision\(\{\s*accessToken,/);
    // No token, no job key: nothing waits on a grouping run that will never start.
    expect(grouping).toContain("accessToken && state ? groupingJobFingerprint(state) : null");
  });
});
