import type { FetchAdapter, FetchClubSeasonParams, ListClubSeasonPairsParams } from "./adapter.js";

export function createRecordingFetchAdapter(inner: FetchAdapter): {
  adapter: FetchAdapter;
  getFetchCalls: () => FetchClubSeasonParams[];
  getListCalls: () => ListClubSeasonPairsParams[];
} {
  const fetchCalls: FetchClubSeasonParams[] = [];
  const listCalls: ListClubSeasonPairsParams[] = [];

  return {
    adapter: {
      async listClubSeasonPairs(params) {
        listCalls.push({ ...params });
        return inner.listClubSeasonPairs(params);
      },
      async fetchClubSeason(params) {
        fetchCalls.push({ ...params });
        return inner.fetchClubSeason(params);
      },
    },
    getFetchCalls: () => [...fetchCalls],
    getListCalls: () => [...listCalls],
  };
}

export type RecordingFetchAdapter = ReturnType<typeof createRecordingFetchAdapter>;
