import * as cheerio from "cheerio";
import type { ActorPlayerProfile, ActorSeasonClubRow, ActorSquadRow } from "./actor-types.js";

export interface KaderParseWarning {
  kind: "missing_jersey_number";
  playerId?: string;
  playerName: string;
  clubId: string;
}

export function parseCompetitionSeasonHtml(html: string): ActorSeasonClubRow[] {
  const $ = cheerio.load(html);
  const clubs: ActorSeasonClubRow[] = [];
  const seen = new Set<string>();

  $("table.items tbody tr").each((_, row) => {
    const link = $(row).find('a[href*="/verein/"]').first();
    const href = link.attr("href");
    if (!href) {
      return;
    }

    const match = /\/verein\/(\d+)/.exec(href);
    if (!match) {
      return;
    }

    const clubId = match[1]!;
    if (seen.has(clubId)) {
      return;
    }
    seen.add(clubId);

    const clubName = link.text().trim() || link.attr("title")?.trim();
    if (!clubName) {
      return;
    }

    clubs.push({ clubId, clubName, clubUrl: href });
  });

  return clubs;
}

function parseJerseyNumber(raw: string | undefined): number | null | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-" || trimmed === "–") {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseKaderHtml(
  html: string,
  clubId: string,
  clubName?: string,
  season?: number,
): { squadRows: ActorSquadRow[]; warnings: KaderParseWarning[] } {
  const $ = cheerio.load(html);
  const squadRows: ActorSquadRow[] = [];
  const warnings: KaderParseWarning[] = [];

  $("table.items tbody tr").each((_, row) => {
    const playerLink = $(row).find('a[href*="/spieler/"]').first();
    const href = playerLink.attr("href");
    const playerName = playerLink.text().trim() || playerLink.attr("title")?.trim();
    if (!playerName) {
      return;
    }

    const playerMatch = href ? /\/spieler\/(\d+)/.exec(href) : null;
    const playerId = playerMatch?.[1];

    const numberCell =
      $(row).find(".rn_nummer").first().text() ||
      $(row).find(".rueckennummer").first().text() ||
      $(row).find("td.zentriert").first().text();
    const shirtNumber = parseJerseyNumber(numberCell);

    if (playerId && (shirtNumber === null || shirtNumber === undefined)) {
      warnings.push({
        kind: "missing_jersey_number",
        playerId,
        playerName,
        clubId,
      });
    }

    squadRows.push({
      playerId,
      playerName,
      shirtNumber,
      clubId,
      clubName,
      season,
    });
  });

  return { squadRows, warnings };
}

export function parsePlayerProfileHtml(html: string, playerId: string): ActorPlayerProfile {
  const $ = cheerio.load(html);
  const playerName =
    $("h1.data-header__headline-wrapper").text().trim() || $("h1").first().text().trim();

  if (!playerName) {
    throw new Error(`Invalid player profile for ${playerId}`);
  }

  const shirtRaw =
    $(".data-header__shirt-number").first().text() ||
    $('span:contains("Shirt number")').parent().find("span").last().text();
  const shirtMatch = /#?\s*(\d+)/.exec(shirtRaw);
  const shirtNumber = shirtMatch ? Number.parseInt(shirtMatch[1]!, 10) : null;

  return {
    playerId,
    playerName,
    shirtNumber,
  };
}
