import type {
  FetchAdapter,
  FetchClubParams,
  FetchClubSeasonParams,
  FetchLeagueParams,
  FetchLeagueSeasonParams,
  FetchNationalTeamParams,
  FetchNationalTeamSeasonParams,
  ListClubSeasonPairsParams,
} from "./adapter.js";

export function createRecordingFetchAdapter(inner: FetchAdapter): {
  adapter: FetchAdapter;
  getFetchCalls: () => FetchClubSeasonParams[];
  getListCalls: () => ListClubSeasonPairsParams[];
  getLeagueCalls: () => FetchLeagueParams[];
  getLeagueSeasonCalls: () => FetchLeagueSeasonParams[];
  getClubCalls: () => FetchClubParams[];
} {
  const fetchCalls: FetchClubSeasonParams[] = [];
  const listCalls: ListClubSeasonPairsParams[] = [];
  const leagueCalls: FetchLeagueParams[] = [];
  const leagueSeasonCalls: FetchLeagueSeasonParams[] = [];
  const clubCalls: FetchClubParams[] = [];

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
      async fetchClub(params) {
        clubCalls.push({ ...params });
        return inner.fetchClub(params);
      },
      async fetchNationalTeam(params: FetchNationalTeamParams) {
        return inner.fetchNationalTeam(params);
      },
      async fetchNationalTeamSeason(params: FetchNationalTeamSeasonParams) {
        return inner.fetchNationalTeamSeason(params);
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
    getClubCalls: () => [...clubCalls],
  };
}

export type RecordingFetchAdapter = ReturnType<typeof createRecordingFetchAdapter>;
