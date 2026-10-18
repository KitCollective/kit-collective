import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bidCardAmountTypography } from "../src/components/bid-card-amount";

const bidCardPath = join(__dirname, "../src/components/bid-card.tsx");
const conversationViewPath = join(__dirname, "../src/components/conversation-view.tsx");

describe("bidCardAmountTypography", () => {
  it("uses mono 20px with 24 line-height per design lock", () => {
    expect(bidCardAmountTypography()).toEqual({
      fontSize: 20,
      lineHeight: 24,
    });
  });
});

describe("BidCard (Revision 2026-10-10, KIT-297)", () => {
  it("renders from the thread view-model, with Accepter and Afvis only when incomingPending", () => {
    const source = readFileSync(bidCardPath, "utf8");
    const view = readFileSync(conversationViewPath, "utf8");

    expect(source).toMatch(/BidCardState/);
    expect(source).toMatch(/incomingPending: boolean/);
    expect(source).toMatch(/\{incomingPending \? \(/);
    expect(view).toMatch(/const incomingPending = item\.card\.actions === "answer"/);
    expect(source).toMatch(/label="Accepter"/);
    expect(source).toMatch(/label="Afvis"/);
    expect(source).toMatch(/label="Send nyt bud"/);
    expect(source).toMatch(/accessibilityLabel=\{card\.accessibility\.accept\}/);
    expect(source).toMatch(/accessibilityLabel=\{card\.accessibility\.decline\}/);
    expect(source).toMatch(/accessibilityLabel=\{card\.accessibility\.sendNewBid\}/);
  });

  it("sets the amount in mono 28 with kr in mono 15, not bidCardAmountTypography", () => {
    const source = readFileSync(bidCardPath, "utf8");

    expect(source).not.toMatch(/bidCardAmountTypography/);
    expect(source).toMatch(/BID_CARD_AMOUNT_SIZE = 28/);
    expect(source).toMatch(/BID_CARD_UNIT_SIZE = 15/);
  });

  it("is 290 wide with a 40 x 50 jersey thumb, aligned by the view-model", () => {
    const source = readFileSync(bidCardPath, "utf8");

    expect(source).toMatch(/BID_CARD_WIDTH = 290/);
    expect(source).toMatch(/JERSEY_THUMB_WIDTH = 40/);
    expect(source).toMatch(/JERSEY_THUMB_HEIGHT = 50/);
    expect(source).toMatch(/card\.align === "end" \? "flex-end" : "flex-start"/);
  });
});

describe("ConversationView (Revision 2026-10-10, KIT-297)", () => {
  it("wires accept and decline through respondBid", () => {
    const source = readFileSync(conversationViewPath, "utf8");

    expect(source).toMatch(/respondBid/);
    expect(source).toMatch(/handleRespondBid/);
  });

  it("builds the column from the thread view-model and never renders a system line as a bubble", () => {
    const source = readFileSync(conversationViewPath, "utf8");

    expect(source).toMatch(/threadItems\(detail\)/);
    expect(source).not.toMatch(/buildTimeline/);
    expect(source).toMatch(/item\.type === "system"[\s\S]*?testID="thread-system-line"/);
  });

  it("shows a 32px round initial in the header, not the Avatar primitive, and reloads on focus", () => {
    const source = readFileSync(conversationViewPath, "utf8");

    expect(source).toMatch(/HEADER_INITIAL_SIZE = 32/);
    expect(source).toMatch(/headerInitial\(detail\.peerHandle\)/);
    expect(source).not.toMatch(/@\/components\/avatar/);
    expect(source).toMatch(/useFocusEffect/);
  });
});
