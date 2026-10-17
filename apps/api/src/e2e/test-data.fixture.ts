import type { JerseyCondition, JerseySize, KitType, PhotoRole } from "@kit/domain";

/**
 * Device-flow test data (KIT-267). Every row the command writes has a fixed id,
 * so a re-run lands on the same rows and Maestro screenshots stay comparable.
 */
export const TEST_COLLECTOR_ID = "e2e00000-0000-4000-8000-000000000001";
export const TEST_PEER_ID = "e2e00000-0000-4000-8000-000000000002";
/** The second bidder (KIT-287). Never signs in: a Bud on a jersey needs a second Collector. */
export const TEST_SECOND_PEER_ID = "e2e00000-0000-4000-8000-000000000003";

export const TEST_COLLECTOR_HANDLE = "e2e_collector";
export const TEST_PEER_HANDLE = "e2e_peer";
export const TEST_SECOND_PEER_HANDLE = "freja_e2e";
export const TEST_SECOND_PEER_EMAIL = "e2e-second-peer@test.kitcollective";

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

/**
 * One Bud the test peer left on the Test Collector's FC København jersey and the Collector has
 * not answered (KIT-286): Samling shows "1 bud" on that tile and the Med bud view has a result.
 */
export const TEST_UNANSWERED_BID = {
  conversationId: "e2e00000-0000-4000-8000-000000000501",
  messageId: "e2e00000-0000-4000-8000-000000000502",
  jerseyId: TEST_JERSEYS[0]!.id,
  bidderId: TEST_PEER_ID,
  ownerId: TEST_COLLECTOR_ID,
  amountDkk: 250,
};

/**
 * Two different bidders each hold a pending Bud on the Test Collector's Brøndby IF jersey
 * (KIT-287): the own jersey detail's bid row has several bidders there, so it opens Indbakke
 * filtered to the jersey. FC København keeps its one bidder. The second bidder's Bud is the
 * newer one, so the bidder initials read F then E.
 */
export const TEST_TWO_BIDDER_BIDS = [
  {
    // In the existing Conversation of the Test Collector and the test peer.
    conversationId: TEST_UNANSWERED_BID.conversationId,
    messageId: "e2e00000-0000-4000-8000-000000000503",
    jerseyId: TEST_JERSEYS[1]!.id,
    bidderId: TEST_PEER_ID,
    ownerId: TEST_COLLECTOR_ID,
    amountDkk: 300,
    minutesAgo: 120,
  },
  {
    conversationId: "e2e00000-0000-4000-8000-000000000504",
    messageId: "e2e00000-0000-4000-8000-000000000505",
    jerseyId: TEST_JERSEYS[1]!.id,
    bidderId: TEST_SECOND_PEER_ID,
    ownerId: TEST_COLLECTOR_ID,
    amountDkk: 350,
    minutesAgo: 60,
  },
];

/** What Vision suggests to the test Collector, every run. */
export const FIXED_VISION_SUGGESTION: { side: FixtureSide; type: KitType } = {
  side: { kind: "club", label: "AaB" },
  type: "home",
};

/** The fixed Vision answers the device flows can pick between, by the reset call (KIT-284). */
export const VISION_CASES = ["resolved", "low-confidence", "mixed-grouping", "failure"] as const;
export type VisionCase = (typeof VISION_CASES)[number];

export const DEFAULT_VISION_CASE: VisionCase = "resolved";

/**
 * What each case answers. `identityConfidence` is every identity confidence; `groupConfidences`
 * are handed to the photo groups in order, and wrap round when there are more groups than entries.
 * 60 sits in the suggest band (50-69) and 30 below it; 90 preselects. `failure` has no answer: the
 * adapter rejects, so the job fails at once.
 */
export const FIXED_VISION_CASES: Record<
  VisionCase,
  { identityConfidence: number; groupConfidences: number[] } | "fails"
> = {
  resolved: { identityConfidence: 90, groupConfidences: [90] },
  "low-confidence": { identityConfidence: 60, groupConfidences: [90] },
  "mixed-grouping": { identityConfidence: 90, groupConfidences: [90, 60, 30] },
  failure: "fails",
};

/** The Comp Entitlement never lapses during a run. */
export const TEST_COMP_EXPIRES = new Date("2099-01-01T00:00:00.000Z");
