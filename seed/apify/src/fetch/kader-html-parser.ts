import * as cheerio from "cheerio";
import type {
  ActorPlayerProfile,
  ActorSeasonClubRow,
  ActorSquadRow,
  ClubFactsParse,
  HonourParseRow,
} from "./actor-types.js";

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

    const clubId = match[1];
    if (!clubId || seen.has(clubId)) {
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

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const NATIONALITY_ISO: Record<string, string> = {
  denmark: "DK",
  sweden: "SE",
  norway: "NO",
  finland: "FI",
  iceland: "IS",
  germany: "DE",
  "faroe islands": "FO",
};

export function parseEnglishDate(raw: string): string | undefined {
  const trimmed = raw.replace(/\s*\(\d+\)\s*$/, "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    return trimmed;
  }
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (dotted) {
    const [, day, month, year] = dotted;
    if (!day || !month || !year) {
      return undefined;
    }
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const named = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(trimmed);
  if (!named) {
    return undefined;
  }
  const [, monthName, day, year] = named;
  if (!monthName || !day || !year) {
    return undefined;
  }
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) {
    return undefined;
  }
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

export function parseHeightCm(raw: string): number | undefined {
  const match = /(\d)[,.](\d{2})\s*m/i.exec(raw.trim());
  if (!match) {
    return undefined;
  }
  const meters = match[1];
  const centimeters = match[2];
  if (!meters || !centimeters) {
    return undefined;
  }
  return Number.parseInt(meters, 10) * 100 + Number.parseInt(centimeters, 10);
}

export function parsePreferredFoot(raw: string): ActorSquadRow["preferredFoot"] | undefined {
  const value = raw.trim().toLowerCase();
  if (value === "left" || value === "right" || value === "both") {
    return value;
  }
  return undefined;
}

export function parseCapacity(raw: string): number | undefined {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) {
    return undefined;
  }
  const parsed = Number.parseInt(digits, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseJerseyNumber(raw: string | undefined): number | null | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-" || trimmed === "–") {
    return null;
  }

  const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1).trim() : trimmed;
  if (!withoutHash) {
    return null;
  }

  const parsed = Number.parseInt(withoutHash, 10);
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

  $("table.items > tbody > tr").each((_, row) => {
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

    const $row = $(row);
    const inlineRows = $row.find("table.inline-table tr");
    const positionText = inlineRows.eq(1).find("td").first().text().trim();
    const portraitSrc = $row.find("img.bilderrahmen-fixed").first().attr("src")?.trim();

    const flag = $row
      .find("img[title], img[data-iso]")
      .filter((_, img) => {
        const $img = $(img);
        return Boolean($img.attr("data-iso") || $img.attr("title"));
      })
      .first();
    const nationalityName = flag.attr("title")?.trim();
    const nationalityIso =
      flag.attr("data-iso")?.trim().toUpperCase() ||
      (nationalityName ? NATIONALITY_ISO[nationalityName.toLowerCase()] : undefined);

    let dateOfBirth: string | undefined;
    let heightCm: number | undefined;
    let preferredFoot: ActorSquadRow["preferredFoot"] | undefined;

    $row.find("td").each((_, cell) => {
      const text = $(cell).text().replace(/\s+/g, " ").trim();
      if (!dateOfBirth) {
        dateOfBirth = parseEnglishDate(text);
      }
      if (heightCm === undefined) {
        heightCm = parseHeightCm(text);
      }
      if (!preferredFoot) {
        preferredFoot = parsePreferredFoot(text);
      }
    });

    const rowData: ActorSquadRow = {
      playerId,
      playerName,
      shirtNumber,
      clubId,
      clubName,
      season,
    };
    if (positionText && positionText !== playerName) {
      rowData.position = positionText;
    }
    if (dateOfBirth) {
      rowData.dateOfBirth = dateOfBirth;
    }
    if (nationalityIso) {
      rowData.nationalityIso = nationalityIso;
    }
    if (nationalityName) {
      rowData.nationalityName = nationalityName;
    }
    if (heightCm !== undefined) {
      rowData.heightCm = heightCm;
    }
    if (preferredFoot) {
      rowData.preferredFoot = preferredFoot;
    }
    if (portraitSrc) {
      rowData.portraitSrc = portraitSrc;
    }

    squadRows.push(rowData);
  });

  return { squadRows, warnings };
}

