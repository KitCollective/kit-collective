import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { resolveCompetition } from "@kit/seed-shared";

function competitionCode(slug: string): string {
  const def = resolveCompetition(slug);
  if (!def) {
    throw new Error(`Unknown competition: ${slug}`);
  }
  return def.leagueTransfermarktId;
}

export interface KaderHtmlStore {
  listAvailableSeasons(competition: string): Promise<number[]>;
  loadCompetitionSeason(competition: string, season: number): Promise<string>;
  loadKader(clubId: string, season: number): Promise<string>;
  loadProfile(playerId: string): Promise<string>;
  loadClubFacts(clubId: string): Promise<string | undefined>;
  loadClubHonours(clubId: string): Promise<string | undefined>;
  loadPortrait(playerId: string): Promise<Uint8Array | undefined>;
}

export function createKaderHtmlStore(fixturesDir: string): KaderHtmlStore {
  const competitionsDir = path.join(fixturesDir, "competitions");
  const kaderDir = path.join(fixturesDir, "kader");
  const profilesDir = path.join(fixturesDir, "profiles");
  const factsDir = path.join(fixturesDir, "facts");
  const honoursDir = path.join(fixturesDir, "honours");
  const portraitsDir = path.join(fixturesDir, "portraits");

  async function readOptional(filePath: string): Promise<string | undefined> {
    try {
      return await readFile(filePath, "utf8");
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  return {
    async listAvailableSeasons(competition: string): Promise<number[]> {
      const code = competitionCode(competition);
      const files = await readdir(competitionsDir);
      const prefix = `${code}-`;
      return files
        .filter((file) => file.startsWith(prefix) && file.endsWith(".html"))
        .map((file) => Number.parseInt(file.slice(prefix.length, -".html".length), 10))
        .filter((year) => !Number.isNaN(year));
    },

    async loadCompetitionSeason(competition: string, season: number): Promise<string> {
      const code = competitionCode(competition);
      const filePath = path.join(competitionsDir, `${code}-${season}.html`);
      return readFile(filePath, "utf8");
    },

    async loadKader(clubId: string, season: number): Promise<string> {
      const filePath = path.join(kaderDir, `${clubId}-${season}.html`);
      return readFile(filePath, "utf8");
    },

    async loadProfile(playerId: string): Promise<string> {
      const filePath = path.join(profilesDir, `player-${playerId}.html`);
      return readFile(filePath, "utf8");
    },

    async loadClubFacts(clubId: string): Promise<string | undefined> {
      return readOptional(path.join(factsDir, `${clubId}.html`));
    },

    async loadClubHonours(clubId: string): Promise<string | undefined> {
      return readOptional(path.join(honoursDir, `${clubId}.html`));
    },

    async loadPortrait(playerId: string): Promise<Uint8Array | undefined> {
      const filePath = path.join(portraitsDir, `${playerId}.bin`);
      try {
        const buffer = await readFile(filePath);
        return new Uint8Array(buffer);
      } catch (error: unknown) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          return undefined;
        }
        throw error;
      }
    },
  };
}
