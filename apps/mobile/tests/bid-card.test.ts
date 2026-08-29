import { describe, expect, it } from "vitest";
import { bidCardAmountTypography } from "../src/components/bid-card-amount";

describe("bidCardAmountTypography", () => {
  it("uses mono 20px with 24 line-height per design lock", () => {
    expect(bidCardAmountTypography()).toEqual({
      fontSize: 20,
      lineHeight: 24,
    });
  });
});
