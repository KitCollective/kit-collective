import type { ResolvedSeedLane } from "./lane.js";

export type JoinClubScope = {
  path: "club";
  competition: string;
  season: string;
  lane: ResolvedSeedLane;
};

export type JoinNationalTeamScope = {
  path: "national_team";
  nationalTeamRef: string;
  season: string;
  lane: ResolvedSeedLane;
};

export type JoinScope = JoinClubScope | JoinNationalTeamScope;
