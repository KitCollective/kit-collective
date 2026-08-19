import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveCompetition } from "@kit/seed-shared";
import type {
  ActorCompetitionRecording,
  ActorProfileRecording,
  ActorSquadRecording,
} from "./actor-types.js";

function competitionCode(slug: string): string {
  const def = resolveCompetition(slug);
  if (!def) {
    throw new Error(`Unknown competition: ${slug}`);
  }
  return def.leagueTransfermarktId;
}

export interface ActorRecordingsStore {
  listAvailableSeasons(competition: string): Promise<number[]>;
  loadCompetitionSeason(competition: string, season: number): Promise<ActorCompetitionRecording>;
  loadSquad(clubId: string, season: number): Promise<ActorSquadRecording>;
  loadProfile(playerId: string): Promise<ActorProfileRecording>;
}

export function createActorRecordingsStore(recordingsDir: string): ActorRecordingsStore {
  const competitionsDir = path.join(recordingsDir, "competitions");
  const squadsDir = path.join(recordingsDir, "squads");
  const profilesDir = path.join(recordingsDir, "profiles");

  async function readJson<T>(filePath: string): Promise<T> {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  }

  return {
    async listAvailableSeasons(competition: string): Promise<number[]> {
      const code = competitionCode(competition);
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(competitionsDir);
      const prefix = `${code}-`;
      return files
        .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
        .map((file) => Number.parseInt(file.slice(prefix.length, -".json".length), 10))
        .filter((year) => !Number.isNaN(year));
    },

    async loadCompetitionSeason(competition: string, season: number): Promise<ActorCompetitionRecording> {
      const code = competitionCode(competition);
      const filePath = path.join(competitionsDir, `${code}-${season}.json`);
      return readJson<ActorCompetitionRecording>(filePath);
    },

    async loadSquad(clubId: string, season: number): Promise<ActorSquadRecording> {
      const filePath = path.join(squadsDir, `${clubId}-${season}.json`);
      return readJson<ActorSquadRecording>(filePath);
    },

    async loadProfile(playerId: string): Promise<ActorProfileRecording> {
      const filePath = path.join(profilesDir, `player-${playerId}.json`);
      return readJson<ActorProfileRecording>(filePath);
    },
  };
}
