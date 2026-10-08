import type { SeedScope } from "@kit/seed-shared";

export type ParseFkListingKitsQueryResult =
  | { ok: true; scope: SeedScope }
  | { ok: false; error: string };

function required(value: string | null, label: string): string | { error: string } {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return { error: `${label} is required` };
  }
  return trimmed;
}

/** Parse Join `GET /kits` query into a SeedScope. Missing identity fails closed. */
export function parseFkListingKitsQuery(search: URLSearchParams): ParseFkListingKitsQueryResult {
  const clubTransfermarktId = search.get("clubTransfermarktId")?.trim() ?? "";
  const nationalTeamFkApiId = search.get("nationalTeamFkApiId")?.trim() ?? "";
  const competition = search.get("competition")?.trim() ?? "";
  const season = search.get("season")?.trim() ?? "";
  const from = search.get("from")?.trim() ?? "";
  const to = search.get("to")?.trim() ?? "";

  if (clubTransfermarktId) {
    const seasonValue = required(season, "season");
    if (typeof seasonValue !== "string") {
      return { ok: false, error: seasonValue.error };
    }
    return {
      ok: true,
      scope: {
        kind: "club",
        competition: competition || "superligaen",
        clubExternalId: clubTransfermarktId,
        season: seasonValue,
      },
    };
  }

  if (nationalTeamFkApiId) {
    const seasonValue = required(season, "season");
    if (typeof seasonValue !== "string") {
      return { ok: false, error: seasonValue.error };
    }
    return {
      ok: true,
      scope: {
        kind: "national_team",
        nationalTeamRef: nationalTeamFkApiId,
        season: seasonValue,
      },
    };
  }

  if (competition || from || to) {
    const competitionValue = required(competition, "competition");
    const fromValue = required(from, "from");
    const toValue = required(to, "to");
    if (typeof competitionValue !== "string") {
      return { ok: false, error: competitionValue.error };
    }
    if (typeof fromValue !== "string") {
      return { ok: false, error: fromValue.error };
    }
    if (typeof toValue !== "string") {
      return { ok: false, error: toValue.error };
    }
    return {
      ok: true,
      scope: {
        kind: "competition",
        competition: competitionValue,
        fromSeason: fromValue,
        toSeason: toValue,
      },
    };
  }

  return {
    ok: false,
    error:
      "kits query requires clubTransfermarktId+season, nationalTeamFkApiId+season, or competition+from+to",
  };
}
