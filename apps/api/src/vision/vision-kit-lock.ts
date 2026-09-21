import type { KitType } from "@kit/domain";

/** Catalog-locked season/type — not capped by the model's year guess. */
export const CATALOG_KIT_LOCK_CONFIDENCE = 95;

/** Alias rows score below an official CatalogLabel of the same text. */
const CATALOG_ALIAS_SCORE_CAP = 90;

export type ObservableKitHit = {
  kitId: string;
  clubId: string | null;
  nationalTeamId?: string | null;
  seasonId: string;
  seasonLabel: string;
  type: KitType;
  manufacturer: string;
  sponsor: string;
  colorNames?: string | null;
};

export type ObservableKitLock =
  | { status: "unique"; kit: ObservableKitHit }
  | { status: "ambiguous"; kits: ObservableKitHit[] }
  | { status: "none" };

export type CatalogSideKind = "club" | "national_team";

export type CatalogSideMatch = {
  id: string;
  kind: CatalogSideKind;
  score: number;
};

export type CatalogSideLabel = {
  entityId: string;
  entityType: string;
  text: string | null;
  kind: string;
};

const CLUB_STOP_TOKENS = new Set([
  "fc",
  "afc",
  "cf",
  "sc",
  "bk",
  "if",
  "fk",
  "the",
  "club",
  "football",
]);

/** Country / NT names the VLM uses for national-team shirts (cellar corpus + common sides). */
const NATIONAL_TEAM_HINT_TOKENS = new Set([
  "argentina",
  "armenia",
  "austria",
  "belgium",
  "brazil",
  "brasilien",
  "croatia",
  "kroatien",
  "czech",
  "tjekkiet",
  "denmark",
  "danmark",
  "england",
  "english",
  "france",
  "frankrig",
  "germany",
  "tyskland",
  "greece",
  "graekenland",
  "hungary",
  "ungarn",
  "ireland",
  "irland",
  "italy",
  "italien",
  "japan",
  "netherlands",
  "holland",
  "norway",
  "norge",
  "poland",
  "polen",
  "portugal",
  "romania",
  "rumanien",
  "saudi",
  "scotland",
  "skotland",
  "serbia",
  "serbien",
  "spain",
  "spanien",
  "sweden",
  "sverige",
  "switzerland",
  "schweiz",
  "turkey",
  "tyrkiet",
  "ukraine",
  "usa",
  "america",
]);

export function isLikelyNationalTeamHint(hints: string[]): boolean {
  for (const hint of hints) {
    const tokens = significantCatalogTokens(hint);
    if (tokens.length === 0) {
      continue;
    }
    if (tokens.every((token) => NATIONAL_TEAM_HINT_TOKENS.has(token))) {
      return true;
    }
    const compact = compactCatalogHint(hint);
    if (compact.length >= 3 && NATIONAL_TEAM_HINT_TOKENS.has(compact)) {
      return true;
    }
  }
  return false;
}

const DIACRITIC_FOLD: Record<string, string> = {
  æ: "ae",
  ø: "o",
  å: "a",
  ä: "a",
  ö: "o",
  ü: "u",
  ß: "ss",
};

export function normalizeHint(value: string): string {
  return value.trim().toLowerCase();
}

function foldCatalogHint(value: string): string {
  const stripped = value.normalize("NFD").replace(/\p{M}/gu, "");
  return [...stripped].map((character) => DIACRITIC_FOLD[character] ?? character).join("");
}

export function compactCatalogHint(value: string): string {
  return foldCatalogHint(normalizeHint(value)).replace(/[^a-z0-9]+/g, "");
}

function significantCatalogTokens(value: string): string[] {
  return foldCatalogHint(normalizeHint(value))
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !CLUB_STOP_TOKENS.has(token));
}

