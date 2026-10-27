import type { CollectionJersey } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import {
  applyJerseyEdit,
  clubChangeCopy,
  type JerseyEditOutcome,
  jerseyFactSheetCopy,
  seasonDecades,
  sortSeasonsNewestFirst,
} from "@/jersey-detail/jersey-edit";

const CLUB_A = "00000000-0000-4000-8000-00000000000a";
const CLUB_B = "00000000-0000-4000-8000-00000000000b";
const TEAM_DK = "00000000-0000-4000-8000-0000000000d1";
const SEASON_23 = "00000000-0000-4000-8000-000000000023";
const SEASON_22 = "00000000-0000-4000-8000-000000000022";
const PLAYER_1 = "00000000-0000-4000-8000-0000000000f1";
const PLAYER_2 = "00000000-0000-4000-8000-0000000000f2";
const PATCH_1 = "00000000-0000-4000-8000-0000000000e1";
const PATCH_2 = "00000000-0000-4000-8000-0000000000e2";
const KIT_1 = "00000000-0000-4000-8000-0000000000c1";

function jersey(overrides: Partial<CollectionJersey> = {}): CollectionJersey {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    clubId: CLUB_A,
    nationalTeamId: null,
    seasonId: SEASON_23,
    countryId: "00000000-0000-4000-8000-0000000000aa",
    leagueId: null,
    catalogKitId: KIT_1,
    type: "home",
    size: "m",
    condition: "used",
    countryLabel: "Danmark",
    leagueLabel: null,
    clubLabel: "Brøndby IF",
    nationalTeamLabel: null,
    seasonLabel: "2023/24",
    squadPlayers: [{ id: PLAYER_1, label: "Kevin Mensah" }],
    playerId: PLAYER_1,
    playerLabel: "Kevin Mensah",
    playerNumber: "9",
    patches: [{ id: PATCH_1, label: "Superliga" }],
    photos: [],
    biddingEnabled: false,
    private: false,
    ...overrides,
  } as CollectionJersey;
}

function ok(outcome: JerseyEditOutcome) {
  if (outcome.status !== "ok") {
    throw new Error(`expected ok, got ${outcome.status}`);
  }
  return outcome;
}

describe("one fact at a time: type, size, condition", () => {
  it("sends the whole row with only that fact changed", () => {
    const { body, optimistic, reset } = ok(
      applyJerseyEdit(jersey(), { kind: "size", value: "xl" }),
    );

    expect(body).toEqual({
      clubId: CLUB_A,
      seasonId: SEASON_23,
      catalogKitId: KIT_1,
      type: "home",
      size: "xl",
      condition: "used",
      playerId: PLAYER_1,
      patchIds: [PATCH_1],
    });
    expect(optimistic.size).toBe("xl");
    expect(optimistic.playerLabel).toBe("Kevin Mensah");
    expect(reset).toEqual([]);
  });

  it("keeps the kit reference on size and condition", () => {
    expect(
      ok(applyJerseyEdit(jersey(), { kind: "condition", value: "new" })).body.catalogKitId,
    ).toBe(KIT_1);
    expect(ok(applyJerseyEdit(jersey(), { kind: "size", value: "s" })).body.catalogKitId).toBe(
      KIT_1,
    );
  });

  it("drops the kit reference when the type changes, because a kit is per type", () => {
    const { body, optimistic } = ok(applyJerseyEdit(jersey(), { kind: "type", value: "away" }));

    expect(body.type).toBe("away");
    expect(body.catalogKitId).toBeNull();
    expect(optimistic.catalogKitId).toBeNull();
    expect(body.patchIds).toEqual([PATCH_1]);
    expect(body.playerId).toBe(PLAYER_1);
  });

  it("keeps the kit when the type is picked again unchanged", () => {
    expect(ok(applyJerseyEdit(jersey(), { kind: "type", value: "home" })).body.catalogKitId).toBe(
      KIT_1,
    );
  });

  it("sends an empty patch list and a null player when the jersey has none", () => {
    const { body } = ok(
      applyJerseyEdit(
        jersey({ playerId: null, playerLabel: null, playerNumber: null, patches: undefined }),
        { kind: "size", value: "l" },
      ),
    );

    expect(body.playerId).toBeNull();
    expect(body.patchIds).toEqual([]);
  });

  it("round-trips the national-team side", () => {
    const national = jersey({
      clubId: null,
      clubLabel: null,
      nationalTeamId: TEAM_DK,
      nationalTeamLabel: "Danmark",
    });
    const { body } = ok(applyJerseyEdit(national, { kind: "condition", value: "good" }));

    expect(body.nationalTeamId).toBe(TEAM_DK);
    expect(body).not.toHaveProperty("clubId");
  });
});

