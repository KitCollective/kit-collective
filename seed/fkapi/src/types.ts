/** Raw kit payload from the Football Kit Archive fetch adapter. */
export type FkRawKit = {
  id: string;
  clubTransfermarktId: string;
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
