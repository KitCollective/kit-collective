/** Occasion kits nest under the type-default when one exists. No cup-name enum. */

export type KitNestIdentity = {
  kitType: string;
  variant?: string | null;
};

export function isOccasionNestedUnderTypeDefault(
  kit: KitNestIdentity,
  siblings: KitNestIdentity[],
): boolean {
  if (!kit.variant) {
    return false;
  }
  return siblings.some((other) => other.kitType === kit.kitType && !other.variant);
}

export function catalogLabelKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function matchCompetitionLinks(
  raw: string | undefined,
  extraLookup: string[],
  leagues: { id: string; text: string }[],
): { label: string; href?: string }[] {
  const byKey = new Map<string, { id: string; text: string }>();
  for (const row of leagues) {
    const key = catalogLabelKey(row.text);
    if (key && !byKey.has(key)) {
      byKey.set(key, row);
    }
  }
  const parts = raw
    ? raw
        .split(/[/·|,]+/)
        .map((part) => part.trim())
        .filter(Boolean)
    : [];
  const displayTokens =
    parts.length > 1 ? parts : raw?.trim() ? [raw.trim()] : [];
  const seen = new Set<string>();
  const links: { label: string; href?: string }[] = [];
  for (const token of displayTokens) {
    const key = catalogLabelKey(token);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const hit = byKey.get(key);
    links.push(hit ? { label: token, href: `/stamdata/leagues/${hit.id}` } : { label: token });
  }
  for (const token of extraLookup) {
    const key = catalogLabelKey(token);
    if (!key || seen.has(key)) {
      continue;
    }
    const hit = byKey.get(key);
    if (!hit) {
      continue;
    }
    seen.add(key);
    links.push({ label: hit.text, href: `/stamdata/leagues/${hit.id}` });
  }
  return links;
}

export function competitionTokens(raw: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const part of [raw, ...raw.split(/[/·|,]+/)]) {
    const token = part.trim();
    if (!token) {
      continue;
    }
    const key = token.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tokens.push(token);
  }
  return tokens;
}
