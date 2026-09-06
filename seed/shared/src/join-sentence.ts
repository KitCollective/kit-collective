import { resolveSeedLane, type ResolvedSeedLane } from "./lane.js";
import { resolveNationalTeam } from "./national-teams.js";
import type { JoinClubScope, JoinNationalTeamScope, JoinScope } from "./join-scope.js";

export type ParseJoinSentenceResult =
  | { ok: true; scope: JoinScope }
  | { ok: false; error: string };

const CLUB_SEASON_PATTERN = /\b20?10\s*\/\s*11\b|\b2010-11\b/i;
const NT_SEASON_PATTERN = /\bworld\s*cup\s*20?10\b|\bwc\s*20?10\b|\b20?10\b/i;

function extractLane(sentence: string): ResolvedSeedLane | { ok: false; error: string } {
  const folded = sentence.toLowerCase();
  if (/\bproduction\b/.test(folded)) {
    return { ok: false, error: "Production lane is rejected for Seed runs" };
  }
  if (/\bstaging\b/.test(folded)) {
    const laneResult = resolveSeedLane("staging");
    if (!laneResult.ok) {
      return { ok: false, error: laneResult.error };
    }
    return laneResult.lane;
  }
  return "development";
}

function parseClubSentence(sentence: string, lane: ResolvedSeedLane): ParseJoinSentenceResult {
  const folded = sentence.toLowerCase();
  const mentionsSuperliga = /\bsuperliga(?:en)?\b/.test(folded);
  if (!mentionsSuperliga) {
    return { ok: false, error: "Club Join sentence must name Superliga" };
  }
  if (!CLUB_SEASON_PATTERN.test(sentence)) {
    return { ok: false, error: "Club Join sentence must name season 2010/11" };
  }
  if (!/\bclub|squad|kader|kits?\b/i.test(sentence)) {
    return {
      ok: false,
      error: "Club Join sentence must mention clubs, squads, and kits",
    };
  }

  const scope: JoinClubScope = {
    path: "club",
    competition: "superliga",
    season: "2010/11",
    lane,
  };
  return { ok: true, scope };
}

function parseNationalTeamSentence(
  sentence: string,
  lane: ResolvedSeedLane,
): ParseJoinSentenceResult {
  const folded = sentence.toLowerCase();
  const mentionsDenmark = /\bdenmark\b|\bdanmark\b/.test(folded);
  const mentionsMen = /\bmen\b|\bherre\b/.test(folded);
  const mentionsWorldCup = /\bworld\s*cup\b|\bvm\b/.test(folded);

  if (!mentionsDenmark || !mentionsMen) {
    return { ok: false, error: "NationalTeam Join sentence must name Denmark men" };
  }
  if (!mentionsWorldCup) {
    return { ok: false, error: "NationalTeam Join sentence must name World Cup 2010" };
  }
  if (!NT_SEASON_PATTERN.test(sentence)) {
    return { ok: false, error: "NationalTeam Join sentence must name season 2010" };
  }

  const def = resolveNationalTeam("3436");
  if (!def) {
    return { ok: false, error: "Denmark men national team is not configured" };
  }

  const scope: JoinNationalTeamScope = {
    path: "national_team",
    nationalTeamRef: def.transfermarktId,
    season: "2010",
    lane,
  };
  return { ok: true, scope };
}

/**
 * Parse a one-sentence Seed run (ADR-0014) into a Join workflow scope.
 * Proof seasons: Superliga 2010/11 and Denmark men World Cup 2010.
 */
export function parseJoinSentence(sentence: string): ParseJoinSentenceResult {
  const trimmed = sentence.trim();
  if (!trimmed) {
    return { ok: false, error: "Join sentence is required" };
  }

  const laneParsed = extractLane(trimmed);
  if (typeof laneParsed !== "string") {
    return laneParsed;
  }
  const lane = laneParsed;

  const folded = trimmed.toLowerCase();
  const isNationalTeam =
    (/\bdenmark\b|\bdanmark\b/.test(folded) && /\bworld\s*cup\b|\bvm\b/.test(folded)) ||
    /\bnational[\s-]?team\b/.test(folded);

  if (isNationalTeam) {
    return parseNationalTeamSentence(trimmed, lane);
  }

  return parseClubSentence(trimmed, lane);
}

export function formatJoinSentenceUsage(command: string): string {
  return [
    `Usage (Join sentence): ${command} join sentence "<natural language>"`,
    `Usage (Club path):     ${command} join club <competition> <season> [lane]`,
    `Usage (NT path):       ${command} join national-team <ntRef> <season> [lane]`,
    "",
    "  Lane defaults to development; staging only when named. Production is rejected.",
    "",
    "  Example sentence:",
    '    Seed Superliga 2010/11 including every club, squads, and kits into development.',
    '    Seed Denmark men World Cup 2010 including squad and kits into development.',
  ].join("\n");
}
