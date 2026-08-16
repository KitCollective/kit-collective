import type { SeedToolName } from "./prepare-seed-run.ts";

export const SEED_TOOL_LANES = ["development", "staging"] as const;

export type SeedToolLane = (typeof SEED_TOOL_LANES)[number];

const LANE_RULES = [
  "`0001` is that competition's first season (not a calendar year).",
  "Run Apify for the same competition + season range before FK. FK refuses a scope whose Club/Season rows are missing.",
  "Lane defaults to development when omitted. Use staging only when the human named that lane. Production is impossible from these tools.",
].join(" ");

export type SeedToolDefinition = {
  name: SeedToolName;
  description: string;
};

export const SEED_TOOL_DEFINITIONS: readonly SeedToolDefinition[] = [
  {
    name: "seed_apify",
    description: [
      "Run the Apify / Transfermarkt seed CLI: fetch → normalize → map Club, League, Season, TeamSeason, Player, PlayerClubSeason, CatalogLabel, and ExternalId.",
      "Arguments match the CLI: competition, from-season, to-season, lane.",
      LANE_RULES,
    ].join(" "),
  },
  {
    name: "seed_fk",
    description: [
      "Run the Football Kit Archive seed CLI: write Kit identity and admin_only KitPhoto object keys (rights unresolved) for a competition + season range.",
      "Arguments match the CLI: competition, from-season, to-season, lane.",
      LANE_RULES,
    ].join(" "),
  },
];
