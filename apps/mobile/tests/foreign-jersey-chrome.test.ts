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

    expect(source).toContain('"[jerseyId]"');
    expect(source).toContain('presentation: "fullScreenModal"');
  });
});
