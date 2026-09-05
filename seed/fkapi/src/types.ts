/** Raw kit payload from the Football Kit Archive fetch adapter. */
export type FkRawKit = {
  id: string;
  /** Club kits join via Transfermarkt club ExternalId. Mutually exclusive with nationalTeamFkApiId. */
  clubTransfermarktId?: string;
  /** NationalTeam kits join via FKA team id → fkapi national_team ExternalId. Never a Club row. */
  nationalTeamFkApiId?: string;
  seasonTransfermarktId: string;
  seasonLabel: string;
  type: KitType;
  manufacturerName?: string;
  labelEn?: string;
  sponsorName?: string;
  primaryColorHex?: string;
  secondaryColorHex?: string;
  imageBytes?: Uint8Array;
};

export type KitType = "home" | "away" | "third" | "gk" | "special";

export type { SeedScope as FkFetchScope } from "@kit/seed-shared";

export type FkFetchAdapter = {
  fetchKits(scope: import("@kit/seed-shared").SeedScope): Promise<FkRawKit[]>;
};

export type ObjectStoreAdapter = {
  putObject(key: string, bytes: Uint8Array): Promise<void>;
  objectExists(key: string): Promise<boolean>;
};

export const EXTERNAL_SYSTEM_FKAPI = "fkapi";
export const EXTERNAL_SYSTEM_TRANSFERMARKT = "transfermarkt";

export type SeedRunResult = {
  kitsUpserted: number;
  photosWritten: number;
};

export function isNationalTeamKit(
  kit: FkRawKit,
): kit is FkRawKit & { nationalTeamFkApiId: string; clubTransfermarktId?: undefined } {
  return Boolean(kit.nationalTeamFkApiId) && !kit.clubTransfermarktId;
}

export function isClubKit(
  kit: FkRawKit,
): kit is FkRawKit & { clubTransfermarktId: string; nationalTeamFkApiId?: undefined } {
  return Boolean(kit.clubTransfermarktId) && !kit.nationalTeamFkApiId;
}
