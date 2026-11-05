import type { Entitlement } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import {
  PAYWALL_BENEFITS,
  resolvePaywallBody,
  resolvePlusAccessState,
  resolveSellPage,
  resolveWishlistPage,
} from "../src/premium/plus-view-model";

const NO_ROW: Entitlement = { live: false, source: null, expires: null, trialUsed: false };
const ACTIVE_TRIAL: Entitlement = {
  live: true,
  source: "trial",
  expires: "2026-09-02T12:00:00.000Z",
  trialUsed: true,
};
const EXPIRED_TRIAL: Entitlement = {
  live: false,
  source: "trial",
  expires: "2026-08-01T12:00:00.000Z",
  trialUsed: true,
};
const COMP: Entitlement = {
  live: true,
  source: "comp",
  expires: "2026-12-31T23:59:59.000Z",
  trialUsed: false,
};
const IAP: Entitlement = {
  live: true,
  source: "iap_apple",
  expires: "2026-12-31T23:59:59.000Z",
  trialUsed: false,
};
const LAPSED_IAP: Entitlement = { ...IAP, live: false };

const TRIAL_3 = { trialEnabled: true, trialDays: 3 };

describe("resolvePlusAccessState", () => {
  it("is none-trial-available for a Collector with no Entitlement row and a trial on offer", () => {
    expect(resolvePlusAccessState(NO_ROW, TRIAL_3)).toBe("none-trial-available");
  });

  it("is none-trial-used when the trial is off in Offer", () => {
    expect(resolvePlusAccessState(NO_ROW, { trialEnabled: false, trialDays: 3 })).toBe(
      "none-trial-used",
    );
    expect(resolvePlusAccessState(NO_ROW, { trialEnabled: true, trialDays: 0 })).toBe(
      "none-trial-used",
    );
  });

  it("is none-trial-used while Offer has not loaded, so no trial is promised", () => {
    expect(resolvePlusAccessState(NO_ROW, null)).toBe("none-trial-used");
  });

  it("is live for an active trial, comp and IAP Entitlement", () => {
    expect(resolvePlusAccessState(ACTIVE_TRIAL, TRIAL_3)).toBe("live");
    expect(resolvePlusAccessState(COMP, TRIAL_3)).toBe("live");
    expect(resolvePlusAccessState(IAP, TRIAL_3)).toBe("live");
  });

  it("is lapsed once an Entitlement has ended", () => {
    expect(resolvePlusAccessState(EXPIRED_TRIAL, TRIAL_3)).toBe("lapsed");
    expect(resolvePlusAccessState(LAPSED_IAP, TRIAL_3)).toBe("lapsed");
  });

  it("is live when the local Entitlement gate is off in a dev build", () => {
    expect(resolvePlusAccessState(EXPIRED_TRIAL, TRIAL_3, "off", true)).toBe("live");
  });

  it("ignores the Entitlement gate off flag in a release build", () => {
    expect(resolvePlusAccessState(EXPIRED_TRIAL, TRIAL_3, "off", false)).toBe("lapsed");
  });
});

describe("resolveWishlistPage", () => {
  it("sells Plus to a Collector who has none, and lists wishes for the rest", () => {
    expect(resolveWishlistPage("none-trial-available")).toBe("sell");
    expect(resolveWishlistPage("none-trial-used")).toBe("sell");
    expect(resolveWishlistPage("live")).toBe("list");
    expect(resolveWishlistPage("lapsed")).toBe("list");
  });
});

describe("resolveSellPage", () => {
  it("offers the trial by its length from Offer, with the monthly store price", () => {
    expect(resolveSellPage("none-trial-available", TRIAL_3, "29,00 kr.")).toEqual({
      buttonLabel: "Prøv gratis i 3 dage",
      caption: "29,00 kr./md.",
    });
    expect(
      resolveSellPage("none-trial-available", { trialEnabled: true, trialDays: 7 }, null),
    ).toMatchObject({ buttonLabel: "Prøv gratis i 7 dage" });
  });

  it("says dag, not dage, for a one-day trial", () => {
    expect(
      resolveSellPage("none-trial-available", { trialEnabled: true, trialDays: 1 }, null)
        .buttonLabel,
    ).toBe("Prøv gratis i 1 dag");
  });

  it("offers Fortsæt med Plus when the trial is used, and when Offer has it off", () => {
    expect(resolveSellPage("none-trial-used", TRIAL_3, "29,00 kr.").buttonLabel).toBe(
      "Fortsæt med Plus",
    );
    expect(
      resolveSellPage("none-trial-used", { trialEnabled: false, trialDays: 3 }, null).buttonLabel,
    ).toBe("Fortsæt med Plus");
  });

  it("has no caption, never an ellipsis, while the price has not loaded", () => {
    expect(resolveSellPage("none-trial-used", TRIAL_3, null).caption).toBeNull();
  });
});

describe("resolvePaywallBody", () => {
  it("names the two benefits and no internal names", () => {
    expect(PAYWALL_BENEFITS).toEqual(["Besked ved match", "Ubegrænset fotogenkendelse"]);
  });

  it("shows the three-line timeline, the price line and Start gratis prøve while the trial is unused", () => {
    const body = resolvePaywallBody("none-trial-available", TRIAL_3, "29,00 kr.");
    expect(body).toEqual({
      kind: "trial",
      timeline: [
        { label: "I dag", text: "3 dage gratis" },
        { label: "Dag 2", text: "Påmindelse" },
        { label: "Dag 3", text: "Prøven slutter" },
      ],
      priceLine: "Derefter 29,00 kr./md. Intet trækkes automatisk.",
      buttonLabel: "Start gratis prøve",
    });
  });

  it("drops the reminder when the trial is one day, as the reminder day is today", () => {
    const body = resolvePaywallBody(
      "none-trial-available",
      { trialEnabled: true, trialDays: 1 },
      null,
    );
    expect(body.kind === "trial" && body.timeline).toEqual([
      { label: "I dag", text: "1 dag gratis" },
      { label: "Dag 1", text: "Prøven slutter" },
    ]);
  });

  it("has no price line, never an ellipsis, while the price has not loaded", () => {
    const body = resolvePaywallBody("none-trial-available", TRIAL_3, null);
    expect(body.kind === "trial" && body.priceLine).toBeNull();
  });

  it("shows the buy body once the trial is used, lapsed, or off in Offer", () => {
    expect(resolvePaywallBody("none-trial-used", TRIAL_3, "29,00 kr.").kind).toBe("buy");
    expect(resolvePaywallBody("lapsed", TRIAL_3, "29,00 kr.").kind).toBe("buy");
    expect(
      resolvePaywallBody("none-trial-used", { trialEnabled: false, trialDays: 3 }, null).kind,
    ).toBe("buy");
  });

  it("never uses an internal name in the copy", () => {
    const copy = JSON.stringify([
      PAYWALL_BENEFITS,
      resolvePaywallBody("none-trial-available", TRIAL_3, "29,00 kr."),
      resolveSellPage("none-trial-available", TRIAL_3, "29,00 kr."),
    ]);
    expect(copy).not.toContain("Vision Matcher");
    expect(copy).not.toContain("Plus er");
    expect(copy).not.toContain("…");
  });
});
