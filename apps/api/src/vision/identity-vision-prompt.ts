import type { KitType } from "@kit/domain";
import { KIT_TYPES } from "@kit/domain";

export type IdentityFieldConfidence = {
  club?: number;
  season?: number;
  kitType?: number;
  player?: number;
  badge?: number;
};

export type IdentityVisionHints = {
  clubHint?: string;
  seasonHint?: string;
  kitType?: KitType;
  playerHint?: string;
  playerNumberHint?: string;
  patchHint?: string;
  manufacturerHint?: string;
  sponsorHint?: string;
  colorHint?: string;
  /** Overall model confidence 0–1. */
  confidence?: number;
  /** Per-field model confidence 0–1. */
  fieldConfidence?: IdentityFieldConfidence;
};

/**
 * Huddle identity discipline: one shirt, home = club colours, never invent pads.
 * KitCollective field names and kit-type enum. Does not ask for embeddings or wizard steps.
 */
export const IDENTITY_VISION_SYSTEM_PROMPT = `You are an expert football kit analyst.

You analyze 1–8 photos of the SAME physical football shirt (front, back, sleeves, collar, wash label) and return ONE consolidated JSON object. Merge every angle. Never treat the photos as different shirts.

Think like Football Kit Archive or Classic Football Shirts. Output JSON only — no markdown, no comments.

CLUB
- Identify the club or national team. Use a commonly known English name ("Rangers FC", "Liverpool FC", "RB Leipzig", "Denmark").
- Use crest, collar tags, and known templates. Do not invent a club with no visual clue.

KIT TYPE (home | away | third | fourth | gk | special)
Decide in this order:
1. gk — fluorescent / keeper-only template, clearly not the outfield set.
2. home — the club's traditional primary colours. White CAN be home (Real Madrid, FC København, Germany, RB Leipzig 2019/20 white home). A white or unusual shirt is NOT automatically away.
   Before choosing away, decide the club's usual home palette. If this shirt matches that palette (including white-home clubs with coloured trim), kitType is home. Only choose away when the shirt clearly contrasts with that home identity.
3. away — a relatively clean, neutral contrast to home (simple white/black/navy/yellow) when home is already a different colour.
4. third / fourth — experimental colour or graphic (teal, purple, neon, marble, camo) that is not a typical away.
5. special — explicit anniversary / commemorative kit (years on the crest as a celebration, "125 years" artwork, one-off).

If unsure between away and third for a loud design, prefer third with lower kitType confidence. If unsure between home and away on a white shirt that matches the club's known home, choose home.
A patterned or tonal-print white shirt in the club's home colours is still home — do not treat a graphic white body as away.
If you still choose away on a predominantly white/light shirt, cap kitType confidence at 0.45 unless you can name the club's actual home as a clearly different colour.

SEASON
Give a single most likely season as "2019/20" (start year / next). Use:
- Manufacturer + chest sponsor together (Hummel+32Red is not Castore; Nike+Standard Chartered years differ).
- Collar, sleeve cut, side panels, and template family.
- Crest commemorative years: a founding year plus an anniversary year (e.g. 1892 and 2017, "125 YEARS") dates the kit to that anniversary season (2017/18), not the year before.
- Wash labels and size tags only as weak supporting evidence — never identify the club from a wash tag alone if other photos show the crest.

Season confidence:
- 0.90–1.0 only with distinctive, corroborating evidence (sponsor+manufacturer+crest years).
- 0.60–0.80 fairly sure.
- 0.20–0.50 a weak but useful guess.
- Omit seasonHint and set season confidence 0 when you have no meaningful basis.
Never report 0.95 on a one-year guess you cannot corroborate.
If two adjacent seasons are plausible and sponsor+manufacturer+template do not lock one year, keep season confidence ≤ 0.50.

PLAYER
- Fill playerHint / playerNumberHint only from a visible back print.
- Blank back → omit both, player confidence 0.

PATCHES / BADGES (critical)
- patchHint is a sleeve or chest PATCH: league, UCL/EL/Conference, charity, captain. Not the crest. Not the manufacturer logo. Not the main chest sponsor.
- Crest artwork ("125 YEARS", founding years) is not a sleeve patch.
- Many replica and fan shirts have NO sleeve patches. If none are visible: badges must be [] and you MUST omit patchHint. Do not invent Premier League, Bundesliga, or any competition pad.
- If badges is [], ignore any patchHint you were tempted to add.

SPONSOR VS BADGE
- Large chest text/logo → sponsorHint only.
- Never copy the sponsor into patchHint.

MANUFACTURER
- Nike, Adidas, Puma, Hummel, Castore, New Balance, etc. Infer from logo or known template with lower confidence if the logo is unclear.

UNCERTAINTY
- Omit a field (or use null) and set that field's confidence to 0 rather than hallucinate.
- Conservative empty is better than a confident wrong season, kit type, or pad.`;

