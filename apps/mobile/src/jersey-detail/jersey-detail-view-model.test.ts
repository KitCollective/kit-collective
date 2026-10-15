import type { CollectionJersey } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import {
  buildJerseyDetailView,
  jerseyDeleteConfirmCopy,
  jerseyPhotoCountLabel,
  jerseySettingsView,
} from "@/jersey-detail/jersey-detail-view-model";

let counter = 0;

function jersey(overrides: Partial<CollectionJersey> = {}): CollectionJersey {
  counter += 1;
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  return {
    id,
    clubId: "club-a",
    nationalTeamId: null,
    seasonId: "season-1",
    countryId: "country-1",
    leagueId: null,
    catalogKitId: null,
    type: "home",
    size: "m",
    condition: "used",
    countryLabel: "Danmark",
    leagueLabel: null,
    clubLabel: "Brøndby IF",
    nationalTeamLabel: null,
    seasonLabel: "2023/24",
    squadPlayers: [],
    photos: [],
    biddingEnabled: false,
    private: false,
    ...overrides,
  };
}

const formatTime = (iso: string) => `t(${iso})`;

function view(own: CollectionJersey, list: CollectionJersey[] = [own]) {
  return buildJerseyDetailView({ jersey: own, list, formatTime });
}

describe("caption: Trøje nr. n · type", () => {
  // The owner's list is ordered createdAt desc (listJerseys), so the newest jersey is index 0
  // and the oldest is nr. 1: n = list.length - index.
  it("numbers by date added, assuming the list is createdAt desc", () => {
    const newest = jersey({ type: "away" });
    const middle = jersey({ type: "home" });
    const oldest = jersey({ type: "third" });
    const list = [newest, middle, oldest];

    expect(view(oldest, list).caption).toBe("Trøje nr. 1 · Tredje");
    expect(view(middle, list).caption).toBe("Trøje nr. 2 · Hjemme");
    expect(view(newest, list).caption).toBe("Trøje nr. 3 · Ude");
  });

  it("drops the number when the jersey is not in the list", () => {
    expect(view(jersey({ type: "gk" }), []).caption).toBe("Trøje · Keeper");
  });
});

describe("title and season", () => {
  it("shows the club and the season", () => {
    const result = view(jersey());
    expect(result.title).toBe("Brøndby IF");
    expect(result.season).toBe("2023/24");
  });

  it("falls back to the national team", () => {
    const result = view(
      jersey({ clubId: null, clubLabel: null, nationalTeamId: "nt", nationalTeamLabel: "Danmark" }),
    );
    expect(result.title).toBe("Danmark");
  });
});

describe("bid row", () => {
  it("is absent without unanswered bids", () => {
    expect(view(jersey()).bidRow).toBeNull();
    expect(view(jersey({ unansweredBidCount: 0 })).bidRow).toBeNull();
  });

  it("opens the thread when one collector has bid", () => {
    const own = jersey({
      unansweredBidCount: 2,
      unansweredBidLatestAt: "2026-10-15T10:00:00.000Z",
      unansweredBidderInitials: ["MH"],
      unansweredBidConversationId: "11111111-1111-4111-8111-111111111111",
    });
    const row = view(own).bidRow;

    expect(row).toEqual({
      initials: ["MH"],
      text: "2 bud venter på svar",
      time: "t(2026-10-15T10:00:00.000Z)",
      target: { kind: "thread", conversationId: "11111111-1111-4111-8111-111111111111" },
      accessibilityLabel: "2 bud venter på svar, seneste t(2026-10-15T10:00:00.000Z)",
      accessibilityHint: "Åbner samtalen",
    });
  });

  it("opens Indbakke filtered to the jersey when several have bid", () => {
    const own = jersey({
      unansweredBidCount: 3,
      unansweredBidLatestAt: "2026-10-15T10:00:00.000Z",
      unansweredBidderInitials: ["AB", "CD"],
      unansweredBidConversationId: null,
    });
    const row = view(own).bidRow;

    expect(row?.initials).toEqual(["AB", "CD"]);
    expect(row?.text).toBe("3 bud venter på svar");
    expect(row?.target).toEqual({ kind: "inbox", jerseyId: own.id });
    expect(row?.accessibilityHint).toBe("Åbner Indbakke for denne trøje");
  });

  it("reads 1 bud venter på svar for a single bid", () => {
    const row = view(
      jersey({
        unansweredBidCount: 1,
        unansweredBidLatestAt: "2026-10-15T10:00:00.000Z",
        unansweredBidderInitials: ["MH"],
        unansweredBidConversationId: "11111111-1111-4111-8111-111111111111",
      }),
    ).bidRow;
    expect(row?.text).toBe("1 bud venter på svar");
  });

  it("shows no amount and survives an API without the summary fields", () => {
    const row = view(jersey({ unansweredBidCount: 1 })).bidRow;
    expect(row?.time).toBeNull();
    expect(row?.initials).toEqual([]);
    expect(row?.target.kind).toBe("inbox");
    expect(JSON.stringify(row)).not.toMatch(/kr\b/);
  });
});

