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
  const clubTransfermarktId = asString(raw.clubTransfermarktId);
  const seasonTransfermarktId = asString(raw.seasonTransfermarktId);
  const seasonLabel = asString(raw.seasonLabel);
  const type = asKitType(raw.type);

  if (!id || !clubTransfermarktId || !seasonTransfermarktId || !seasonLabel || !type) {
    return null;
  }

  const manufacturerName = asOptionalString(raw.manufacturerName);
  const labelEn = asOptionalString(raw.labelEn);
  const sponsorName = asOptionalString(raw.sponsorName);
  const primaryColorHex = asColorHex(raw.primaryColorHex);
  const secondaryColorHex = asColorHex(raw.secondaryColorHex);

  let imageBytes: Uint8Array | undefined;
  if (raw.imageBytes instanceof Uint8Array) {
    imageBytes = raw.imageBytes;
  } else if (Array.isArray(raw.imageBytes)) {
    // SAFETY: Uint8Array.from coerces each element, so a non-numeric entry becomes NaN
    // rather than corrupting the byte contract.
    imageBytes = Uint8Array.from(raw.imageBytes as number[]);
  }

  return {
    id,
    clubTransfermarktId,
    seasonTransfermarktId,
    seasonLabel,
    type,
    manufacturerName,
    labelEn,
    sponsorName,
    primaryColorHex,
    secondaryColorHex,
    imageBytes,
  };
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
    value === "gk" ||
    value === "special"
  ) {
    return value;
  }
  return undefined;
}
