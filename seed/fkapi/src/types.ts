import type { KitType } from "@kit/domain";

/** Raw kit payload from the Football Kit Archive fetch adapter. */
export type FkRawKit = {
  id: string;
  clubTransfermarktId: string;
  seasonTransfermarktId: string;
  seasonLabel: string;
  type: KitType;
  manufacturerName?: string;
  labelEn?: string;
  imageBytes?: Uint8Array;
};

export type FkFetchScope = {
  competition: string;
  fromSeason: string;
  toSeason: string;
};

export type FkFetchAdapter = {
  fetchKits(scope: FkFetchScope): Promise<FkRawKit[]>;
};

export type ObjectStoreAdapter = {
  putObject(key: string, bytes: Uint8Array): Promise<void>;
};

export const EXTERNAL_SYSTEM_FKAPI = "fkapi";
export const EXTERNAL_SYSTEM_TRANSFERMARKT = "transfermarkt";

export type SeedLane = "development" | "staging";

export type CliArgs = {
  competition: string;
  fromSeason: string;
  toSeason: string;
  lane: SeedLane;
};

export type SeedRunOptions = {
  databaseUrl: string;
  fetchAdapter: FkFetchAdapter;
  objectStore: ObjectStoreAdapter;
};

export type SeedRunResult = {
  kitsUpserted: number;
  photosWritten: number;
};