export function identityVisionUserPrompt(photoCount: number): string {
  const photos =
    photoCount === 1 ? "this jersey photo" : `these ${photoCount} jersey photos of the SAME shirt`;

  return `Analyze ${photos}. Merge all angles into one JSON object.

{
  "clubHint": "Rangers FC" | null,
  "seasonHint": "2019/20" | null,
  "kitType": "home"|"away"|"third"|"fourth"|"gk"|"special"|null,
  "playerHint": "Morelos" | null,
  "playerNumberHint": "20" | null,
  "patchHint": "UEFA Champions League" | null,
  "manufacturerHint": "Hummel" | null,
  "sponsorHint": "32Red" | null,
  "colorHint": "white with red trim" | null,
  "badges": [],
  "confidence": {
    "club": 0.0,
    "season": 0.0,
    "kitType": 0.0,
    "player": 0.0,
    "badge": 0.0,
    "overall": 0.0
  }
}

Rules:
- All images are one shirt. Combine crest, back print, sleeves, and labels.
- kitType values are lowercase exactly as above.
- badges: [] if no sleeve/chest patch is visible. Each visible patch: {"position":"right_sleeve"|"left_sleeve"|"front"|"other","category":"competition"|"league"|"partner"|"captain"|"unknown","nameText":"..."}.
- Omit patchHint when badges is []. Do not invent pads.
- confidence values are 0–1 (not 0–100). overall is holistic; season must not copy club's score.
- Omit fields you cannot support. JSON only.`;
}

/** Combined prompt for Gemini generateContent (no system role). */
export function identityVisionPrompt(photoCount: number): string {
  return `${IDENTITY_VISION_SYSTEM_PROMPT}\n\n${identityVisionUserPrompt(photoCount)}`;
}

export type IdentityRefinementCandidate = {
  seasonLabel: string;
  type: string;
  manufacturer: string;
  sponsor: string;
  colorNames?: string | null;
};

/**
 * Second look when manufacturer+sponsor hits N kits. Catalog facts only —
 * never "you guessed the wrong year".
 */
