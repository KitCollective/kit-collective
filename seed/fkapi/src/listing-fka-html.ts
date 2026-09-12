import { classifyFkaKitRemainder, fkaTypeLabelRemainder, isFkaKitDetailPath } from "./listing-fka-slugs.js";
import type { KitType } from "./types.js";

export type ParsedFkaKitPage = {
  type: KitType;
  variant?: string;
  manufacturerName?: string;
  sponsorName?: string;
  design?: string;
  colorNames?: string;
  primaryColorHex?: string;
  secondaryColorHex?: string;
  competition?: string;
  releasedOn?: string;
  description?: string;
  imageUrl?: string;
  extraImageUrls: string[];
  canonicalUrl?: string;
};

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

const COLOR_HEX: Record<string, string> = {
  white: "FFFFFF",
  black: "000000",
  red: "FF0000",
  blue: "0000FF",
  navy: "001F5B",
  green: "008000",
  yellow: "FFD700",
  orange: "FF8C00",
  purple: "6A0DAD",
  pink: "FF69B4",
  gold: "C5A572",
  silver: "C0C0C0",
  grey: "808080",
  gray: "808080",
  maroon: "800000",
  burgundy: "800020",
  teal: "008080",
};

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function factTable(html: string): Map<string, string> {
  const rows = new Map<string, string>();
  const rowRe = /<tr>\s*<td>([^<]+)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  for (const match of html.matchAll(rowRe)) {
    const key = match[1]?.trim().toLowerCase();
    const value = stripTags(match[2] ?? "");
    if (key && value && key !== "rating") {
      rows.set(key, value);
    }
  }
  return rows;
}

