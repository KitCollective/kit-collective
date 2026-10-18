import { describe, expect, it } from "vitest";
import {
  bidSentToastMessage,
  normalizeBidAmountInput,
  ownBidRowCopy,
  sendBidButton,
  sendBidButtonLabel,
} from "../src/search/bid-rules";

describe("bid amount input (KIT-291)", () => {
  it("keeps digits only", () => {
    expect(normalizeBidAmountInput("250")).toBe("250");
    expect(normalizeBidAmountInput("2a5b0")).toBe("250");
  });

  it("allows no decimals: a separator is dropped, never read as a fraction", () => {
    expect(normalizeBidAmountInput("2,5")).toBe("25");
    expect(normalizeBidAmountInput("2.5")).toBe("25");
  });

  it("allows no leading zero", () => {
    expect(normalizeBidAmountInput("0")).toBe("");
    expect(normalizeBidAmountInput("007")).toBe("7");
    expect(normalizeBidAmountInput("100")).toBe("100");
  });

  it("empties on a non-numeric entry", () => {
    expect(normalizeBidAmountInput("abc")).toBe("");
    expect(normalizeBidAmountInput("")).toBe("");
  });
});

describe("send bid button (KIT-291)", () => {
  it("carries the amount when it is above zero", () => {
    expect(sendBidButton("250")).toEqual({ label: "Send bud på 250 kr", disabled: false });
  });

  it("reads plain Send bud and is disabled without an amount", () => {
    expect(sendBidButton("")).toEqual({ label: "Send bud", disabled: true });
    expect(sendBidButton("0")).toEqual({ label: "Send bud", disabled: true });
    expect(sendBidButton("abc")).toEqual({ label: "Send bud", disabled: true });
  });

  it("carries the amount on the label only for a whole kroner amount", () => {
    expect(sendBidButtonLabel("")).toBe("Send bud");
    expect(sendBidButtonLabel("0")).toBe("Send bud");
    expect(sendBidButtonLabel("abc")).toBe("Send bud");
    expect(sendBidButtonLabel("250")).toBe("Send bud på 250 kr");
  });
});

describe("own bid row copy (KIT-291)", () => {
  it("names Dit bud, the amount and Afventer svar", () => {
    expect(ownBidRowCopy(250)).toEqual({
      title: "Dit bud",
      amount: "250 kr",
      status: "Afventer svar",
      accessibilityLabel: "Dit bud, 250 kr, Afventer svar",
    });
  });
});

describe("bid sent toast (KIT-291)", () => {
  it("names the Handle the bid went to", () => {
    expect(bidSentToastMessage("freja_e2e")).toBe("Dit bud er sendt til freja_e2e");
  });
});