describe("badge", () => {
  it("sets the chosen patch and keeps everything else", () => {
    const { body, optimistic } = ok(
      applyJerseyEdit(jersey({ patches: [] }), {
        kind: "badge",
        patch: { id: PATCH_2, label: "Pokal" },
      }),
    );

    expect(body.patchIds).toEqual([PATCH_2]);
    expect(optimistic.patches).toEqual([{ id: PATCH_2, label: "Pokal" }]);
    expect(body.catalogKitId).toBe(KIT_1);
    expect(body.playerId).toBe(PLAYER_1);
  });

  it("removes the badge with Ingen", () => {
    const { body, optimistic } = ok(applyJerseyEdit(jersey(), { kind: "badge", patch: null }));

    expect(body.patchIds).toEqual([]);
    expect(optimistic.patches).toEqual([]);
  });
});

describe("player", () => {
  it("sets the player with label and number and keeps the kit", () => {
    const { body, optimistic } = ok(
      applyJerseyEdit(jersey(), {
        kind: "player",
        player: { id: PLAYER_2, label: "Jonas Lund", number: "11" },
      }),
    );

    expect(body.playerId).toBe(PLAYER_2);
    expect(body.catalogKitId).toBe(KIT_1);
    expect(optimistic.playerId).toBe(PLAYER_2);
    expect(optimistic.playerLabel).toBe("Jonas Lund");
    expect(optimistic.playerNumber).toBe("11");
  });

  it("stores an empty number as no number", () => {
    const { optimistic } = ok(
      applyJerseyEdit(jersey(), {
        kind: "player",
        player: { id: PLAYER_2, label: "Jonas Lund", number: "" },
      }),
    );

    expect(optimistic.playerNumber).toBeNull();
  });

  it("removes the player with a null playerId", () => {
    const { body, optimistic } = ok(applyJerseyEdit(jersey(), { kind: "player", player: null }));

    expect(body.playerId).toBeNull();
    expect(optimistic.playerId).toBeNull();
    expect(optimistic.playerLabel).toBeNull();
    expect(optimistic.playerNumber).toBeNull();
  });
});

