import * as cheerio from "cheerio";
import { parseJerseyNumber } from "./kader-html-parser.js";
import { widenSeasonLabel } from "./season-label.js";

/**
 * One `/rueckennummern/spieler/<id>` row: the number this player wore for one side in
 * one season. Not the profile page's current shirt number.
 *
 * Transfermarkt lists both sides of a mid-season transfer under the same season label, and
 * lists a national side once per number worn in that season, so neither
 * `(season)` nor `(season, side)` is unique — the number is part of the identity.
 */
export interface JerseyNumberParseRow {
  /** Widened to `YYYY/YY`; the page writes `25/26`. */
  seasonLabel: string;
  /** Exactly as the page wrote it, so a label we could not widen stays inspectable. */
  rawSeasonLabel: string;
  /** Transfermarkt `verein` id — a club, a reserve/youth side, or a national side. */
  sideExternalId: string;
  sideName: string;
  side: "club" | "national_team";
  squadNumber: number | null;
}

export type JerseyNumberParseWarning =
  | { kind: "unparsed_season"; playerId: string; rawSeasonLabel: string }
  | { kind: "missing_number"; playerId: string; seasonLabel: string; sideExternalId: string }
  | { kind: "missing_side"; playerId: string; rawSeasonLabel: string };

export interface JerseyNumberParse {
  playerId: string;
  rows: JerseyNumberParseRow[];
  warnings: JerseyNumberParseWarning[];
}

/**
 * Which side kind a row belongs to.
 *
 * The two boxes ("Squad number history" and "… in the national team") carry identical
 * markup and both head the side column "Club", so the headline alone would break on a
 * localised page. The crest is the row-level truth: clubs — reserve and youth sides
 * included — are served from `/wappen/`, national sides from `/flagge/`.
 */
function sideKindFromCrest($crestSrc: string | undefined): "club" | "national_team" | undefined {
  if (!$crestSrc) {
    return undefined;
  }
  if (/\/flagge\//i.test($crestSrc)) {
    return "national_team";
  }
  if (/\/wappen\//i.test($crestSrc)) {
    return "club";
  }
  return undefined;
}

function boxSideKind(headline: string): "club" | "national_team" {
  return /national\s*team|nationalmannschaft/i.test(headline) ? "national_team" : "club";
}

/**
 * Read a player's whole squad-number history.
 *
 * An empty box renders "No entries available" with no `table.items` at all, so a player
 * with no history parses to zero rows rather than throwing.
 */
export function parseJerseyNumbersHtml(html: string, playerId: string): JerseyNumberParse {
  const $ = cheerio.load(html);
  const rows: JerseyNumberParseRow[] = [];
  const warnings: JerseyNumberParseWarning[] = [];

  $("div.box").each((_, box) => {
    const $box = $(box);
    const headline = $box.find("h2.content-box-headline").first().text().trim();
    if (!/squad number|r[üu]ckennummer/i.test(headline)) {
      return;
    }
    const fallbackSide = boxSideKind(headline);

    $box.find("table.items > tbody > tr").each((_, row) => {
      const $row = $(row);
      const cells = $row.find("> td");
      if (cells.length < 2) {
        return;
      }

      const rawSeasonLabel = cells.first().text().replace(/\s+/g, " ").trim();
      const $sideLink = $row.find('a[href*="/verein/"]').last();
      const sideExternalId = /\/verein\/(\d+)/.exec($sideLink.attr("href") ?? "")?.[1];
      if (!sideExternalId) {
        warnings.push({ kind: "missing_side", playerId, rawSeasonLabel });
        return;
      }

      const seasonLabel = widenSeasonLabel(rawSeasonLabel);
      if (!seasonLabel) {
        warnings.push({ kind: "unparsed_season", playerId, rawSeasonLabel });
        return;
      }

      const sideName =
        $sideLink.text().replace(/\s+/g, " ").trim() || ($sideLink.attr("title")?.trim() ?? "");
      const squadNumber =
        parseJerseyNumber(cells.last().text().replace(/\s+/g, " ").trim()) ?? null;
      if (squadNumber === null) {
        warnings.push({ kind: "missing_number", playerId, seasonLabel, sideExternalId });
      }

      rows.push({
        seasonLabel,
        rawSeasonLabel,
        sideExternalId,
        sideName,
        side: sideKindFromCrest($row.find("img").first().attr("src")) ?? fallbackSide,
        squadNumber,
      });
    });
  });

  return { playerId, rows, warnings };
}
