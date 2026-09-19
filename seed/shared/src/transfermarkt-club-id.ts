/**
 * Normalize a Transfermarkt club external id for ExternalId lookup.
 * MCP and CLI accept `club-190` or `190`; Apify fixtures may use either form.
 */
export function normalizeTransfermarktClubId(clubExternalId: string): string {
  const trimmed = clubExternalId.trim();
  return trimmed.startsWith("club-") ? trimmed.slice("club-".length) : trimmed;
}
