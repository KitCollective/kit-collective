import { type CompetitionHit, iso3166ForCountryName } from "@kit/seed-shared";
import * as cheerio from "cheerio";

export function competitionSearchUrl(query: string): string {
  const encoded = encodeURIComponent(query.trim());
  return `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encoded}`;
}

function countryFromAnchor(anchor: ReturnType<cheerio.CheerioAPI>): string | undefined {
  const row = anchor.closest("tr");
  const scoped = row.length > 0 ? row : anchor;
  const flag = scoped.find("img.flaggenrahmen").first();
  const flagTitle = flag.attr("title")?.trim() || flag.attr("alt")?.trim();
  if (flagTitle) {
    return flagTitle;
  }

  const lastCell = scoped.find("td").last().text().trim();
  if (!lastCell || /^\d+$/.test(lastCell)) {
    return undefined;
  }
  return lastCell;
}

export function parseCompetitionSearchHtml(html: string): CompetitionHit[] {
  const $ = cheerio.load(html);
  const hits: CompetitionHit[] = [];
  const seen = new Set<string>();

  $("table.items a[href*='/wettbewerb/']").each((_, anchor) => {
    const href = $(anchor).attr("href");
    const name = $(anchor).attr("title")?.trim() || $(anchor).text().replace(/\s+/g, " ").trim();
    if (!href || !name) {
      return;
    }

    const match = /\/([^/?#]+)\/startseite\/wettbewerb\/([A-Z0-9]+)/i.exec(href);
    if (!match) {
      return;
    }

    const slug = match[1];
    const tmCode = match[2]?.toUpperCase();
    if (!slug || !tmCode || seen.has(tmCode)) {
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