export function identityVisionRefinementUserPrompt(
  candidates: IdentityRefinementCandidate[],
): string {
  const lines = candidates.map((candidate, index) => {
    const colors = candidate.colorNames?.trim() ? `; colours: ${candidate.colorNames}` : "";
    return `${index + 1}. season ${candidate.seasonLabel}, type ${candidate.type}, ${candidate.manufacturer}, sponsor ${candidate.sponsor}${colors}`;
  });

  return `Look at the photos again. These catalog kits already share manufacturer and sponsor. Pick the one shirt that matches what you see.

${lines.join("\n")}

Return JSON only with seasonHint and kitType from that list. Do not invent a season or type that is not listed. Do not copy a catalog year you cannot see on the shirt.

{"seasonHint":"2019/20"|null,"kitType":"home"|"away"|"third"|"fourth"|"gk"|"special"|null,"confidence":{"season":0.0,"kitType":0.0,"overall":0.0}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isKitType(value: unknown): value is KitType {
  if (typeof value !== "string") {
    return false;
  }
  return KIT_TYPES.some((kitType) => kitType === value);
}

function normalizeKitType(value: unknown): KitType | undefined {
  if (isKitType(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const lowered = value.trim().toLowerCase();
  if (lowered === "goalkeeper") {
    return "gk";
  }
  if (lowered === "special edition") {
    return "special";
  }
  if (isKitType(lowered)) {
    return lowered;
  }
  return undefined;
}

function nonemptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const lowered = trimmed.toLowerCase();
  if (lowered === "null" || lowered === "none" || lowered === "n/a" || lowered === "unknown") {
    return undefined;
  }
  return trimmed;
}

/** Accept 0–1 or Huddle-style 0–100. */
export function asUnitConfidence(value: unknown): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return Math.min(1, value / 100);
  }
  return value;
}

function firstBadgeName(badges: unknown): string | undefined {
  if (!Array.isArray(badges)) {
    return undefined;
  }
  for (const entry of badges) {
    if (!isRecord(entry)) {
      continue;
    }
    const name = nonemptyString(entry.nameText) ?? nonemptyString(entry.name);
    if (name) {
      return name;
    }
  }
  return undefined;
}

function decodeFieldConfidence(value: unknown): IdentityFieldConfidence | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const fieldConfidence: IdentityFieldConfidence = {
    club: asUnitConfidence(value.club),
    season: asUnitConfidence(value.season),
    kitType: asUnitConfidence(value.kitType),
    player: asUnitConfidence(value.player),
    badge: asUnitConfidence(value.badge),
  };
  if (
    fieldConfidence.club === undefined &&
    fieldConfidence.season === undefined &&
    fieldConfidence.kitType === undefined &&
    fieldConfidence.player === undefined &&
    fieldConfidence.badge === undefined
  ) {
    return undefined;
  }
  return fieldConfidence;
}

function looksLightShirtBody(color: string): boolean {
  return /\bwhite\b|\bweiss\b|\bweiß\b|\bhvid\b|\bsilver\b|\boff-white\b|\blight\s*gr[ae]y\b/.test(
    color.toLowerCase(),
  );
}

/** Models still call white home shirts away; that must not preselect. */
export function capWhiteAwayKitConfidence(
  hints: IdentityVisionHints,
  colorHint?: string,
): IdentityVisionHints {
  if (hints.kitType !== "away" || !colorHint || !looksLightShirtBody(colorHint)) {
    return hints;
  }

  const kitType = Math.min(hints.fieldConfidence?.kitType ?? 1, 0.45);
  return {
    ...hints,
    fieldConfidence: { ...hints.fieldConfidence, kitType },
  };
}

function decodeOverallConfidence(parsed: Record<string, unknown>): number | undefined {
  if (typeof parsed.confidence === "number") {
    return asUnitConfidence(parsed.confidence);
  }
  if (isRecord(parsed.confidence)) {
    return asUnitConfidence(parsed.confidence.overall);
  }
  return undefined;
}

/**
 * Parse model JSON into catalog hints. Empty badges array wins over a hallucinated patchHint.
 */
export function decodeIdentityVisionHints(text: string | null): IdentityVisionHints | null {
  if (!text) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) {
      return null;
    }

    const badgesEmpty = Array.isArray(parsed.badges) && parsed.badges.length === 0;
    const patchFromBadges = badgesEmpty ? undefined : firstBadgeName(parsed.badges);
    const patchHint = badgesEmpty
      ? undefined
      : (patchFromBadges ?? nonemptyString(parsed.patchHint));

    const hints: IdentityVisionHints = {};
    const clubHint = nonemptyString(parsed.clubHint) ?? nonemptyString(parsed.clubText);
    const seasonHint = nonemptyString(parsed.seasonHint) ?? nonemptyString(parsed.seasonText);
    const kitType = normalizeKitType(parsed.kitType);
    const playerHint = nonemptyString(parsed.playerHint) ?? nonemptyString(parsed.playerNameText);
    const playerNumberHint =
      nonemptyString(parsed.playerNumberHint) ??
      nonemptyString(parsed.playerNumber) ??
      (typeof parsed.playerNumber === "number" ? String(parsed.playerNumber) : undefined);
    const manufacturerHint =
      nonemptyString(parsed.manufacturerHint) ?? nonemptyString(parsed.manufacturerText);
    const sponsorHint = nonemptyString(parsed.sponsorHint) ?? nonemptyString(parsed.sponsorText);
    const colorHint = nonemptyString(parsed.colorHint) ?? nonemptyString(parsed.colorText);
    const confidence = decodeOverallConfidence(parsed);
    const fieldConfidence = decodeFieldConfidence(
      isRecord(parsed.confidence) ? parsed.confidence : parsed.fieldConfidence,
    );

    if (clubHint) hints.clubHint = clubHint;
    if (seasonHint) hints.seasonHint = seasonHint;
    if (kitType) hints.kitType = kitType;
    if (playerHint) hints.playerHint = playerHint;
    if (playerNumberHint) hints.playerNumberHint = playerNumberHint;
    if (patchHint) hints.patchHint = patchHint;
    if (manufacturerHint) hints.manufacturerHint = manufacturerHint;
    if (sponsorHint) hints.sponsorHint = sponsorHint;
    if (colorHint) hints.colorHint = colorHint;
    if (confidence !== undefined) hints.confidence = confidence;
    if (fieldConfidence) hints.fieldConfidence = fieldConfidence;

    if (
      !hints.clubHint &&
      !hints.seasonHint &&
      !hints.kitType &&
      !hints.playerHint &&
      !hints.playerNumberHint &&
      !hints.patchHint &&
      hints.confidence === undefined &&
      !hints.fieldConfidence
    ) {
      return null;
    }

    return capWhiteAwayKitConfidence(hints, colorHint);
  } catch {
    return null;
  }
}
