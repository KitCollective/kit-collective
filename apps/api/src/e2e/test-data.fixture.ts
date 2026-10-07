import type { JerseyCondition, JerseySize, KitType, PhotoRole } from "@kit/domain";

/**
 * Device-flow test data (KIT-267). Every row the command writes has a fixed id,
 * so a re-run lands on the same rows and Maestro screenshots stay comparable.
 */
export const TEST_COLLECTOR_ID = "e2e00000-0000-4000-8000-000000000001";
export const TEST_PEER_ID = "e2e00000-0000-4000-8000-000000000002";

export const TEST_COLLECTOR_HANDLE = "e2e_samler";
export const TEST_PEER_HANDLE = "e2e_peer";

/** Catalog sides the fixture needs, matched on a `catalog_label` label or alias. */
export const TEST_DATA_CATALOG = {
  clubs: ["FC København", "Brøndby IF", "AGF", "OB", "FC Midtjylland", "AaB"],
  nationalTeams: ["Danmark"],
} as const;

type ClubLabel = (typeof TEST_DATA_CATALOG.clubs)[number];
type NationalTeamLabel = (typeof TEST_DATA_CATALOG.nationalTeams)[number];

export type FixtureSide =
  | { kind: "club"; label: ClubLabel }
  | { kind: "national_team"; label: NationalTeamLabel };

export type FixtureJersey = {
  id: string;
  ownerId: string;
  side: FixtureSide;
  type: KitType;
  size: JerseySize;
  condition: JerseyCondition;
  private: boolean;
  biddingEnabled: boolean;
  /** Shirt colour of the generated photos. */
  colour: string;
  photos: Array<{ id: string; role: PhotoRole }>;
};

const jerseyId = (n: number) => `e2e00000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
const photoId = (jersey: number, n: number) =>
  `e2e00000-0000-4000-8000-00000002${String(jersey).padStart(2, "0")}${String(n).padStart(2, "0")}`;

export const TEST_JERSEYS: FixtureJersey[] = [
  {
    id: jerseyId(1),
    ownerId: TEST_COLLECTOR_ID,
    side: { kind: "club", label: "FC København" },
    type: "home",
    size: "m",
    condition: "used",
    private: false,
    biddingEnabled: false,
    colour: "#f4f4f4",
    photos: [
      { id: photoId(1, 1), role: "front" },
      { id: photoId(1, 2), role: "back" },
    ],
  },
  {
    id: jerseyId(2),
    ownerId: TEST_COLLECTOR_ID,
    side: { kind: "club", label: "Brøndby IF" },
    type: "away",
    size: "l",
    condition: "worn",
    private: false,
    biddingEnabled: false,
    colour: "#f2c400",
    photos: [{ id: photoId(2, 1), role: "front" }],
  },
  {
    id: jerseyId(3),
    ownerId: TEST_COLLECTOR_ID,
    side: { kind: "national_team", label: "Danmark" },
    type: "home",
    size: "l",
    condition: "new",
    private: false,
    biddingEnabled: false,
    colour: "#c8102e",
    photos: [
      { id: photoId(3, 1), role: "front" },
      { id: photoId(3, 2), role: "back" },
    ],
  },
  {
    id: jerseyId(4),
    ownerId: TEST_COLLECTOR_ID,
    side: { kind: "club", label: "AGF" },
    type: "third",
    size: "s",
    condition: "used",
    private: true,
    biddingEnabled: false,
    colour: "#1d2a57",
    photos: [{ id: photoId(4, 1), role: "front" }],
  },
  {
    id: jerseyId(5),
    ownerId: TEST_PEER_ID,
    side: { kind: "club", label: "OB" },
    type: "home",
    size: "xl",
    condition: "used",
    private: false,
    biddingEnabled: true,
    colour: "#2f5fb3",
    photos: [
      { id: photoId(5, 1), role: "front" },
      { id: photoId(5, 2), role: "back" },
    ],
  },
];

export const TEST_WISHLIST_ENTRY: { id: string; side: FixtureSide; type: KitType } = {
  id: "e2e00000-0000-4000-8000-000000000301",
  side: { kind: "club", label: "FC Midtjylland" },
  type: "home",
};

export const TEST_SHORTCUT: { id: string; name: string; side: FixtureSide } = {
  id: "e2e00000-0000-4000-8000-000000000401",
  name: "FCK",
  side: { kind: "club", label: "FC København" },
};

/** What Vision suggests to the test Collector, every run. */
export const FIXED_VISION_SUGGESTION: { side: FixtureSide; type: KitType } = {
  side: { kind: "club", label: "AaB" },
  type: "home",
};

/** The Comp Entitlement never lapses during a run. */
export const TEST_COMP_EXPIRES = new Date("2099-01-01T00:00:00.000Z");
