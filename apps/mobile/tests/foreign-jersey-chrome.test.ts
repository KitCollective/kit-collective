import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const screen = () => read("app/(tabs)/search/[jerseyId].tsx");

describe("foreign jersey detail screen chrome (KIT-290)", () => {
  it("is one column: the photo pager, no thumb strip, no bottom sheet, no pager dots", () => {
    const source = screen();

    expect(source).toContain("JerseyPhotoPager");
    expect(source).not.toContain("JerseyThumbStrip");
    expect(source).not.toContain("bottomSheet");
    expect(source).not.toContain("pagerDot");
  });

  it("drops the closed-bidding helper: a jersey that is not open for bid has no dock", () => {
    expect(screen()).not.toContain("BIDDING_CLOSED_HELPER");
    expect(screen()).not.toContain("Ejer har lukket for bud");
  });

  it("docks Send bud outside the scroll body, behind the dock state", () => {
    const source = screen();
    const scrollClose = source.indexOf("</ScrollView>");
    const dock = source.indexOf("<ButtonDock");
    const send = source.indexOf('testID="send-bid-open"');

    expect(scrollClose).toBeGreaterThan(-1);
    expect(dock).toBeGreaterThan(scrollClose);
    expect(send).toBeGreaterThan(dock);
    expect(source).toContain("peerJerseyDockState");
    expect(source).toContain("/(tabs)/search/send-bid/");
  });

  it("reloads the jersey on every focus, so a sent bid shows the own bid row (KIT-291)", () => {
    const source = screen();

    expect(source).toContain("useFocusEffect");
    expect(source).toContain("fetchPeerJersey");
    expect(source).toContain("myPendingBid: peerJersey.myPendingBid");
  });

  it("docks the own bid row, not Send bud, and opens the thread of that Bud (KIT-291)", () => {
    const source = screen();
    const scrollClose = source.indexOf("</ScrollView>");
    const row = source.indexOf("<OwnBidRow");

    expect(row).toBeGreaterThan(scrollClose);
    expect(source).toContain('dockState.kind === "own-pending"');
    expect(source).toContain("/(tabs)/inbox/${dockState.conversationId}");
  });

  it("shows the sent-bid Toast once from a handoff, through a host on this screen (KIT-291)", () => {
    const source = screen();

    expect(source).toContain("consumeBidSent");
    expect(source).toContain("<Toast");
    expect(source).toContain("config={bidSentToastConfig}");
  });

  it("puts the owner block last in the column, after the fact rows", () => {
    const source = screen();

    expect(source.indexOf("JerseyFactRow")).toBeGreaterThan(-1);
    expect(
      source.indexOf("ForeignJerseyOwnerRow", source.indexOf("<JerseyFactRow")),
    ).toBeGreaterThan(source.indexOf("<JerseyFactRow"));
  });

  it("reads no other Collector's bid amount", () => {
    expect(screen()).not.toContain("latestBidAmountDkk");
  });

  it("gives Favorit to the pager through the optional favorite prop", () => {
    expect(screen()).toContain("favorite={");
  });
});

describe("own bid row and sent-bid Toast chrome (KIT-291)", () => {
  it("builds the own bid row from lock tokens: fill.secondary, radius.md, 54 high, chevron", () => {
    const source = read("src/search/own-bid-row.tsx");

    expect(source).toContain("theme.fillSecondary");
    expect(source).toContain("radius.md");
    expect(source).toContain("ROW_HEIGHT = 54");
    expect(source).toContain("chevron-forward");
    expect(source).toContain("typography.mono");
  });

  it("builds the sent-bid Toast from the Toast tokens, without the danger border, icon or action", () => {
    const source = read("src/search/bid-sent-toast.tsx");

    expect(source).toContain("theme.fillSecondary");
    expect(source).toContain("radius.md");
    expect(source).toContain("typography.body");
    expect(source).toContain("theme.contentPrimary");
    expect(source).not.toContain("theme.danger");
    expect(source).not.toContain("Ionicons");
    expect(source).not.toContain("Prøv igen");
  });
});

describe("photo pager favorite slot (KIT-290)", () => {
  it("renders a Favorit round button only when a favorite prop is given", () => {
    const source = read("src/jersey-detail/jersey-photos.tsx");

    expect(source).toContain("favorite?:");
    expect(source).toContain("Fjern favorit");
    expect(source).toContain("Gem favorit");
    expect(source).toMatch(/favorite\s*\?/);
  });

  it("leaves the own detail with Back and More only", () => {
    const source = read("app/(tabs)/collection/[jerseyId].tsx");

    expect(source).not.toContain("favorite=");
  });
});

describe("Avatar sm (KIT-290, KIT-394)", () => {
  it("adds the 44 size with initials in type.label and keeps lg and md", () => {
    const source = read("src/components/avatar.tsx");

    expect(source).toMatch(/AvatarSize = "lg" \| "md" \| "sm"/);
    expect(source).toMatch(/sm:\s*44/);
    expect(source).toMatch(/lg:\s*64/);
    expect(source).toMatch(/md:\s*56/);
    expect(source).toContain("typography.label");
  });
});

describe("foreign jersey route presentation (KIT-290)", () => {
  it("hides the Tab bar by presenting the jersey route as a full-screen modal", () => {
    const source = read("app/(tabs)/search/_layout.tsx");

    expect(source).toContain("name={FOREIGN_JERSEY_ROUTE}");
    expect(source).toContain('presentation: "fullScreenModal"');
  });

  it("names a full-screen presentation for routes above the jersey route", () => {
    const source = read("app/(tabs)/search/_layout.tsx");

    expect(source).toContain("sitsAboveForeignJersey");
    expect(source).toContain("navigation.getState()");
  });

  it("declares the index screen before the jersey route so Søg stays the initial route", () => {
    const source = read("app/(tabs)/search/_layout.tsx");

    expect(source.indexOf('name="index"')).toBeGreaterThan(-1);
    expect(source.indexOf('name="index"')).toBeLessThan(
      source.indexOf("name={FOREIGN_JERSEY_ROUTE}"),
    );
  });
});
