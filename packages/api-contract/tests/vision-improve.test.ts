import type { KitType } from "@kit/domain";
import { describe, expect, it } from "vitest";
import {
  aliasLocaleForHint,
  buildVisionImproveFingerprint,
  proposeVisionImprove,
  visionImproveKindForEvalClass,
} from "../src/collection/vision-improve.js";

const CLUB_A = "33333333-3333-3333-3333-333333333333";
const CLUB_B = "55555555-5555-5555-5555-555555555555";
const SEASON = "44444444-4444-4444-4444-444444444444";
const KIT_TYPE: KitType = "home";

describe("visionImproveKindForEvalClass", () => {
  it("maps alias coverage model and skips accepted transport", () => {
    expect(visionImproveKindForEvalClass("alias")).toBe("alias");
    expect(visionImproveKindForEvalClass("coverage")).toBe("seed");
    expect(visionImproveKindForEvalClass("model")).toBe("prompt");
    expect(visionImproveKindForEvalClass("accepted")).toBeNull();
    expect(visionImproveKindForEvalClass("transport")).toBeNull();
  });
});

describe("aliasLocaleForHint", () => {
  it("uses da when the hint is Danish-shaped and en otherwise", () => {
    expect(aliasLocaleForHint("F.C. København")).toBe("da");
    expect(aliasLocaleForHint("FCK")).toBe("en");
    expect(aliasLocaleForHint("Århus")).toBe("da");
  });
});

describe("buildVisionImproveFingerprint", () => {
  it("covers kind, entity, field, and compact-folded hint text", () => {
    const first = buildVisionImproveFingerprint({
      kind: "alias",
      entityType: "club",
      entityId: CLUB_B,
      field: "side",
      text: "F.C. København",
    });
    const second = buildVisionImproveFingerprint({
      kind: "alias",
      entityType: "club",
      entityId: CLUB_B,
      field: "side",
      text: "FC Kobenhavn",
    });
    expect(first).toBe(`alias:club:${CLUB_B}:side:fckobenhavn`);
    expect(second).toBe(first);
  });
});

describe("proposeVisionImprove", () => {
  it("upserts alias from a compact-matching side hint", () => {
    const proposal = proposeVisionImprove({
      evalClass: "alias",
      selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
      suggested: {},
      entityHints: { side: ["FCK"] },
      selectedCatalogLabels: { side: ["F.C. København", "FCK"] },
    });
    expect(proposal).toEqual({
      kind: "alias",
      text: "FCK",
      entityType: "club",
      entityId: CLUB_B,
      field: "side",
      fingerprint: `alias:club:${CLUB_B}:side:fck`,
    });
  });

  it("upserts seed from coverage and prompt from model", () => {
    const seed = proposeVisionImprove({
      evalClass: "coverage",
      selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
      suggested: {},
      entityHints: { side: ["Zyx Unknown"] },
    });
    expect(seed?.kind).toBe("seed");
    expect(seed?.field).toBe("side");
    expect(seed?.text).toBe("Zyx Unknown");
    expect(seed?.entityId).toBe(CLUB_B);

    const prompt = proposeVisionImprove({
      evalClass: "model",
      selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
      suggested: { clubId: CLUB_A, seasonId: SEASON, type: KIT_TYPE },
    });
    expect(prompt?.kind).toBe("prompt");
    expect(prompt?.field).toBe("side");
    expect(prompt?.text).toBe(`${CLUB_A}->${CLUB_B}`);
    expect(prompt?.entityId).toBe(CLUB_B);
  });

  it("creates no proposal for accepted or transport", () => {
    expect(
      proposeVisionImprove({
        evalClass: "accepted",
        selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
        suggested: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
      }),
    ).toBeNull();
    expect(
      proposeVisionImprove({
        evalClass: "transport",
        selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
      }),
    ).toBeNull();
  });
});
