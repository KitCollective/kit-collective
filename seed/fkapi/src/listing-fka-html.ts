import type { KitType } from "./types.js";

export type ParsedFkaKitPage = {
  type: KitType;
  manufacturerName?: string;
  sponsorName?: string;
  imageUrl?: string;
  canonicalUrl?: string;
};

const DROPPED_TYPE_STEMS = [
  "training",
  "anthem",
  "track",
  "rain",
  "bench",
  "warm-up",
  "warmup",
  "pre-season",
  "preseason",
];

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function factTable(html: string): Map<string, string> {
  const rows = new Map<string, string>();
  const rowRe = /<tr>\s*<td>([^<]+)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  for (const match of html.matchAll(rowRe)) {
    const key = match[1]?.trim();
    const value = stripTags(match[2] ?? "");
    if (key && value) {
      rows.set(key.toLowerCase(), value);
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

export function mapFkaTypeLabel(raw: string): KitType | undefined {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (DROPPED_TYPE_STEMS.some((stem) => normalized.includes(stem))) {
    return undefined;
  }
  if (normalized.includes("european") || normalized.includes("champions league")) {
    return undefined;
  }
  if (normalized === "home") {
    return "home";
  }
  if (normalized === "away") {
    return "away";
  }
  if (normalized === "third") {
    return "third";
  }
  if (normalized === "special") {
    return "special";
  }
  if (normalized.startsWith("gk") || normalized.includes("goalkeeper")) {
    return "gk";
  }
  return undefined;
}

/** Parse a Football Kit Archive kit page. Logos and ratings are ignored (ADR-0002). */
export function parseFkaKitPageHtml(html: string): ParsedFkaKitPage | undefined {
  const facts = factTable(html);
  const typeLabel = facts.get("type");
  if (!typeLabel) {
    return undefined;
  }
  const type = mapFkaTypeLabel(typeLabel);
  if (!type) {
    return undefined;
  }

  const manufacturerName = facts.get("brand");
  const sponsorName = facts.get("sponsor");
  const imageUrl = ogImageUrl(html);
  const canonical = canonicalUrl(html);

  return {
    type,
    manufacturerName: manufacturerName || undefined,
    sponsorName: sponsorName || undefined,
    imageUrl,
    canonicalUrl: canonical,
  };
}