function labelKey(raw: string): string {
  return raw
    .replace(/[:\s]+$/g, "")
    .trim()
    .toLowerCase();
}

function hexColorsFrom(htmlFragment: string): string[] {
  const matches = [...htmlFragment.matchAll(/#([0-9a-fA-F]{6})\b/g)];
  const colors: string[] = [];
  for (const match of matches) {
    const hex = match[1];
    if (hex) {
      colors.push(`#${hex.toUpperCase()}`);
    }
  }
  return colors;
}

export function parseClubFactsHtml(html: string): ClubFactsParse {
  const $ = cheerio.load(html);
  const facts: ClubFactsParse = {};

  $("tr").each((_, row) => {
    const $row = $(row);
    const label = labelKey($row.find("th").first().text() || $row.find("td").first().text());
    const valueCell = $row.find("td").last();
    const value = valueCell.text().replace(/\s+/g, " ").trim();
    const isColourRow = label.includes("colour") || label.includes("color");
    if (!label || (!value && !isColourRow)) {
      return;
    }

    if (label.includes("official") && label.includes("name")) {
      facts.officialName = value;
      return;
    }
    if (label === "founded" || label.includes("founded")) {
      const foundedOn = parseEnglishDate(value);
      if (foundedOn) {
        facts.foundedOn = foundedOn;
      }
      return;
    }
    if (label === "stadium" || (label.includes("stadium") && !label.includes("capacity"))) {
      facts.stadiumName = value;
      return;
    }
    if (label.includes("capacity")) {
      facts.stadiumCapacity = parseCapacity(value);
      return;
    }
    if (label.includes("colour") || label.includes("color")) {
      const styleBits = [
        valueCell.attr("style") ?? "",
        ...valueCell
          .find("[style]")
          .toArray()
          .map((el) => $(el).attr("style") ?? ""),
      ].join(" ");
      const colors = hexColorsFrom(styleBits);
      if (colors[0]) {
        facts.primaryColorHex = colors[0];
      }
      if (colors[1]) {
        facts.secondaryColorHex = colors[1];
      }
      return;
    }
    if (label.includes("homepage") || label.includes("website")) {
      const href = valueCell.find("a[href]").first().attr("href")?.trim();
      if (href && !/transfermarkt/i.test(href)) {
        facts.websiteUrl = href;
      } else if (/^https?:\/\//i.test(value)) {
        facts.websiteUrl = value;
      }
    }
  });

  return facts;
}

export function parseHonoursHtml(html: string): HonourParseRow[] {
  const $ = cheerio.load(html);
  const rows: HonourParseRow[] = [];
  const seen = new Set<string>();

  $("table.items tbody tr, table.items tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .toArray()
      .map((cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (cells.length < 1) {
      return;
    }

    const first = cells[0];
    if (!first) {
      return;
    }
    let seasonLabel: string | null = null;
    let title: string;
    if (cells.length === 1) {
      title = first;
    } else if (
      /^\d{2}\/\d{2}$/.test(first) ||
      /^\d{4}$/.test(first) ||
      /^\d{4}\/\d{2}$/.test(first)
    ) {
      seasonLabel = first;
      title = cells.slice(1).join(" ");
    } else {
      title = cells.join(" ");
    }
    if (!title) {
      return;
    }
    const key = `${seasonLabel ?? ""}:${title}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    rows.push({ seasonLabel, title });
  });

  return rows;
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
  const shirtDigits = shirtMatch?.[1];
  const shirtNumber = shirtDigits ? Number.parseInt(shirtDigits, 10) : null;

  return {
    playerId,
    playerName,
    shirtNumber,
  };
}