describe("season", () => {
  const next = { id: SEASON_22, label: "2022/23" };

  it("keeps the player and the badge that exist in the new season, drops the kit", () => {
    const { body, optimistic, reset } = ok(
      applyJerseyEdit(jersey(), {
        kind: "season",
        season: next,
        squad: [{ id: PLAYER_1, label: "Kevin Mensah" }],
        patches: [{ id: PATCH_1, label: "Superliga" }],
      }),
    );

    expect(body.seasonId).toBe(SEASON_22);
    expect(body.playerId).toBe(PLAYER_1);
    expect(body.patchIds).toEqual([PATCH_1]);
    expect(body.catalogKitId).toBeNull();
    expect(optimistic.seasonLabel).toBe("2022/23");
    expect(optimistic.squadPlayers).toEqual([{ id: PLAYER_1, label: "Kevin Mensah" }]);
    expect(reset).toEqual([]);
  });

  it("clears the player who is not in the new squad", () => {
    const { body, optimistic, reset } = ok(
      applyJerseyEdit(jersey(), {
        kind: "season",
        season: next,
        squad: [{ id: PLAYER_2, label: "Jonas Lund" }],
        patches: [{ id: PATCH_1, label: "Superliga" }],
      }),
    );

    expect(body.playerId).toBeNull();
    expect(optimistic.playerLabel).toBeNull();
    expect(optimistic.playerNumber).toBeNull();
    expect(reset).toEqual(["player"]);
  });

  it("clears a badge the new season does not have", () => {
    const { body, optimistic, reset } = ok(
      applyJerseyEdit(jersey(), {
        kind: "season",
        season: next,
        squad: [{ id: PLAYER_1, label: "Kevin Mensah" }],
        patches: [{ id: PATCH_2, label: "Pokal" }],
      }),
    );

    expect(body.patchIds).toEqual([]);
    expect(optimistic.patches).toEqual([]);
    expect(reset).toEqual(["badge"]);
  });

  it("does nothing to a jersey that has no player or badge to reset", () => {
    const bare = jersey({ playerId: null, playerLabel: null, playerNumber: null, patches: [] });
    const { reset } = ok(
      applyJerseyEdit(bare, { kind: "season", season: next, squad: [], patches: [] }),
    );

    expect(reset).toEqual([]);
  });

  it("keeps the kit when the same season is picked again", () => {
    const same = { id: SEASON_23, label: "2023/24" };
    const { body } = ok(
      applyJerseyEdit(jersey(), {
        kind: "season",
        season: same,
        squad: [{ id: PLAYER_1, label: "Kevin Mensah" }],
        patches: [{ id: PATCH_1, label: "Superliga" }],
      }),
    );

    expect(body.catalogKitId).toBe(KIT_1);
  });

  it("works on the national-team side", () => {
    const national = jersey({
      clubId: null,
      clubLabel: null,
      nationalTeamId: TEAM_DK,
      nationalTeamLabel: "Danmark",
    });
    const { body } = ok(
      applyJerseyEdit(national, { kind: "season", season: next, squad: [], patches: [] }),
    );

    expect(body.nationalTeamId).toBe(TEAM_DK);
    expect(body.seasonId).toBe(SEASON_22);
  });
});

describe("club", () => {
  const clubB = { id: CLUB_B, label: "FC København" };

  it("keeps season, type, size, condition and badge when the new club has the season; resets the player", () => {
    const { body, optimistic, reset } = ok(
      applyJerseyEdit(jersey(), {
        kind: "club",
        club: clubB,
        seasons: [
          { id: SEASON_23, label: "2023/24" },
          { id: SEASON_22, label: "2022/23" },
        ],
        patches: [{ id: PATCH_1, label: "Superliga" }],
      }),
    );

    expect(body.clubId).toBe(CLUB_B);
    expect(body).not.toHaveProperty("nationalTeamId");
    expect(body.seasonId).toBe(SEASON_23);
    expect(body.type).toBe("home");
    expect(body.size).toBe("m");
    expect(body.condition).toBe("used");
    expect(body.playerId).toBeNull();
    expect(body.catalogKitId).toBeNull();
    expect(body.patchIds).toEqual([PATCH_1]);
    expect(optimistic.clubLabel).toBe("FC København");
    expect(optimistic.playerLabel).toBeNull();
    expect(optimistic.squadPlayers).toEqual([]);
    expect(reset).toEqual(["player"]);
  });

  it("does not report a player reset for a jersey that has no player", () => {
    const { reset } = ok(
      applyJerseyEdit(jersey({ playerId: null, playerLabel: null, playerNumber: null }), {
        kind: "club",
        club: clubB,
        seasons: [{ id: SEASON_23, label: "2023/24" }],
        patches: [{ id: PATCH_1, label: "Superliga" }],
      }),
    );

    expect(reset).toEqual([]);
  });

  it("drops a badge the kept season does not offer", () => {
    const { body, reset } = ok(
      applyJerseyEdit(jersey(), {
        kind: "club",
        club: clubB,
        seasons: [{ id: SEASON_23, label: "2023/24" }],
        patches: [{ id: PATCH_2, label: "Pokal" }],
      }),
    );

    expect(body.patchIds).toEqual([]);
    expect(reset).toEqual(["player", "badge"]);
  });

  it("asks for a season when the new club lacks the jersey's season, and saves nothing", () => {
    const outcome = applyJerseyEdit(jersey(), {
      kind: "club",
      club: clubB,
      seasons: [{ id: SEASON_22, label: "2022/23" }],
      patches: [],
    });

    expect(outcome).toEqual({ status: "choose-season", reset: ["player", "season", "badge"] });
  });

  it("with a chosen season for the new club: season changes, badge is checked against it", () => {
    const { body, optimistic, reset } = ok(
      applyJerseyEdit(jersey(), {
        kind: "club",
        club: clubB,
        seasons: [{ id: SEASON_22, label: "2022/23" }],
        chosenSeason: { id: SEASON_22, label: "2022/23" },
        patches: [{ id: PATCH_1, label: "Superliga" }],
      }),
    );

    expect(body.clubId).toBe(CLUB_B);
    expect(body.seasonId).toBe(SEASON_22);
    expect(optimistic.seasonLabel).toBe("2022/23");
    expect(body.patchIds).toEqual([PATCH_1]);
    expect(reset).toEqual(["player", "season"]);
  });

  it("moves a national-team jersey to a club (xor side)", () => {
    const national = jersey({
      clubId: null,
      clubLabel: null,
      nationalTeamId: TEAM_DK,
      nationalTeamLabel: "Danmark",
    });
    const { body, optimistic } = ok(
      applyJerseyEdit(national, {
        kind: "club",
        club: clubB,
        seasons: [{ id: SEASON_23, label: "2023/24" }],
        patches: [],
      }),
    );

    expect(body.clubId).toBe(CLUB_B);
    expect(body).not.toHaveProperty("nationalTeamId");
    expect(optimistic.nationalTeamId).toBeNull();
    expect(optimistic.nationalTeamLabel).toBeNull();
  });
});

