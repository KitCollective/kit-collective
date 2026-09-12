import type { FkRawKit } from "./types.js";

/** Drop fields we never persist (market value, agent PII, TM branding). */
const FORBIDDEN_KEYS = new Set([
  "marketValue",
  "market_value",
  "agent",
  "agentName",
  "transfermarktLogoUrl",
  "tmLogoUrl",
]);

export function normalizeRawKit(raw: Record<string, unknown>): FkRawKit | null {
  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return null;
    }
  }

  const id = asString(raw.id);
  const clubTransfermarktId = asOptionalString(raw.clubTransfermarktId);
  const nationalTeamFkApiId = asOptionalString(raw.nationalTeamFkApiId);
  const seasonTransfermarktId = asString(raw.seasonTransfermarktId);
  const seasonLabel = asString(raw.seasonLabel);
  const type = asKitType(raw.type);

  if (!id || !seasonTransfermarktId || !seasonLabel || !type) {
    return null;
  }

  const hasClub = Boolean(clubTransfermarktId);
  const hasNationalTeam = Boolean(nationalTeamFkApiId);
  if (hasClub === hasNationalTeam) {
    return null;
  }

  const manufacturerName = asOptionalString(raw.manufacturerName);
  const labelEn = asOptionalString(raw.labelEn);
  const sponsorName = asOptionalString(raw.sponsorName);
  const primaryColorHex = asColorHex(raw.primaryColorHex);
  const secondaryColorHex = asColorHex(raw.secondaryColorHex);
  const design = asOptionalString(raw.design);
  const colorNames = asOptionalString(raw.colorNames);
  const competition = asOptionalString(raw.competition);
  const releasedOn = asOptionalString(raw.releasedOn);
  const description = asOptionalString(raw.description);

  let imageBytes: Uint8Array | undefined;
  if (raw.imageBytes instanceof Uint8Array) {
    imageBytes = raw.imageBytes;
  } else if (Array.isArray(raw.imageBytes)) {
    imageBytes = Uint8Array.from(raw.imageBytes as number[]);
  }

  let additionalImageBytes: Uint8Array[] | undefined;
  if (Array.isArray(raw.additionalImageBytes)) {
    const extras: Uint8Array[] = [];
    for (const item of raw.additionalImageBytes) {
      if (item instanceof Uint8Array && item.length > 0) {
        extras.push(item);
      } else if (Array.isArray(item)) {
        extras.push(Uint8Array.from(item as number[]));
      }
    }
    if (extras.length > 0) {
      additionalImageBytes = extras;
    }
  }

  const kit: FkRawKit = {
    id,
    seasonTransfermarktId,
    seasonLabel,
    type,
  };

  if (manufacturerName) {
    kit.manufacturerName = manufacturerName;
  }
  if (labelEn) {
    kit.labelEn = labelEn;
  }
  if (sponsorName) {
    kit.sponsorName = sponsorName;
  }
  if (primaryColorHex) {
    kit.primaryColorHex = primaryColorHex;
  }
  if (secondaryColorHex) {
    kit.secondaryColorHex = secondaryColorHex;
  }
  if (design) {
    kit.design = design;
  }
  if (colorNames) {
    kit.colorNames = colorNames;
  }
  if (competition) {
    kit.competition = competition;
  }
  if (releasedOn) {
    kit.releasedOn = releasedOn;
  }
  if (description) {
    kit.description = description;
  }
  const variant = asOptionalString(raw.variant);
  if (variant) {
    kit.variant = variant;
  }
  if (imageBytes) {
    kit.imageBytes = imageBytes;
  }
  if (additionalImageBytes) {
    kit.additionalImageBytes = additionalImageBytes;
  }

  if (clubTransfermarktId) {
    kit.clubTransfermarktId = clubTransfermarktId;
  }
  if (nationalTeamFkApiId) {
    kit.nationalTeamFkApiId = nationalTeamFkApiId;
  }

  return kit;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asColorHex(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
    return undefined;
  }
  return normalized.toUpperCase();
}

function asKitType(value: unknown): FkRawKit["type"] | undefined {
  if (
    value === "home" ||
    value === "away" ||
    value === "third" ||
    value === "fourth" ||
    value === "gk" ||
    value === "special"
  ) {
    return value;
  }
  return undefined;
}
