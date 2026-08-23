import {
  type CompetitionHit,
  iso3166ForCountryName,
} from "@kit/seed-shared";
import * as cheerio from "cheerio";

export function competitionSearchUrl(query: string): string {
  const encoded = encodeURIComponent(query.trim());
  return `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encoded}`;
}

function countryFromAnchor(anchor: ReturnType<cheerio.CheerioAPI>): string | undefined {
  const row = anchor.closest("tr");
  const scoped = row.length > 0 ? row : anchor;
  const imgTitle = scoped.find("img[title]").first().attr("title")?.trim();
  if (imgTitle) {
    return imgTitle;
  }
  const imgAlt = scoped.find("img[alt]").first().attr("alt")?.trim();
  if (imgAlt) {
    return imgAlt;
  }

  const lastCell = scoped.find("td").last().text().trim();
  return lastCell || undefined;
}

export function parseCompetitionSearchHtml(html: string): CompetitionHit[] {
  const $ = cheerio.load(html);
  const hits: CompetitionHit[] = [];
  const seen = new Set<string>();

  $('a[href*="/wettbewerb/"]').each((_, anchor) => {
    const href = $(anchor).attr("href");
    const name = $(anchor).text().trim() || $(anchor).attr("title")?.trim();
    if (!href || !name) {
      return;
    }

    const match = /\/([^/?#]+)\/startseite\/wettbewerb\/([A-Z0-9]+)/i.exec(href);
    if (!match) {
      return;
    }

    const slug = match[1]!;
    const tmCode = match[2]!.toUpperCase();
    if (seen.has(tmCode)) {
      return;
    }
    seen.add(tmCode);

    const countryName = countryFromAnchor($(anchor)) ?? "";
    hits.push({
      name,
      slug,
      tmCode,
      countryName,
      iso3166: countryName ? iso3166ForCountryName(countryName) : undefined,
    });
  });

  return hits;
}
