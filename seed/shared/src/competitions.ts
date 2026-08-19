export type CompetitionDefinition = {
  /** Transfermarkt league id used for season external ids in Apify seed. */
  leagueTransfermarktId: string;
  /** Label of the first season ("0001" resolves to this). */
  firstSeasonLabel: string;
};

const COMPETITIONS: Record<string, CompetitionDefinition> = {
  superliga: {
    leagueTransfermarktId: "DK1",
    firstSeasonLabel: "1991/92",
  },
  superligaen: {
    leagueTransfermarktId: "DK1",
    firstSeasonLabel: "1991/92",
  },
  dk1: {
    leagueTransfermarktId: "DK1",
    firstSeasonLabel: "1991/92",
  },
  championship: {
    leagueTransfermarktId: "GB2",
    firstSeasonLabel: "2004/05",
  },
};

export function resolveCompetition(name: string): CompetitionDefinition | undefined {
  const key = name.trim().toLowerCase();
  return COMPETITIONS[key];
}