describe("club change sheet copy", () => {
  const bare = jersey({ patches: [] });

  it("lists what is kept and what is reset, with the two actions named after the club", () => {
    const copy = clubChangeCopy(bare, "FC København", ["player"]);

    expect(copy.title).toBe("Skift klub?");
    expect(copy.kept).toEqual(["Sæson 2023/24", "Type", "Størrelse", "Stand"]);
    expect(copy.reset).toEqual(["Spiller"]);
    expect(copy.confirmLabel).toBe("Skift til FC København");
    expect(copy.keepLabel).toBe("Behold Brøndby IF");
  });

  it("moves season and badge to the reset list when they do not carry over", () => {
    const copy = clubChangeCopy(jersey(), "FC København", ["player", "season", "badge"]);

    expect(copy.kept).toEqual(["Type", "Størrelse", "Stand"]);
    expect(copy.reset).toEqual(["Spiller", "Sæson", "Badge"]);
  });

  it("lists a badge as kept only when the jersey has one that carries over", () => {
    expect(clubChangeCopy(jersey(), "FC København", ["player"]).kept).toContain("Badge");
    expect(clubChangeCopy(bare, "FC København", ["player"]).kept).not.toContain("Badge");
  });
});

describe("sheet copy for screen readers", () => {
  it("announces the fact and its current value", () => {
    const copy = jerseyFactSheetCopy("type", jersey());

    expect(copy.title).toBe("Type");
    expect(copy.accessibilityLabel).toBe("Type, nuværende Hjemme");
  });

  it("announces an unset badge as ingen", () => {
    expect(jerseyFactSheetCopy("badge", jersey({ patches: [] })).accessibilityLabel).toBe(
      "Badge, nuværende Ingen",
    );
  });
});

describe("season list", () => {
  const seasons = [
    { id: "a", label: "2009/10" },
    { id: "b", label: "2023/24" },
    { id: "c", label: "2014/15" },
    { id: "d", label: "2021/22" },
  ];

  it("sorts newest first by the starting year", () => {
    expect(sortSeasonsNewestFirst(seasons).map((season) => season.label)).toEqual([
      "2023/24",
      "2021/22",
      "2014/15",
      "2009/10",
    ]);
  });

  it("builds decade chips, newest first, each pointing at its first season", () => {
    expect(seasonDecades(sortSeasonsNewestFirst(seasons))).toEqual([
      { label: "2020'erne", firstSeasonId: "b" },
      { label: "2010'erne", firstSeasonId: "c" },
      { label: "2000'erne", firstSeasonId: "a" },
    ]);
  });

  it("puts a label with no year last and gives it no decade", () => {
    const sorted = sortSeasonsNewestFirst([...seasons, { id: "e", label: "Ukendt" }]);

    expect(sorted.at(-1)?.id).toBe("e");
    expect(seasonDecades(sorted)).toHaveLength(3);
  });
});
