import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeBidSent,
  rememberBidSent,
  resetBidSentHandoff,
} from "../src/search/bid-sent-handoff";

describe("bid sent handoff (KIT-291)", () => {
  beforeEach(() => resetBidSentHandoff());

  it("hands the Handle to the detail once", () => {
    rememberBidSent("jersey-1", "freja_e2e");
    expect(consumeBidSent("jersey-1")).toBe("freja_e2e");
    expect(consumeBidSent("jersey-1")).toBeNull();
  });

  it("hands nothing over when no bid was sent", () => {
    expect(consumeBidSent("jersey-1")).toBeNull();
  });

  it("hands nothing to another jersey's detail and keeps the pending toast", () => {
    rememberBidSent("jersey-1", "freja_e2e");
    expect(consumeBidSent("jersey-2")).toBeNull();
    expect(consumeBidSent("jersey-1")).toBe("freja_e2e");
  });
});
