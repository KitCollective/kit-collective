export { createFixtureFetchAdapter } from "./fetch/fixture-adapter.js";
export { createRecordingFetchAdapter } from "./fetch/recording-adapter.js";
export type {
  ClubSeasonPair,
  FetchAdapter,
  FetchClubSeasonParams,
  ListClubSeasonPairsParams,
} from "./fetch/adapter.js";
export { normalize, stripForbiddenFields } from "./normalize/index.js";
export { mapFacts } from "./map/index.js";
export { parseLane, resolveDatabaseUrl } from "./lane.js";
export { filterSeasons } from "./season-range.js";
export { isClubSeasonAlreadySeeded } from "./seeded.js";
export {
  parseCliArgs,
  runSeed,
  type RunSeedOptions,
  type RunSeedResult,
  type RunSeedSummary,
  type ClubSeasonFailure,
} from "./run.js";
export type {
  Lane,
  MapResult,
  NormalizedFacts,
  RunSeedCliInput,
  TransfermarktRawPayload,
} from "./types.js";
export { TM_SYSTEM } from "./types.js";