function canonicalUrl(html: string): string | undefined {
  const match = html.match(/rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  if (match?.[1]) {
    return match[1];
  }
  const reverse = html.match(/href=["']([^"']+)["']\s+rel=["']canonical["']/i);
  return reverse?.[1];
}

function ogImageUrl(html: string): string | undefined {
  const match = html.match(
    /content=["'](https:\/\/cdn\.footballkitarchive\.com\/[^"']+\.(?:jpg|jpeg|png|webp))["'][^>]*property=["'](?:og:image|twitter:image)["']/i,
  );
  if (match?.[1]) {
    return match[1];
  }
  const reverse = html.match(
    /property=["'](?:og:image|twitter:image)["'][^>]*content=["'](https:\/\/cdn\.footballkitarchive\.com\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i,
  );
  return reverse?.[1];
}

function topImageUrl(html: string): string | undefined {
  const match = html.match(
    /class=["'][^"']*top-image[^"']*["'][^>]*data-src=["'](https:\/\/cdn\.footballkitarchive\.com\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i,
  );
  if (match?.[1]) {
    return match[1];
  }
  const reverse = html.match(
    /data-src=["'](https:\/\/cdn\.footballkitarchive\.com\/[^"']+\.(?:jpg|jpeg|png|webp))["'][^>]*class=["'][^"']*top-image[^"']*["']/i,
  );
  return reverse?.[1];
}

function extraImageUrls(html: string): string[] {
  const start = html.search(/class=["']extra-images-container["']/i);
  if (start < 0) {
    return [];
  }
  const rest = html.slice(start);
  const endMatch = rest.search(/class=["'](?:kit-container|players-wearing-kit-heads)["']/i);
  const source = endMatch >= 0 ? rest.slice(0, endMatch) : rest;
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const match of source.matchAll(/href=["'](https:\/\/cdn\.footballkitarchive\.com\/[^"']+)["']/gi)) {
    const url = match[1];
    if (!url || url.includes("-small.") || seen.has(url)) {
      continue;
    }
    if (!/\.(?:jpg|jpeg|png|webp)$/i.test(url)) {
      continue;
    }
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function primaryImageUrl(html: string): string | undefined {
  return topImageUrl(html) ?? ogImageUrl(html);
}

function uniqueImageList(primary: string | undefined, extras: string[]): {
  imageUrl?: string;
  extraImageUrls: string[];
} {
  const extraImageUrls = extras.filter((url) => url !== primary);
  return { imageUrl: primary, extraImageUrls };
}

export function parseFkaReleaseDate(raw: string): string | undefined {
  const match = raw.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!match) {
    return undefined;
  }
  const month = MONTHS[match[1]?.toLowerCase() ?? ""];
  const day = match[2]?.padStart(2, "0");
  const year = match[3];
  if (!month || !day || !year) {
    return undefined;
  }
  return `${year}-${month}-${day}`;
}

export function hexFromFkaColorNames(colorNames: string): {
  primaryColorHex?: string;
  secondaryColorHex?: string;
} {
  const parts = colorNames
    .split("/")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  const hexes = parts
    .map((name) => COLOR_HEX[name])
    .filter((hex): hex is string => Boolean(hex));
  return {
    primaryColorHex: hexes[0],
    secondaryColorHex: hexes[1],
  };
}

function kitDescription(html: string): string | undefined {
  const block = html.match(/<div class=["']paragraph["']>([\s\S]*?)<\/div>/i);
  if (!block?.[1]) {
    return undefined;
  }
  const visible = block[1].match(/<span class=["']visible["']>([\s\S]*?)<\/span>/i)?.[1] ?? "";
  const hidden = block[1].match(/<span class=["']hidden["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "";
  const text = stripTags(`${visible} ${hidden}`);
  return text.length > 0 ? text : undefined;
}

const BRAND_IN_DESCRIPTION = /\b(nike|adidas|puma|kappa|umbro|hummel|joma|macron|castore|new balance)\b/i;

function enrichFromDescription(
  facts: {
    manufacturerName?: string;
    sponsorName?: string;
    colorNames?: string;
  },
  description: string | undefined,
): typeof facts {
  if (!description) {
    return facts;
  }
  const next = { ...facts };
  if (!next.manufacturerName) {
    const brand = description.match(BRAND_IN_DESCRIPTION)?.[1];
    if (brand) {
      next.manufacturerName = brand[0]?.toUpperCase() + brand.slice(1).toLowerCase();
      if (brand.toLowerCase() === "adidas") {
        next.manufacturerName = "adidas";
      }
    }
  }
  if (!next.sponsorName) {
    const sponsor = description.match(/\bsponsor(?:ed)?(?:\s+by)?\s+([A-Z][A-Za-z0-9&.\- ]{1,40})/i);
    if (sponsor?.[1]) {
      next.sponsorName = sponsor[1].trim().replace(/\s+on the chest.*$/i, "");
    }
  }
  return next;
}

export function mapFkaTypeLabel(raw: string): KitType | undefined {
  return classifyFkaKitRemainder(fkaTypeLabelRemainder(raw))?.type;
}

/** Parse a Football Kit Archive kit page. Logos and ratings are ignored (ADR-0002). */
export function parseFkaKitPageHtml(html: string): ParsedFkaKitPage | undefined {
  const facts = factTable(html);
  const typeLabel = facts.get("type");
  if (!typeLabel) {
    return undefined;
  }
  const classified = classifyFkaKitRemainder(fkaTypeLabelRemainder(typeLabel));
  if (!classified) {
    return undefined;
  }

  const description = kitDescription(html);
  const colorNames = facts.get("colors");
  const hex = colorNames ? hexFromFkaColorNames(colorNames) : {};
  const enriched = enrichFromDescription(
    {
      manufacturerName: facts.get("brand"),
      sponsorName: facts.get("sponsor"),
      colorNames,
    },
    description,
  );
  const images = uniqueImageList(primaryImageUrl(html), extraImageUrls(html));
  const competition = facts.get("league") ?? facts.get("competition");
  const releasedOn = facts.get("release date")
    ? parseFkaReleaseDate(facts.get("release date") ?? "")
    : undefined;

  return {
    type: classified.type,
    ...(classified.variant ? { variant: classified.variant } : {}),
    manufacturerName: enriched.manufacturerName || undefined,
    sponsorName: enriched.sponsorName || undefined,
    design: facts.get("design") || undefined,
    colorNames: enriched.colorNames || undefined,
    primaryColorHex: hex.primaryColorHex,
    secondaryColorHex: hex.secondaryColorHex,
    competition: competition || undefined,
    releasedOn,
    description,
    imageUrl: images.imageUrl,
    extraImageUrls: images.extraImageUrls,
    canonicalUrl: canonicalUrl(html),
  };
}

/** Kit detail URLs from a Football Kit Archive season index (`…-kits/`). */
export function parseFkaSeasonIndexKitUrls(
  html: string,
  slug: string,
  seasonKey: string,
): string[] {
  const needle = `/${slug}-${seasonKey}-`;
  const found = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    let href = match[1] ?? "";
    if (href.startsWith("//")) {
      href = `https:${href}`;
    } else if (href.startsWith("/")) {
      href = `https://www.footballkitarchive.com${href}`;
    }
    let pathname: string;
    try {
      pathname = new URL(href).pathname;
    } catch {
      continue;
    }
    if (!pathname.includes(needle) || !isFkaKitDetailPath(pathname)) {
      continue;
    }
    const normalized = pathname.endsWith("/") ? pathname : `${pathname}/`;
    found.add(`https://www.footballkitarchive.com${normalized}`);
  }
  return [...found];
}