/** ILIKE needles for one model hint: original, compact, and token-gap form. */
export function catalogHintSearchNeedles(hint: string): string[] {
  const trimmed = hint.trim();
  if (!trimmed) {
    return [];
  }
  const needles = new Set<string>([trimmed]);
  const compact = compactCatalogHint(trimmed);
  if (compact.length >= 3) {
    needles.add(compact);
  }
  const tokens = significantCatalogTokens(trimmed);
  if (tokens.length >= 2) {
    needles.add(tokens.join("%"));
  }
  for (const token of tokens) {
    if (token.length >= 3) {
      needles.add(token);
    }
  }
  return [...needles];
}

export function scoreLabelMatch(label: string, hint: string): number {
  if (!label.trim() || !hint.trim()) {
    return 0;
  }

  const normalizedLabel = normalizeHint(label);
  const normalizedHint = normalizeHint(hint);
  if (normalizedLabel === normalizedHint) {
    return 95;
  }

  const compactLabel = compactCatalogHint(label);
  const compactHint = compactCatalogHint(hint);
  if (compactLabel.length >= 3 && compactLabel === compactHint) {
    return 95;
  }

  const foldedLabel = foldCatalogHint(normalizedLabel);
  const foldedHint = foldCatalogHint(normalizedHint);
  if (foldedLabel === foldedHint) {
    return 95;
  }
  if (foldedLabel.startsWith(foldedHint) || foldedHint.startsWith(foldedLabel)) {
    return 85;
  }
  if (foldedLabel.includes(foldedHint) || foldedHint.includes(foldedLabel)) {
    return 70;
  }

  return scoreTokenOverlap(label, hint);
}

function scoreTokenOverlap(label: string, hint: string): number {
  const labelTokens = significantCatalogTokens(label);
  const hintTokens = significantCatalogTokens(hint);
  if (hintTokens.length === 0 || labelTokens.length === 0) {
    return 0;
  }
  const labelSet = new Set(labelTokens);
  if (hintTokens.every((token) => labelSet.has(token))) {
    return hintTokens.length === labelTokens.length ? 85 : 70;
  }
  const hintSet = new Set(hintTokens);
  return labelTokens.every((token) => hintSet.has(token)) ? 70 : 0;
}

export function collectClubHints(hints: { clubHint?: string; clubHintAlts?: string[] }): string[] {
  const unique = new Set<string>();
  if (hints.clubHint?.trim()) {
    unique.add(hints.clubHint.trim());
  }
  for (const alt of hints.clubHintAlts ?? []) {
    if (alt.trim()) {
      unique.add(alt.trim());
    }
  }
  return [...unique];
}

function scoreLabelAgainstHints(label: string, hints: string[], isAlias: boolean): number {
  let score = 0;
  for (const hint of hints) {
    score = Math.max(score, scoreLabelMatch(label, hint));
  }
  if (isAlias && score > 0) {
    return Math.min(score, CATALOG_ALIAS_SCORE_CAP);
  }
  return score;
}

export function pickBestCatalogSide(
  rows: CatalogSideLabel[],
  hints: string[],
  validClubIds: Set<string>,
  validNationalTeamIds: Set<string>,
): CatalogSideMatch | null {
  const bestByEntity = new Map<string, CatalogSideMatch>();
  for (const row of rows) {
    const kind = catalogSideKind(row.entityType, row.entityId, validClubIds, validNationalTeamIds);
    if (!kind) {
      continue;
    }
    const score = scoreLabelAgainstHints(row.text ?? "", hints, row.kind === "alias");
    if (score <= 0) {
      continue;
    }
    const previous = bestByEntity.get(row.entityId);
    if (!previous || score > previous.score) {
      bestByEntity.set(row.entityId, { id: row.entityId, kind, score });
    }
  }

  return uniqueTopCatalogSide([...bestByEntity.values()], hints);
}