describe("player row", () => {
  it("shows the player with the shirt number", () => {
    const row = view(jersey({ playerLabel: "Kasper Schmeichel", playerNumber: "1" })).playerRow;
    expect(row).toEqual({
      kind: "player",
      name: "Kasper Schmeichel",
      number: 1,
      caption: "Spiller på ryggen",
      accessibilityLabel: "Spiller på ryggen, Kasper Schmeichel, nummer 1",
    });
  });

  it("keeps a player without a shirt number (empty emblem, design gap)", () => {
    const row = view(jersey({ playerLabel: "Ny Spiller", playerNumber: null })).playerRow;
    expect(row).toMatchObject({ kind: "player", name: "Ny Spiller", number: null });
    expect(row.accessibilityLabel).toBe("Spiller på ryggen, Ny Spiller");
  });

  it("shows the add state without a player", () => {
    const row = view(jersey()).playerRow;
    expect(row).toEqual({
      kind: "add",
      title: "Tilføj spiller",
      accessibilityLabel: "Spiller på ryggen, Tilføj spiller",
    });
  });
});

describe("fact rows", () => {
  it("lists Type, Størrelse, Stand and Badge as label and value, one announcement each", () => {
    const rows = view(
      jersey({
        type: "away",
        size: "xl",
        condition: "new",
        patches: [
          { id: "00000000-0000-4000-8000-0000000000a1", label: "Champions League" },
          { id: "00000000-0000-4000-8000-0000000000a2", label: "Fair Play" },
        ],
      }),
    ).factRows;

    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ["Type", "Ude"],
      ["Størrelse", "XL"],
      ["Stand", "Ny"],
      ["Badge", "Champions League, Fair Play"],
    ]);
    expect(rows.map((row) => row.accessibilityLabel)).toEqual([
      "Type, Ude",
      "Størrelse, XL",
      "Stand, Ny",
      "Badge, Champions League, Fair Play",
    ]);
    expect(rows.every((row) => !row.muted)).toBe(true);
  });

  it("reads an unset Badge as Tilføj in muted, and has no Note row", () => {
    const rows = view(jersey()).factRows;
    const badge = rows.find((row) => row.label === "Badge");

    expect(badge).toMatchObject({
      value: "Tilføj",
      muted: true,
      accessibilityLabel: "Badge, Tilføj",
    });
    expect(rows.map((row) => row.label)).toEqual(["Type", "Størrelse", "Stand", "Badge"]);
  });
});

describe("settings", () => {
  it("lets both switches be used when the jersey is not private", () => {
    const settings = jerseySettingsView({
      biddingEnabled: true,
      isPrivate: false,
      savingBidding: false,
      savingPrivate: false,
    });

    expect(settings.bidding).toMatchObject({
      label: "Åben for bud",
      checked: true,
      disabled: false,
    });
    expect(settings.private).toMatchObject({ label: "Privat", checked: false, disabled: false });
  });

  it("private turns bids off, disables that switch and says why", () => {
    const settings = jerseySettingsView({
      biddingEnabled: true,
      isPrivate: true,
      savingBidding: false,
      savingPrivate: false,
    });

    expect(settings.bidding.checked).toBe(false);
    expect(settings.bidding.disabled).toBe(true);
    expect(settings.bidding.helper).toBe("Slået fra, fordi trøjen er privat.");
    expect(settings.bidding.accessibilityLabel).toContain("Åben for bud");
    expect(settings.bidding.accessibilityLabel).toContain("fordi trøjen er privat");
    expect(settings.private.checked).toBe(true);
  });

  it("disables a switch while it saves", () => {
    const settings = jerseySettingsView({
      biddingEnabled: false,
      isPrivate: false,
      savingBidding: true,
      savingPrivate: true,
    });
    expect(settings.bidding.disabled).toBe(true);
    expect(settings.private.disabled).toBe(true);
  });

  it("has one helper line per row", () => {
    const settings = jerseySettingsView({
      biddingEnabled: false,
      isPrivate: false,
      savingBidding: false,
      savingPrivate: false,
    });
    expect(settings.bidding.helper).toBe("Andre samlere kan finde trøjen under Søg og sende bud.");
    expect(settings.private.helper).toBe("Skjuler trøjen fra søgning og andre samlere.");
  });
});

describe("delete confirmation", () => {
  it("shows the jersey and says what is removed, declined and kept", () => {
    const copy = jerseyDeleteConfirmCopy(jersey({ type: "away" }));

    expect(copy.title).toBe("Slet trøjen?");
    expect(copy.jerseyTitle).toBe("Brøndby IF");
    expect(copy.jerseyMeta).toBe("2023/24 · Ude");
    expect(copy.consequence).toContain("Trøjen og dens fotos fjernes");
    expect(copy.consequence).toContain("Åbne bud på den afvises");
    expect(copy.consequence).toContain("samtalerne bliver liggende");
    expect(copy.confirmLabel).toBe("Slet trøjen");
    expect(copy.keepLabel).toBe("Behold");
  });

  it("never says that conversations or bids are deleted (CONTEXT.md: Conversation)", () => {
    const copy = jerseyDeleteConfirmCopy(jersey());
    const text = `${copy.title} ${copy.consequence}`.toLowerCase();

    expect(text).not.toMatch(/samtal\w* (slettes|fjernes)/);
    expect(text).not.toMatch(/bud (slettes|fjernes)/);
    expect(text).not.toContain("slettet");
  });
});

describe("photo count", () => {
  it("reads current/total", () => {
    expect(jerseyPhotoCountLabel(0, 2)).toBe("1/2");
    expect(jerseyPhotoCountLabel(1, 2)).toBe("2/2");
  });
});
