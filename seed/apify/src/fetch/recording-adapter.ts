import type {
  FetchAdapter,
  FetchClubSeasonParams,
  FetchLeagueParams,
  FetchLeagueSeasonParams,
  ListClubSeasonPairsParams,
} from "./adapter.js";

export function createRecordingFetchAdapter(inner: FetchAdapter): {
  adapter: FetchAdapter;
  getFetchCalls: () => FetchClubSeasonParams[];
  getListCalls: () => ListClubSeasonPairsParams[];
  getLeagueCalls: () => FetchLeagueParams[];
  getLeagueSeasonCalls: () => FetchLeagueSeasonParams[];
} {
  const fetchCalls: FetchClubSeasonParams[] = [];
  const listCalls: ListClubSeasonPairsParams[] = [];
  const leagueCalls: FetchLeagueParams[] = [];
  const leagueSeasonCalls: FetchLeagueSeasonParams[] = [];

  return {
    adapter: {
      async fetchLeague(params) {
        leagueCalls.push({ ...params });
        return inner.fetchLeague(params);
      },
      async fetchLeagueSeason(params) {
        leagueSeasonCalls.push({ ...params });
        return inner.fetchLeagueSeason(params);
      },
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
    getLeagueCalls: () => [...leagueCalls],
    getLeagueSeasonCalls: () => [...leagueSeasonCalls],
  };
}

export type RecordingFetchAdapter = ReturnType<typeof createRecordingFetchAdapter>;