function catalogSideKind(
  entityType: string,
  entityId: string,
  validClubIds: Set<string>,
  validNationalTeamIds: Set<string>,
): CatalogSideKind | null {
  if (entityType === "club" && validClubIds.has(entityId)) {
    return "club";
  }
  if (entityType === "national_team" && validNationalTeamIds.has(entityId)) {
    return "national_team";
  }
  return null;
}

function uniqueTopCatalogSide(
  matches: CatalogSideMatch[],
  hints: string[] = [],
): CatalogSideMatch | null {
  const ranked = [...matches].sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best) {
    return null;
  }
  const tied = ranked.filter((match) => match.score === best.score);
  if (tied.length === 1) {
    return best;
  }
  if (isLikelyNationalTeamHint(hints)) {
    const nationalTeam = tied.find((match) => match.kind === "national_team");
    if (nationalTeam) {
      return nationalTeam;
    }
  }
  return null;
}

function onlyHit(hits: ObservableKitHit[]): ObservableKitHit | undefined {
  return hits.length === 1 ? hits[0] : undefined;
}

function hitMatchesSide(hit: ObservableKitHit, sideId: string): boolean {
  return hit.clubId === sideId || hit.nationalTeamId === sideId;
}

function dedupeKits(hits: ObservableKitHit[]): ObservableKitHit[] {
  const seen = new Map<string, ObservableKitHit>();
  for (const hit of hits) {
    if (!seen.has(hit.kitId)) {
      seen.set(hit.kitId, hit);
    }
  }
  return [...seen.values()];
}

/**
 * Unique manufacturer+sponsor kit wins, even over a wrong seasonHint.
 * N hits scoped to a Club or NationalTeam still unique → lock that side's kit.
 */
export function resolveObservableKitLock(
  hits: ObservableKitHit[],
  sideId?: string,
): ObservableKitLock {
  const unique = dedupeKits(hits);
  const uniqueKit = onlyHit(unique);
  if (uniqueKit) {
    return { status: "unique", kit: uniqueKit };
  }
  if (unique.length === 0) {
    return { status: "none" };
  }
  if (sideId) {
    const scoped = unique.filter((hit) => hitMatchesSide(hit, sideId));
    const scopedKit = onlyHit(scoped);
    if (scopedKit) {
      return { status: "unique", kit: scopedKit };
    }
    if (scoped.length > 1) {
      return { status: "ambiguous", kits: scoped };
    }
  }
  return { status: "ambiguous", kits: unique };
}

export function pickLockedKit(
  hits: ObservableKitHit[],
  options: {
    amongKitIds?: string[];
    sideId?: string;
    seasonHint?: string;
    kitType?: KitType;
    colorHint?: string;
  },
): ObservableKitHit | null {
  if (options.amongKitIds?.length) {
    return pickRefinedKit(hits, options.amongKitIds, options.seasonHint, options.kitType);
  }
  const lock = resolveObservableKitLock(hits, options.sideId);
  if (lock.status === "unique") {
    return lock.kit;
  }
  if (lock.status === "ambiguous") {
    return pickUniqueKitByObservables(lock.kits, options.kitType, options.colorHint);
  }
  return null;
}

/** Club UUID for Save FK — never a NationalTeam id, never a Club beside an NT kit lock. */
export function catalogClubIdForSave(
  locked: ObservableKitHit | null,
  sideMatch: CatalogSideMatch | null,
): string | undefined {
  if (locked) {
    return locked.clubId ?? undefined;
  }
  return sideMatch?.kind === "club" ? sideMatch.id : undefined;
}

/** NationalTeam UUID for Save FK — never stuffed into clubId. */
export function catalogNationalTeamIdForSave(
  locked: ObservableKitHit | null,
  sideMatch: CatalogSideMatch | null,
): string | undefined {
  if (locked) {
    return locked.nationalTeamId ?? undefined;
  }
  return sideMatch?.kind === "national_team" ? sideMatch.id : undefined;
}

