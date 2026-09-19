import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bidCardAmountTypography } from "../src/components/bid-card-amount";

const bidCardPath = join(__dirname, "../src/components/bid-card.tsx");
const activityCardPath = join(__dirname, "../src/components/activity-card.tsx");
const conversationViewPath = join(__dirname, "../src/components/conversation-view.tsx");

describe("bidCardAmountTypography", () => {
  it("uses mono 20px with 24 line-height per design lock", () => {
    expect(bidCardAmountTypography()).toEqual({
      fontSize: 20,
      lineHeight: 24,
    });
  });
});

describe("BidCard accept/decline (KIT-120)", () => {
  it("shows Accepter and Afvis only for incoming pending bids", () => {
    const source = readFileSync(bidCardPath, "utf8");

    expect(source).toMatch(/incomingPending/);
    expect(source).toMatch(/label="Accepter"/);
    expect(source).toMatch(/label="Afvis"/);
    expect(source).toMatch(/variant="primary"/);
    expect(source).toMatch(/variant="secondary"/);
  });
});

describe("ActivityCard (KIT-120)", () => {
  it("maps unread fill and read surface per design lock", () => {
    const source = readFileSync(activityCardPath, "utf8");

    expect(source).toMatch(/item\.unread \? theme\.fillSecondary : theme\.surface/);
    expect(source).toMatch(/bidCardAmountTypography/);
    expect(source).toMatch(/chevron-forward/);
  });
});

describe("ConversationView bid response (KIT-120)", () => {
  it("wires accept and decline for incoming pending bids", () => {
    const source = readFileSync(conversationViewPath, "utf8");

    expect(source).toMatch(/respondBid/);
    expect(source).toMatch(/incomingPending=\{incomingPending\}/);
    expect(source).toMatch(/handleRespondBid/);
  });
});