const COLOR_TOKEN =
  /\b(white|weiss|weiß|hvid|black|navy|red|blue|green|yellow|gold|orange|purple|pink|grey|gray|teal|maroon|claret|amber|silver|cream|ivory)\b/g;

export function scoreColorMatch(colorNames: string | null | undefined, colorHint?: string): number {
  if (!colorHint?.trim() || !colorNames?.trim()) {
    return 0;
  }
  const labelScore = scoreLabelMatch(colorNames, colorHint);
  if (labelScore > 0) {
    return labelScore;
  }
  const catalogTokens = new Set(colorNames.toLowerCase().match(COLOR_TOKEN) ?? []);
  const hintTokens = new Set(colorHint.toLowerCase().match(COLOR_TOKEN) ?? []);
  if (catalogTokens.size === 0 || hintTokens.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of hintTokens) {
    if (catalogTokens.has(token)) {
      overlap += 1;
    }
  }
  if (overlap === 0) {
    return 0;
  }
  return overlap === hintTokens.size ? 85 : 70;
}

/**
 * Among N manufacturer+sponsor hits, type and/or colours can lock one kit
 * without a second Vision call.
 */
export function pickUniqueKitByObservables(
  hits: ObservableKitHit[],
  kitType?: KitType,
  colorHint?: string,
): ObservableKitHit | null {
  let scoped = dedupeKits(hits);
  if (kitType) {
    scoped = scoped.filter((hit) => hit.type === kitType);
  }
  const typed = onlyHit(scoped);
  if (typed) {
    return typed;
  }
  if (colorHint?.trim()) {
    const colored = scoped.filter((hit) => scoreColorMatch(hit.colorNames, colorHint) > 0);
    return onlyHit(colored) ?? null;
  }
  return null;
}

/** Second look: pick among catalog candidates by refined season label and type. */
export function pickRefinedKit(
  hits: ObservableKitHit[],
  amongKitIds: string[],
  seasonHint?: string,
  kitType?: KitType,
): ObservableKitHit | null {
  const allowed = new Set(amongKitIds);
  let scoped = dedupeKits(hits).filter((hit) => allowed.has(hit.kitId));
  if (kitType) {
    scoped = scoped.filter((hit) => hit.type === kitType);
  }
  if (seasonHint?.trim()) {
    scoped = scoped.filter((hit) => scoreLabelMatch(hit.seasonLabel, seasonHint) > 0);
  }
  return onlyHit(scoped) ?? null;
}

/**
 * Visual seasonHint maps onto TeamSeason even when no Kit row exists.
 * A squad for the named player may reject an impossible year; two remaining
 * seasons omit rather than keep the wrong hint.
 */
export function reconcileHintSeasonWithSquad(
  hintedSeasonId: string | undefined,
  squadSeasonIds: readonly string[],
): string | undefined {
  if (squadSeasonIds.length === 0) {
    return hintedSeasonId;
  }
  if (hintedSeasonId && squadSeasonIds.includes(hintedSeasonId)) {
    return hintedSeasonId;
  }
  if (squadSeasonIds.length === 1) {
    return squadSeasonIds[0];
  }
  return undefined;
}

/**
 * Club UUID from side match or kit lock, constrained to the player's
 * `player_club_season` career. Empty career keeps the hint (no squad rows yet).
 */
export function reconcileHintClubWithCareer(
  hintedClubId: string | undefined,
  careerClubIds: readonly string[],
): { clubId: string | undefined; conflict: boolean } {
  if (careerClubIds.length === 0) {
    return { clubId: hintedClubId, conflict: false };
  }
  if (!hintedClubId) {
    return { clubId: undefined, conflict: false };
  }
  if (careerClubIds.includes(hintedClubId)) {
    return { clubId: hintedClubId, conflict: false };
  }
  if (careerClubIds.length === 1) {
    return { clubId: careerClubIds[0], conflict: true };
  }
  return { clubId: undefined, conflict: true };
}
